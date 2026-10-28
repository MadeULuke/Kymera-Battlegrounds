// Client smoke test for Find a player. Runs the real page script with a fake socket and fake DOM.
// It checks the search list and the profile output (text and counts), not how the screens look.
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
class FakeList { constructor() { this.children = []; } set innerHTML(v) { this.children = []; } get innerHTML() { return ''; } appendChild(c) { this.children.push(c); return c; } }
const makeEl = () => ({ dataset: {}, style: {}, className: '', textContent: '', onclick: null, append() {}, children: [], appendChild(c) { this.children.push(c); return c; } });

const ALICE = {
  name: 'Alice', wins: 4, losses: 1, winRate: 80, titles: [{ id: 'rank:Rank 1 for Wins', name: 'Rank 1 for Wins', color: '#dcae5a' }], equippedTitle: null, favorite: 'cc', owned: ['xeno', 'cc'], ks: 250,
  matches: [
    { result: 'won', score: '2-1', mode: '1v1', char: 'CatClaw', vs: 'bobby', map: 'QVX (blue)' },
    { result: 'lost', score: '0-2', mode: '2v2', char: 'Xeno', vs: 'Carol & test_01', map: 'Last Stand for Imira (red)' },
  ],
};
const fakeSocket = {
  on() {},
  emit(ev, payload, cb) {
    if (ev === 'findPlayers') {
      const q = String(payload).toLowerCase();
      cb({ results: ['Alice', 'Alicia'].filter(n => n.toLowerCase().includes(q)).map(name => ({ name })) });
    } else if (ev === 'playerProfile') {
      cb(String(payload).toLowerCase() === 'alice' ? { profile: ALICE } : { error: 'No player with that name.' });
    }
  },
};
const els = {
  findName: { value: 'ali', addEventListener() {} }, findMsg: { textContent: '' },
  findList: new FakeList(), profTitle: { textContent: '' }, profBody: new FakeList(),
};
const ctx = {
  console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, navigator: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  io: () => fakeSocket,
  document: {
    getElementById: id => (els[id] || (els[id] = anyFn())),
    querySelectorAll: () => [], querySelector: () => null,
    createElement: () => makeEl(), addEventListener() {}, body: anyFn(), documentElement: anyFn(),
  },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set() {} }; this.rotation = { y: 0 }; } add(...o) { this.children.push(...o); } remove() {} updateMatrixWorld() {} traverse() {} clone() { return this; } };
ctx.THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { y: 0, set() {} }; this.rotation = { x: 0 }; } };
ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = o.color; } };
ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx; vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (err) { console.log('FAIL - page script threw on load:', err.message); process.exit(1); }
const run = code => vm.runInContext(code, ctx);

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
try {
  run(`catalog = { xeno: { name: 'Xeno', price: 600 }, cc: { name: 'CatClaw', price: 1000 }, tm: { name: 'Tank Maestro', price: 600 } };`);

  run(`runFind()`);
  check('search for "ali" lists both matches', els.findList.children.length === 2, 'items=' + els.findList.children.length);
  check('search says how many were found', els.findMsg.textContent === '2 players found.', els.findMsg.textContent);

  run(`$('findName').value = 'zzz'; runFind()`);
  check('no match clears the list and says so', els.findList.children.length === 0 && els.findMsg.textContent === 'No players match "zzz".', els.findMsg.textContent);

  run(`$('findName').value = '   '; runFind()`);
  check('a blank search asks for a name', els.findMsg.textContent === 'Type part of a username first.');

  run(`$('findName').value = 'ali'; runFind()`);
  const first = els.findList.children[0];
  check('each result is a button with the player name', first && first.textContent === 'Alice', first && first.textContent);
  first.onclick();
  check('opening a result shows the profile name', els.profTitle.textContent === 'Alice', els.profTitle.textContent);
  const labels = els.profBody.children.filter(c => c.textContent && c.textContent.endsWith(': ')).map(c => c.textContent);
  check('profile lists the stat lines', labels.length === 7, JSON.stringify(labels));
  check('profile stat lines in order',
    JSON.stringify(labels) === JSON.stringify(['K Serum: ', 'Wins: ', 'Losses: ', 'Win rate: ', 'Title: ', 'Favorite Kymera: ', 'Kymera owned: ']), JSON.stringify(labels));
  const listEl = els.profBody.children.find(c => (c.children || []).some(x => x.className === 'card'));
  const cards = listEl ? listEl.children.filter(c => c.className === 'card') : [];
  check('profile shows one card per recent match (2)', cards.length === 2, 'cards=' + cards.length);
  check('profile has a Last matches toggle', els.profBody.children.some(c => c.className === 'stats-toggle'));

  run(`openProfile('nobody')`);
  check('an unknown profile shows the error on the search screen', els.findMsg.textContent === 'No player with that name.', els.findMsg.textContent);

  run(`$('bFindGo').onclick()`);
  check('the Search button runs the same search', els.findList.children.length === 2);
} catch (err) {
  failures++; console.log('FAIL - runtime error: ' + err.message);
}
console.log(failures ? `\n${failures} FAILED` : '\nAll find-a-player client checks passed');
process.exit(failures ? 1 : 0);
