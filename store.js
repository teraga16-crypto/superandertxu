// Capa de datos: Firebase (sincronización al instante) o modo prueba local.
import { CONFIG } from './config.js';
import { FAMILY_EMAIL, pinToPassword } from './core.js';

export const configured = !!CONFIG.firebase?.apiKey;
const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

function setPath(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
  o[parts.at(-1)] = val;
}

function localStore() {
  const listeners = {};
  const read = (c) => {
    try { return JSON.parse(localStorage.getItem('sa_' + c) || '{}'); } catch { return {}; }
  };
  const write = (c, data) => {
    localStorage.setItem('sa_' + c, JSON.stringify(data));
    const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
    (listeners[c] || []).forEach((cb) => cb(list));
  };
  let authCb = () => {};
  return {
    demo: true,
    onAuth(cb) { authCb = cb; cb(localStorage.getItem('sa_auth') ? { demo: true } : null); },
    async login() { localStorage.setItem('sa_auth', '1'); authCb({ demo: true }); return { created: false }; },
    async logout() { localStorage.removeItem('sa_auth'); authCb(null); },
    async changePin() {},
    watch(c, cb) {
      (listeners[c] = listeners[c] || []).push(cb);
      cb(Object.entries(read(c)).map(([id, v]) => ({ id, ...v })), { fromCache: false });
    },
    async get(c, id) { return read(c)[id] || null; },
    async add(c, v) { const d = read(c); const id = crypto.randomUUID().slice(0, 18); d[id] = v; write(c, d); return id; },
    async set(c, id, v) { const d = read(c); d[id] = v; write(c, d); },
    async update(c, id, v) {
      const d = read(c);
      if (!d[id]) return;
      for (const [k, val] of Object.entries(v)) setPath(d[id], k, val);
      write(c, d);
    },
    async remove(c, id) { const d = read(c); delete d[id]; write(c, d); },
  };
}

async function firebaseStore() {
  const { initializeApp } = await import(`${CDN}/firebase-app.js`);
  const A = await import(`${CDN}/firebase-auth.js`);
  const F = await import(`${CDN}/firebase-firestore.js`);
  const app = initializeApp(CONFIG.firebase);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache() });
  } catch {
    db = F.getFirestore(app);
  }
  const unsubs = [];
  return {
    demo: false,
    onAuth(cb) { A.onAuthStateChanged(auth, cb); },
    async login(pin) {
      const pw = pinToPassword(pin);
      try {
        await A.signInWithEmailAndPassword(auth, FAMILY_EMAIL, pw);
        return { created: false };
      } catch (e) {
        // Primera vez: si la cuenta familiar no existe, se crea con este PIN.
        try {
          await A.createUserWithEmailAndPassword(auth, FAMILY_EMAIL, pw);
          return { created: true };
        } catch (e2) {
          if (e2.code === 'auth/email-already-in-use') throw new Error('PIN incorrecto');
          if (e2.code === 'auth/too-many-requests' || e.code === 'auth/too-many-requests')
            throw new Error('Demasiados intentos. Espera unos minutos.');
          throw new Error('No se pudo entrar (' + (e2.code || e2.message) + ')');
        }
      }
    },
    async logout() { unsubs.splice(0).forEach((u) => u()); await A.signOut(auth); },
    async changePin(oldPin, newPin) {
      const cred = A.EmailAuthProvider.credential(FAMILY_EMAIL, pinToPassword(oldPin));
      await A.reauthenticateWithCredential(auth.currentUser, cred);
      await A.updatePassword(auth.currentUser, pinToPassword(newPin));
    },
    watch(c, cb) {
      unsubs.push(F.onSnapshot(F.collection(db, c), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), { fromCache: snap.metadata.fromCache })));
    },
    async get(c, id) { const s = await F.getDoc(F.doc(db, c, id)); return s.exists() ? s.data() : null; },
    async add(c, v) { const r = await F.addDoc(F.collection(db, c), v); return r.id; },
    async set(c, id, v) { await F.setDoc(F.doc(db, c, id), v); },
    async update(c, id, v) { await F.updateDoc(F.doc(db, c, id), v); },
    async remove(c, id) { await F.deleteDoc(F.doc(db, c, id)); },
  };
}

export const store = configured ? await firebaseStore() : localStore();
