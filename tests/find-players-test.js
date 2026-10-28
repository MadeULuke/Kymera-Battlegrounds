// Server test for Find a player. Needs the server running on PORT (default 3104).
// Run it against a copy with a fresh data folder so test accounts are not left behind.
const { io } = require('socket.io-client');
const URL = 'http://localhost:' + (process.env.PORT || 3104);
const client = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
const emit = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout on ' + ev)), 5000);
  s.emit(ev, payload, r => { clearTimeout(t); res(r); });
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const s = client(); await new Promise(r => s.on('connect', r));
  const names = ['Alice', 'Alicia', 'bobby', 'Carol_99'];
  for (const n of names) {
    const r = await emit(s, 'register', { name: n, password: 'secret1' });
    if (r.error) throw new Error('register ' + n + ': ' + r.error);
  }
  for (let i = 1; i <= 12; i++) await emit(s, 'register', { name: 'test_' + String(i).padStart(2, '0'), password: 'secret1' });
  // A guest (not logged in) must be able to search too
  const g = client(); await new Promise(r => g.on('connect', r));

  let r = await emit(g, 'findPlayers', 'ali');
  check('partial name finds both Alice and Alicia', r.results.map(x => x.name).sort().join(',') === 'Alice,Alicia', JSON.stringify(r.results));
  r = await emit(g, 'findPlayers', 'ALI');
  check('search ignores capitals', r.results.length === 2, JSON.stringify(r.results));
  r = await emit(g, 'findPlayers', 'OBB');
  check('a middle part of a name is found', r.results.length === 1 && r.results[0].name === 'bobby', JSON.stringify(r.results));
  r = await emit(g, 'findPlayers', 'carol_');
  check('underscores are searched', r.results.length === 1 && r.results[0].name === 'Carol_99', JSON.stringify(r.results));
  r = await emit(g, 'findPlayers', 'zzz');
  check('no match gives an empty list, not an error', r.results && r.results.length === 0 && !r.error);
  r = await emit(g, 'findPlayers', '   ');
  check('a blank search gives an empty list', r.results && r.results.length === 0);
  r = await emit(g, 'findPlayers', 'test_');
  check('results are capped at 10', r.results.length === 10, 'count=' + r.results.length);

  r = await emit(g, 'playerProfile', 'ALICE');
  check('profile opens by name, ignoring capitals', r.profile && r.profile.name === 'Alice', JSON.stringify(r).slice(0, 120));
  const json = JSON.stringify(r.profile || {});
  const leaks = ['hash', 'salt', 'token', 'password', 'binds', 'settings', 'sessions', 'gifts'].filter(w => json.includes('"' + w));
  check('profile shows no passwords, sessions, key binds, settings or gifts', leaks.length === 0, leaks.join(',') || 'clean');
  check('profile has the public stats', r.profile && ['wins', 'losses', 'winRate', 'titles', 'favorite', 'owned', 'ks', 'matches'].every(k => k in r.profile));
  check('a new player starts with 0 wins, no win rate, and 1 owned Kymera (Xeno)',
    r.profile && r.profile.wins === 0 && r.profile.winRate === null && r.profile.owned.length === 1 && r.profile.owned[0] === 'xeno', JSON.stringify(r.profile && { w: r.profile.wins, wr: r.profile.winRate, o: r.profile.owned }));
  check('a new player has no matches yet', r.profile && Array.isArray(r.profile.matches) && r.profile.matches.length === 0);

  r = await emit(g, 'playerProfile', 'nobody_here');
  check('an unknown name gives a clear error', r.error === 'No player with that name.', JSON.stringify(r));
  r = await emit(g, 'playerProfile', '');
  check('an empty profile request gives an error', !!r.error);

  console.log(failures ? `\n${failures} FAILED` : '\nAll find-a-player server checks passed');
  [s, g].forEach(x => x.disconnect());
  process.exit(failures ? 1 : 0);
})().catch(err => { console.log('TEST ERROR', err.message); process.exit(2); });
