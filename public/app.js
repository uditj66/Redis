/* ═══════════════════════════════════════════════════════════════
   Redis Learning Platform — Frontend SPA Logic
   All module interactions, API calls, and UI updates
═══════════════════════════════════════════════════════════════ */

const API = '';  // same origin

// ── Utility helpers ──────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}
const get  = path        => api('GET',    path);
const post = (path, b)   => api('POST',   path, b);
const del  = path        => api('DELETE', path);

function showResponse(module, data) {
  const cmdEl  = document.getElementById(`resp-${module}-cmd`);
  const bodyEl = document.getElementById(`resp-${module}-body`);
  const expEl  = document.getElementById(`resp-${module}-explain`);

  if (cmdEl && data.command)     cmdEl.textContent = data.command;
  if (cmdEl && data.redisCommand) cmdEl.textContent = data.redisCommand;
  if (bodyEl) bodyEl.textContent = JSON.stringify(data, null, 2);
  if (expEl)  expEl.textContent  = data.explanation || data.explain || '';
}

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:12px;font-size:0.84rem;font-weight:700;
    font-family:'Inter',sans-serif;animation:fadeIn 0.2s ease;
    background:${type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)'};color:white;
    backdrop-filter:blur(10px);
    box-shadow:0 8px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Navigation ───────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const mod = btn.dataset.module;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.module').forEach(m => m.classList.add('hidden'));
    document.getElementById(`module-${mod}`).classList.remove('hidden');
    window.scrollTo(0, 0);
  });
});

// ── Redis Status ─────────────────────────────────────────────────
async function checkRedisStatus() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const r = await get('/api/ping');
    if (r.redis === 'PONG') {
      dot.className = 'status-dot connected';
      text.textContent = 'Redis Connected';
    } else throw new Error();
  } catch {
    dot.className = 'status-dot error';
    text.textContent = 'Redis Disconnected';
  }
}
checkRedisStatus();
setInterval(checkRedisStatus, 10000);

// ═══════════════════════════════════════════════════════════════
// MODULE 1: STRINGS
// ═══════════════════════════════════════════════════════════════

async function doSet() {
  const key = document.getElementById('setKey').value.trim();
  const value = document.getElementById('setValue').value.trim();
  const ttl = document.getElementById('setTtl').value;
  if (!key || !value) return toast('Key and value are required', 'error');

  const data = await post('/api/strings/set', { key, value, ttl });
  showResponse('strings', data);
  toast(`SET ${key}`);
  // auto-fill GET
  document.getElementById('getKey').value = key;
}

async function doGet() {
  const key = document.getElementById('getKey').value.trim();
  if (!key) return toast('Enter a key', 'error');
  const data = await get(`/api/strings/get/${encodeURIComponent(key)}`);
  showResponse('strings', data);
}

async function doTtl() {
  const key = document.getElementById('ttlKey').value.trim();
  if (!key) return toast('Enter a key', 'error');
  const data = await get(`/api/strings/ttl/${encodeURIComponent(key)}`);
  showResponse('strings', data);
}

async function doDel() {
  const key = document.getElementById('delKey').value.trim();
  if (!key) return toast('Enter a key', 'error');
  const data = await del(`/api/strings/del/${encodeURIComponent(key)}`);
  showResponse('strings', data);
  toast(data.deleted ? `Deleted ${key}` : `Key ${key} not found`, data.deleted ? 'info' : 'error');
}

