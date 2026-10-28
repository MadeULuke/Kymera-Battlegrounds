// Server test for the saved button layout. Needs the server on PORT (default 3110); run against a copy with a fresh data folder.
const { io } = require('socket.io-client');
const URL = 'http://localhost:' + (process.env.PORT || 3110);
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
  const r = await emit(s, 'register', { name: 'layout1', password: 'secret1' });
  check('test account registered', !r.error, r.error || '');
  s.emit('setLayout', { platform: 'mobile', layout: { opacity: 500, items: {
    m1: { x: -5, y: 200, s: 999 }, nonsense: { x: 1, y: 1, s: 100 }, joy: { x: 'bad', y: 10, s: 100 } } } });
  s.emit('setLayout', { platform: 'pc', layout: { opacity: 20, items: { m1: { x: 9, y: 9, s: 90 } } } });
  await wait(200);

  const s2 = client(); await new Promise(r => s2.on('connect', r));
  let profile = null; s2.on('profile', p => { profile = p; });
  await emit(s2, 'login', { name: 'layout1', password: 'secret1' }); await wait(300);
  const L = profile && profile.layouts;
  check('the mobile layout is saved to the account', !!(L && L.mobile), JSON.stringify(L));
  check('opacity is kept inside 10 to 100', L && L.mobile && L.mobile.opacity === 100, JSON.stringify(L && L.mobile && L.mobile.opacity));
  check('positions and sizes are kept inside their ranges', L && L.mobile && L.mobile.items.m1 && L.mobile.items.m1.x === 0 && L.mobile.items.m1.y === 100 && L.mobile.items.m1.s === 160, JSON.stringify(L && L.mobile && L.mobile.items.m1));
  check('unknown buttons are dropped', L && L.mobile && !('nonsense' in L.mobile.items));
  check('a button with a bad value is dropped', L && L.mobile && !('joy' in L.mobile.items));
  check('a PC layout is ignored (the account only holds Mobile layouts)', L && !('pc' in L), JSON.stringify(L));
  console.log(failures ? `\n${failures} FAILED` : '\nAll saved-layout server checks passed');
  [s, s2].forEach(x => x.disconnect());
  process.exit(failures ? 1 : 0);
})().catch(err => { console.log('TEST ERROR', err.message); process.exit(2); });
