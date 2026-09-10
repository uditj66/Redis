/**
 * MODULE 7: Pub/Sub (Publish/Subscribe)
 * Redis Commands: PUBLISH, SUBSCRIBE
 *
 * Core concept: Pub/Sub is a messaging pattern where:
 *   - PUBLISHERS send messages to a CHANNEL (without knowing who receives them)
 *   - SUBSCRIBERS listen on a CHANNEL (without knowing who sent messages)
 *   - Redis acts as the MESSAGE BROKER in between
 *
 * Key difference from other data structures: Pub/Sub is fire-and-forget.
 * Messages are NOT stored — only active subscribers receive them.
 *
 * Use cases: Real-time notifications, live chat, event broadcasting,
 *            microservices communication
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

// We need a dedicated subscriber client (a subscribed client can only receive)
let subscriberClient = null;
const subscribers = new Map(); // channelName → Set<SSE response>

function getSubscriber() {
  if (!subscriberClient) {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL;

    // Pub/Sub REQUIRES a dedicated client because once a client calls SUBSCRIBE,
    // it enters a special mode where it can ONLY receive messages — no other commands!
    // So we need: Client 1 (main) for SET/GET/ZADD etc. + Client 2 (this) for SUBSCRIBE only.
    subscriberClient = new Redis(redisUrl, {
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: null,   // prevent crash on retry exhaustion
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying gracefully
        return Math.min(times * 300, 3000);
      },
    });

    subscriberClient.on('connect', () => console.log('✅ Pub/Sub subscriber connected to Upstash'));
    subscriberClient.on('error', (err) => console.error('⚠️ Subscriber error:', err.message));

    subscriberClient.on('message', (channel, message) => {
      // Forward received Redis message to all browser SSE clients on this channel
      const clients = subscribers.get(channel);
      if (clients) {
        const payload = JSON.stringify({ channel, message, timestamp: new Date().toISOString() });
        clients.forEach(res => {
          try { res.write(`data: ${payload}\n\n`); } catch (e) { /* client disconnected */ }
        });
      }
    });
  }
  return subscriberClient;
}

// SSE endpoint — browser subscribes to a Redis channel
router.get('/subscribe/:channel', async (req, res) => {
  const channel = req.params.channel;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', channel, message: `Subscribed to channel: ${channel}` })}\n\n`);

  // Register SSE client
  if (!subscribers.has(channel)) {
    subscribers.set(channel, new Set());
    // Subscribe to Redis channel
    const sub = getSubscriber();
    await sub.subscribe(channel);
  }
  subscribers.get(channel).add(res);

  // Cleanup on disconnect
  req.on('close', async () => {
    const clients = subscribers.get(channel);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        subscribers.delete(channel);
        const sub = getSubscriber();
        await sub.unsubscribe(channel);
      }
    }
  });
});

// Publish a message to a channel
router.post('/publish', async (req, res) => {
  const { channel, message, sender } = req.body;
  if (!channel || !message) return res.status(400).json({ error: 'channel and message required' });

  const r = getRedis();
  const payload = JSON.stringify({ text: message, sender: sender || 'Anonymous', time: new Date().toLocaleTimeString() });
  const receivers = await r.publish(channel, payload);

  res.json({
    channel,
    message,
    receivers,
    command: `PUBLISH ${channel} "${payload}"`,
    explanation: `PUBLISH sent the message to ${receivers} active subscriber(s) on channel "${channel}". If 0 subscribers are listening, the message is LOST — Pub/Sub does not persist messages!`
  });
});

// Get active subscriber counts
router.get('/stats', (req, res) => {
  const stats = {};
  for (const [channel, clients] of subscribers.entries()) {
    stats[channel] = clients.size;
  }
  res.json({
    activeChannels: Object.keys(stats).length,
    channels: stats,
    explanation: 'Shows how many SSE browser connections are active per Redis channel.'
  });
});

module.exports = router;