async function doKeys() {
  const pattern = document.getElementById('keysPattern').value.trim() || '*';
  const data = await get(`/api/strings/keys?pattern=${encodeURIComponent(pattern)}`);
  showResponse('strings', data);

  const grid = document.getElementById('keysGrid');
  grid.innerHTML = '';
  if (!data.keys || data.keys.length === 0) {
    grid.innerHTML = '<span style="color:var(--text-dim);font-size:0.8rem;">No keys found</span>';
    return;
  }
  data.keys.forEach(k => {
    const pill = document.createElement('div');
    pill.className = 'key-pill';
    pill.innerHTML = `<span class="key-name">${k.key}</span><span class="key-val">${k.value ?? 'nil'}</span><span class="key-ttl">${k.ttl === -1 ? '∞' : k.ttl === -2 ? '—' : k.ttl + 's'}</span>`;
    pill.onclick = () => {
      document.getElementById('getKey').value = k.key;
      document.getElementById('delKey').value = k.key;
      document.getElementById('ttlKey').value = k.key;
      doGet();
    };
    grid.appendChild(pill);
  });
}

// ═══════════════════════════════════════════════════════════════
// MODULE 2: CACHE
// ═══════════════════════════════════════════════════════════════

let lastFetchedCity = null;

async function fetchWeather(city) {
  lastFetchedCity = city;
  const btn = document.getElementById(`city-${city}`);
  btn.classList.add('loading');
  btn.textContent = '⏳ Loading...';

  const data = await get(`/api/cache/weather/${city}`);

  // Restore button
  const cityNames = { london:'🇬🇧 London', tokyo:'🇯🇵 Tokyo', newyork:'🗽 New York',
    mumbai:'🇮🇳 Mumbai', sydney:'🦘 Sydney', paris:'🗼 Paris',
    dubai:'🏙️ Dubai', singapore:'🦁 Singapore' };
  btn.textContent = cityNames[city];
  btn.classList.remove('loading');
  btn.classList.toggle('cached', data.source?.includes('HIT'));

  showResponse('cache', data);

  const resultEl = document.getElementById('cacheResult');
  const sourceEl = document.getElementById('cacheSource');
  const cardEl   = document.getElementById('weatherCard');
  const latEl    = document.getElementById('cacheLatency');
  const ttlEl    = document.getElementById('cacheTtl');

  resultEl.classList.remove('hidden');
  const isHit = data.source?.includes('HIT');
  sourceEl.textContent = data.source;
  sourceEl.className = `cache-source ${isHit ? 'hit' : 'miss'}`;

  cardEl.innerHTML = `
    <div>
      <div class="weather-city">${data.data?.city || city}</div>
      <div class="weather-info">${data.data?.condition}</div>
    </div>
    <div class="weather-temp">${data.data?.temp}°C</div>
    <div>
      <div class="weather-info">💧 ${data.data?.humidity}% humidity</div>
      <div class="weather-info" style="font-size:0.7rem;margin-top:2px">Fetched: ${new Date(data.data?.fetchedAt).toLocaleTimeString()}</div>
    </div>
  `;
  latEl.textContent = `⚡ ${data.latency}`;
  ttlEl.textContent = `⏱ TTL: ${data.ttlRemaining}s`;

  loadCacheStats();
}

async function invalidateCache() {
  if (!lastFetchedCity) return;
  const data = await del(`/api/cache/invalidate/${lastFetchedCity}`);
  showResponse('cache', data);
  document.getElementById(`city-${lastFetchedCity}`)?.classList.remove('cached');
  document.getElementById('cacheResult').classList.add('hidden');
  toast(`Cache invalidated for ${lastFetchedCity}`);
  loadCacheStats();
}

