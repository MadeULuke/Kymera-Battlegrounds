// Smoke test for the mobile controls. Runs the real page script with fake touches and a fake DOM.
// Checks what each control does and the mobile-only rules. It does not check how the controls look or feel.
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
// Fake element that remembers its event handlers, so a test can "touch" it
const makeEl = () => ({
  dataset: {}, style: {}, className: '', textContent: '', value: '', onclick: null, onchange: null, oninput: null,
  _h: {}, addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }, setPointerCapture() {}, append() {}, appendChild() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
});
const els = {}, moveEls = [0, 1, 2, 3].map(() => makeEl()), globalH = {};
els.ultFill = { parentElement: makeEl(), style: {} };
const store = new Map();
const calls = [], emitted = [];
const fakeSocket = { on() {}, emit(ev) { emitted.push(ev); } };
const ctx = {
  console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener: (ev, fn) => { (globalH[ev] = globalH[ev] || []).push(fn); }, removeEventListener() {}, navigator: {},
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  io: () => fakeSocket, pushAction: a => calls.push(a),
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl())),
    querySelectorAll: sel => (sel === '.moves .move' ? moveEls : []), querySelector: () => null,
    createElement: () => makeEl(), addEventListener: (ev, fn) => { (globalH[ev] = globalH[ev] || []).push(fn); },
    body: { classList: { toggle() {} }, appendChild() {} }, documentElement: anyFn(), pointerLockElement: null,
  },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { y: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
ctx.THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { y: 0, set() {} }; this.rotation = { x: 0 }; } };
ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx;

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const fire = (handlers, ev, evt = {}) => (handlers[ev] || []).forEach(fn => fn(evt));
const touch = (el, ev, x, y, id = 1) => { (el._h[ev] || []).forEach(fn => fn({ clientX: x, clientY: y, pointerId: id, preventDefault() {}, stopPropagation() {}, button: 0 })); };
const globalFire = (ev, x, y, id = 1) => fire(globalH, ev, { clientX: x, clientY: y, pointerId: id, movementX: 0, movementY: 0, preventDefault() {}, button: 0 });

// ---- Run once as PC, once as Mobile ----
function load(platform) {
  store.clear(); calls.length = 0; emitted.length = 0; Object.keys(globalH).forEach(k => delete globalH[k]);
  // Fresh elements for each run, so the PC run's handlers cannot fire in the Mobile run
  Object.keys(els).forEach(k => delete els[k]);
  moveEls.splice(0, moveEls.length, ...[0, 1, 2, 3].map(() => makeEl()));
  els.ultFill = { parentElement: makeEl(), style: {} };
  if (platform) store.set('kymera_platform', platform);
  const c = { ...ctx }; vm.createContext(c);
  const r = code => vm.runInContext(code, c);
  vm.runInContext(src, c);
  r(`state = { phase: 'fight' }; onAction = a => pushAction(a);`); // inFight() is true while the phase is fight
  return { c, r };
}

