/**
 * MODULE 8: Rate Limiting
 * Redis Commands: INCR, EXPIRE, TTL, GET
 *
 * Core concept: Prevent abuse by limiting how many requests a user/IP
 * can make in a time window. Redis makes this atomic and fast.
 *
 * Pattern (Fixed Window Counter):
 *   Key: "ratelimit:{identifier}:{window}"
 *   1. INCR the counter
 *   2. If counter === 1 (first request in window) → set EXPIRE
 *   3. If counter > limit → reject with 429 Too Many Requests
 *
 * Atomicity guarantee: INCR is atomic. Even with thousands of concurrent
 * requests, no two clients can get the same value back.
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

// Configurable limits per endpoint type
const LIMITS = {
  api:    { limit: 10,  windowSec: 60 },  // 10 req/min
  login:  { limit: 5,   windowSec: 60 },  // 5 attempts/min
  search: { limit: 30,  windowSec: 60 },  // 30 searches/min
};

// Generic rate limit check
async function checkRateLimit(r, identifier, type) {
  const config = LIMITS[type] || LIMITS.api;
  const windowStart = Math.floor(Date.now() / (config.windowSec * 1000));
  const key = `ratelimit:${type}:${identifier}:${windowStart}`;

  const current = await r.incr(key);
  if (current === 1) {
    // First request in this window — set expiry
    await r.expire(key, config.windowSec);
  }

  const ttl = await r.ttl(key);
  const remaining = Math.max(0, config.limit - current);
  const allowed = current <= config.limit;

  return { allowed, current, remaining, limit: config.limit, windowSec: config.windowSec, ttl, key };
}

// Simulate an API request with rate limiting
router.post('/request', async (req, res) => {
  const { identifier, type } = req.body;
  const id = identifier || 'default-user';
  const endpointType = type || 'api';

  const r = getRedis();
  const result = await checkRateLimit(r, id, endpointType);

  const status = result.allowed ? 200 : 429;
  res.status(status).json({
    allowed: result.allowed,
    identifier: id,
    type: endpointType,
    requestCount: result.current,
    remaining: result.remaining,
    limit: result.limit,
    windowSeconds: result.windowSec,
    resetIn: result.ttl,
    redisKey: result.key,
    command: `INCR ${result.key}  →  ${result.current === 1 ? `EXPIRE ${result.key} ${result.windowSec}` : '(expiry already set)'}`,
    explanation: result.allowed
      ? `Request ALLOWED ✅. This is request ${result.current}/${result.limit}. ${result.remaining} remaining in this ${result.windowSec}s window. Window resets in ${result.ttl}s.`
      : `Request BLOCKED ❌. ${result.current} requests made (limit: ${result.limit}). Rate limit exceeded! Try again in ${result.ttl}s when the window resets. Redis returns 429.`
  });
});

// Get current rate limit status
router.get('/status/:identifier', async (req, res) => {
  const r = getRedis();
  const id = req.params.identifier;
  const statuses = {};

  for (const [type, config] of Object.entries(LIMITS)) {
    const windowStart = Math.floor(Date.now() / (config.windowSec * 1000));
    const key = `ratelimit:${type}:${id}:${windowStart}`;
    const current = parseInt(await r.get(key)) || 0;
    const ttl = await r.ttl(key);
    statuses[type] = {
      current,
      limit: config.limit,
      remaining: Math.max(0, config.limit - current),
      resetIn: ttl > 0 ? ttl : 0,
      windowSec: config.windowSec
    };
  }

  res.json({ identifier: id, limits: statuses });
});

// Reset rate limit for a user (admin action)
router.delete('/reset/:identifier', async (req, res) => {
  const r = getRedis();
  const id = req.params.identifier;
  const keys = await r.keys(`ratelimit:*:${id}:*`);
  if (keys.length > 0) await Promise.all(keys.map(k => r.del(k)));
  res.json({
    reset: true,
    keysDeleted: keys.length,
    command: `DEL ${keys.join(' ')}`,
    explanation: 'Admin reset: all rate limit counters for this identifier are cleared.'
  });
});

module.exports = router;
