// Client test for Button Configuration (Mobile). Runs the real page script with fake touches and a fake DOM.
// Checks drag, clamping, size, opacity, reset, saved-layout loading, and the PC/mobile move. Not how it looks.
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
// Like a real browser: setting cssText to '' clears every inline style
const makeStyle = () => { const st = {}; Object.defineProperty(st, 'cssText', { enumerable: false, get() { return ''; }, set() { Object.keys(st).forEach(k => { delete st[k]; }); } }); return st; };
const makeEl = () => ({
  dataset: {}, style: makeStyle(), className: '', textContent: '', value: '', disabled: false,
  onclick: null, onchange: null, oninput: null, _h: {}, children: [], _rect: null,
  addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
  setPointerCapture() {}, appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
  getBoundingClientRect() { return this._rect || { left: 0, top: 0, width: 0, height: 0 }; },
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
});
const fire = (el, ev, x, y, id = 1) => (el._h[ev] || []).forEach(fn => fn({ clientX: x, clientY: y, pointerId: id, preventDefault() {}, stopPropagation() {}, button: 0 }));

const store = new Map([['kymera_platform', 'mobile']]);
const emitted = [];
const fakeSocket = { on() {}, emit(ev, payload) { emitted.push({ ev, payload }); } };
const els = {};
['joyBase', 'joyKnob', 'btnM1', 'btnAbility', 'mobMoves', 'mobUlt', 'mobAb', 'mobileHud', 'layoutStage', 'hudBottom', 'bSetKeys',
 'layoutSizeSlider', 'layoutSizeNum', 'layoutOpSlider', 'layoutOpNum', 'layoutMsg', 'layoutSelName', 'layoutSave', 'layoutReset']
  .forEach(id => { els[id] = makeEl(); });
els.bSetKeys.textContent = 'Key Binds';
els.mobileHud.style.display = 'none';
els.layoutStage._rect = { left: 0, top: 0, width: 800, height: 400 };
els.btnM1._rect = { left: 656, top: 140, width: 112, height: 112 };
els.joyBase._rect = { left: 18, top: 252, width: 130, height: 130 };
els.ultFill = { parentElement: makeEl(), style: {} };
const moveEls = [0, 1, 2, 3].map(() => makeEl());
const bodyEl = { classList: { toggle() {} }, children: [], appendChild(c) { this.children.push(c); return c; } };
const ctx = {
  console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, navigator: {},
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  io: () => fakeSocket,
  document: {
    getElementById: id => (els[id] || (els[id] = makeEl())),
    querySelectorAll: sel => (sel === '.moves .move' ? moveEls : []), querySelector: () => null,
    createElement: () => makeEl(), addEventListener() {}, body: bodyEl, documentElement: anyFn(), pointerLockElement: null,
  },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { y: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
ctx.THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { y: 0, set() {} }; this.rotation = { x: 0 }; } };
ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx;
vm.createContext(ctx);
const r = code => vm.runInContext(code, ctx);

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
try { vm.runInContext(src, ctx); } catch (err) { console.log('FAIL - page script threw on load:', err.message); process.exit(1); }

