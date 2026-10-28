// Server test for per-platform settings. Run in three steps against one server (see the shell steps in HANDOFF):
//   node tests/settings-test.js setup    -> registers a test account and saves PC and Mobile settings
//   node tests/settings-test.js keep     -> after a restart, checks both platforms are still separate
//   node tests/settings-test.js legacy   -> after the account is rewritten in the old single-set format, checks it moves to PC
const { io } = require('socket.io-client');
const URL = 'http://localhost:' + (process.env.PORT || 3106);
const MODE = process.argv[2] || 'keep';
const NAME = 'setter1', PASS = 'secret1';
const client = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
const wait = ms => new Promise(r => setTimeout(r, ms));
const emit = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout on ' + ev)), 5000);
  s.emit(ev, payload, r => { clearTimeout(t); res(r); });
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const s = client();
  let lastProfile = null;
  s.on('profile', p => { lastProfile = p; });
  await new Promise(r => s.on('connect', r));

  if (MODE === 'setup') {
    const r = await emit(s, 'register', { name: NAME, password: PASS });
    check('test account registered', !r.error, r.error || '');
    s.emit('setSettings', { platform: 'pc', settings: { fx: 10, music: 20, track: 'none', sens: 30 } });
    s.emit('setSettings', { platform: 'mobile', settings: { fx: 40, music: 50, track: 'none', sens: 80 } });
    await wait(200);
    console.log('setup done');
  } else {
    const r = await emit(s, 'login', { name: NAME, password: PASS });
    check('login works', !r.error, r.error || '');
    await wait(300);
    const st = lastProfile && lastProfile.settings;
    if (MODE === 'keep') {
      check('PC settings survive a restart', st && st.pc && st.pc.sens === 30 && st.pc.fx === 10, JSON.stringify(st && st.pc));
      check('Mobile settings survive a restart and are separate from PC', st && st.mobile && st.mobile.sens === 80 && st.mobile.fx === 40, JSON.stringify(st && st.mobile));
      s.emit('setSettings', { platform: 'mobile', settings: { fx: 40, music: 50, track: 'none', sens: 500 } });
      await wait(200);
      const s2 = client(); await new Promise(r => s2.on('connect', r));
      let p2 = null; s2.on('profile', p => { p2 = p; });
      await emit(s2, 'login', { name: NAME, password: PASS }); await wait(300);
      check('values are clamped to 1-100 (sens 500 becomes 100)', p2 && p2.settings && p2.settings.mobile && p2.settings.mobile.sens === 100, JSON.stringify(p2 && p2.settings && p2.settings.mobile));
      check('a change to Mobile leaves PC alone', p2 && p2.settings && p2.settings.pc && p2.settings.pc.sens === 30);
      s2.disconnect();
    } else if (MODE === 'legacy') {
      check('an old single-set account now shows its values under PC', st && st.pc && st.pc.sens === 66 && st.pc.fx === 33, JSON.stringify(st && st.pc));
      check('Mobile has no values yet after the move', st && st.mobile === null, JSON.stringify(st && st.mobile));
    }
  }
  console.log(failures ? `\n${failures} FAILED` : '\nAll settings server checks passed (' + MODE + ')');
  s.disconnect();
  process.exit(failures ? 1 : 0);
})().catch(err => { console.log('TEST ERROR', err.message); process.exit(2); });
