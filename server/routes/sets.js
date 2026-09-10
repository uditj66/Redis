/**
 * MODULE 5: Sets
 * Redis Commands: SADD, SREM, SMEMBERS, SISMEMBER, SCARD, SINTER, SUNION, SDIFF
 *
 * Core concept: A Set is an UNORDERED collection of UNIQUE strings.
 * No duplicates allowed — Redis automatically ignores repeated additions.
 *
 * Power of Sets: mathematical set operations (intersection, union, difference)
 * happen on the Redis server in microseconds!
 *
 * Use cases: Online users, friend lists, tags, unique visitors, permissions
 */

const router = require('express').Router();
const { getRedis } = require('../redis');

function onlineKey() { return 'users:online'; }
function friendsKey(user) { return `friends:${user}`; }

// Mark user as online
router.post('/online/join', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const r = getRedis();
  const added = await r.sadd(onlineKey(), username);
  const count = await r.scard(onlineKey());

  res.json({
    username,
    wasAlreadyOnline: added === 0,
    onlineCount: count,
    command: `SADD users:online "${username}"`,
    explanation: added === 1
      ? 'SADD added the user. Returns 1 for new member, 0 if already existed. SCARD returns the set size.'
      : 'User was already in the set — Sets guarantee uniqueness. SADD returned 0 (not re-added).'
  });
});

// Mark user as offline
router.post('/online/leave', async (req, res) => {
  const { username } = req.body;
  const r = getRedis();
  const removed = await r.srem(onlineKey(), username);
  const count = await r.scard(onlineKey());
  res.json({
    removed: removed === 1,
    onlineCount: count,
    command: `SREM users:online "${username}"`,
    explanation: 'SREM removes a member. Returns 1 if removed, 0 if not found.'
  });
});

// Get all online users
router.get('/online', async (req, res) => {
  const r = getRedis();
  const members = await r.smembers(onlineKey());
  const count = await r.scard(onlineKey());
  res.json({
    onlineUsers: members,
    count,
    command: 'SMEMBERS users:online',
    explanation: 'SMEMBERS returns all members of the set. O(N). Order is NOT guaranteed — Sets are unordered.'
  });
});

// Check if a user is online
router.get('/online/:username', async (req, res) => {
  const r = getRedis();
  const isMember = await r.sismember(onlineKey(), req.params.username);
  res.json({
    username: req.params.username,
    isOnline: isMember === 1,
    command: `SISMEMBER users:online "${req.params.username}"`,
    explanation: 'SISMEMBER is O(1) — constant time check regardless of set size. Perfect for presence checks.'
  });
});

// Add a friend
router.post('/friends/add', async (req, res) => {
  const { user, friend } = req.body;
  const r = getRedis();
  // Friendship is mutual
  await r.sadd(friendsKey(user), friend);
  await r.sadd(friendsKey(friend), user);
  res.json({
    success: true,
    command: `SADD friends:${user} ${friend}  +  SADD friends:${friend} ${user}`,
    explanation: 'For mutual friendship, we add to both users\' sets. Redis Sets handle this elegantly.'
  });
});

// Mutual friends (SINTER = intersection)
router.get('/friends/mutual/:user1/:user2', async (req, res) => {
  const r = getRedis();
  const { user1, user2 } = req.params;
  const mutual = await r.sinter(friendsKey(user1), friendsKey(user2));
  const u1friends = await r.smembers(friendsKey(user1));
  const u2friends = await r.smembers(friendsKey(user2));

  res.json({
    user1: { name: user1, friends: u1friends },
    user2: { name: user2, friends: u2friends },
    mutualFriends: mutual,
    command: `SINTER friends:${user1} friends:${user2}`,
    explanation: `SINTER finds elements in BOTH sets. ${user1} and ${user2} have ${mutual.length} mutual friend(s). This operation happens entirely on the Redis server!`
  });
});

// All unique friends (SUNION = union)
router.get('/friends/union/:user1/:user2', async (req, res) => {
  const r = getRedis();
  const { user1, user2 } = req.params;
  const union = await r.sunion(friendsKey(user1), friendsKey(user2));
  res.json({
    allFriends: union,
    command: `SUNION friends:${user1} friends:${user2}`,
    explanation: 'SUNION merges both sets, removing duplicates. Returns all unique friends of both users combined.'
  });
});

// Friends user1 has but user2 doesn't (SDIFF)
router.get('/friends/diff/:user1/:user2', async (req, res) => {
  const r = getRedis();
  const { user1, user2 } = req.params;
  const diff = await r.sdiff(friendsKey(user1), friendsKey(user2));
  res.json({
    friendsOnlyIn: user1,
    friends: diff,
    command: `SDIFF friends:${user1} friends:${user2}`,
    explanation: `SDIFF returns members in the FIRST set that are NOT in the second. These are ${user1}'s exclusive friends (not friends with ${user2}).`
  });
});

// Get user's friends
router.get('/friends/:user', async (req, res) => {
  const r = getRedis();
  const friends = await r.smembers(friendsKey(req.params.user));
  res.json({ user: req.params.user, friends, count: friends.length });
});

// Clear all sets
router.delete('/clear', async (req, res) => {
  const r = getRedis();
  const keys = await r.keys('users:online');
  const fkeys = await r.keys('friends:*');
  await Promise.all([...keys, ...fkeys].map(k => r.del(k)));
  res.json({ cleared: true });
});

module.exports = router;
