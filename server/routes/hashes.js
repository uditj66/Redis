/**
 * MODULE 4: Hashes
 * Redis Commands: HSET, HGET, HGETALL, HMSET, HDEL, HEXISTS, HKEYS, HVALS, HINCRBY
 *
 * Core concept: A Hash is like a mini dictionary INSIDE a Redis key.
 * One Redis key → multiple field:value pairs (like a row in a table, or a JS object).
 *
 * Example:
 *   Key: "user:1001"
 *   Fields: { name: "Alice", email: "alice@ex.com", age: "28", points: "150" }
 *
 * Use cases: User profiles, product catalog, session storage
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

function userKey(id) { return `user:${id}`; }

// Create/update a user profile
router.post('/user', async (req, res) => {
  const { id, name, email, age, bio } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });

  const r = getRedis();
  const key = userKey(id);
  await r.hset(key, {
    name,
    email: email || '',
    age: age || '',
    bio: bio || '',
    createdAt: new Date().toISOString(),
    points: '0'
  });

  res.json({
    success: true,
    key,
    command: `HSET ${key} name "${name}" email "${email}" age "${age}" bio "${bio}"`,
    explanation: 'HSET stores multiple field-value pairs in one key. More memory-efficient than storing each field as a separate key (SET user:1001:name, SET user:1001:email, etc.)'
  });
});

// Get a single field
router.get('/user/:id/field/:field', async (req, res) => {
  const r = getRedis();
  const key = userKey(req.params.id);
  const value = await r.hget(key, req.params.field);
  res.json({
    key, field: req.params.field, value,
    command: `HGET ${key} ${req.params.field}`,
    explanation: 'HGET retrieves ONE specific field from the hash — O(1) time.'
  });
});

// Get the entire user profile
router.get('/user/:id', async (req, res) => {
  const r = getRedis();
  const key = userKey(req.params.id);
  const profile = await r.hgetall(key);
  res.json({
    key,
    profile: profile || null,
    command: `HGETALL ${key}`,
    explanation: 'HGETALL returns ALL fields of the hash at once — like a SELECT * for a single row.'
  });
});

// Add points (atomic increment on a hash field)
router.post('/user/:id/points', async (req, res) => {
  const { amount } = req.body;
  const r = getRedis();
  const key = userKey(req.params.id);
  const newPoints = await r.hincrby(key, 'points', Number(amount) || 10);
  res.json({
    key,
    newPoints,
    command: `HINCRBY ${key} points ${amount || 10}`,
    explanation: 'HINCRBY atomically increments a numeric field in the hash. No race conditions — perfect for counters, scores, balances.'
  });
});

// Delete a field
router.delete('/user/:id/field/:field', async (req, res) => {
  const r = getRedis();
  const key = userKey(req.params.id);
  const deleted = await r.hdel(key, req.params.field);
  res.json({
    deleted: deleted === 1,
    command: `HDEL ${key} ${req.params.field}`,
    explanation: 'HDEL removes a specific field from the hash. The key itself remains.'
  });
});

// List all users — only process keys that are actually Hash type
// (e.g. "user:name" from Module 1 is a String, not a Hash — HGETALL on it = WRONGTYPE error)
router.get('/users', async (req, res) => {
  const r = getRedis();
  const keys = await r.keys('user:*');

  // Filter: keep only keys whose Redis type is 'hash'
  const types = await Promise.all(keys.map(k => r.type(k)));
  const hashKeys = keys.filter((k, i) => types[i] === 'hash');

  const users = await Promise.all(
    hashKeys.map(async k => ({ key: k, ...await r.hgetall(k) }))
  );
  res.json({
    users,
    count: users.length,
    skipped: keys.length - hashKeys.length,
    explanation: `Found ${keys.length} keys matching "user:*" but ${keys.length - hashKeys.length} were not Hash type (e.g. Strings from Module 1) and were skipped. Only Hash keys work with HGETALL.`
  });
});

// Delete a user
router.delete('/user/:id', async (req, res) => {
  const r = getRedis();
  const key = userKey(req.params.id);
  const deleted = await r.del(key);
  res.json({ deleted: deleted === 1, command: `DEL ${key}` });
});

module.exports = router;
