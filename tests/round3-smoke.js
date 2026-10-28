// Client test for the round 3 fixes: visibility, labels, fallen ghost, drag and shift lock, metal form, match-over pose.
// Runs the real page script with fake touches and a fake DOM. Checks logic, not how it looks.
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
const makeStyle = () => { const st = {}; Object.defineProperty(st, 'cssText', { enumerable: false, get() { return ''; }, set() { Object.keys(st).forEach(k => { delete st[k]; }); } }); return st; };
const makeEl = () => ({
  dataset: {}, style: makeStyle(), className: '', textContent: '', value: '', disabled: false, onclick: null, onchange: null, oninput: null,
  _h: {}, children: [], _rect: null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }, setPointerCapture() {},
  appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, append() {},
  getBoundingClientRect() { return this._rect || { left: 0, top: 0, width: 0, height: 0 }; },
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
function makeCtx(platform) {
  const store = new Map(platform ? [['kymera_platform', platform]] : []);
  const handlers = {}, globalH = {}, els = {}, bodyEl = { classList: { toggle() {} }, children: [], appendChild(c) { this.children.push(c); return c; } };
  const fakeSocket = { on(ev, fn) { handlers[ev] = fn; }, emit() {} };
  const ctx = {
    console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
    performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
    addEventListener: (ev, fn) => { (globalH[ev] = globalH[ev] || []).push(fn); }, removeEventListener() {}, navigator: {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    io: () => fakeSocket,
    document: {
      getElementById: id => (els[id] || (els[id] = makeEl())),
      querySelectorAll: () => [], querySelector: () => null, createElement: () => makeEl(),
      addEventListener: (ev, fn) => { (globalH[ev] = globalH[ev] || []).push(fn); },
      body: bodyEl, documentElement: anyFn(), pointerLockElement: null,
    },
  };
  ctx.THREE = anyFn();
  ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { y: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
  ctx.THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { y: 0, set() {} }; this.rotation = { x: 0 }; } };
  ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
  ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
  ctx.window = ctx;
  els.ultFill = { parentElement: makeEl(), style: makeStyle() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { r: code => vm.runInContext(code, ctx), handlers, globalH, els };
}
const fire = (list, evt) => (list || []).forEach(fn => fn(Object.assign({ pointerId: 1, clientX: 0, clientY: 0, button: 0, preventDefault() {}, stopPropagation() {} }, evt)));

try {
  // ---- Page-wide checks (PC) ----
  const pc = makeCtx(null), r = pc.r;
  check('Xeno glow ring is maroon', r('CS_COLORS.xeno') === '#800000', r('CS_COLORS.xeno'));

  // Waiting-room details show the visibility
  pc.els.detMode = makeEl(); pc.els.detMap = makeEl(); pc.els.detVis = makeEl();
  try { r(`renderDetails({ mode: '1v1', size: 2, perTeam: 1, map: 'qvx', isPublic: false, slots: [{ team: 0 }, { team: 1 }], canStart: false })`); check('details show Private for a private room', pc.els.detVis.textContent === 'Private (code only)', pc.els.detVis.textContent); } catch (e) { check('details show Private for a private room', false, e.message); }
  try { r(`renderDetails({ mode: '1v1', size: 2, perTeam: 1, map: 'qvx', isPublic: true, slots: [{ team: 0 }, { team: 1 }], canStart: false })`); check('details show Public for a public room', pc.els.detVis.textContent === 'Public (Join Random)', pc.els.detVis.textContent); } catch (e) { check('details show Public for a public room', false, e.message); }

  // Names and lives in the top bars
  check('guest CatClaw shows initials and lives', r(`hudLabel({ name: 'Guest', char: 'cc', livesLeft: 3, livesMax: 3 })`) === 'Guest (CC)(Lives: 3/3)', r(`hudLabel({ name: 'Guest', char: 'cc', livesLeft: 3, livesMax: 3 })`));
  check('a logged-in teammate CatClaw shows name and lives', r(`hudLabel({ name: 'Nathan', char: 'cc', livesLeft: 2, livesMax: 3 })`) === 'Nathan (Lives: 2/3)');
  check('a logged-in Tank Maestro shows just the name', r(`hudLabel({ name: 'Jeff', char: 'tm', livesLeft: 1, livesMax: 1 })`) === 'Jeff');
  check('a guest Xeno shows the X initial, no lives', r(`hudLabel({ name: 'Guest', char: 'xeno', livesLeft: 1, livesMax: 1 })`) === 'Guest (X)');

  // Fallen fighter: the body stays, the ghost moves and the camera follows it, the ghost stays in the arena
  r(`state = { mode: '2v2', phase: 'fight', players: [] }; myIndex = 0; FIGHTER_OUT = [true, false];
     FIGHTERS = [{ root: { position: { x: 1, z: 2 }, rotation: { y: 0 }, visible: true }, inner: { rotation: { x: 0 }, position: { y: 0 } }, parts: [], metal: false, metalMat: null }];
     P = FIGHTERS[0];`);
  check('a fallen fighter in 2v2 is recognised', r('isFallen()') === true);
  check('the camera follows the body start point', r('cameraFocus().x') === 1);
  r('ghostPos().x = 4');
  check('the camera follows the ghost, not the body', r('cameraFocus().x') === 4 && r('P.root.position.x') === 1);
  r('ghost.x = 20; ghost.z = 0; clampGhost(ghost)');
  check('the ghost is kept inside the arena', Math.abs(r('ghost.x') - 8.7) < 1e-9, 'x=' + r('ghost.x'));
  r(`state.phase = 'over'`);
  check('after the match the ghost is not used', r('isFallen()') === false && r('cameraFocus() === P.root.position') === true && r('ghost') === null);
  r(`state.phase = 'fight'; state.mode = '1v1'`);
  check('in 1v1 nobody lies down, so no ghost', r('isFallen()') === false);
  // A punch the server will ignore must not animate on this screen
  r(`state.mode = '2v2'; state.phase = 'fight'; FIGHTER_OUT = [true, false];`);
  r('punch()');
  check('a fallen fighter does not animate a punch', r('P.punch') === undefined, 'punch=' + r('P.punch'));
  r(`state.mode = '1v1'; FIGHTER_OUT = [false, false]; state.players = [{ index: 0, shielded: true }];`);
  r('punch()');
  check('a shielded (just respawned) fighter does not animate a punch', r('P.punch') === undefined, 'punch=' + r('P.punch'));
  r(`state.players = [{ index: 0, shielded: false }];`);
  r('punch()');
  check('a normal punch still animates', r('P.punch') === 0.28, 'punch=' + r('P.punch'));

  // Match over: the winner's stand scene, not the floating arena pose
  pc.handlers.state({ phase: 'over', matchResult: 'won', wins: [1, 0], ks: 20 });
  check('the match result shows the pedestal scene', r('menuMode') === 'join', r('menuMode'));

  // Metal form: each fighter follows its own state
  r(`FIGHTERS = [
    { root: { position: { x: 0, z: 0 }, rotation: { y: 0 }, visible: true }, inner: { rotation: { x: 0 }, position: { y: 0 } }, parts: [], metal: false, metalMat: null },
    { root: { position: { x: 0, z: 0 }, rotation: { y: 0 }, visible: true }, inner: { rotation: { x: 0 }, position: { y: 0 } }, parts: [{ mesh: { material: 'base' }, mat: 'base' }], metal: false, metalMat: 'metal' }];
    P = FIGHTERS[0]; O = FIGHTERS[1];`);
  pc.handlers.meter({ meter: 0, metal: false, oppMeter: 0, oppMetal: false, metals: [false, true] });
  check('a teammate or opponent in metal form shows the metal texture', r('FIGHTERS[1].metal') === true && r('FIGHTERS[1].parts[0].mesh.material') === 'metal');

  // Camera drag only follows the finger that started it
  const yaw0 = r('view.yaw');
  fire(pc.els.c._h.pointerdown, { pointerId: 1, clientX: 100, clientY: 100 });
  fire(pc.globalH.pointermove, { pointerId: 2, clientX: 160, clientY: 100 });
  check('a second finger moving does not turn the camera', r('view.yaw') === yaw0, 'yaw=' + r('view.yaw'));
  fire(pc.globalH.pointermove, { pointerId: 1, clientX: 150, clientY: 100 });
  check('the finger that started the drag turns the camera', Math.abs(r('view.yaw') - (yaw0 - 50 * 0.006 * r('mouseScale()'))) < 1e-9);
  fire(pc.globalH.pointerup, { pointerId: 2, clientX: 150, clientY: 100 });
  check('lifting a different finger does not stop the drag', r('drag') === true);
  fire(pc.globalH.pointerup, { pointerId: 1, clientX: 150, clientY: 100 });
  check('lifting the finger that started the drag stops it', r('drag') === false);

  // Shift lock on PC asks the browser to lock the pointer
  let lockCalls = 0; pc.els.c.requestPointerLock = () => { lockCalls++; };
  r('shiftLock = false; toggleLock()');
  check('PC: shift lock asks for the pointer to be locked', lockCalls === 1);
} catch (err) {
  failures++; console.log('FAIL - runtime error: ' + err.message);
}

try {
  // ---- Mobile: shift lock must not grab the pointer, or the joystick stops working ----
  const mob = makeCtx('mobile'), r = mob.r;
  let lockCalls = 0; mob.els.c.requestPointerLock = () => { lockCalls++; };
  r('shiftLock = false; toggleLock()');
  check('Mobile: shift lock turns on without asking for the pointer to be locked', r('shiftLock') === true && lockCalls === 0, 'locks=' + lockCalls);
} catch (err) {
  failures++; console.log('FAIL - runtime error (mobile): ' + err.message);
}
console.log(failures ? `\n${failures} FAILED` : '\nAll round 3 client checks passed');
process.exit(failures ? 1 : 0);
