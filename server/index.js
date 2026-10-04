require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ─────────────────────────────────────────────
app.use('/api/strings',   require('./routes/strings'));
app.use('/api/cache',     require('./routes/cache'));
app.use('/api/lists',     require('./routes/lists'));
app.use('/api/hashes',    require('./routes/hashes'));
app.use('/api/sets',      require('./routes/sets'));
app.use('/api/sorted',    require('./routes/sorted'));
app.use('/api/pubsub',    require('./routes/pubsub'));
app.use('/api/ratelimit',     require('./routes/ratelimit'));
app.use('/api/bloom-filter',  require('./routes/bloom-filter'));

// ── Health check ────────────────────────────────────────
app.get('/api/ping', async (req, res) => {
  const { getRedis } = require('./redis');
  try {
    const r = getRedis();
    const pong = await r.ping();
    res.json({ status: 'ok', redis: pong });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ── SPA fallback ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Redis Learning Platform running on http://localhost:${PORT}`);
});

module.exports = app;

