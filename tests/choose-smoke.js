// Client test for the shop: the order of the stands, colours and prices, Coming soon for the placeholders,
// the arrows, and the hallway background. Runs the real page script with a fake 3D library and a fake DOM.
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
const handlers = {}, sent = [];
const fakeSocket = { on(ev, fn) { handlers[ev] = fn; }, emit(ev) { sent.push(ev); } };
const els = {};
const ctx = {
  console, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0, requestAnimationFrame: () => 0,
  performance: { now: () => 0 }, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, navigator: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  io: () => fakeSocket,
  document: { getElementById: id => (els[id] || (els[id] = anyFn())), querySelectorAll: () => [], querySelector: () => null, createElement: () => anyFn(), addEventListener() {}, body: anyFn(), documentElement: anyFn(), pointerLockElement: null },
};
ctx.THREE = anyFn();
ctx.THREE.Group = class { constructor() { this.children = []; this.visible = true; this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y || 0; this.z = z || 0; } }; this.rotation = { x: 0, y: 0, z: 0 }; } add(...o) { this.children.push(...o); } remove(o) { this.children = this.children.filter(c => c !== o); } updateMatrixWorld() {} traverse() {} clone() { return this; } };
ctx.THREE.Mesh = class { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.visible = true; this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y || 0; this.z = z || 0; } }; this.rotation = { x: 0, y: 0, z: 0 }; } };
ctx.THREE.MeshBasicMaterial = class { constructor(o) { this.color = (o && o.color) || 0; } };
ctx.THREE.GLTFLoader = class { load(url, ok) { ok({ scene: anyFn() }); } };
ctx.window = ctx; vm.createContext(ctx);
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };
try { vm.runInContext(src, ctx); } catch (err) { console.log('FAIL - page script threw on load:', err.message); process.exit(1); }
const r = code => vm.runInContext(code, ctx);
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(res => setImmediate(res)); };

(async () => {
  try {
    handlers.catalog({
      xeno: { name: 'Xeno', price: 600, hp: 100, damage: 11, speed: 4.2, ability: 'aura', abilityLabel: 'Ability: dark aura' },
      cc: { name: 'CatClaw', price: 1000, hp: 50, lives: 3, damage: 10, speed: 7.5, ability: 'dash', abilityLabel: 'Ability: burst dash' },
      tm: { name: 'Tank Maestro', price: 600, hp: 150, damage: 8, speed: 3.2, meter: true, ability: 'metal', abilityLabel: 'Special: metal form' },
    });
    r(`profile = { name: null, owned: ['xeno'], ks: 0 }; chosen = 'xeno';`);

    check('the shop runs in the listed order, through six tiers',
      r('kymeraIds().join(",")') === 'cress,vantage,spine,maw,bandit,tm,xeno,vulker,qing,cc,devma,hunter,gamno,kaizer', r('kymeraIds().join(",")'));

    r(`show('sSelect')`); r('updateMenuScene(0.016)'); await settle();
    check('opening the screen shows the selected Kymera (Xeno)', r('csIndex') === 6 && r("$('csName').textContent") === 'Xeno');
    check('14 stands and 3 models are built', r('chooseRow.children.length') === 17, 'children=' + r('chooseRow.children.length'));
    check('the three real Kymera models load onto their stands', r('chooseFighters.filter(Boolean).length') === 3);

    const rings = r('chooseRow.children.slice(0, 14).map(st => st.children[2].material.color)');
    check('the stand rings take the shop colours (Cress navy, Maw dark blue, Tank Maestro green, CatClaw yellow, Kaizer black)',
      rings[0] === '#1f3a93' && rings[3] === '#1e3c8c' && rings[5] === '#43d17a' && rings[9] === '#f2c230' && rings[13] === '#111111', JSON.stringify([rings[0], rings[3], rings[5], rings[9], rings[13]]));

    r('showChosen(0)'); check('Tier 1 is free', r("$('csPrice').textContent") === 'Free', r("$('csPrice').textContent"));
    r('showChosen(3)');
    check('Maw is named in its colour, and the price is 100 K Serum', r("$('csName').style.color") === '#1e3c8c' && r("$('csPrice').textContent") === '100 K Serum', r("$('csPrice').textContent"));
    check('Maw says Coming soon under its name', r("$('csSoon').textContent") === 'Coming soon');
    check('its stats say Coming soon', r("$('csStats').innerHTML").includes('Stats coming soon'));
    r("$('csAction').onclick()");
    check('buying Maw says Coming soon and sends nothing', r("$('csMsg').textContent") === 'Coming soon.' && !sent.includes('buy'));
    r('showChosen(13)'); check('Kaizer has a ??? price', r("$('csPrice').textContent") === '???');
    r('showChosen(6)'); check('Xeno is owned and has no Coming soon', r("$('csPrice').textContent") === 'Owned' && r("$('csSoon').textContent") === '');
    check('the real Xeno stats still show', r("$('csStats').innerHTML").includes('Health: 100'));

    r('showChosen(0)'); r("$('csNext').onclick()");
    check('the next arrow goes to Vantage', r('csIndex') === 1);
    r('showChosen(0)'); r("$('csPrev').onclick()");
    check('the previous arrow from Cress wraps to Kaizer', r('csIndex') === 13);

    check('the hallway background is on for Choose Character', r('shopGroup.visible') === true && r('floor.visible') === false);
    check('the hallway has tier signs, pillars, posters and a shopkeeper', r('shopGroup.children.length') >= 12, 'items=' + r('shopGroup.children.length'));
    r('showChosen(3)'); r('updateMenuScene(0.016)'); await settle();
    for (let k = 0; k < 300; k++) r('updateMenuScene(0.016)');
    check('Maw is in the second row, and the camera has moved forward to it', Math.abs(r('camChooseZ') - 12) < 0.01 && Math.abs(r('camChooseX') - 14) < 0.01, 'z=' + r('camChooseZ') + ' x=' + r('camChooseX'));
    r('showChosen(2)'); for (let k = 0; k < 300; k++) r('updateMenuScene(0.016)');
    check('Spine Barker is in the first row, at the end of it (so the camera goes back to Tier 1)', Math.abs(r('camChooseZ')) < 1e-6 && Math.abs(r('camChooseX') - 19.5) < 0.01, 'z=' + r('camChooseZ') + ' x=' + r('camChooseX'));
    check('the tiers sit in rows, centred on the shopkeeper', r('chooseRow.children[3].position.z') === 12 && r('chooseRow.children[13].position.z') === 60 && Math.abs(r('chooseRow.children[8].position.x') - 25) < 0.01 && Math.abs((r('chooseRow.children[4].position.x') + r('chooseRow.children[8].position.x')) / 2 - 14) < 0.01);
    r(`show('sHome')`); r('updateMenuScene(0.016)');
    check('the hallway goes away on other screens, and the arena comes back', r('shopGroup.visible') === false && r('floor.visible') === true);
  } catch (err) { failures++; console.log('FAIL - runtime error: ' + err.message); }
  console.log(failures ? `\n${failures} FAILED` : '\nAll shop checks passed');
  process.exit(failures ? 1 : 0);
})();