try {
  // Starting on Mobile: the Key Binds button is now Button Configuration, and the saved defaults are applied
  check('on Mobile, the Key Binds button reads Button Configuration', els.bSetKeys.textContent === 'Button Configuration', els.bSetKeys.textContent);
  check('the default layout is applied to M1', els.btnM1.style.left === '82%' && els.btnM1.style.top === '35%' && els.btnM1.style.transform === 'scale(1)', JSON.stringify({ l: els.btnM1.style.left, t: els.btnM1.style.top }));
  check('buttons start at 50% see-through', Number(els.btnM1.style.opacity) === 0.5);
  check('the move squares sit in the overlay on Mobile', els.mobileHud.children.includes(els.mobMoves));

  // Opening the screen moves the real buttons into the preview
  r(`$('bSetKeys').onclick()`);
  check('the screen opens', r('layoutOpen') === true);
  check('the overlay moves into the preview box', els.layoutStage.children.includes(els.mobileHud));

  // Drag M1: grab it 10px in from its corner, move the pointer, and it follows
  fire(els.btnM1, 'pointerdown', 666, 150);
  check('tapping a button chooses it', r('layoutSel') === 'm1');
  fire(els.btnM1, 'pointermove', 410, 210);
  check('dragging moves M1 to the new spot (50%, 50%)', r('layout.items.m1.x') === 50 && r('layout.items.m1.y') === 50, JSON.stringify(r('layout.items.m1')));
  check('the M1 position is applied on screen', els.btnM1.style.left === '50%' && els.btnM1.style.top === '50%');
  fire(els.btnM1, 'pointermove', 2000, -500);
  check('a button cannot be dragged off the screen', r('layout.items.m1.x') === 86 && r('layout.items.m1.y') === 0, JSON.stringify(r('layout.items.m1')));
  fire(els.btnM1, 'pointerup', 2000, -500);

  // Size: slider, then the number box, and the limits
  r('setLayoutSize(140)');
  check('size 140 scales M1 to 1.4x', r('layout.items.m1.s') === 140 && els.btnM1.style.transform === 'scale(1.4)', els.btnM1.style.transform);
  els.layoutSizeNum.value = '70'; els.layoutSizeNum.onchange();
  check('the number box sets size 70', r('layout.items.m1.s') === 70 && els.btnM1.style.transform === 'scale(0.7)');
  r('setLayoutSize(500)');
  check('size is capped at 160', r('layout.items.m1.s') === 160);
  r('setLayoutSize(100)');

  // Opacity: one value for all buttons; bars keep full strength
  els.layoutOpSlider.value = '30'; els.layoutOpSlider.oninput();
  check('opacity 30 applies to M1 and the move squares', Number(els.btnM1.style.opacity) === 0.3 && Number(els.mobMoves.style.opacity) === 0.3);
  check('the Ultimate bar is not affected by opacity', els.mobUlt.style.opacity === '');

  // The joystick ignores touches while the layout screen is open
  fire(els.joyBase, 'pointerdown', 100, 20);
  check('the joystick does not move the character while configuring', r('joy.y') === 0 && r('joy.x') === 0);
  fire(els.joyBase, 'pointerup', 100, 20);

  // Leaving the screen puts the overlay back and hides it
  r('closeLayout()');
  check('leaving the screen moves the overlay back out and hides it', bodyEl.children.includes(els.mobileHud) && els.mobileHud.style.display === 'none');
  check('leaving the screen closes the editor', r('layoutOpen') === false);

  // Reset puts the defaults back
  els.layoutReset.onclick();
  check('Reset restores the default position, size and opacity', r('layout.items.m1.x') === 82 && r('layout.items.m1.s') === 100 && r('layout.opacity') === 50 && els.btnM1.style.left === '82%');

  // Loading a saved layout clamps bad numbers and fills in what is missing
  store.set('kymera_layout_mobile', JSON.stringify({ opacity: 5, items: { m1: { x: 500, y: -4, s: 300 }, joy: { x: 'abc' } } }));
  r('loadLayoutLocal()');
  check('a saved layout is clamped to safe ranges', r('layout.opacity') === 10 && r('JSON.stringify(layout.items.m1)') === '{"x":100,"y":0,"s":160}', r('JSON.stringify(layout.items.m1)'));
  check('a missing or bad value falls back to the default', r('layout.items.joy.x') === 2 && r('layout.items.ult.x') === 30);

  // Save message: guests save to this device, logged-in players also save to the account
  els.layoutSave.onclick();
  check('a guest is told the layout is saved on this device', els.layoutMsg.textContent === 'Saved on this device. Log in to save to your account.', els.layoutMsg.textContent);
  r(`profile = { name: 'Ann', ks: 0, owned: ['xeno'] }`);
  emitted.length = 0;
  r('saveLayout(true)');
  const sent = emitted.filter(e => e.ev === 'setLayout');
  check('a logged-in player sends the layout to the account, tagged Mobile', sent.length === 1 && sent[0].payload.platform === 'mobile' && sent[0].payload.layout.opacity === 10, JSON.stringify(sent));
  r(`profile = { ks: 0, owned: ['xeno'] }`);

  // PC: the bottom bar comes back, unmoved, and the Key Binds name returns
  r(`savePlatform('pc')`);
  check('on PC the bottom bar holds the move squares, Ultimate and ability bars again', els.hudBottom.children.length === 3 && els.hudBottom.children[2] === els.mobMoves && els.hudBottom.children[0] === els.mobUlt);
  check('on PC the move squares have no leftover layout styles', els.mobMoves.style.cssText === '' && els.mobMoves.style.left === undefined);
  check('on PC the button reads Key Binds again', els.bSetKeys.textContent === 'Key Binds', els.bSetKeys.textContent);

  // And back to Mobile, with the saved layout in place
  r(`savePlatform('mobile')`);
  check('back on Mobile the move squares are in the overlay with the saved spot', els.mobileHud.children.includes(els.mobMoves) && els.mobMoves.style.left === '30%');
} catch (err) {
  failures++; console.log('FAIL - runtime error: ' + err.message);
}
console.log(failures ? `\n${failures} FAILED` : '\nAll button configuration checks passed');
process.exit(failures ? 1 : 0);
