// Client test for Free For All: the lobby text, the plain and its katana, lying down as a ghost, and the names and HUD wiring.
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const src = html.split('<script>').pop().split('</script>')[0];
const anyFn = () => { const f = function () {}; return new Proxy(f, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return () => anyFn(); if (!(p in t)) t[p] = anyFn(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return anyFn(); }, construct() { return anyFn(); } }); };
const makeStyle = () => { const st = {}; Object.defineProperty(st, 'cssText', { enumerable: false, get() { return ''; }, set() {} }); return st; };
const makeEl = () => ({ dataset: {}, style: makeStyle(), className: '', textContent: '', value: '', disabled: false, onclick: null, onchange: null, oninput: null, _h: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, append() {}, getContext: () => anyFn(), getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; } });
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
const els = { ultFill: { parentElement: makeEl(), style: makeStyle() } };
const ctx = {
  console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, navigator: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  io: () => ({ on() {}, emit() {} }),
  document: { getElementById: id => (els[id] || (els[id] = makeEl())), querySelectorAll: () => [], querySelector: () => null, createElement: () => makeEl(), addEventListener() {}, body: { classList: { toggle() {} }, appendChild() {} }, documentElement: anyFn(), pointerLockElement: null },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; } add(...o) { this.children.push(...o); } remove() {} };
ctx.THREE.Mesh = class { constructor() { this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { x: 0, y: 0, z: 0 }; this.material = { color: { set() {} } }; } };
ctx.THREE.MeshBasicMaterial = class {}; ctx.THREE.GLTFLoader = class { load(u, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const r = c => vm.runInContext(c, ctx);
try {
  // Lobby text
  r(`renderDetails({ mode: 'ffa', size: 10, perTeam: 1, map: 'plains', isPublic: false, slots: [{}, {}, {}], canStart: true })`);
  check('the lobby reads Free For All with the count', els.detMode.textContent === 'Free For All (3 of 10 players)', els.detMode.textContent);
  check('the lobby says the host can start with 3', els.detStatus.textContent === 'Ready. The host can start the match.');
  check('the side switch is hidden in Free For All', els.bSwitch.style.display === 'none');
  r(`renderDetails({ mode: 'ffa', size: 10, perTeam: 1, map: 'plains', isPublic: true, slots: [{}, {}], canStart: false })`);
  check('the lobby asks for one more player with 2 in', els.detStatus.textContent === 'Waiting for 1 more player. Free For All needs 3 to 10 players.', els.detStatus.textContent);
  check('the lobby shows public or private', els.detVis.textContent === 'Public (Join Random)');
  r(`renderDetails({ mode: '1v1', size: 2, perTeam: 1, map: 'qvx', isPublic: false, slots: [{ team: 0 }, { team: 1 }], canStart: false })`);
  check('the side switch comes back for 1v1', els.bSwitch.style.display === '');

  // The plain: shown only on the Free For All map
  r(`applyMap('plains')`);
  check('the plain is shown for Free For All', r('plainsGroup.visible') === true && r('floor.visible') === false);
  r(`applyMap('qvx')`);
  check('the plain is hidden again on the arena maps', r('plainsGroup.visible') === false && r('floor.visible') === true);

  // Lying down as a ghost, in Free For All as in 2v2
  r(`state = { mode: 'ffa', phase: 'fight', players: [] }; myIndex = 0; FIGHTER_OUT = [true, false, false];
     FIGHTERS = [{ root: { position: { x: 1, z: 2 }, rotation: { y: 0 }, visible: true }, inner: { rotation: { x: 0 }, position: { y: 0 } }, parts: [], metal: false, metalMat: null }];
     P = FIGHTERS[0];`);
  check('a knocked-out player in Free For All is a ghost', r('isFallen()') === true);
  r('ghostPos().x = 40; ghostPos().z = 0; clampGhost(ghost)');
  check('the ghost can roam the whole plain (17.4 radius)', Math.abs(r('ghost.x') - 17.4) < 1e-9, 'x=' + r('ghost.x'));

  // Source checks for the HUD, names, and the mode button
  check('names above heads are plain in Free For All', src.includes("s.mode === 'ffa' ? -1 : s.players[i].team"));
  check('the HUD shows only your health and kills in Free For All', src.includes("'Kills: ' + (selfP ? (selfP.kills || 0) : 0)") && html.includes('body.ffa .bar.r{display:none}'));
  check('Create Room offers Free For All', html.includes('data-mode="ffa"'));
  check('Join Random offers Free For All', html.includes('id="bRandFfa"') && src.includes("mode: 'ffa' }, res =>"));
  // The waiting room shows every Free For All player, with no sides
  const box = els.sideBlue || (els.sideBlue = makeEl());
  box.children.length = 0;
  r(`renderSlots({ mode: 'ffa', size: 10, perTeam: 1, mySide: 0, canStart: false, slots: [{ index: 0, name: 'a', team: 0, char: 'xeno', host: true }, { index: 1, name: 'b', team: 1, char: 'cc' }, { index: 2, name: 'c', team: 2, char: 'tm' }, { index: 3, name: 'd', team: 3, char: 'xeno' }, { index: 4, name: 'e', team: 4, char: 'xeno' }] })`);
  check('the waiting room lists every Free For All player (plus open spots up to 10)', box.children.length === 10, 'cards=' + box.children.length);
  check('the Red side column is hidden for Free For All', els.redCol.style.display === 'none');
  check('the Free For All waiting room has no side switch', els.bSwitch.style.display === 'none');
  check('the match ends with rounds and kills for Free For All', src.includes("'Rounds won: ' + (meOver.roundWins || 0)"));
} catch (err) { failures++; console.log('FAIL - runtime error: ' + err.message); }
console.log(failures ? `\n${failures} FAILED` : '\nAll Free For All client checks passed');
process.exit(failures ? 1 : 0);
