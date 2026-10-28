const { io } = require('socket.io-client');
const URL = 'http://localhost:' + (process.env.PORT || 3101);
const client = () => io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
const emit = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout on ' + ev)), 5000);
  s.emit(ev, payload, r => { clearTimeout(t); res(r); });
});
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : '')); };

(async () => {
  const socks = [client(), client(), client(), client(), client(), client()];
  await Promise.all(socks.map(s => new Promise((r, j) => { s.on('connect', r); s.on('connect_error', j); })));
  const [a, b, c, d, e, f] = socks;
  let lastLobbyA = null, lastLobbyC = null;
  a.on('lobby', l => { lastLobbyA = l; });
  c.on('lobby', l => { lastLobbyC = l; });

  // 1. Create Room defaults to private: Join Random must NOT join it
  const A = await emit(a, 'create', { char: 'xeno', map: 'qvx', mode: '1v1' });
  const B = await emit(b, 'joinRandom', { char: 'xeno', mode: '1v1' });
  check('default create is private (no create payload flag)', A.code && B.code && B.code !== A.code, `A=${A.code} B=${B.code}`);
  await new Promise(r => setTimeout(r, 100));
  check('lobby says the default room is private', lastLobbyA && lastLobbyA.isPublic === false, `isPublic=${lastLobbyA && lastLobbyA.isPublic}`);

  // 2. A private 1v1 room still joins by code
  const J = await emit(f, 'join', { code: A.code, char: 'xeno' });
  check('private room still joins by code', J && J.ok === true, JSON.stringify(J));

  // 3. Public 2v2 room: Join Random does find it
  const C = await emit(c, 'create', { char: 'xeno', map: 'qvx', mode: '2v2', public: true });
  await new Promise(r => setTimeout(r, 100));
  check('public room is marked public in the lobby', lastLobbyC && lastLobbyC.isPublic === true, `isPublic=${lastLobbyC && lastLobbyC.isPublic}`);
  const D = await emit(d, 'joinRandom', { char: 'xeno', mode: '2v2' });
  check('Join Random finds a public 2v2 room', D.code === C.code, `C=${C.code} D=${D.code}`);

  // 4. Private 2v2 room (the owner's bug) must not be found by Join Random
  const E = await emit(e, 'create', { char: 'xeno', map: 'qvx', mode: '2v2' });
  const G = client(); await new Promise(r => G.on('connect', r));
  const H = await emit(G, 'joinRandom', { char: 'xeno', mode: '2v2' });
  check('private 2v2 room is not joined by Join Random', H.code !== E.code, `E=${E.code} H=${H.code}`);

  // 5. Explicit private flag works the same as the default
  const I = client(); await new Promise(r => I.on('connect', r));
  const K = await emit(I, 'create', { char: 'xeno', map: 'qvx', mode: '1v1', public: false });
  const L = client(); await new Promise(r => L.on('connect', r));
  const M = await emit(L, 'joinRandom', { char: 'xeno', mode: '1v1' });
  check('public:false room is not joined by Join Random', M.code !== K.code, `K=${K.code} M=${M.code}`);

  console.log(failures ? `\n${failures} FAILED` : '\nAll room checks passed');
  socks.forEach(s => s.disconnect()); G.disconnect(); I.disconnect(); L.disconnect();
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error('TEST ERROR', err.message); process.exit(2); });
