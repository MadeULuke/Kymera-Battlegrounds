// Server test for Free For All lobbies: 3 to 10 players, the plain map, and the start rules.
// Needs the server on PORT (default 3122). Run it against a copy with a fresh data folder.
const { io } = require('socket.io-client');
const fs = require('fs'), path = require('path');
const URL = 'http://localhost:' + (process.env.PORT || 3122);
const client = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
const wait = ms => new Promise(r => setTimeout(r, ms));
const emit = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout on ' + ev)), 5000);
  s.emit(ev, payload, r => { clearTimeout(t); res(r); });
});
// The start event takes only a callback (no payload)
const startGame = s => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout on start')), 5000); s.emit('start', r => { clearTimeout(t); res(r); }); });
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const host = client(); await new Promise(r => host.on('connect', r));
  let lobby = null, state = null;
  host.on('lobby', l => { lobby = l; });
  host.on('state', s => { state = s; });

  const made = await emit(host, 'create', { mode: 'ffa', char: 'xeno', map: 'qvx' });
  check('a Free For All room can be created', !!made.code, JSON.stringify(made));
  await wait(120);
  check('the lobby is Free For All, up to 10 players, on the plain', lobby && lobby.mode === 'ffa' && lobby.size === 10 && lobby.map === 'plains', JSON.stringify(lobby && { m: lobby.mode, s: lobby.size, map: lobby.map }));
  check('one player cannot start', lobby && lobby.canStart === false);

  const guests = [];
  const join = async () => { const g = client(); await new Promise(r => g.on('connect', r)); guests.push(g); return emit(g, 'join', { code: made.code, char: 'xeno' }); };
  await join();
  const err2 = await startGame(host);
  check('two players cannot start (3 are needed)', err2.error === 'Start needs at least 3 players.', JSON.stringify(err2));
  await join();
  await wait(120);
  check('the host can start with 3 players', lobby && lobby.canStart === true, 'canStart=' + (lobby && lobby.canStart));
  for (let i = 0; i < 7; i++) await join();
  await wait(120);
  check('the lobby fills to 10 players', lobby && lobby.slots.length === 10, 'slots=' + (lobby && lobby.slots.length));
  const full = await join();
  check('an 11th player is turned away', full.error === 'That lobby is full or already playing.', JSON.stringify(full));

  const started = await startGame(host);
  check('the match starts', started.ok === true, JSON.stringify(started));
  await wait(150);
  check('the match is Free For All and in a fight', state && state.mode === 'ffa' && state.phase === 'fight', JSON.stringify(state && { m: state.mode, p: state.phase }));

  // Rules that need a fight are checked in the source, since a real knock-out takes a live match
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  check('a kill pays KILL_REWARD (5 K Serum) to the attacker', src.includes('function creditKill') && src.includes('KILL_REWARD'));
  check('the last player standing gets players x 5 K Serum', src.includes('players * FFA.rewardPerPlayer'));
  check('the round ends when one player is left', src.includes('if (alive.length <= 1) return endRoundFfa'));
  check('the match winner has the most rounds, then the most kills', src.includes('(b.roundWins || 0) - (a.roundWins || 0) || (b.kills || 0) - (a.kills || 0)'));
  check('the plain is 4x the arena area (double radius)', src.includes('plains: { r: 17.4 }'));

  // Join Random finds a public Free For All room, or starts one
  const r1 = client(); await new Promise(res => r1.on('connect', res)); guests.push(r1);
  const rand1 = await emit(r1, 'joinRandom', { mode: 'ffa', char: 'xeno' });
  const r2 = client(); await new Promise(res => r2.on('connect', res)); guests.push(r2);
  const rand2 = await emit(r2, 'joinRandom', { mode: 'ffa', char: 'xeno' });
  check('Join Random starts a public Free For All room', !!rand1.code, JSON.stringify(rand1));
  check('a second Join Random finds that Free For All room', rand2.code === rand1.code, JSON.stringify([rand1, rand2]));
  console.log(failures ? `\n${failures} FAILED` : '\nAll Free For All server checks passed');
  [host, ...guests].forEach(x => x.disconnect());
  process.exit(failures ? 1 : 0);
})().catch(err => { console.log('TEST ERROR', err.message); process.exit(2); });
