/**
 * Bloom Filter Route — Username Availability Checker
 * ─────────────────────────────────────────────────────
 * Uses Redis bit arrays (BITSET / GETBIT / BITCOUNT) to implement
 * a real Bloom Filter backed by Upstash Redis.
 *
 * Key:   bloom:usernames
 * Size:  m = 2048 bits  (BF_SIZE)
 * Hash:  k = 4 hash functions
 */

const express = require('express');
const router  = express.Router();
const { getRedis } = require('../redis');

// ── Bloom Filter parameters ─────────────────────────────
const BF_KEY  = 'bloom:usernames';
const BF_SIZE = 2048;   // m  — bit array length
const BF_K    = 4;      // k  — number of hash functions

// A separate sorted-set keeps "confirmed taken" usernames for
// ground-truth lookups so we can detect true vs false positives.
const TAKEN_KEY = 'bloom:taken_set';

// ── Hash functions ──────────────────────────────────────
// Simple djb2-family variants seeded with different constants.
function hash(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return (h >>> 0) % BF_SIZE;
}

function getPositions(item) {
  const lower = item.toLowerCase();
  return [
    hash(lower, 0xdeadbeef),
    hash(lower, 0xc0ffee01),
    hash(lower, 0xabcdef12),
    hash(lower, 0x12345678),
  ];
}

// ── POST /api/bloom-filter/register ────────────────────
// Register (claim) a username — adds to Bloom Filter + confirmed set.
router.post('/register', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username is required' });
  }
  const clean = username.trim();
  if (clean.length < 3 || clean.length > 30) {
    return res.status(400).json({ error: 'Username must be 3–30 characters' });
  }

  try {
    const r = getRedis();

    // First check: is it already confirmed taken?
    const alreadyTaken = await r.zscore(TAKEN_KEY, clean.toLowerCase());
    if (alreadyTaken !== null) {
      return res.json({
        available: false,
        reason: 'already_registered',
        message: `"${clean}" is already registered.`,
        positions: getPositions(clean),
      });
    }

    const positions = getPositions(clean);
    const pipe = r.pipeline();
    for (const pos of positions) {
      pipe.setbit(BF_KEY, pos, 1);
    }
    // Store in the confirmed set (score = registration timestamp)
    pipe.zadd(TAKEN_KEY, Date.now(), clean.toLowerCase());
    await pipe.exec();

    // Return stats
    const bitsSet  = await r.bitcount(BF_KEY);
    const fillRatio = ((bitsSet / BF_SIZE) * 100).toFixed(1);
    const fpRate = Math.pow(1 - Math.exp(-BF_K * await r.zcard(TAKEN_KEY) / BF_SIZE), BF_K);

    res.json({
      registered: true,
      username: clean,
      positions,
      bitsSet,
      fillRatio: parseFloat(fillRatio),
      fpRate: (fpRate * 100).toFixed(2),
      message: `✅ "${clean}" registered successfully!`,
    });
  } catch (e) {
    console.error('Bloom register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/bloom-filter/check ───────────────────────
// Check if a username MIGHT be taken (Bloom Filter query).
router.post('/check', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'username is required' });
  }
  const clean = username.trim().toLowerCase();

  try {
    const r = getRedis();
    const positions = getPositions(clean);

    // Read all bit positions in a pipeline
    const pipe = r.pipeline();
    for (const pos of positions) {
      pipe.getbit(BF_KEY, pos);
    }
    const results  = await pipe.exec();
    const bits     = results.map(([err, val]) => (err ? 0 : val));
    const allSet   = bits.every(b => b === 1);

    // Ground-truth check (only for confirmed-taken set)
    const confirmed = allSet
      ? await r.zscore(TAKEN_KEY, clean)
      : null;

    let status, message, variant;
    if (!allSet) {
      // At least one bit is 0  → definitely not taken
      status  = 'available';
      variant = 'available';
      message = `✅ "${username}" is definitely available! Grab it now.`;
    } else if (confirmed !== null) {
      // All bits set AND in confirmed set → truly taken
      status  = 'taken';
      variant = 'taken';
      message = `❌ "${username}" is already taken.`;
    } else {
      // All bits set but NOT in confirmed set → false positive
      status  = 'maybe';
      variant = 'false_positive';
      message = `⚠️ "${username}" might be taken — but this could be a false positive! (All ${BF_K} bits happened to be set by other usernames.)`;
    }

    const bitsSet  = await r.bitcount(BF_KEY);
    const total    = await r.zcard(TAKEN_KEY);
    const fpRate   = Math.pow(1 - Math.exp(-BF_K * total / BF_SIZE), BF_K);

    res.json({
      username,
      status,
      variant,
      message,
      positions,
      bits,
      allSet,
      confirmed: confirmed !== null,
      bitsSet,
      fillRatio: ((bitsSet / BF_SIZE) * 100).toFixed(1),
      fpRate: (fpRate * 100).toFixed(2),
      totalRegistered: total,
    });
  } catch (e) {
    console.error('Bloom check error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/bloom-filter/stats ────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const r     = getRedis();
    const bitsSet  = await r.bitcount(BF_KEY);
    const total    = await r.zcard(TAKEN_KEY);
    const recent   = await r.zrange(TAKEN_KEY, -10, -1); // last 10
    const fpRate   = Math.pow(1 - Math.exp(-BF_K * total / BF_SIZE), BF_K);

    res.json({
      bfSize: BF_SIZE,
      hashFunctions: BF_K,
      bitsSet,
      fillRatio: ((bitsSet / BF_SIZE) * 100).toFixed(1),
      totalRegistered: total,
      fpRate: (fpRate * 100).toFixed(2),
      recentUsernames: recent.reverse(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/bloom-filter/reset ────────────────────
router.delete('/reset', async (req, res) => {
  try {
    const r = getRedis();
    await r.del(BF_KEY, TAKEN_KEY);
    res.json({ reset: true, message: 'Bloom filter and username registry cleared.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
