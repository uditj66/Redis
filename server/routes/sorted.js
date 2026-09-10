/**
 * MODULE 6: Sorted Sets (ZSets)
 * Redis Commands: ZADD, ZRANGE, ZREVRANGE, ZRANK, ZREVRANK, ZSCORE, ZINCRBY, ZCARD, ZREM
 *
 * Core concept: Like a Set, but every member has a SCORE (float).
 * Members are automatically sorted by score (ascending by default).
 * 
 * Key insight: Sorted Sets combine the speed of a hash (O(1) score lookup)
 * with the power of a sorted list. Insertions/lookups are O(log N).
 *
 * Use cases: Leaderboards, priority queues, time-series, rate limiting windows
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

const LEADERBOARD_KEY = 'leaderboard:global';
const GAMES = ['Chess', 'Tetris', 'Racing', 'Puzzle', 'Shooter'];

// Add/update a player score
router.post('/score', async (req, res) => {
  const { player, score } = req.body;
  if (!player || score === undefined)
    return res.status(400).json({ error: 'player and score required' });

  const r = getRedis();
  await r.zadd(LEADERBOARD_KEY, Number(score), player);
  const rank = await r.zrevrank(LEADERBOARD_KEY, player); // 0-indexed
  const total = await r.zcard(LEADERBOARD_KEY);

  res.json({
    player,
    score: Number(score),
    rank: rank + 1, // 1-indexed for display
    totalPlayers: total,
    command: `ZADD ${LEADERBOARD_KEY} ${score} "${player}"`,
    explanation: `ZADD adds/updates a member with its score. Sorted automatically. ${player} is now ranked #${rank + 1} of ${total} players. O(log N) insertion.`
  });
});

// Increment score (atomic)
router.post('/score/increment', async (req, res) => {
  const { player, by } = req.body;
  const r = getRedis();
  const newScore = await r.zincrby(LEADERBOARD_KEY, Number(by) || 10, player);
  const rank = await r.zrevrank(LEADERBOARD_KEY, player);
  res.json({
    player,
    newScore: Number(newScore),
    rank: rank !== null ? rank + 1 : null,
    command: `ZINCRBY ${LEADERBOARD_KEY} ${by || 10} "${player}"`,
    explanation: 'ZINCRBY atomically adds to the player\'s score and re-sorts. Like HINCRBY but keeps sorted order.'
  });
});

// Get top N players (leaderboard)
router.get('/top/:n', async (req, res) => {
  const r = getRedis();
  const n = Math.min(parseInt(req.params.n) || 10, 50);
  // ZREVRANGE = high score first (reverse sorted order)
  const raw = await r.zrevrange(LEADERBOARD_KEY, 0, n - 1, 'WITHSCORES');

  const leaderboard = [];
  for (let i = 0; i < raw.length; i += 2) {
    leaderboard.push({ rank: i / 2 + 1, player: raw[i], score: Number(raw[i + 1]) });
  }

  res.json({
    leaderboard,
    command: `ZREVRANGE ${LEADERBOARD_KEY} 0 ${n - 1} WITHSCORES`,
    explanation: `ZREVRANGE returns members in DESCENDING score order (highest first). WITHSCORES includes scores. Perfect for leaderboards. O(log N + M) where M = returned elements.`
  });
});

// Get a player's rank and score
router.get('/player/:name', async (req, res) => {
  const r = getRedis();
  const player = req.params.name;
  const score = await r.zscore(LEADERBOARD_KEY, player);
  const rank = await r.zrevrank(LEADERBOARD_KEY, player);
  const total = await r.zcard(LEADERBOARD_KEY);

  res.json({
    player,
    score: score !== null ? Number(score) : null,
    rank: rank !== null ? rank + 1 : null,
    totalPlayers: total,
    percentile: rank !== null ? Math.round((1 - rank / total) * 100) : null,
    command: `ZSCORE ${LEADERBOARD_KEY} "${player}"  |  ZREVRANK ${LEADERBOARD_KEY} "${player}"`,
    explanation: `ZSCORE = O(1) score lookup. ZREVRANK = O(log N) rank lookup (0 = highest score). Percentile = how player compares to everyone.`
  });
});

// ── NEW: Total players count using ZCARD ──────────────────────
// ZCARD = ZSet CARDinality = total number of members, always O(1)
router.get('/count', async (req, res) => {
  const r = getRedis();
  const total = await r.zcard(LEADERBOARD_KEY);
  const top = await r.zrevrange(LEADERBOARD_KEY, 0, 0, 'WITHSCORES'); // #1 player

  res.json({
    totalPlayers: total,
    topPlayer: top.length ? { player: top[0], score: Number(top[1]) } : null,
    command: `ZCARD ${LEADERBOARD_KEY}`,
    explanation: `ZCARD returns the total number of members in a Sorted Set in O(1) time — it doesn't scan the set, Redis keeps an internal count. Result: ${total} player(s) on the leaderboard.`
  });
});


router.delete('/player/:name', async (req, res) => {
  const r = getRedis();
  const removed = await r.zrem(LEADERBOARD_KEY, req.params.name);
  res.json({
    removed: removed === 1,
    command: `ZREM ${LEADERBOARD_KEY} "${req.params.name}"`,
    explanation: 'ZREM removes a member from the sorted set.'
  });
});

// Seed with sample data
router.post('/seed', async (req, res) => {
  const r = getRedis();
  const players = [
    { name: 'Alice', score: 9500 }, { name: 'Bob', score: 8200 },
    { name: 'Charlie', score: 7800 }, { name: 'Diana', score: 6500 },
    { name: 'Eve', score: 5900 }, { name: 'Frank', score: 4200 },
    { name: 'Grace', score: 3800 }, { name: 'Hank', score: 2100 },
  ];

  for (const p of players) {
    await r.zadd(LEADERBOARD_KEY, p.score, p.name);
  }

  res.json({
    seeded: players.length,
    players,
    command: `ZADD ${LEADERBOARD_KEY} 9500 "Alice" 8200 "Bob" ...`,
    explanation: 'Seeded leaderboard with 8 sample players. Scores are automatically sorted!'
  });
});

// Clear leaderboard
router.delete('/clear', async (req, res) => {
  const r = getRedis();
  await r.del(LEADERBOARD_KEY);
  res.json({ cleared: true });
});

module.exports = router;
