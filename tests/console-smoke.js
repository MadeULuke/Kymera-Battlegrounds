// Client test for the Console platform (controller) and the one-line title. Runs the real page script with a fake
// controller and a fake DOM. Checks what each stick and button does; not how the controller feels.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const src = html.split('<script>').pop().split('</script>')[0];
const anyFn = () => { const f = function () {}; return new Proxy(f, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return () => anyFn(); if (!(p in t)) t[p] = anyFn(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return anyFn(); }, construct() { return anyFn(); } }); };
const makeStyle = () => { const st = {}; Object.defineProperty(st, 'cssText', { enumerable: false, get() { return ''; }, set() { Object.keys(st).forEach(k => { delete st[k]; }); } }); return st; };
const makeEl = () => ({
  dataset: {}, style: makeStyle(), className: '', textContent: '', value: '', disabled: false, onclick: null, onchange: null, oninput: null,
  _h: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }, setPointerCapture() {},
  appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, append() {},
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
function make(platform) {
  const store = new Map(platform ? [['kymera_platform', platform]] : []);
  const els = { ultFill: { parentElement: makeEl(), style: makeStyle() } };
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  const navigator = { getGamepads: () => [pad] };
  const ctx = {
    console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
    performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
    addEventListener() {}, removeEventListener() {}, navigator,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    io: () => ({ on() {}, emit() {} }),
    document: { getElementById: id => (els[id] || (els[id] = makeEl())), querySelectorAll: () => [], querySelector: () => null, createElement: () => makeEl(), addEventListener() {}, body: { classList: { toggle() {} }, children: [], appendChild(c) { this.children.push(c); return c; } }, documentElement: anyFn(), pointerLockElement: null },
  };
  ctx.THREE = anyFn();
  ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
  ctx.THREE.Mesh = class { constructor() { this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; } };
  ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
  ctx.THREE.GLTFLoader = class { load(u, ok) { ok({ scene: anyFn() }); } };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  els.c.requestPointerLock = () => {}; // the canvas: pointer lock calls are recorded below
  return { r: c => vm.runInContext(c, ctx), els, pad };
}
try {
  const con = make('console');
  const r = con.r, pad = con.pad;
  check('the Console platform is chosen and labelled', r('platformNow()') === 'console' && con.els.platLabel.textContent === 'Console');
  check('the platform menu offers Console', html.includes('data-plat="console"') && html.includes('mobile, PC, or console'));
  check('Console instructions are shown for the controller', (r('renderInstructions()'), con.els.instrControls.children.map(c => c.textContent).join(' ').includes('Start leaves the match')));

  // Left stick: forward is up, and the same push as the mobile joystick
  pad.axes = [1, -1, 0, 0]; r('pollGamepad(0.016)');
  check('left stick up and right: the character walks forward and right', r('joy.x') === 1 && r('joy.y') === 1, 'x=' + r('joy.x') + ' y=' + r('joy.y'));
  pad.axes = [0.05, 0.05, 0, 0]; r('pollGamepad(0.016)');
  check('a tiny stick push is ignored', r('joy.x') === 0 && r('joy.y') === 0);
  pad.axes = [0, 0, 0, 0]; r('pollGamepad(0.016)');

  // Right stick: turns the camera
  r(`state = { phase: 'fight', mode: '1v1', players: [] }`);
  const yaw0 = r('view.yaw');
  pad.axes = [0, 0, 1, 0]; r('pollGamepad(0.1)');
  check('right stick turns the camera', Math.abs(r('view.yaw') - (yaw0 - 2.6 * 0.1)) < 1e-9, 'yaw=' + r('view.yaw'));
  pad.axes = [0, 0, 0, 0];

  // Buttons act once, on the press
  const acts = []; r('onAction = a => pushAction(a)'); con.r('globalThis.pushAction = null');
  const calls = []; const ctxRef = con; ctxRef.r('0'); // placeholder to keep the API symmetric
  const ctxActs = [];
  // Record actions by swapping onAction for a recorder in the page's own scope
  r('onAction = a => __acts.push(a)'); r('var __acts = []');
  const press = (i, on) => { pad.buttons[i].pressed = on; r('pollGamepad(0.016)'); };
  press(0, true); check('A is the basic attack', r('__acts').join(',') === 'm1', r('__acts').join(','));
  press(0, true); check('holding A does not repeat the attack', r('__acts').join(',') === 'm1');
  press(0, false); press(0, true); check('pressing A again attacks again', r('__acts').join(',') === 'm1,m1');
  press(0, false);
  press(1, true); check('B uses the ability', r('__acts').slice(-1)[0] === 'ability');
  press(1, false);
  press(3, true); check('Y uses the ultimate', r('__acts').slice(-1)[0] === 'ult');
  press(3, false);
  press(14, true); check('D-pad left is Move 1', r('__acts').slice(-1)[0] === 'move1');
  press(14, false);
  press(12, true); check('D-pad up is Move 2', r('__acts').slice(-1)[0] === 'move2');
  press(12, false); press(15, true); check('D-pad right is Move 3', r('__acts').slice(-1)[0] === 'move3');
  press(15, false); press(13, true); check('D-pad down is Move 4', r('__acts').slice(-1)[0] === 'move4');
  press(13, false);

  // Start leaves the match. The right stick press turns shift lock on, without asking the browser to lock the pointer.
  let leaves = 0, locks = 0; con.els.bLeave.onclick = () => { leaves++; };
  con.els.c.requestPointerLock = () => { locks++; };
  press(9, true); check('Start leaves the match', leaves === 1, 'leaves=' + leaves);
  press(9, false);
  press(10, true); check('the right stick press turns shift lock on', r('shiftLock') === true);
  press(10, false);
  check('on Console the shift lock does not lock the pointer', locks === 0, 'locks=' + locks);

  // Titles: the account and the profile show one title, the one you are wearing
  r(`profile = { name: 'Ann', ks: 0, owned: ['xeno'], titles: [{ id: 'draxen', name: 'Draxen', color: '#43d17a' }], equippedTitle: { id: 'draxen', name: 'Draxen', color: '#43d17a' } }; renderAccount()`);
  check('the account shows the title you are wearing', con.els.accTitles.textContent === 'Draxen', con.els.accTitles.textContent);
  r(`profile = { name: 'Ann', ks: 0, owned: ['xeno'], titles: [{ id: 'draxen', name: 'Draxen' }], equippedTitle: null }; renderAccount()`);
  check('the account shows None when no title is worn', con.els.accTitles.textContent === 'None');
  const prof = make(null);
  prof.r(`renderProfile({ name: 'X', ks: 0, wins: 0, losses: 0, winRate: null, titles: [{ id: 'draxen', name: 'Draxen' }, { id: 'velmarian', name: 'Velmarian' }], equippedTitle: { id: 'draxen', name: 'Draxen' }, favorite: null, owned: ['xeno'], matches: [] })`);
  const lines = prof.els.profBody.children.map(c => c.textContent).filter(t => t);
  check('the profile shows one title line, not the list', lines.includes('Title: ') && !lines.some(t => t.startsWith('Titles')) && !lines.some(t => t.startsWith('Wearing')), JSON.stringify(lines));

  // PC is unaffected: the controller does nothing there
  const pcCtx = make(null);
  pcCtx.pad.axes = [1, 1, 0, 0]; pcCtx.r('pollGamepad(0.016)');
  check('on PC a connected controller is ignored', pcCtx.r('joy.x') === 0 && pcCtx.r('joy.y') === 0);
} catch (err) { failures++; console.log('FAIL - runtime error: ' + err.message); }
console.log(failures ? `\n${failures} FAILED` : '\nAll console and title checks passed');
process.exit(failures ? 1 : 0);
