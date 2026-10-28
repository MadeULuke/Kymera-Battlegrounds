// Client smoke test for per-platform settings. Runs the real page script with a fake socket, a real-looking
// localStorage, and deferred timers. Checks that PC and Mobile keep separate values.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const parts = html.split('<script>');
const src = parts[parts.length - 1].split('</script>')[0];

const anyFn = () => {
  const f = function () {};
  return new Proxy(f, {
    get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return () => anyFn(); if (!(p in t)) t[p] = anyFn(); return t[p]; },
    set(t, p, v) { t[p] = v; return true; }, apply() { return anyFn(); }, construct() { return anyFn(); },
  });
};
const makeEl = () => ({ dataset: {}, style: {}, className: '', textContent: '', value: '', onclick: null, onchange: null, oninput: null, append() {}, appendChild() {}, addEventListener() {} });
const store = new Map();
const emitted = [], handlers = {}, pending = [];
const fakeSocket = {
  on(ev, fn) { handlers[ev] = fn; },
  emit(ev, payload) { emitted.push({ ev, payload }); },
};
const els = { ultFill: { parentElement: makeEl(), style: {} } };
const ctx = {
  console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, requestAnimationFrame: () => 0,
  setTimeout: fn => { pending.push(fn); return pending.length; },
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, navigator: {},
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  io: () => fakeSocket,
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl())),
    querySelectorAll: () => [], querySelector: () => null,
    createElement: () => makeEl(), addEventListener() {}, body: anyFn(), documentElement: anyFn(),
  },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { y: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
ctx.THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { y: 0, set() {} }; this.rotation = { x: 0 }; } };
ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx;

// Saved before the page loads: PC has its own values, Mobile has none yet, and the old single set holds sens 77
store.set('kymera_platform', 'pc');
store.set('kymera_settings_pc', JSON.stringify({ fx: 10, music: 20, track: 'none', sens: 30 }));
vm.createContext(ctx);
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const flush = () => { pending.splice(0).forEach(f => f()); };
const run = code => vm.runInContext(code, ctx);
try { vm.runInContext(src, ctx); } catch (err) { console.log('FAIL - page script threw on load:', err.message); process.exit(1); }

try {
  check('saved PC settings load when the page opens (this used to be lost on refresh)', run('settings.sens') === 30 && run('settings.fx') === 10, JSON.stringify(run('settings')));
  check('the label says Mouse sensitivity on PC', els.sensLabel.textContent === 'Mouse sensitivity' && els.audioPlat.textContent === 'PC');

  // Switch to Mobile: it has no saved values yet, so it starts at the defaults and does not inherit PC's
  run(`savePlatform('mobile')`);
  check('Mobile starts with its own defaults, not PC values', run('settings.sens') === 50 && run('settings.fx') === 70, JSON.stringify(run('settings')));
  check('the label says Drag sensitivity on Mobile', els.sensLabel.textContent === 'Drag sensitivity' && els.audioPlat.textContent === 'Mobile');

  // Change Mobile's sensitivity to 20 with the number box
  els.sensNum.value = '20'; els.sensNum.onchange(); flush();
  check('Mobile saves its own sensitivity', store.has('kymera_settings_mobile') && JSON.parse(store.get('kymera_settings_mobile')).sens === 20);
  check('PC is not changed by a Mobile change', JSON.parse(store.get('kymera_settings_pc')).sens === 30);

  // Back to PC: PC's values return, Mobile's do not leak in
  run(`savePlatform('pc')`);
  check('switching back to PC shows PC values (sens 30)', run('settings.sens') === 30, 'sens=' + run('settings.sens'));
  check('label goes back to Mouse sensitivity', els.sensLabel.textContent === 'Mouse sensitivity');

  // Logged in: a change sends only this platform, tagged with the platform
  run(`profile = { name: 'Ann', ks: 0, owned: ['xeno'] }`);
  emitted.length = 0;
  run(`savePlatform('mobile')`); els.fxSlider.value = '55'; els.fxSlider.oninput(); flush();
  const sent = emitted.filter(e => e.ev === 'setSettings');
  check('a logged-in change is sent tagged with Mobile', sent.length === 1 && sent[0].payload.platform === 'mobile' && sent[0].payload.settings.fx === 55, JSON.stringify(sent));
  run(`profile = { ks: 0, owned: ['xeno'] }`);

  // The account's copy wins when the profile arrives: PC from the account, Mobile falls back to this browser
  handlers.profile({ name: 'Ann', ks: 0, owned: ['xeno'], settings: { pc: { fx: 1, music: 2, track: 'none', sens: 90 }, mobile: null } });
  check('logging in while on Mobile keeps Mobile on its own browser copy (20), not PC\'s account copy (90)', run('settings.sens') === 20, 'sens=' + run('settings.sens'));
  run(`savePlatform('pc')`);
  check('after login, PC shows the account value (sens 90)', run('settings.sens') === 90, 'sens=' + run('settings.sens'));
  run(`savePlatform('mobile')`);
  check('after login, Mobile has no account copy, so it uses this browser (sens 20)', run('settings.sens') === 20, 'sens=' + run('settings.sens'));
} catch (err) {
  failures++; console.log('FAIL - runtime error: ' + err.message);
}
console.log(failures ? `\n${failures} FAILED` : '\nAll settings client checks passed');
process.exit(failures ? 1 : 0);
