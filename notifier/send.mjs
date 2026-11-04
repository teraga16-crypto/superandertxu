// Se ejecuta cada 10 minutos en GitHub y envía los avisos pendientes a los iPhone.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore/lite';
import webpush from 'web-push';
import { CONFIG } from '../config.js';
import { FAMILY_EMAIL, pinToPassword, setExtraHolidays, expand, reminderTime, isDone, ymd, addDays, catEmoji } from '../core.js';

const PIN = process.env.FAMILY_PIN;
if (!CONFIG.firebase.apiKey) { console.log('Firebase aún no está configurado. Nada que hacer.'); process.exit(0); }
if (!PIN) { console.error('Falta el secreto FAMILY_PIN en GitHub.'); process.exit(1); }

const WINDOW_MS = 90 * 60000; // si GitHub se retrasa, aún se envían los avisos de la última hora y media

const app = initializeApp(CONFIG.firebase);
await signInWithEmailAndPassword(getAuth(app), FAMILY_EMAIL, pinToPassword(PIN));
const db = getFirestore(app);
const all = async (c) => (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, ...d.data() }));

const vapid = (await getDoc(doc(db, 'config', 'vapid'))).data();
if (!vapid) { console.log('Nadie ha activado los avisos todavía.'); process.exit(0); }
webpush.setVapidDetails('mailto:avisos@superandertxu.app', vapid.publicKey, vapid.privateKey);

const [events, people, subs, sent, holidays] = await Promise.all([all('events'), all('people'), all('subs'), all('sent'), all('holidays')]);
setExtraHolidays(holidays);
const sentIds = new Set(sent.map((s) => s.id));
const name = (id) => people.find((p) => p.id === id)?.name;
const now = new Date();

const due = expand(events, ymd(addDays(now, -1)), ymd(addDays(now, 3))).filter((o) => {
  const t = reminderTime(o);
  return t && t <= now && now - t < WINDOW_MS && !(o.ev.kind === 'tarea' && isDone(o));
});

function whenText(o) {
  const today = ymd(now);
  const day = o.date === today ? 'Hoy' : o.date === ymd(addDays(now, 1)) ? 'Mañana'
    : new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(o.date + 'T12:00'));
  return o.ev.start ? `${day} a las ${o.ev.start}` : `${day} (todo el día)`;
}

let count = 0;
for (const o of due) {
  const key = `${o.ev.id}_${o.date}_${o.ev.reminder}`;
  if (sentIds.has(key)) continue;
  const ids = (o.ev.people || []).filter(name);
  let targets = subs.filter((s) => s.mode === 'all' || !ids.length || ids.includes(s.personId));
  if (!targets.length) targets = subs; // p. ej. cosas solo del bebé o de los abuelos: avisar a todos
  const payload = JSON.stringify({
    title: `${catEmoji(o.ev.category) || '📅'} ${o.ev.title}`,
    body: [whenText(o), ids.map(name).join(', '), o.ev.location].filter(Boolean).join(' · '),
    tag: key,
  });
  for (const s of targets) {
    try {
      await webpush.sendNotification(s.sub, payload, { TTL: 3600 });
      count++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await deleteDoc(doc(db, 'subs', s.id));
      else console.error('Error enviando:', e.statusCode, e.body);
    }
  }
  await setDoc(doc(db, 'sent', key), { at: Date.now() });
}

// Limpieza de registros antiguos
for (const s of sent) if (Date.now() - (s.at || 0) > 7 * 86400000) await deleteDoc(doc(db, 'sent', s.id));

console.log(`Avisos pendientes: ${due.length}. Notificaciones enviadas: ${count}.`);
process.exit(0);
