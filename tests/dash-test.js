// Burst dash rules, checked by reading the server source (no socket run: the timing is hard to hit on purpose).
// It confirms: a timing miss does not tire; a dash that hits tires; a dash that ends without a hit tires.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
let failures = 0;
const check = (name, ok) => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name); };
const pressBlock = src.slice(src.indexOf("if (me.mg) { // second press"), src.indexOf("if (now < me.cdUntil || now < me.tiredUntil) return;"));
check('a missed timing does not tire CatClaw', !pressBlock.includes('tire('));
const tickLine = src.split('\n').find(l => l.includes('no press in time'));
check('running out of time on the timing game does not tire CatClaw', !!tickLine && !tickLine.includes('tire('));
check('a successful timing starts the dash and does not tire', pressBlock.includes('me.dashUntil = now + DASH.duration') && !pressBlock.includes('tire('));
const posBlock = src.slice(src.indexOf("if (now < me.dashUntil) {"), src.indexOf("room.players.forEach(q => { if (q !== me && !q.left) q.sock.emit('posOf'"));
check('a dash that hits someone tires CatClaw', posBlock.indexOf('tire(me)') !== -1 && posBlock.indexOf('tire(me)') < posBlock.indexOf('return dashHit(room, me, hitTarget)'));
check('a dash that ends without a hit tires CatClaw', /else if \(me\.dashUntil\)\s*\{[^}]*tire\(me\)/.test(posBlock));
check('the labels no longer show the (E) or (G) key letters', !/\((E|G)\)/.test(src));
console.log(failures ? `\n${failures} FAILED` : '\nAll dash checks passed');
process.exit(failures ? 1 : 0);
