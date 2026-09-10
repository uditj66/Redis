const Redis = require('ioredis');

let redis;

function getRedis() {
  if (!redis) {
    // Upstash (or any cloud Redis) provides a full URL like:
    // rediss://default:<password>@<host>.upstash.io:6379
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      console.error('❌ REDIS_URL is not set in your .env file!');
      console.error('   1. Create a free database at https://console.upstash.com');
      console.error('   2. Copy the "REDIS_URL" from the database page');
      console.error('   3. Paste it into your .env file as: REDIS_URL=rediss://...');
      process.exit(1);
    }

    redis = new Redis(redisUrl, {
      // TLS is required for Upstash (the "rediss://" scheme handles this)
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,

      // Prevent crash after retries — just log the error and keep trying
      maxRetriesPerRequest: null,

      retryStrategy(times) {
        if (times > 5) {
          console.error('❌ Redis: too many retries. Check your REDIS_URL in .env');
          return null; // stop retrying, don't crash
        }
        return Math.min(times * 300, 3000);
      },

      reconnectOnError(err) {
        console.error('⚠️ Redis reconnect on error:', err.message);
        return true;
      },
    });

    redis.on('connect', () => {
      console.log('✅ Connected to Upstash Redis!');
    });

    redis.on('ready', () => {
      console.log('🟢 Redis is ready to accept commands');
    });

    redis.on('error', (err) => {
      // Only log once per error type to avoid spam
      if (!redis._lastErrMsg || redis._lastErrMsg !== err.message) {
        console.error('❌ Redis error:', err.message);
        redis._lastErrMsg = err.message;
      }
    });
  }
  return redis;
}

module.exports = { getRedis };
