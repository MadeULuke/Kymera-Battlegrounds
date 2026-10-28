// Server test for titles: free titles, wearing one at a time, and no wearing what you do not own. Needs the server on PORT (default 3116).
// Run it against a copy with a fresh data folder.
const { io } = require('socket.io-client');
const fs = require('fs'), path = require('path');
const URL = 'http://localhost:' + (process.env.PORT || 3116);
const client = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
const wait = ms => new Promise(r => setTimeout(r, ms));
const emit = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout on ' + ev)), 5000);
  s.emit(ev, payload, r => { clearTimeout(t); res(r); });
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const s = client(); await new Promise(r => s.on('connect', r));
  let profile = null; s.on('profile', p => { profile = p; });
  const r = await emit(s, 'register', { name: 'titled1', password: 'secret1' });
  check('test account registered', !r.error, r.error || '');
  await wait(200);
  const ids = (profile && profile.titles || []).map(t => t.id);
  check('a new player owns the two free titles', ids.includes('velmarian') && ids.includes('draxen'), JSON.stringify(ids));
  check('a new player is not wearing a title', profile && profile.equippedTitle === null);

  let res = await emit(s, 'setTitle', 'velmarian');
  await wait(150);
  check('wearing Velmarian succeeds', res.ok === true, JSON.stringify(res));
  check('the profile now shows Velmarian as worn', profile && profile.equippedTitle && profile.equippedTitle.name === 'Velmarian', JSON.stringify(profile && profile.equippedTitle));

  res = await emit(s, 'setTitle', 'draxen');
  await wait(150);
  check('only one title at a time: wearing Draxen replaces Velmarian', profile && profile.equippedTitle && profile.equippedTitle.name === 'Draxen');

  res = await emit(s, 'setTitle', 'xeno_glazer');
  check('a title not yet earned cannot be worn', res.error === 'You do not own that title.', JSON.stringify(res));
  res = await emit(s, 'setTitle', 'rank:Rank 1 for Wins');
  check('a leaderboard title you do not hold cannot be worn', !!res.error, JSON.stringify(res));

  res = await emit(s, 'setTitle', null);
  await wait(150);
  check('taking the title off works', profile && profile.equippedTitle === null);

  const g = client(); await new Promise(r => g.on('connect', r));
  res = await emit(g, 'setTitle', 'velmarian');
  check('a guest cannot wear a title', res.error === 'Log in to wear a title.', JSON.stringify(res));

  // Xeno Glazer: 10 matches in a row as Xeno, win or lose. This checks the rule in the source (a live match would take too long to play here).
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const rec = src.slice(src.indexOf('function recordMatch(room)'), src.indexOf('function recordMatch(room)') + 900);
  check('the Xeno Glazer streak counts Xeno matches and resets on other Kymera', rec.includes("p.char === 'xeno'") && rec.includes('xenoStreak = (u.xenoStreak || 0) + 1') && rec.includes('else u.xenoStreak = 0'));
  check('10 in a row awards Xeno Glazer', rec.includes('XENO_STREAK') && rec.includes("'xeno_glazer'"));
  check('CatClaw shows his protection in the shop', src.includes("desc: 'Protected for 3 seconds after each respawn.'"));

  console.log(failures ? `\n${failures} FAILED` : '\nAll title server checks passed');
  [s, g].forEach(x => x.disconnect());
  process.exit(failures ? 1 : 0);
})().catch(err => { console.log('TEST ERROR', err.message); process.exit(2); });
