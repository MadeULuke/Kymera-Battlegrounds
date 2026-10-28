const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname + '/public'));
const server = http.createServer(app);
const io = new Server(server);

// ---- Accounts (saved in data/accounts.json) ----
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'accounts.json');
// The owner's account name goes in data/owner.txt. Only that account sees the admin page.
const OWNER = (() => {
  try { return fs.readFileSync(path.join(DATA_DIR, 'owner.txt'), 'utf8').trim().toLowerCase() || null; } catch (e) { return null; }
})();
let store = { users: {}, sessions: {} };
try { store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
store.users = store.users || {};
store.sessions = store.sessions || {};
function saveStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const validName = n => typeof n === 'string' && NAME_RE.test(n);
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function checkPw(user, pw) {
  const a = Buffer.from(hashPw(String(pw), user.salt), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newUser(name, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { name, salt, hash: hashPw(pw, salt), ks: 0, owned: ['xeno'], wins: 0, losses: 0, binds: {}, history: [], gifts: [], favorite: null, created: Date.now() };
}
const nameOf = pid => { const u = pid.startsWith('user:') ? store.users[pid.slice(5)] : null; return u ? u.name : 'Guest'; };
const TITLE_RANKS = 3;   // the top this many on each board earn a title
const BOARDS = [['wins', 'Wins'], ['ks', 'K Serum']];
const winRateOf = u => (u.wins + u.losses) ? Math.round(100 * u.wins / (u.wins + u.losses)) : null;
function board(field) {
  return Object.entries(store.users)
    .map(([key, u]) => ({ key, name: u.name, value: u[field] || 0 }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 10);
}
function rankOf(field, key) {
  const sorted = Object.entries(store.users)
    .filter(([, u]) => (u[field] || 0) > 0)
    .sort(([, a], [, b]) => (b[field] || 0) - (a[field] || 0) || a.name.localeCompare(b.name));
  const i = sorted.findIndex(([k]) => k === key);
  return i < 0 ? 0 : i + 1;
}
// Titles change automatically as ranks change, so a title is lost when someone passes you
function titlesFor(key) {
  return BOARDS.map(([field, label]) => ({ label, rank: rankOf(field, key) }))
    .filter(t => t.rank && t.rank <= TITLE_RANKS)
    .map(t => 'Rank ' + t.rank + ' for ' + t.label);
}
// ---- Titles: free ones, the Xeno Glazer award, and leaderboard titles (which change as ranks change) ----
const FREE_TITLES = ['velmarian', 'draxen'];
const TITLE_INFO = {
  velmarian: { name: 'Velmarian', color: '#4aa3ff' },
  draxen: { name: 'Draxen', color: '#43d17a' },
  xeno_glazer: { name: 'Xeno Glazer', color: '#800000' },
};
const XENO_STREAK = 10; // matches in a row as Xeno, win or lose
function ownedTitles(key) {
  const u = store.users[key];
  if (!u) return [];
  const list = [...FREE_TITLES, ...(u.earnedTitles || [])].map(id => ({ id, ...TITLE_INFO[id] }));
  titlesFor(key).forEach(label => list.push({ id: 'rank:' + label, name: label, color: '#dcae5a' }));
  return list;
}
// The title a player is wearing, or null if they no longer own it (for example, after losing a leaderboard place)
function wornTitle(key) {
  const u = store.users[key];
  if (!u || !u.equippedTitle) return null;
  return ownedTitles(key).find(t => t.id === u.equippedTitle) || null;
}
function scoreOf(room, p) {
  if (room.mode === 'ffa') return (p.roundWins || 0) + ' rounds, ' + (p.kills || 0) + ' kills';
  return room.wins[p.team] + '-' + room.wins[1 - p.team];
}
// Keeps the last 50 matches on each logged-in player's account
function recordMatch(room) {
  room.players.forEach(p => {
    if (p.left || !p.pid.startsWith('user:')) return;
    const u = store.users[p.pid.slice(5)];
    if (u) { // 10 matches in a row as Xeno, win or lose
      if (p.char === 'xeno') { u.xenoStreak = (u.xenoStreak || 0) + 1; if (u.xenoStreak >= XENO_STREAK) u.earnedTitles = [...new Set([...(u.earnedTitles || []), 'xeno_glazer'])]; }
      else u.xenoStreak = 0;
    }
    if (!u) return;
    const won = p.team === room.matchWinner;
    if (won) u.wins++; else u.losses++;
    const enemies = room.players.filter(q => q.team !== p.team);
    const mates = room.players.filter(q => q !== p && q.team === p.team);
    u.history = [{
      at: Date.now(), result: won ? 'won' : 'lost', mode: room.mode,
      score: scoreOf(room, p),
      vs: enemies.map(q => nameOf(q.pid)).join(' & '),
      with: mates.map(q => nameOf(q.pid)).join(' & '),
      char: CHARS[p.char].name, oppChar: enemies.map(q => CHARS[q.char].name).join(' & '),
      map: MAPS[room.map] || room.map,
    }, ...(u.history || [])].slice(0, 50);
  });
  saveStore();
}

// Sends a fresh profile to every open connection logged in as this account
function notifyUser(key) {
  for (const s of io.sockets.sockets.values()) {
    if (s.data.user === key) s.emit('profile', profileOf('user:' + key));
  }
}

const MAPS = { qvx: 'QVX (blue)', imira: 'Last Stand for Imira (red)', plains: 'Plains (Free For All)' };
const ACTION_IDS = ['move_up', 'move_left', 'move_down', 'move_right', 'ability', 'ult', 'm1', 'move1', 'move2', 'move3', 'move4'];
const RESERVED_KEYS = ['Escape', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
function bindsError(b) {
  if (!b || typeof b !== 'object') return 'Invalid key binds.';
  const seen = new Map();
  for (const a of ACTION_IDS) {
    const k = b[a];
    if (typeof k !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(k)) return 'Invalid key for ' + a + '.';
    if (RESERVED_KEYS.includes(k)) return 'That key is reserved: ' + k + '.';
    if (seen.has(k)) return 'Invalid: ' + k + ' is used for two actions.';
    seen.set(k, a);
  }
  return null;
}

// Kymera roster. Stats, prices, and abilities are placeholders to tune.
const CHARS = {
  xeno: { name: 'Xeno', title: 'Minotaur', price: 600, hp: 100, damage: 11, speed: 4.2, meter: false, ability: 'aura', abilityLabel: 'Ability: dark aura' },
  cc: { name: 'CatClaw', title: 'Fast cat', price: 1000, hp: 50, lives: 3, damage: 10, speed: 7.5, meter: false, ability: 'dash', abilityLabel: 'Ability: burst dash', desc: 'Protected for 3 seconds after each respawn.' },
  tm: { name: 'Tank Maestro', title: 'Tank', price: 600, hp: 150, damage: 8, speed: 3.2, meter: true, ability: 'metal', abilityLabel: 'Special: metal form' },
};

// Tank Maestro's special meter, in percent
const METER = {
  passiveFill: 100 / 20,  // a full meter takes 20 seconds, only while the special is off
  hitFill: 10,            // added for each punch that lands
  drain: 100 / 5,         // a full meter lasts 5 seconds while the special is on
  carryFactor: 0.5,       // share of the meter kept between rounds, rounded
};
const METAL = { damageDealt: 1.2, damageTaken: 0.5 };
// Xeno's dark aura
const AURA = { duration: 5000, cd: 15000, cdHeal: 20000, heal: 35, damage: 1.5 };
// CatClaw's dash. The timing bar sweeps once every `period` ms.
const DASH = { cd: 15000, window: 2500, period: 1200, zone: 0.16, duration: 900, speed: 34, hitRadius: 1.6,
  metalHit: 0.10, auraHit: 0.30, knockback: 2.5, knockbackMs: 300 };
// CatClaw's tired-out state after a missed dash
const TIRED = { duration: 5000, punchCooldown: 1000 };
// Ultimate bar: each punch that lands adds this much (placeholder amount)
const ULT = { perHit: 0.05 };
// Arena limits for each map: QVX is a circle, Last Stand for Imira is a rectangle
const ARENA = { qvx: { r: 8.7 }, imira: { hx: 12.7, hz: 7.7 }, plains: { r: 17.4 } };
function clampPos(map, x, z) {
  if (map === 'imira') {
    return { x: Math.max(-ARENA.imira.hx, Math.min(ARENA.imira.hx, x)), z: Math.max(-ARENA.imira.hz, Math.min(ARENA.imira.hz, z)) };
  }
  const r = Math.hypot(x, z), R = (ARENA[map] && ARENA[map].r) || ARENA.qvx.r;
  return r > R ? { x: x * R / r, z: z * R / r } : { x, z };
}

const ROUNDS = 3;
const ROUND_REWARD = 5;   // K Serum (KS) per round won
const MATCH_BONUS = 20;    // extra KS for winning the match
const KILL_REWARD = 5;     // K Serum per kill (Free For All)
const FFA = { min: 3, max: 10, rewardPerPlayer: 5, spawnRadius: 12 };
const LIMIT = 8.7;          // keep fighters inside the arena
const PUNCH_RANGE = 2.6;
const PUNCH_COOLDOWN = 450; // ms
const HIT_CHANCE = 0.8;     // one punch in five is dodged
const BETWEEN_ROUNDS = 2000;
const RESPAWN_MS = 2000;   // pause after a life is lost
const TICK = 100;           // ms, how often meters and abilities update
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const rooms = new Map();   // lobby code -> room
const roomOf = new Map();  // socket id -> room
const wallets = new Map(); // player id -> money (in memory; resets when the server restarts)
const owned = new Map();   // player id -> Set of owned Kymera ids (in memory)

const ownedBy = pid => {
  if (!owned.has(pid)) owned.set(pid, new Set(['xeno']));
  return owned.get(pid);
};
const profileOf = pid => {
  const key = pid.startsWith('user:') ? pid.slice(5) : null;
  const u = key ? store.users[key] : null;
  return {
    ks: wallets.get(pid) || 0,
    owned: [...ownedBy(pid)],
    name: u ? u.name : null,
    wins: u ? u.wins : 0,
    losses: u ? u.losses : 0,
    winRate: u ? winRateOf(u) : null,
    favorite: u ? u.favorite || null : null,
    titles: u ? ownedTitles(key) : [],
    equippedTitle: u ? wornTitle(key) : null,
    isOwner: !!key && key === OWNER,
    binds: u ? u.binds : {},
    settings: u ? settingsMap(u) : null,
    layouts: u ? (u.layouts || {}) : {},
  };
};
const pickChar = (pid, payload) => {
  const id = payload && payload.char;
  return CHARS[id] && ownedBy(pid).has(id) ? id : 'xeno';
};

// Timing bar position, 0 to 1 and back, once every DASH.period
const tri = ms => {
  const ph = (ms % DASH.period) / DASH.period;
  return ph < 0.5 ? ph * 2 : (1 - ph) * 2;
};

// Distance from point (px, pz) to the segment from (ax, az) to (bx, bz)
function segDist(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

function newCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

const SPAWN_SHIELD_MS = 3000; // after a CatClaw respawn: invulnerable and unable to attack for this long

function newPlayer(sock, pid, char) {
  return {
    sock, pid, char, team: 0, hp: CHARS[char].hp, maxHp: CHARS[char].hp, livesLeft: CHARS[char].lives || 1,
    out: false, shieldUntil: 0, x: 0, z: 0, rot: 0, lastPunch: 0,
    meter: 0, metal: false,
    cdUntil: 0, auraUntil: 0, auraStart: 0, mg: null, tiredUntil: 0, dashUntil: 0, ult: 0, refillFrom: 0,
  };
}

function resetAbilities(p) {
  p.cdUntil = 0; p.auraUntil = 0; p.mg = null; p.tiredUntil = 0; p.dashUntil = 0; p.metal = false;
  p.ult = 0; p.refillFrom = 0;
}

// Players per side: 1v1 is one per side, 2v2 is two per side
function perTeamOf(mode) { return mode === '2v2' ? 2 : 1; }
function sizeOf(mode) { return mode === 'ffa' ? FFA.max : perTeamOf(mode) * 2; }
function teamCounts(room) { const c = [0, 0]; room.players.forEach(p => { if (p.team < 2) c[p.team]++; }); return c; }
function openTeam(room) {
  if (room.mode === 'ffa') return room.players.length < FFA.max ? room.players.length : -1; // everyone has their own team
  const c = teamCounts(room), per = perTeamOf(room.mode);
  return c[0] < per ? 0 : (c[1] < per ? 1 : -1);
}
// Blue (team 0) starts on the left, red (team 1) starts on the right
function spawnPos(room, p) {
  if (room.mode === 'ffa') {
    const a = (room.players.indexOf(p) / Math.max(1, room.players.length)) * Math.PI * 2;
    return { x: Math.cos(a) * FFA.spawnRadius, z: Math.sin(a) * FFA.spawnRadius };
  }
  const side = p.team === 0 ? -1 : 1;
  const slot = room.players.filter(q => q.team === p.team && !q.left).indexOf(p);
  if (room.mode === '2v2') return { x: side * 5, z: slot === 0 ? -1.5 : 1.5 };
  return { x: side * 3, z: 0 };
}
const shielded = (p, now) => now < p.shieldUntil;

// What a dash does depends on the defender:
// metal form (Tank Maestro): stands still and takes 10% of max HP
// dark aura (Xeno): takes 30% of max HP and is knocked back
// anything else: instant kill
function dashHit(room, att, def) {
  const now = Date.now();
  if (def.metal) {
    def.hp = Math.max(0, +(def.hp - def.maxHp * DASH.metalHit).toFixed(1));
  } else if (now < def.auraUntil) {
    def.hp = Math.max(0, +(def.hp - def.maxHp * DASH.auraHit).toFixed(1));
    const dx = def.x - att.x, dz = def.z - att.z, len = Math.hypot(dx, dz) || 1;
    def.sock.emit('knock', { dx: dx / len, dz: dz / len, dist: DASH.knockback, dur: DASH.knockbackMs });
  } else {
    def.hp = 0;
  }
  if (def.hp <= 0) return downed(room, def, att);
  sendState(room);
}

function tire(p) {
  p.tiredUntil = Date.now() + TIRED.duration;
  p.mg = null;
}

function sendState(room) {
  const now = Date.now();
  room.players.forEach((p, i) => {
    if (p.left) return;
    const e0 = room.players.find(q => q.team !== p.team && !q.left) || null;
    const pick = w => (w === null ? null : w === p.team ? 'won' : 'lost');
    p.sock.emit('state', {
      index: i, team: p.team, mode: room.mode, phase: room.phase, round: room.round,
      hp: [p.hp, e0 ? e0.hp : 0], hpMax: [p.maxHp, e0 ? e0.maxHp : 100],
      char: p.char, oppChar: e0 ? e0.char : null,
      wins: [room.wins[p.team], room.wins[1 - p.team]],
      roundResult: pick(room.roundWinner), matchResult: pick(room.matchWinner),
      ks: wallets.get(p.pid) || 0, spawn: room.spawn || 0,
      lives: [p.livesLeft, e0 ? e0.livesLeft : 1], livesMax: [CHARS[p.char].lives || 1, e0 ? (CHARS[e0.char].lives || 1) : 1],
      players: room.players.map((q, j) => ({
        index: j, name: nameOf(q.pid), team: q.team, char: q.char, hp: q.hp, maxHp: q.maxHp,
        livesLeft: q.livesLeft, livesMax: CHARS[q.char].lives || 1, out: q.out, left: !!q.left, shielded: shielded(q, now), kills: q.kills || 0, roundWins: q.roundWins || 0,
        x: q.x, z: q.z,
      })),
    });
  });
}

function sendMeters(room) {
  const metals = room.players.map(q => q.metal);
  room.players.forEach(p => {
    if (p.left) return;
    const e0 = room.players.find(q => q.team !== p.team && !q.left) || null;
    p.sock.emit('meter', {
      meter: Math.round(p.meter), metal: p.metal,
      oppMeter: e0 ? Math.round(e0.meter) : 0, oppMetal: e0 ? e0.metal : false,
      metals,
    });
  });
}

function abilityView(p, now) {
  const kind = CHARS[p.char].ability;
  const span = Math.max(1, p.cdUntil - p.refillFrom);
  const refill = Math.min(1, Math.max(0, (now - p.refillFrom) / span));
  if (kind === 'aura') {
    if (now < p.auraUntil) return { fill: (p.auraUntil - now) / AURA.duration, label: 'Dark aura: press again to heal' };
    return { fill: refill, label: 'Dark aura' };
  }
  if (kind === 'dash') {
    if (p.mg) return { fill: refill, label: 'Press in the gold zone' };
    if (now < p.tiredUntil) return { fill: refill, label: 'Tired out' };
    return { fill: refill, label: 'Burst dash' };
  }
  if (kind === 'metal') return { fill: p.meter / 100, label: p.metal ? 'Metal form on: press to stop' : 'Metal form' };
  return { fill: 1, label: '' };
}

function sendAbility(room) {
  const now = Date.now();
  room.players.forEach(p => {
    if (p.left) return;
    const e0 = room.players.find(q => q.team !== p.team && !q.left) || null;
    const ab = abilityView(p, now);
    p.sock.emit('ability', {
      serverNow: now,
      kind: CHARS[p.char].ability,
      cdLeft: Math.max(0, Math.ceil((p.cdUntil - now) / 1000)),
      aura: now < p.auraUntil,
      tired: now < p.tiredUntil,
      lockStart: p.mg ? p.mg.start : 0,
      oppAura: e0 ? now < e0.auraUntil : false,
      auras: room.players.map(q => now < q.auraUntil),
      abFill: ab.fill,
      abLabel: ab.label,
      ultFill: p.ult,
      ultLabel: p.ult >= 1 ? 'Ultimate ready' : 'Ultimate',
    });
  });
}

// Runs every TICK ms during a fight
function tick(room) {
  const dt = TICK / 1000, now = Date.now();
  room.players.forEach(p => {
    if (CHARS[p.char].meter) {
      if (p.metal) {
        p.meter = Math.max(0, p.meter - METER.drain * dt);
        if (p.meter === 0) p.metal = false;
      } else {
        p.meter = Math.min(100, p.meter + METER.passiveFill * dt);
      }
    }
    if (p.mg && now - p.mg.start > DASH.window) p.mg = null; // no press in time: no dash was tried, so no tiredness
  });
  sendMeters(room);
  sendAbility(room);
}
setInterval(() => rooms.forEach(room => { if (room.phase === 'fight') tick(room); }), TICK);

function startRound(room) {
  room.phase = 'fight';
  room.roundWinner = null;
  room.players.forEach(p => {
    if (p.left) { p.out = true; p.hp = 0; return; }
    p.maxHp = CHARS[p.char].hp;
    p.hp = p.maxHp;
    p.out = false;
    p.shieldUntil = 0;
    p.livesLeft = CHARS[p.char].lives || 1;
    const sp = spawnPos(room, p);
    p.x = sp.x; p.z = sp.z;
    resetAbilities(p);
    if (room.round === 1) p.meter = 0; // each match starts with an empty meter
    if (room.round === 1) { p.kills = 0; p.roundWins = 0; }
  });
  sendState(room);
  sendMeters(room);
}

// Saves a logged-in player's K Serum and owned Kymera
function saveWallet(pid) {
  if (!pid.startsWith('user:')) return;
  const u = store.users[pid.slice(5)];
  if (!u) return;
  u.ks = wallets.get(pid) || 0;
  u.owned = [...ownedBy(pid)];
  saveStore();
}

// A player's health ran out. CatClaw has 3 lives: each death costs one life and he respawns on his own.
// A player with no lives left is out for the round. When a whole side is out, the other side wins the round.
function downed(room, p, att) {
  if (room.phase !== 'fight') return;
  if (room.mode === 'ffa' && att && att !== p) creditKill(room, att);
  p.livesLeft--;
  if (p.livesLeft > 0) return respawnOne(room, p);
  p.out = true;
  p.hp = 0;
  p.mg = null;
  p.dashUntil = 0;
  if (room.mode === 'ffa') return checkFfaRound(room);
  if (!room.players.some(q => q.team === p.team && !q.out)) return endRound(room, 1 - p.team);
  sendState(room);
  sendMeters(room);
}

// Free For All: each knock-out is a kill for whoever landed the last hit, paid at once
function creditKill(room, att) {
  att.kills = (att.kills || 0) + 1;
  wallets.set(att.pid, (wallets.get(att.pid) || 0) + KILL_REWARD);
  saveWallet(att.pid);
  att.sock.emit('profile', profileOf(att.pid));
}
// Free For All: a round ends when one player is left standing
function checkFfaRound(room) {
  const alive = room.players.filter(q => !q.left && !q.out);
  if (alive.length <= 1) return endRoundFfa(room, alive[0] || null);
  sendState(room);
  sendMeters(room);
}
function endRoundFfa(room, winner) {
  if (room.phase !== 'fight') return;
  room.phase = 'between';
  room.roundWinner = winner ? winner.team : null;
  if (winner) winner.roundWins = (winner.roundWins || 0) + 1;
  const players = room.players.filter(q => !q.left).length;
  room.players.forEach(p => { resetAbilities(p); p.meter = Math.round(p.meter * METER.carryFactor); });
  if (winner) { // last one standing: players x 5 K Serum, on top of the kills
    wallets.set(winner.pid, (wallets.get(winner.pid) || 0) + players * FFA.rewardPerPlayer);
    saveWallet(winner.pid);
    winner.sock.emit('profile', profileOf(winner.pid));
  }
  sendState(room);
  sendMeters(room);
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.phase !== 'between') return;
    if (room.round < ROUNDS) { room.round++; startRound(room); return; }
    room.phase = 'over';
    const best = room.players.filter(q => !q.left).sort((a, b) => (b.roundWins || 0) - (a.roundWins || 0) || (b.kills || 0) - (a.kills || 0))[0];
    room.matchWinner = best ? best.team : null;
    recordMatch(room);
    room.players.forEach(p => p.sock.emit('profile', profileOf(p.pid)));
    sendState(room);
  }, BETWEEN_ROUNDS);
}
// Only this player goes back to their spawn point. Nobody else waits.
function respawnOne(room, p) {
  room.spawn = (room.spawn || 0) + 1;
  p.hp = p.maxHp;
  p.mg = null;
  p.dashUntil = 0;
  p.metal = false;
  const sp = spawnPos(room, p);
  p.x = sp.x; p.z = sp.z;
  p.shieldUntil = Date.now() + SPAWN_SHIELD_MS;
  io.to(room.code).emit('posReset', { index: room.players.indexOf(p), x: p.x, z: p.z });
  sendState(room);
  sendMeters(room);
}

function hitPlayer(room, att, def, dmg) {
  if (room.phase !== 'fight' || def.out || shielded(def, Date.now())) return;
  def.hp = Math.max(0, +(def.hp - dmg).toFixed(1));
  if (!att.metal) att.meter = Math.min(100, att.meter + METER.hitFill);
  att.ult = Math.min(1, att.ult + ULT.perHit);
  if (def.hp <= 0) return downed(room, def, att);
  sendState(room);
  sendMeters(room);
}

function endRound(room, team) {
  if (room.phase !== 'fight') return;
  room.phase = 'between';
  room.roundWinner = team;
  room.wins[team]++;
  room.players.forEach(p => {
    resetAbilities(p);
    p.meter = Math.round(p.meter * METER.carryFactor); // half carries over
  });
  room.players.filter(p => p.team === team && !p.left).forEach(p => {
    wallets.set(p.pid, (wallets.get(p.pid) || 0) + ROUND_REWARD);
    saveWallet(p.pid);
    p.sock.emit('profile', profileOf(p.pid));
  });
  sendState(room);
  sendMeters(room);
  setTimeout(() => {
    if (rooms.get(room.code) !== room || room.phase !== 'between') return; // lobby closed, or the match already ended
    if (room.round < ROUNDS) {
      room.round++;
      startRound(room);
      return;
    }
    room.phase = 'over';
    room.matchWinner = room.wins[0] > room.wins[1] ? 0 : 1;
    room.players.filter(p => p.team === room.matchWinner && !p.left).forEach(p => {
      wallets.set(p.pid, (wallets.get(p.pid) || 0) + MATCH_BONUS);
      saveWallet(p.pid);
    });
    recordMatch(room);
    room.players.forEach(p => p.sock.emit('profile', profileOf(p.pid)));
    sendState(room);
  }, BETWEEN_ROUNDS);
}

// ---- Lobbies ----
function makeRoom(socket, pid, payload, map, mode, isPublic) {
  const code = newCode();
  const room = { code, map, mode, isPublic: !!isPublic, players: [], phase: 'waiting', round: 1, wins: [0, 0], roundWinner: null, matchWinner: null, spawn: 0 };
  rooms.set(code, room);
  seatInRoom(room, socket, pid, payload);
  return room;
}
function seatInRoom(room, socket, pid, payload) {
  const p = newPlayer(socket, pid, pickChar(pid, payload));
  p.team = openTeam(room);
  room.players.push(p);
  roomOf.set(socket.id, room);
  socket.join(room.code);
  sendState(room);
  sendLobby(room);
}
function lobbyReady(room) {
  if (room.mode === 'ffa') return room.phase === 'waiting' && room.players.length >= FFA.min;
  const per = perTeamOf(room.mode), c = teamCounts(room);
  return room.phase === 'waiting' && room.players.length === sizeOf(room.mode) && c[0] === per && c[1] === per;
}
function sendLobby(room) {
  const ready = lobbyReady(room);
  room.players.forEach((p, i) => {
    p.sock.emit('lobby', {
      code: room.code, isPublic: room.isPublic, map: room.map, mode: room.mode, size: sizeOf(room.mode), perTeam: perTeamOf(room.mode),
      mySide: p.team, isHost: i === 0, canStart: i === 0 && ready,
      slots: room.players.map((q, j) => ({ index: j, name: nameOf(q.pid), team: q.team, char: q.char, host: j === 0 })),
    });
  });
}

// Close the lobby for everyone. The leaver is not notified.
function closeRoom(room, leaverId) {
  rooms.delete(room.code);
  room.players.forEach(p => {
    roomOf.delete(p.sock.id);
    if (p.sock.id !== leaverId) {
      p.sock.leave(room.code);
      p.sock.emit('opponentLeft');
    }
  });
}

// Someone who left the match gets this much: the rounds they already won. Nothing more.
function recordLeave(room, p) {
  if (room.phase === 'over' || !p.pid.startsWith('user:')) return;
  const u = store.users[p.pid.slice(5)];
  if (!u) return;
  const enemies = room.players.filter(q => q.team !== p.team);
  const mates = room.players.filter(q => q !== p && q.team === p.team);
  u.losses++;
  u.history = [{
    at: Date.now(), result: 'left', mode: room.mode,
    score: scoreOf(room, p),
    vs: enemies.map(q => nameOf(q.pid)).join(' & '),
    with: mates.map(q => nameOf(q.pid)).join(' & '),
    char: CHARS[p.char].name, oppChar: enemies.map(q => CHARS[q.char].name).join(' & '),
    map: MAPS[room.map] || room.map,
  }, ...(u.history || [])].slice(0, 50);
  saveStore();
}

// If one whole side has left, the other side wins the match automatically and gets the bonus.
// If a side still has players, a round ends only when that side has no one left in the round.
function checkAfterLeave(room, p) {
  if (room.phase === 'over') return;
  if (room.mode === 'ffa') {
    const here = room.players.filter(q => !q.left);
    if (here.length < 2) {
      room.phase = 'over';
      room.matchWinner = here[0] ? here[0].team : null;
      recordMatch(room);
      here.forEach(q => q.sock.emit('profile', profileOf(q.pid)));
      sendState(room);
      return;
    }
    if (room.phase === 'fight') checkFfaRound(room);
    return;
  }
  const alive = t => room.players.filter(q => q.team === t && !q.left).length;
  if (alive(0) === 0 || alive(1) === 0) {
    room.phase = 'over';
    room.matchWinner = alive(0) > 0 ? 0 : 1;
    room.players.filter(q => q.team === room.matchWinner && !q.left).forEach(q => {
      wallets.set(q.pid, (wallets.get(q.pid) || 0) + MATCH_BONUS);
      saveWallet(q.pid);
    });
    recordMatch(room);
    room.players.filter(q => !q.left).forEach(q => q.sock.emit('profile', profileOf(q.pid)));
    sendState(room);
    return;
  }
  if (room.phase === 'fight' && !room.players.some(q => q.team === p.team && !q.out)) return endRound(room, 1 - p.team);
  sendState(room);
  sendMeters(room);
}

// A player leaves. In the lobby, the host passes to the next player automatically.
// During a match, the player is out of the round and the match carries on.
function leaveRoom(socket) {
  const room = roomOf.get(socket.id);
  if (!room) return;
  roomOf.delete(socket.id);
  socket.leave(room.code);
  const p = room.players.find(q => q.sock.id === socket.id);
  if (!p || p.left) return;
  const name = nameOf(p.pid);
  if (room.phase === 'waiting') {
    room.players = room.players.filter(q => q !== p);
    if (room.players.length === 0) { rooms.delete(room.code); return; }
    room.players.forEach(q => q.sock.emit('playerLeft', { name, team: p.team }));
    sendState(room);
    sendLobby(room);
    return;
  }
  p.left = true;
  p.out = true;
  p.hp = 0;
  p.mg = null;
  p.dashUntil = 0;
  p.metal = false;
  recordLeave(room, p);
  p.sock.emit('profile', profileOf(p.pid));
  if (room.players.every(q => q.left)) { rooms.delete(room.code); return; }
  room.players.forEach(q => { if (!q.left) q.sock.emit('playerLeft', { name, team: p.team }); });
  checkAfterLeave(room, p);
}

// Button layouts: only known buttons are kept, and every number is kept inside its range
const LAYOUT_IDS = ['joy', 'm1', 'ab', 'moves', 'ult', 'abbar'];
function cleanLayout(l) {
  const out = { opacity: 50, items: {} };
  const n = (v, a, b) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : null);
  const op = n(l && l.opacity, 10, 100);
  if (op !== null) out.opacity = op;
  LAYOUT_IDS.forEach(id => {
    const src = l && l.items && l.items[id];
    if (!src) return;
    const x = n(src.x, 0, 100), y = n(src.y, 0, 100), s = n(src.s, 60, 160);
    if (x !== null && y !== null && s !== null) out.items[id] = { x, y, s };
  });
  return out;
}
// Settings are kept per platform: { pc: {...}, mobile: {...} }. Older accounts kept one set, which belongs to PC.
function settingsMap(u) {
  const s = u.settings || {};
  if (s.pc || s.mobile || s.console) return { pc: s.pc || null, mobile: s.mobile || null, console: s.console || null };
  if ('fx' in s || 'sens' in s) return { pc: { ...s }, mobile: null, console: null };
  return { pc: null, mobile: null, console: null };
}

// ---- Find a player: partial, case-insensitive name search and public profiles ----
const FIND_LIMIT = 10;
const cleanQuery = q => String(q || '').trim().toLowerCase().slice(0, 16);
function publicProfileOf(key) {
  const u = store.users[key];
  if (!u) return null;
  const pid = 'user:' + key;
  return {
    name: u.name,
    wins: u.wins, losses: u.losses, winRate: winRateOf(u),
    titles: ownedTitles(key),
    equippedTitle: wornTitle(key),
    favorite: u.favorite || null,
    owned: [...ownedBy(pid)],
    ks: wallets.has(pid) ? wallets.get(pid) : (u.ks || 0),
    matches: (u.history || []).slice(0, 10),
  };
}

io.on('connection', socket => {
  let pid = String(socket.handshake.auth?.pid || socket.id).slice(0, 64);
  const guestPid = pid;
  const reply = (cb, data) => typeof cb === 'function' && cb(data);

  socket.emit('catalog', CHARS);
  socket.emit('profile', profileOf(pid));

  socket.on('create', (payload, cb) => {
    if (roomOf.has(socket.id)) return reply(cb, { error: 'You are already in a lobby.' });
    const p = payload || {};
    const mode = p.mode === '2v2' || p.mode === 'ffa' ? p.mode : '1v1';
    const room = makeRoom(socket, pid, p, mode === 'ffa' ? 'plains' : (MAPS[p.map] ? p.map : 'qvx'), mode, p.public === true);
    reply(cb, { code: room.code });
  });

  socket.on('join', (payload, cb) => {
    const p = payload || {};
    const room = rooms.get(String(p.code || '').toUpperCase().trim());
    if (!room) return reply(cb, { error: 'No lobby with that code.' });
    if (roomOf.has(socket.id)) return reply(cb, { error: 'You are already in a lobby.' });
    if (room.phase !== 'waiting' || room.players.length >= sizeOf(room.mode)) return reply(cb, { error: 'That lobby is full or already playing.' });
    seatInRoom(room, socket, pid, p);
    reply(cb, { ok: true });
  });

  socket.on('joinRandom', (payload, cb) => {
    if (roomOf.has(socket.id)) return reply(cb, { error: 'You are already in a lobby.' });
    const p = payload || {};
    const mode = p.mode === '2v2' || p.mode === 'ffa' ? p.mode : '1v1';
    const open = [...rooms.values()].find(r => r.isPublic && r.phase === 'waiting' && r.mode === mode && r.players.length < sizeOf(mode));
    if (open) {
      seatInRoom(open, socket, pid, p);
      return reply(cb, { code: open.code });
    }
    const room = makeRoom(socket, pid, p, mode === 'ffa' ? 'plains' : 'qvx', mode, true);
    reply(cb, { code: room.code });
  });

  socket.on('switchSide', cb => {
    const room = roomOf.get(socket.id);
    if (!room || room.phase !== 'waiting') return reply(cb, { error: 'You can only switch sides in the waiting room.' });
    const me = room.players.find(p => p.sock.id === socket.id);
    const target = 1 - me.team;
    if (teamCounts(room)[target] >= perTeamOf(room.mode)) return reply(cb, { error: 'That side is full.' });
    me.team = target;
    sendState(room);
    sendLobby(room);
    reply(cb, { ok: true });
  });

  socket.on('start', cb => {
    const room = roomOf.get(socket.id);
    if (!room || room.players[0].sock.id !== socket.id) return reply(cb, { error: 'Only the host can start.' });
    if (!lobbyReady(room)) return reply(cb, { error: room.mode === 'ffa' ? 'Start needs at least 3 players.' : room.mode === '2v2' ? 'Start needs 4 players with 2 on each side.' : 'Start needs 2 players, one on each side.' });
    reply(cb, { ok: true });
    startRound(room);
  });

  socket.on('buy', (id, cb) => {
    const c = CHARS[id];
    if (!c) return reply(cb, { error: 'Unknown Kymera.' });
    const set = ownedBy(pid);
    if (set.has(id)) return reply(cb, { error: 'You already own this Kymera.' });
    const money = wallets.get(pid) || 0;
    if (money < c.price) return reply(cb, { error: 'Not enough K Serum.' });
    wallets.set(pid, money - c.price);
    set.add(id);
    saveWallet(pid);
    socket.emit('profile', profileOf(pid));
    reply(cb, { ok: true });
  });

  // E: each Kymera's ability
  socket.on('special', () => {
    const room = roomOf.get(socket.id);
    if (!room || room.phase !== 'fight') return;
    const me = room.players.find(p => p.sock.id === socket.id);
    const now = Date.now();
    if (me.out || shielded(me, now)) return;
    const kind = CHARS[me.char].ability;

    if (kind === 'metal') {
      if (me.metal) me.metal = false;
      else if (me.meter > 0) me.metal = true;
      return sendMeters(room);
    }

    if (kind === 'aura') {
      if (now < me.auraUntil) { // pressed again while the aura is on: heal
        me.hp = Math.min(me.maxHp, me.hp + AURA.heal);
        me.auraUntil = 0;
        me.cdUntil = me.auraStart + AURA.cdHeal;
        me.refillFrom = now;
        return sendState(room);
      }
      if (now < me.cdUntil) return;
      me.auraStart = now;
      me.auraUntil = now + AURA.duration;
      me.cdUntil = now + AURA.cd;
      me.refillFrom = me.auraUntil;
      return;
    }

    if (kind === 'dash') {
      if (me.mg) { // second press: the timing decides the dash
        const hit = Math.abs(tri(now - me.mg.start) - 0.5) <= DASH.zone / 2;
        me.mg = null;
        if (hit) {
          me.dashUntil = now + DASH.duration;
          me.sock.emit('dash', { dx: Math.sin(me.rot), dz: Math.cos(me.rot), dur: DASH.duration, speed: DASH.speed });
        }
        return;
      }
      if (now < me.cdUntil || now < me.tiredUntil) return;
      me.cdUntil = now + DASH.cd;
      me.refillFrom = now;
      me.mg = { start: now };
    }
  });

  socket.on('pos', data => {
    const room = roomOf.get(socket.id);
    if (!room) return;
    const me = room.players.find(p => p.sock.id === socket.id);
    const i = room.players.indexOf(me);
    const { x, z, rot } = data || {};
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) return;
    me.rot = rot;
    if (room.phase === 'fight' && !me.out) {
      const px = me.x, pz = me.z;
      const c = clampPos(room.map, x, z);
      me.x = c.x; me.z = c.z;
      const now = Date.now();
      // A dash that passes through an enemy hits them (teammates are never hit)
      if (now < me.dashUntil) {
        const hitTarget = room.players.find(q => q.team !== me.team && !q.out && !shielded(q, now) && segDist(px, pz, me.x, me.z, q.x, q.z) < DASH.hitRadius);
        if (hitTarget) {
          me.dashUntil = 0;
          me.sock.emit('dashStop');
          tire(me); // a dash that hits tires CatClaw
          return dashHit(room, me, hitTarget);
        }
      } else if (me.dashUntil) { // the dash ended without hitting anyone: tired too
        me.dashUntil = 0;
        tire(me);
      }
    }
    room.players.forEach(q => { if (q !== me && !q.left) q.sock.emit('posOf', { index: i, x: me.x, z: me.z, rot }); });
  });

  socket.on('punch', () => {
    const room = roomOf.get(socket.id);
    if (!room || room.phase !== 'fight') return;
    const me = room.players.find(p => p.sock.id === socket.id);
    const now = Date.now();
    if (me.out || shielded(me, now)) return;
    const cooldown = now < me.tiredUntil ? TIRED.punchCooldown : PUNCH_COOLDOWN;
    if (now - me.lastPunch < cooldown) return;
    me.lastPunch = now;
    const i = room.players.indexOf(me);
    room.players.forEach(q => { if (q !== me && !q.left) q.sock.emit('punched', { index: i }); });
    // Punches land on the nearest enemy in range. Teammates are never hit.
    const dist = q => Math.hypot(me.x - q.x, me.z - q.z);
    const target = room.players
      .filter(q => q.team !== me.team && !q.out && !shielded(q, now) && dist(q) < PUNCH_RANGE)
      .sort((a, b) => dist(a) - dist(b))[0];
    if (!target || Math.random() >= HIT_CHANCE) return;
    let dmg = CHARS[me.char].damage;
    if (me.metal) dmg *= METAL.damageDealt;
    if (now < me.auraUntil) dmg *= AURA.damage;
    if (target.metal) dmg *= METAL.damageTaken;
    hitPlayer(room, me, target, dmg);
  });

  // Settings are saved to the account, so they survive updates along with everything else in data/
  // Button layout for the Mobile platform, saved to the account
  socket.on('setLayout', p => {
    if (!socket.data.user || !p || p.platform !== 'mobile') return;
    const u = store.users[socket.data.user];
    u.layouts = { ...(u.layouts || {}), mobile: cleanLayout(p.layout) };
    saveStore();
  });
  socket.on('setTitle', (id, cb) => {
    if (!socket.data.user) return reply(cb, { error: 'Log in to wear a title.' });
    const key = socket.data.user, u = store.users[key];
    if (id !== null && !ownedTitles(key).some(t => t.id === id)) return reply(cb, { error: 'You do not own that title.' });
    u.equippedTitle = id;
    saveStore();
    notifyUser(key);
    reply(cb, { ok: true });
  });
  socket.on('setSettings', p => {
    if (!socket.data.user) return;
    if (!p || !['pc', 'mobile', 'console'].includes(p.platform)) return;
    const st = p.settings || {};
    const u = store.users[socket.data.user];
    const clamp = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
    const map = settingsMap(u);
    map[p.platform] = {
      fx: clamp(st.fx, 0, 100, 70),
      music: clamp(st.music, 0, 100, 70),
      track: String(st.track || 'none').slice(0, 50),
      sens: clamp(st.sens, 1, 100, 50),
    };
    u.settings = map;
    saveStore();
  });

  // Testing only: unlock every Kymera
  socket.on('unlockAll', () => {
    Object.keys(CHARS).forEach(id => ownedBy(pid).add(id));
    saveWallet(pid);
    socket.emit('profile', profileOf(pid));
  });

  // ---- Accounts ----
  const attach = key => {
    pid = 'user:' + key;
    socket.data.user = key;
    if (!wallets.has(pid)) wallets.set(pid, store.users[key].ks || 0);
    if (!owned.has(pid)) owned.set(pid, new Set(store.users[key].owned || ['xeno']));
    socket.emit('profile', profileOf(pid));
  };
  const detach = () => {
    pid = guestPid;
    socket.data.user = null;
    socket.emit('profile', profileOf(pid));
  };
  const newSession = key => {
    const token = crypto.randomBytes(24).toString('hex');
    store.sessions[token] = key;
    saveStore();
    return token;
  };
  socket.data.detach = detach;
  socket.on('checkName', (name, cb) => reply(cb, { available: validName(name) && !store.users[String(name).toLowerCase()] }));
  socket.on('register', (p, cb) => {
    p = p || {};
    if (roomOf.has(socket.id)) return reply(cb, { error: 'Leave your lobby first.' });
    if (!validName(p.name)) return reply(cb, { error: 'Usernames are 3 to 16 letters, numbers, or underscores.' });
    if (typeof p.password !== 'string' || p.password.length < 6) return reply(cb, { error: 'Password must be at least 6 characters.' });
    const key = p.name.toLowerCase();
    if (store.users[key]) return reply(cb, { error: 'That username is taken.' });
    store.users[key] = newUser(p.name, p.password);
    saveStore();
    attach(key);
    reply(cb, { token: newSession(key), name: p.name });
  });
  socket.on('login', (p, cb) => {
    p = p || {};
    if (roomOf.has(socket.id)) return reply(cb, { error: 'Leave your lobby first.' });
    const key = String(p.name || '').toLowerCase();
    const u = store.users[key];
    if (!u || typeof p.password !== 'string' || !checkPw(u, p.password)) return reply(cb, { error: 'Wrong username or password.' });
    attach(key);
    reply(cb, { token: newSession(key), name: u.name });
  });
  socket.on('resume', (token, cb) => {
    const key = store.sessions[token];
    if (!key || !store.users[key] || roomOf.has(socket.id)) return reply(cb, { error: 'Session expired.' });
    attach(key);
    reply(cb, { name: store.users[key].name });
  });
  socket.on('logout', (token, cb) => {
    if (roomOf.has(socket.id)) return reply(cb, { error: 'Leave your lobby first.' });
    delete store.sessions[token];
    saveStore();
    detach();
    reply(cb, { ok: true });
  });
  socket.on('setBinds', (p, cb) => {
    p = p || {};
    if (p.platform !== 'pc' && p.platform !== 'mobile') return reply(cb, { error: 'Unknown platform.' });
    const err = bindsError(p.binds);
    if (err) return reply(cb, { error: err });
    if (!socket.data.user) return reply(cb, { ok: true, local: true });
    store.users[socket.data.user].binds[p.platform] = p.binds;
    saveStore();
    reply(cb, { ok: true });
  });

  // ---- Leaderboards, history, gifts, favorite Kymera, and owner admin ----
  socket.on('leaderboard', cb => reply(cb, { wins: board('wins'), ks: board('ks') }));
  // Anyone can search, guests included. Results are names only.
  socket.on('findPlayers', (q, cb) => {
    const query = cleanQuery(q);
    if (!query) return reply(cb, { results: [] });
    const results = Object.entries(store.users)
      .filter(([key]) => key.includes(query))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, FIND_LIMIT)
      .map(([, u]) => ({ name: u.name }));
    reply(cb, { results });
  });
  socket.on('playerProfile', (name, cb) => {
    const key = cleanQuery(name);
    const profile = key && store.users[key] ? publicProfileOf(key) : null;
    reply(cb, profile ? { profile } : { error: 'No player with that name.' });
  });

  socket.on('getHistory', cb => {
    if (!socket.data.user) return reply(cb, { error: 'Log in to see your history.' });
    const u = store.users[socket.data.user];
    reply(cb, { matches: u.history || [], gifts: u.gifts || [] });
  });
  socket.on('sendGift', (p, cb) => {
    p = p || {};
    if (!socket.data.user) return reply(cb, { error: 'Log in to send K Serum.' });
    const from = socket.data.user;
    const to = String(p.to || '').trim().toLowerCase();
    const amount = Math.floor(Number(p.amount));
    if (!store.users[to]) return reply(cb, { error: 'No account with that username.' });
    if (to === from) return reply(cb, { error: 'You cannot send K Serum to yourself.' });
    if (!Number.isFinite(amount) || amount < 1) return reply(cb, { error: 'Enter an amount of at least 1 K Serum.' });
    const fromPid = 'user:' + from, toPid = 'user:' + to;
    const have = wallets.has(fromPid) ? wallets.get(fromPid) : store.users[from].ks;
    if (have < amount) return reply(cb, { error: 'Not enough K Serum.' });
    const got = wallets.has(toPid) ? wallets.get(toPid) : store.users[to].ks;
    wallets.set(fromPid, have - amount);
    wallets.set(toPid, got + amount);
    store.users[from].ks = have - amount;
    store.users[to].ks = got + amount;
    const at = Date.now();
    store.users[from].gifts = [{ at, dir: 'sent', with: store.users[to].name, amount }, ...(store.users[from].gifts || [])].slice(0, 30);
    store.users[to].gifts = [{ at, dir: 'received', with: store.users[from].name, amount }, ...(store.users[to].gifts || [])].slice(0, 30);
    saveStore();
    notifyUser(from);
    notifyUser(to);
    reply(cb, { ok: true });
  });
  socket.on('setFavorite', (id, cb) => {
    if (!socket.data.user) return reply(cb, { error: 'Log in first.' });
    if (!CHARS[id] || !ownedBy('user:' + socket.data.user).has(id)) return reply(cb, { error: 'Pick a Kymera you own.' });
    store.users[socket.data.user].favorite = id;
    saveStore();
    notifyUser(socket.data.user);
    reply(cb, { ok: true });
  });
  socket.on('adminList', cb => {
    if (!socket.data.user || socket.data.user !== OWNER) return reply(cb, { error: 'Owner only.' });
    reply(cb, {
      users: Object.entries(store.users)
        .map(([key, u]) => ({ key, name: u.name, ks: wallets.has('user:' + key) ? wallets.get('user:' + key) : u.ks, wins: u.wins, losses: u.losses }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  });
  socket.on('adminDelete', (key, cb) => {
    if (!socket.data.user || socket.data.user !== OWNER) return reply(cb, { error: 'Owner only.' });
    key = String(key || '');
    if (!store.users[key]) return reply(cb, { error: 'No account with that name.' });
    if (key === OWNER) return reply(cb, { error: 'You cannot delete the owner account.' });
    for (const s2 of io.sockets.sockets.values()) {
      if (s2.data.user === key) {
        leaveRoom(s2);
        if (s2.data.detach) s2.data.detach();
        s2.emit('accountDeleted');
      }
    }
    for (const [token, k] of Object.entries(store.sessions)) if (k === key) delete store.sessions[token];
    delete store.users[key];
    wallets.delete('user:' + key);
    owned.delete('user:' + key);
    saveStore();
    reply(cb, { ok: true });
  });

  socket.on('leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Kymera Battle Grounds server on port ' + PORT));