try {
  // PC: the mobile controls and the mobile-only rules stay off
  let pc = load(null);
  pc.r(`bindLookup = { Mouse0: 'm1' }`);
  touch(els.btnM1, 'pointerdown', 0, 0);
  touch(els.btnAbility, 'pointerdown', 0, 0);
  moveEls.forEach(el => touch(el, 'pointerdown', 0, 0));
  touch(els.ultFill.parentElement, 'pointerdown', 0, 0);
  check('PC: the on-screen buttons and move squares do nothing', calls.length === 0, JSON.stringify(calls));
  touch(els.c, 'pointerdown', 50, 50);
  check('PC: a mouse button bound to an action still works', calls.includes('m1'), JSON.stringify(calls));

  // Mobile
  let m = load('mobile');
  m.r(`bindLookup = { Mouse0: 'm1' }`);
  touch(els.btnM1, 'pointerdown', 0, 0);
  check('Mobile: M1 button does the basic attack', m.c && calls.includes('m1'), JSON.stringify(calls));
  calls.length = 0;
  touch(els.btnAbility, 'pointerdown', 0, 0);
  check('Mobile: star button uses the ability', calls.length === 1 && calls[0] === 'ability', JSON.stringify(calls));
  calls.length = 0;
  touch(moveEls[2], 'pointerdown', 0, 0);
  check('Mobile: move square 3 is pressable', calls.length === 1 && calls[0] === 'move3', JSON.stringify(calls));
  calls.length = 0;
  touch(els.ultFill.parentElement, 'pointerdown', 0, 0);
  check('Mobile: the Ultimate bar is pressable', calls.length === 1 && calls[0] === 'ult', JSON.stringify(calls));

  // A drag that starts on the canvas must not fire the mouse-bound attack on a phone
  calls.length = 0;
  touch(els.c, 'pointerdown', 50, 50);
  globalFire('pointerup', 50, 50); // the finger lifts before the next touch
  check('Mobile: a touch on the screen does not fire a mouse-bound action', !calls.includes('m1'), JSON.stringify(calls));

  // Joystick: pushing up is forward, pushing right is right, and the knob is limited to the base
  calls.length = 0;
  touch(els.joyBase, 'pointerdown', 100, 20);
  check('joystick: pushing up gives forward (y > 0)', m.r('joy.y') > 0.79 && Math.abs(m.r('joy.x')) < 1e-9, 'x=' + m.r('joy.x') + ' y=' + m.r('joy.y'));
  touch(els.joyBase, 'pointermove', 400, 100);
  check('joystick: pushing past the edge is limited to full right (x = 1, y = 0)', Math.abs(m.r('joy.x') - 1) < 1e-9 && Math.abs(m.r('joy.y')) < 1e-9, 'x=' + m.r('joy.x') + ' y=' + m.r('joy.y'));
  check('joystick: the move direction follows the push (x = 1 on the moveInput)', Math.abs(m.r('moveInput().mx') - 1) < 1e-9 && Math.abs(m.r('moveInput().mz')) < 1e-9);
  touch(els.joyBase, 'pointerup', 400, 100);
  check('joystick: letting go returns it to the middle', m.r('joy.x') === 0 && m.r('joy.y') === 0 && m.r('moveInput().mx') === 0);
  touch(els.joyBase, 'pointerdown', 100, 100); // dead centre, below the deadzone
  check('joystick: a tiny push is ignored', m.r('moveInput().mx') === 0 && m.r('moveInput().mz') === 0);
  touch(els.joyBase, 'pointerup', 100, 100);

  // Keyboard and joystick add together, and the keys still work
  m.r(`held.move_right = true`);
  touch(els.joyBase, 'pointerdown', 100, 20); // forward
  check('keys and joystick add together', Math.abs(m.r('moveInput().mx') - 1) < 1e-9 && m.r('moveInput().mz') > 0.79);
  m.r(`held.move_right = false`); touch(els.joyBase, 'pointerup', 100, 20);

  // Camera drag on the screen still turns the camera on a phone
  const yaw0 = m.r('view.yaw');
  touch(els.c, 'pointerdown', 100, 100);
  globalFire('pointermove', 120, 100);
  globalFire('pointerup', 120, 100);
  check('Mobile: dragging the empty screen turns the camera', Math.abs(m.r('view.yaw') - (yaw0 - 20 * 0.006 * m.r('mouseScale()'))) < 1e-9, 'yaw0=' + yaw0 + ' yaw=' + m.r('view.yaw'));

  // Hiding the match HUD hides the mobile controls and clears any push
  m.r(`hideGameUI()`);
  check('leaving the match hides the mobile controls', m.r(`$('mobileHud').style.display`) === 'none');
} catch (err) {
  failures++; console.log('FAIL - runtime error: ' + err.message);
}
console.log(failures ? `\n${failures} FAILED` : '\nAll mobile control checks passed');
process.exit(failures ? 1 : 0);
