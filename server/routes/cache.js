/**
 * MODULE 2: Caching (Cache-Aside Pattern)
 * Redis Commands: SET with EX, GET
 *
 * Core concept: Instead of hitting a slow database/API every time,
 * cache the result in Redis. On next request, serve from cache (microseconds)
 * instead of the slow source (seconds). This is the "cache-aside" pattern.
 *
 * Pattern:
 *   1. Check Redis for cached data
 *   2. If HIT → return cached data instantly
 *   3. If MISS → fetch from slow source, store in Redis, return data
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

// Simulated "slow" data source (fake weather API)
const CITIES = {
  london:    { city: 'London',    temp: 18, condition: 'Cloudy',  humidity: 75 },
  tokyo:     { city: 'Tokyo',     temp: 28, condition: 'Sunny',   humidity: 60 },
  newyork:   { city: 'New York',  temp: 22, condition: 'Partly Cloudy', humidity: 55 },
  mumbai:    { city: 'Mumbai',    temp: 32, condition: 'Hot',     humidity: 85 },
  sydney:    { city: 'Sydney',    temp: 20, condition: 'Windy',   humidity: 65 },
  paris:     { city: 'Paris',     temp: 16, condition: 'Rainy',   humidity: 80 },
  dubai:     { city: 'Dubai',     temp: 38, condition: 'Sunny',   humidity: 40 },
  singapore: { city: 'Singapore', temp: 30, condition: 'Humid',   humidity: 90 },
};

async function fetchWeatherFromSource(city) {
  // Simulate network delay (like a real external API call)
  await new Promise(resolve => setTimeout(resolve, 1500));
  const data = CITIES[city.toLowerCase()];
  if (!data) throw new Error(`City "${city}" not found`);
  return { ...data, fetchedAt: new Date().toISOString() };
}

// GET /api/cache/weather/:city
router.get('/weather/:city', async (req, res) => {
  const r = getRedis();
  const city = req.params.city.toLowerCase();
  const cacheKey = `weather:${city}`;
  const TTL = 30; // 30 seconds cache

  const start = Date.now();

  // Step 1: Check cache
  const cached = await r.get(cacheKey);
  if (cached) {
    const ttlLeft = await r.ttl(cacheKey);
    return res.json({
      source: 'CACHE HIT 🟢',
      data: JSON.parse(cached),
      latency: `${Date.now() - start}ms`,
      ttlRemaining: ttlLeft,
      redisCommand: `GET ${cacheKey}`,
      explanation: `Cache HIT! Data was already in Redis. Returned in ${Date.now() - start}ms instead of ~1500ms. TTL: ${ttlLeft}s left before expiry.`
    });
  }

  // Step 2: Cache miss — fetch from "slow" source
  try {
    const data = await fetchWeatherFromSource(city);
    const latency = Date.now() - start;

    // Step 3: Store in cache
    await r.set(cacheKey, JSON.stringify(data), 'EX', TTL);

    res.json({
      source: 'CACHE MISS 🔴 → Fetched & Cached',
      data,
      latency: `${latency}ms`,
      ttlRemaining: TTL,
      redisCommand: `SET ${cacheKey} <data> EX ${TTL}`,
      explanation: `Cache MISS. Had to call the "slow API" (took ${latency}ms). Result stored in Redis for ${TTL}s. Next request will be instant!`
    });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Invalidate cache for a city
router.delete('/invalidate/:city', async (req, res) => {
  const r = getRedis();
  const cacheKey = `weather:${req.params.city.toLowerCase()}`;
  const deleted = await r.del(cacheKey);
  res.json({
    invalidated: deleted === 1,
    redisCommand: `DEL ${cacheKey}`,
    explanation: 'Cache invalidation: removing the cached entry forces the next request to fetch fresh data.'
  });
});

// Get cache stats
router.get('/stats', async (req, res) => {
  const r = getRedis();
  const keys = await r.keys('weather:*');
  const stats = await Promise.all(keys.map(async k => ({
    key: k,
    ttl: await r.ttl(k),
    value: JSON.parse(await r.get(k))
  })));
  res.json({ cachedCities: stats, totalCached: stats.length });
});

module.exports = router;
