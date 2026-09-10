/**
 * MODULE 1: Strings & Keys
 * Redis Commands: SET, GET, DEL, EXPIRE, TTL, EXISTS, KEYS, MSET, MGET
 * 
 * Core concept: Redis is a key-value store. Every piece of data is stored
 * under a unique KEY. The simplest value type is a STRING.
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

// SET a key (with optional TTL in seconds)
router.post('/set', async (req, res) => {
  const { key, value, ttl } = req.body;
  if (!key || value === undefined)
    return res.status(400).json({ error: 'key and value are required' });

  const r = getRedis();
  if (ttl && Number(ttl) > 0) {
    await r.set(key, value, 'EX', Number(ttl));
  } else {
    await r.set(key, value);
  }

  const command = ttl ? `SET ${key} "${value}" EX ${ttl}` : `SET ${key} "${value}"`;
  res.json({ success: true, command, explanation: 'SET stores a string value under the given key. EX sets expiry in seconds.' });
});

// GET a key
router.get('/get/:key', async (req, res) => {
  const r = getRedis();
  const value = await r.get(req.params.key);
  const ttl = await r.ttl(req.params.key);
  res.json({
    key: req.params.key,
    value,
    ttl,
    command: `GET ${req.params.key}`,
    explanation: value === null
      ? 'GET returns nil when key does not exist or has expired.'
      : `GET returned the stored value. TTL=${ttl === -1 ? '∞ (no expiry)' : ttl + 's remaining'}`
  });
});

// DEL a key
router.delete('/del/:key', async (req, res) => {
  const r = getRedis();
  const deleted = await r.del(req.params.key);
  res.json({
    deleted: deleted === 1,
    command: `DEL ${req.params.key}`,
    explanation: 'DEL removes the key. Returns 1 if deleted, 0 if key did not exist.'
  });
});

// TTL of a key
router.get('/ttl/:key', async (req, res) => {
  const r = getRedis();
  const ttl = await r.ttl(req.params.key);
  res.json({
    key: req.params.key, ttl,
    meaning: ttl === -2 ? 'Key does not exist' : ttl === -1 ? 'Key exists but has no expiry' : `${ttl} seconds remaining`,
    command: `TTL ${req.params.key}`,
    explanation: 'TTL returns seconds until expiry. -1 = no expiry, -2 = key missing.'
  });
});

// LIST all keys matching a pattern
router.get('/keys', async (req, res) => {
  const r = getRedis();
  const pattern = req.query.pattern || '*';
  const keys = await r.keys(pattern);

  // Check type of each key first — GET only works on strings!
  // WRONGTYPE error occurs when you call GET on a list/hash/set/zset
  const data = await Promise.all(keys.map(async k => {
    const type = await r.type(k);  // returns: string, list, hash, set, zset
    const ttl  = await r.ttl(k);

    let value;
    let hint;
    switch (type) {
      case 'string':
        value = await r.get(k);
        hint = 'Use GET';
        break;
      case 'list':
        const len = await r.llen(k);
        value = `[List · ${len} item${len !== 1 ? 's' : ''}]`;
        hint = 'Use LRANGE';
        break;
      case 'hash':
        const hlen = await r.hlen(k);
        value = `{Hash · ${hlen} field${hlen !== 1 ? 's' : ''}}`;
        hint = 'Use HGETALL';
        break;
      case 'set':
        const scard = await r.scard(k);
        value = `(Set · ${scard} member${scard !== 1 ? 's' : ''})`;
        hint = 'Use SMEMBERS';
        break;
      case 'zset':
        const zcard = await r.zcard(k);
        value = `⟨SortedSet · ${zcard} member${zcard !== 1 ? 's' : ''}⟩`;
        hint = 'Use ZRANGE';
        break;
      default:
        value = `[${type}]`;
        hint = type;
    }
    return { key: k, type, value, ttl, hint };
  }));

  res.json({
    keys: data,
    command: `KEYS ${pattern}`,
    explanation: `KEYS returned ${data.length} key(s). Notice different Redis data types — you must use the correct command for each type! GET only works on strings. That's why WRONGTYPE errors happen when you mix them up.`
  });
});

// EXISTS check
router.get('/exists/:key', async (req, res) => {
  const r = getRedis();
  const exists = await r.exists(req.params.key);
  res.json({
    exists: exists === 1,
    command: `EXISTS ${req.params.key}`,
    explanation: 'EXISTS returns 1 if key exists, 0 if not.'
  });
});

module.exports = router;
