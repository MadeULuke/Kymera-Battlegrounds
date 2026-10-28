// Client test for the Instructions screen: the Controls text changes with the platform, and the CatClaw sentence has moved to the shop.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const src = html.split('<script>').pop().split('</script>')[0];
const anyFn = () => { const f = function () {}; return new Proxy(f, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return () => anyFn(); if (!(p in t)) t[p] = anyFn(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return anyFn(); }, construct() { return anyFn(); } }); };
const makeStyle = () => { const st = {}; Object.defineProperty(st, 'cssText', { enumerable: false, get() { return ''; }, set() {} }); return st; };
const makeEl = () => ({ dataset: {}, style: makeStyle(), className: '', textContent: '', value: '', onclick: null, _h: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, append() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; } });
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
function make(platform) {
  const store = new Map(platform ? [['kymera_platform', platform]] : []);
  const els = { ultFill: { parentElement: makeEl(), style: makeStyle() } };
  const ctx = {
    console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
    performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
    addEventListener() {}, removeEventListener() {}, navigator: {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    io: () => ({ on() {}, emit() {} }),
    document: { getElementById: id => (els[id] || (els[id] = makeEl())), querySelectorAll: () => [], querySelector: () => null, createElement: () => makeEl(), addEventListener() {}, body: { classList: { toggle() {} }, appendChild() {} }, documentElement: anyFn(), pointerLockElement: null },
  };
  ctx.THREE = anyFn(); ctx.THREE.Group = class { constructor() { this.children = []; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; } add() {} };
  ctx.THREE.Mesh = class { constructor() { this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; } }; ctx.THREE.MeshBasicMaterial = class {}; ctx.THREE.GLTFLoader = class { load(u, ok) { ok({ scene: anyFn() }); } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
  return { r: c => vm.runInContext(c, ctx), els };
}
try {
  const pc = make(null);
  pc.r('renderInstructions()');
  const pcText = pc.els.instrControls.children.map(c => c.textContent).join(' | ');
  check('PC Controls mention the keyboard and Key Binds', pcText.includes('W A S D') && pcText.includes('Key Binds'), pcText.slice(0, 60));
  check('PC Controls keep E and G, the defaults', pcText.includes('E uses your') && pcText.includes('G is the ultimate'));

  const mob = make('mobile');
  mob.r('renderInstructions()');
  const mobText = mob.els.instrControls.children.map(c => c.textContent).join(' | ');
  check('Mobile Controls describe the joystick, camera drag, fist and star', mobText.includes('joystick') && mobText.includes('empty part of the screen') && mobText.includes('fist') && mobText.includes('star'));
  check('Mobile Controls do not mention the keyboard', !mobText.includes('W A S D') && !mobText.includes('Space'));
  check('Mobile Controls point to Button Configuration', mobText.includes('Button Configuration'));

  const page = html;
  check('the CatClaw sentence is gone from the Instructions', !page.includes('CatClaw has 3 lives per round'));
  check('the Instructions screen has a platform-driven Controls box', page.includes('id="instrControls"'));
  check('Console text is written for the agreed controller layout', src.includes("'Start leaves the match") && src.includes('D-pad'));
} catch (err) { failures++; console.log('FAIL - runtime error: ' + err.message); }
console.log(failures ? `\n${failures} FAILED` : '\nAll instruction checks passed');
process.exit(failures ? 1 : 0);