async function loadCacheStats() {
  const data = await get('/api/cache/stats');
  const inv = document.getElementById('cacheInventory');
  if (data.cachedCities?.length === 0) { inv.innerHTML = ''; return; }
  inv.innerHTML = `
    <div class="cache-inventory-title">Cached Cities (${data.totalCached})</div>
    <div class="cache-items">${(data.cachedCities || []).map(c =>
      `<span class="cache-item">${c.value?.city || c.key} · ${c.ttl}s</span>`
    ).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 3: LISTS
// ═══════════════════════════════════════════════════════════════

function setFeedUser(u) { document.getElementById('feedUser').value = u; }

const FEED_ACTIONS = [
  'liked a photo', 'posted a video', 'shared an article', 'commented on a post',
  'joined a group', 'updated their status', 'tagged a friend', 'started a live stream',
  'created a story', 'followed a new account'
];
function randomFeedAction() {
  document.getElementById('feedAction').value = FEED_ACTIONS[Math.floor(Math.random() * FEED_ACTIONS.length)];
}

async function pushFeed() {
  const user = document.getElementById('feedUser').value.trim();
  const action = document.getElementById('feedAction').value.trim();
  if (!user || !action) return toast('Fill in user and action', 'error');
  const data = await post('/api/lists/push', { user, action });
  showResponse('lists', data);
  loadFeed();
}

async function loadFeed() {
  const data = await get('/api/lists/feed?start=0&end=19');
  showResponse('lists', data);
  const list = document.getElementById('feedList');
  if (!data.items?.length) { list.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;">Feed is empty — push some items!</div>'; return; }
  list.innerHTML = data.items.map((item, i) => `
    <div class="feed-item">
      <span class="feed-user">${item.user}</span>
      <span class="feed-action">${item.action}</span>
      <span class="feed-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
    </div>
  `).join('');
}

let taskQueue = [];
async function enqueueTask() {
  const task = document.getElementById('queueTask').value.trim();
  if (!task) return toast('Enter a task', 'error');
  const data = await post('/api/lists/queue/enqueue', { task });
  showResponse('lists', data);
  taskQueue.push(task);
  renderQueue();
}

async function dequeueTask() {
  const data = await post('/api/lists/queue/dequeue', {});
  showResponse('lists', data);
  const qData = await get('/api/lists/queue');
  taskQueue = qData.queue || [];
  renderQueue();
  if (data.dequeued) toast(`Processed: ${data.dequeued}`);
}

function renderQueue() {
  const el = document.getElementById('queueVisual');
  if (!taskQueue.length) { el.innerHTML = '<div class="queue-empty">Queue is empty</div>'; return; }
  el.innerHTML = taskQueue.map((t, i) =>
    `<div class="queue-item ${i === 0 ? 'first' : ''}" title="${i === 0 ? 'Next to be processed (LPOP)' : ''}">${i === 0 ? '→ ' : ''}${t}</div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// MODULE 4: HASHES
// ═══════════════════════════════════════════════════════════════

async function createUser() {
  const id    = document.getElementById('userId').value.trim();
  const name  = document.getElementById('userName').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const age   = document.getElementById('userAge').value.trim();
  const bio   = document.getElementById('userBio').value.trim();
  if (!id || !name) return toast('ID and name are required', 'error');
  const data = await post('/api/hashes/user', { id, name, email, age, bio });
  showResponse('hashes', data);
  toast(`Created user:${id}`);
  // auto-fill get
  document.getElementById('getUserId').value = id;
}

async function getUser() {
  const id = document.getElementById('getUserId').value.trim();
  if (!id) return toast('Enter a user ID', 'error');
  const data = await get(`/api/hashes/user/${encodeURIComponent(id)}`);
  showResponse('hashes', data);
  const card = document.getElementById('userProfileCard');
  if (!data.profile) { card.classList.add('hidden'); toast('User not found', 'error'); return; }
  card.classList.remove('hidden');
  card.innerHTML = Object.entries(data.profile).map(([f, v]) => `
    <div class="profile-field">
      <span class="profile-label">${f}</span>
      <span class="profile-val ${f === 'points' ? 'profile-points' : ''}">${v || '—'}</span>
    </div>
  `).join('');
}

async function addPoints() {
  const id = document.getElementById('getUserId').value.trim();
  const amount = document.getElementById('pointsAmount').value;
  if (!id) return toast('Load a user first', 'error');
  const data = await post(`/api/hashes/user/${encodeURIComponent(id)}/points`, { amount });
  showResponse('hashes', data);
  toast(`+${amount} points → total: ${data.newPoints}`);
  getUser();
}

async function loadUsers() {
  const data = await get('/api/hashes/users');
  const grid = document.getElementById('usersGrid');
  if (!data.users?.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;">No users yet — create some above!</div>'; return; }
  grid.innerHTML = data.users.map(u => `
    <div class="user-card">
      <div class="user-card-name">${u.name || '?'}</div>
      <div class="user-card-key">${u.key}</div>
      ${u.email ? `<div class="user-card-field">📧 ${u.email}</div>` : ''}
      ${u.age   ? `<div class="user-card-field">🎂 ${u.age} years</div>` : ''}
      <div class="user-card-field" style="color:var(--accent-yellow);margin-top:4px;">⭐ ${u.points || 0} points</div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// MODULE 5: SETS
// ═══════════════════════════════════════════════════════════════

function setOnlineUser(u) { document.getElementById('onlineUser').value = u; }

async function userJoin() {
  const username = document.getElementById('onlineUser').value.trim();
  if (!username) return toast('Enter a username', 'error');
  const data = await post('/api/sets/online/join', { username });
  showResponse('sets', data);
  loadOnlineUsers();
}

async function userLeave() {
  const username = document.getElementById('onlineUser').value.trim();
  if (!username) return toast('Enter a username', 'error');
  const data = await post('/api/sets/online/leave', { username });
  showResponse('sets', data);
  loadOnlineUsers();
}

async function loadOnlineUsers() {
  const data = await get('/api/sets/online');
  document.getElementById('onlineCount').textContent = `${data.count} online`;
  const el = document.getElementById('onlineUsers');
  el.innerHTML = (data.onlineUsers || []).map(u =>
    `<div class="online-badge"><div class="online-dot"></div>${u}</div>`
  ).join('');
}

async function addFriend() {
  const user   = document.getElementById('fUser').value.trim();
  const friend = document.getElementById('fFriend').value.trim();
  if (!user || !friend) return toast('Enter both user and friend', 'error');
  const data = await post('/api/sets/friends/add', { user, friend });
  showResponse('sets', data);
  toast(`${user} ↔️ ${friend} are now friends!`);
}

async function doSetOp(type) {
  const u1 = document.getElementById('soUser1').value.trim();
  const u2 = document.getElementById('soUser2').value.trim();
  if (!u1 || !u2) return toast('Enter both user names', 'error');

  let data, members, color;
  if (type === 'mutual') {
    data = await get(`/api/sets/friends/mutual/${encodeURIComponent(u1)}/${encodeURIComponent(u2)}`);
    members = data.mutualFriends;
    color = 'blue';
  } else if (type === 'union') {
    data = await get(`/api/sets/friends/union/${encodeURIComponent(u1)}/${encodeURIComponent(u2)}`);
    members = data.allFriends;
    color = 'green';
  } else {
    data = await get(`/api/sets/friends/diff/${encodeURIComponent(u1)}/${encodeURIComponent(u2)}`);
    members = data.friends;
    color = 'purple';
  }

  showResponse('sets', data);
  const res = document.getElementById('setResult');
  res.classList.add('visible');
  res.innerHTML = `
    <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">${data.explanation || ''}</div>
    <div class="set-members">${(members || []).map(m => `<span class="set-member ${color}">${m}</span>`).join('') || '<span style="color:var(--text-dim);font-size:0.8rem;">Empty set</span>'}</div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 6: SORTED SETS
// ═══════════════════════════════════════════════════════════════

async function addScore() {
  const player = document.getElementById('lbPlayer').value.trim();
  const score  = document.getElementById('lbScore').value;
  if (!player || !score) return toast('Player and score required', 'error');
  const data = await post('/api/sorted/score', { player, score });
  showResponse('sorted', data);
  loadLeaderboard();
}

async function incrementScore() {
  const player = document.getElementById('lbPlayer').value.trim();
  const by = document.getElementById('lbScore').value || 10;
  if (!player) return toast('Enter a player name', 'error');
  const data = await post('/api/sorted/score/increment', { player, by });
  showResponse('sorted', data);
  loadLeaderboard();
}

async function seedLeaderboard() {
  const data = await post('/api/sorted/seed', {});
  showResponse('sorted', data);
  loadLeaderboard();
  toast('Seeded 8 sample players!');
}

async function loadLeaderboard() {
  const data = await get('/api/sorted/top/10');
  showResponse('sorted', data);
  const medals = ['🥇', '🥈', '🥉'];
  const el = document.getElementById('leaderboard');
  if (!data.leaderboard?.length) { el.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;">Empty leaderboard — add players or seed sample data!</div>'; return; }
  el.innerHTML = data.leaderboard.map(p => `
    <div class="lb-row ${p.rank <= 3 ? 'top' + p.rank : ''}">
      <span class="lb-rank">#${p.rank}</span>
      <span class="lb-medal">${medals[p.rank - 1] || ''}</span>
      <span class="lb-player">${p.player}</span>
      <span class="lb-score">${p.score.toLocaleString()}</span>
    </div>
  `).join('');
}

async function lookupPlayer() {
  const player = document.getElementById('lookupPlayer').value.trim();
  if (!player) return toast('Enter a player name', 'error');
  const data = await get(`/api/sorted/player/${encodeURIComponent(player)}`);
  showResponse('sorted', data);
  const stats = document.getElementById('playerStats');
  if (data.score === null) { stats.classList.remove('visible'); toast(`${player} not on leaderboard`, 'error'); return; }
  stats.classList.add('visible');
  stats.innerHTML = `
    <div class="ps-name">${player}</div>
    <div class="ps-row"><span class="ps-label">Score</span><span class="ps-val">${data.score?.toLocaleString()}</span></div>
    <div class="ps-row"><span class="ps-label">Rank</span><span class="ps-val">#${data.rank} of ${data.totalPlayers}</span></div>
    <div class="ps-row"><span class="ps-label">Percentile</span><span class="ps-val">Top ${100 - data.percentile}%</span></div>
  `;
}

// ── NEW: ZCARD — total player count ─────────────────────────
async function getPlayerCount() {
  const data = await get('/api/sorted/count');
  showResponse('sorted', data);

  const el = document.getElementById('zcardResult');
  el.classList.remove('hidden');
  el.style.cssText = `
    margin: 10px 0;
    padding: 14px 18px;
    background: rgba(255,75,75,0.06);
    border: 1px solid rgba(255,75,75,0.2);
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 0.85rem;
  `;
  el.innerHTML = `
    <div>
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">ZCARD result</div>
      <div style="font-size:1.6rem;font-weight:800;color:var(--redis-orange);">${data.totalPlayers}</div>
      <div style="color:var(--text-muted);font-size:0.75rem;">total players</div>
    </div>
    <div style="width:1px;height:40px;background:var(--border)"></div>
    <div>
      <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">🥇 #1 Player</div>
      <div style="font-weight:700;color:var(--accent-green);">${data.topPlayer?.player || '—'}</div>
      <div style="color:var(--text-muted);font-size:0.75rem;">${data.topPlayer?.score?.toLocaleString() || '—'} pts</div>
    </div>
    <div style="margin-left:auto;font-family:var(--mono);font-size:0.72rem;color:var(--text-dim);">O(1) — instant!</div>
  `;
  toast(`ZCARD → ${data.totalPlayers} players`);
}


// ═══════════════════════════════════════════════════════════════

let eventSource = null;
let currentChannel = null;
let currentUser = null;

async function joinChannel() {
  const channel  = document.getElementById('chatChannel').value.trim();
  const username = document.getElementById('chatUsername').value.trim();
  if (!channel || !username) return toast('Channel and username required', 'error');

  currentChannel = channel;
  currentUser    = username;

  // Connect SSE
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/pubsub/subscribe/${encodeURIComponent(channel)}`);

  eventSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'connected') {
      appendChatMsg(null, `Connected to #${channel}`, 'system');
      return;
    }
    try {
      const payload = JSON.parse(msg.message);
      const isMe = payload.sender === username;
      appendChatMsg(payload.sender, payload.text, isMe ? 'mine' : 'other', payload.time);
    } catch { appendChatMsg(null, msg.message, 'system'); }
  };

  eventSource.onerror = () => {
    appendChatMsg(null, 'Connection error — reconnecting...', 'system');
  };

  document.getElementById('chatSetup').classList.add('hidden');
  document.getElementById('chatRoom').classList.remove('hidden');
  document.getElementById('chatChannelLabel').textContent = `#${channel}`;

  showResponse('pubsub', {
    command: `SUBSCRIBE ${channel}`,
    explanation: `Subscribed to "${channel}" channel via Server-Sent Events. Redis SUBSCRIBE puts this connection in listening mode. Any PUBLISH to "${channel}" will stream here instantly.`
  });
}

function leaveChannel() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  document.getElementById('chatRoom').classList.add('hidden');
  document.getElementById('chatSetup').classList.remove('hidden');
  document.getElementById('chatMessages').innerHTML = '';
  currentChannel = null;
}

async function sendMessage() {
  const msg = document.getElementById('chatMsg').value.trim();
  if (!msg || !currentChannel) return;
  document.getElementById('chatMsg').value = '';

  const data = await post('/api/pubsub/publish', {
    channel: currentChannel,
    message: msg,
    sender: currentUser
  });
  showResponse('pubsub', data);
}

function appendChatMsg(sender, text, type, time) {
  const el = document.getElementById('chatMessages');
  const div = document.createElement('div');

  if (type === 'system') {
    div.className = 'chat-system';
    div.textContent = text;
  } else {
    div.className = `chat-msg ${type}`;
    div.innerHTML = `
      <div class="sender">${sender}</div>
      <div class="text">${escHtml(text)}</div>
      <div class="ts">${time || new Date().toLocaleTimeString()}</div>
    `;
  }
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════════════════════════════════
// MODULE 8: RATE LIMITING
// ═══════════════════════════════════════════════════════════════

const LIMITS_MAP = { api: 10, login: 5, search: 30 };

async function makeRequest() {
  const identifier = document.getElementById('rlIdentifier').value.trim() || 'user-123';
  const type       = document.getElementById('rlType').value;

  const data = await post('/api/ratelimit/request', { identifier, type });
  showResponse('ratelimit', data);

  // Update meter
  const limit = LIMITS_MAP[type];
  const pct   = Math.min(100, (data.requestCount / limit) * 100);
  const fill  = document.getElementById('meterFill');
  fill.style.width = pct + '%';
  fill.className = `meter-bar-fill ${pct >= 80 ? 'danger' : ''}`;
  document.getElementById('meterLabels').innerHTML = `
    <span>${data.requestCount} / ${limit}</span>
    <span>Window resets in ${data.resetIn}s</span>
  `;

  // Log entry
  const log = document.getElementById('requestLog');
  const entry = document.createElement('div');
  entry.className = 'req-entry';
  entry.innerHTML = `
    <div class="req-status ${data.allowed ? 'ok' : 'blocked'}"></div>
    <span class="req-text">${data.allowed ? '✅ ALLOWED' : '❌ BLOCKED (429)'} — ${type}</span>
    <span class="req-count">${data.requestCount}/${limit}</span>
    <span class="req-time">${new Date().toLocaleTimeString()}</span>
  `;
  log.insertBefore(entry, log.firstChild);
  if (!data.allowed) toast(`Rate limit exceeded! Try again in ${data.resetIn}s`, 'error');
}

async function resetRateLimit() {
  const identifier = document.getElementById('rlIdentifier').value.trim() || 'user-123';
  const data = await del(`/api/ratelimit/reset/${encodeURIComponent(identifier)}`);
  showResponse('ratelimit', data);
  document.getElementById('requestLog').innerHTML = '';
  document.getElementById('meterFill').style.width = '0%';
  document.getElementById('meterLabels').innerHTML = '<span>0 / ?</span><span>? seconds left</span>';
  toast(`Rate limit reset for ${identifier}`);
}

async function loadRlStatus() {
  const identifier = document.getElementById('rlIdentifier').value.trim() || 'user-123';
  const data = await get(`/api/ratelimit/status/${encodeURIComponent(identifier)}`);
  const grid = document.getElementById('rlStatusGrid');
  grid.innerHTML = Object.entries(data.limits).map(([type, info]) => {
    const pct = Math.min(100, (info.current / info.limit) * 100);
    return `
      <div class="rl-status-row">
        <div class="rl-status-type">${type} endpoint (${info.limit} req/${info.windowSec}s)</div>
        <div class="rl-mini-bar"><div class="rl-mini-fill" style="width:${pct}%"></div></div>
        <div class="rl-mini-labels"><span>${info.current}/${info.limit} requests</span><span>Resets in ${info.resetIn}s</span></div>
      </div>
    `;
  }).join('');
}

// ── Pub/Sub Experiment: Publish with 0 vs N subscribers ──────────

async function publishToGhost() {
  const channel = document.getElementById('ghostChannel').value.trim() || 'ghost-channel';
  const message = document.getElementById('ghostMsg').value.trim() || 'Hello void!';
  const data = await post('/api/pubsub/publish', { channel, message, sender: 'Experiment' });
  showResponse('pubsub', data);

  const el = document.getElementById('ghostResult');
  el.style.display = 'block';
  const count = data.receivers;
  el.innerHTML = `
    <div style="color:${count === 0 ? '#EF4444' : 'var(--accent-green)'}">
      PUBLISH ${channel} "${message}"<br/>
      → <strong style="font-size:1.1rem">${count}</strong> receiver${count !== 1 ? 's' : ''}
      ${count === 0 ? ' ❌ Message lost forever!' : ' ✅ Delivered!'}
    </div>`;

  // Update comparison panel
  document.getElementById('ghostCount').textContent = count;
  document.getElementById('receiversComparison').style.display = 'block';
  toast(count === 0 ? `0 receivers — message vanished! 💨` : `${count} receiver(s) got the message!`);
}

async function publishToLive() {
  const channel = document.getElementById('liveChannel').value.trim() || 'live-demo';
  const message = document.getElementById('liveMsg').value.trim() || 'Anyone there?';
  const data = await post('/api/pubsub/publish', { channel, message, sender: 'Experiment' });
  showResponse('pubsub', data);

  const el = document.getElementById('liveResult');
  el.style.display = 'block';
  const count = data.receivers;
  el.innerHTML = `
    <div style="color:${count === 0 ? '#EF4444' : 'var(--accent-green)'}">
      PUBLISH ${channel} "${message}"<br/>
      → <strong style="font-size:1.1rem">${count}</strong> receiver${count !== 1 ? 's' : ''}
      ${count === 0 ? ' ❌ Nobody listening — join the channel first!' : ' ✅ Delivered to all subscribers!'}
    </div>`;

  // Update comparison panel
  document.getElementById('liveCount').textContent = count;
  document.getElementById('receiversComparison').style.display = 'block';
  toast(count === 0 ? `0 receivers — join the channel first!` : `📡 Delivered to ${count} subscriber(s)!`);
}


function toggleCheatSheet() {
  document.getElementById('cheatSheetOverlay').classList.toggle('hidden');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('cheatSheetOverlay').classList.add('hidden');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggleCheatSheet();
  }
});

// ── Init ─────────────────────────────────────────────────────────
loadCacheStats();
