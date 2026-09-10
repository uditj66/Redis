/**
 * MODULE 3: Lists
 * Redis Commands: LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, LTRIM
 *
 * Core concept: Redis Lists are linked lists of strings.
 * LPUSH adds to the LEFT (head), RPUSH adds to the RIGHT (tail).
 * Perfect for: activity feeds, queues, stacks, message logs.
 *
 * Think of it like a doubly-ended queue (deque):
 *   HEAD ← [item5, item4, item3, item2, item1] → TAIL
 *   LPUSH adds here ↑                  RPUSH adds here ↑
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

const FEED_KEY = 'activity:feed';
const MAX_FEED = 20; // keep last 20 items

// Add activity to the feed (LPUSH = newest first)
router.post('/push', async (req, res) => {
  const { user, action } = req.body;
  if (!user || !action)
    return res.status(400).json({ error: 'user and action required' });

  const r = getRedis();
  const item = JSON.stringify({
    user,
    action,
    timestamp: new Date().toISOString()
  });

  await r.lpush(FEED_KEY, item);
  // Trim to keep only the latest MAX_FEED items
  await r.ltrim(FEED_KEY, 0, MAX_FEED - 1);
  const len = await r.llen(FEED_KEY);

  res.json({
    success: true,
    feedLength: len,
    command: `LPUSH ${FEED_KEY} <item>  →  LTRIM ${FEED_KEY} 0 ${MAX_FEED - 1}`,
    explanation: `LPUSH inserted at the HEAD (newest first). LTRIM keeps only the last ${MAX_FEED} items — perfect for a sliding window activity feed.`
  });
});

// Get the feed (LRANGE = slice)
router.get('/feed', async (req, res) => {
  const r = getRedis();
  const start = parseInt(req.query.start || 0);
  const end = parseInt(req.query.end || 9);
  const raw = await r.lrange(FEED_KEY, start, end);
  const items = raw.map(i => JSON.parse(i));
  const total = await r.llen(FEED_KEY);

  res.json({
    items,
    total,
    showing: `${start} to ${end}`,
    command: `LRANGE ${FEED_KEY} ${start} ${end}`,
    explanation: `LRANGE fetches items by index range. Index 0 = newest (head), -1 = oldest (tail). O(N) where N = number of elements returned.`
  });
});

// Queue demo: RPUSH + LPOP (FIFO queue)
router.post('/queue/enqueue', async (req, res) => {
  const { task } = req.body;
  const r = getRedis();
  await r.rpush('task:queue', task);
  const len = await r.llen('task:queue');
  res.json({
    queued: task,
    queueLength: len,
    command: `RPUSH task:queue "${task}"`,
    explanation: 'RPUSH adds to the TAIL. Combined with LPOP (remove from HEAD), this creates a FIFO queue — oldest task processed first.'
  });
});

router.post('/queue/dequeue', async (req, res) => {
  const r = getRedis();
  const task = await r.lpop('task:queue');
  const len = await r.llen('task:queue');
  res.json({
    dequeued: task,
    remainingInQueue: len,
    command: 'LPOP task:queue',
    explanation: task ? 'LPOP removed from the HEAD (oldest item) — FIFO order maintained.' : 'Queue is empty — LPOP returned nil.'
  });
});

router.get('/queue', async (req, res) => {
  const r = getRedis();
  const items = await r.lrange('task:queue', 0, -1);
  res.json({ queue: items, length: items.length, command: 'LRANGE task:queue 0 -1' });
});

// Clear feed
router.delete('/clear', async (req, res) => {
  const r = getRedis();
  await r.del(FEED_KEY);
  await r.del('task:queue');
  res.json({ cleared: true });
});

module.exports = router;
