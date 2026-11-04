// Lógica compartida entre la app (iPhone) y el enviador de avisos (GitHub).

export const FAMILY_EMAIL = 'familia@superandertxu.app';
// El PIN familiar es la contraseña de la cuenta familiar (mínimo 6 dígitos).
export const pinToPassword = (pin) => `${pin}`;

export const CATEGORIES = [
  { id: 'trabajo', label: 'Trabajo', emoji: '💼' },
  { id: 'salud', label: 'Salud', emoji: '🩺' },
  { id: 'guarde', label: 'Guardería', emoji: '🧸' },
  { id: 'social', label: 'Amigos', emoji: '🥂' },
  { id: 'casa', label: 'Casa', emoji: '🏠' },
  { id: 'tramite', label: 'Pagos/Trámites', emoji: '📄' },
  { id: 'otro', label: 'Otros', emoji: '📌' },
];
export const catEmoji = (id) => CATEGORIES.find((c) => c.id === id)?.emoji || '';

export const REMINDERS = [
  { v: '', label: 'Sin aviso' },
  { v: 0, label: 'A la hora' },
  { v: 5, label: '5 min antes' },
  { v: 15, label: '15 min antes' },
  { v: 30, label: '30 min antes' },
  { v: 60, label: '1 hora antes' },
  { v: 120, label: '2 horas antes' },
  { v: 1440, label: '1 día antes' },
  { v: 2880, label: '2 días antes' },
];

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const DAY = 86400000;
const dayNum = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

export function occursOn(ev, dateStr) {
  if (!ev.date || dateStr < ev.date) return false;
  if ((ev.exdates || []).includes(dateStr)) return false;
  const r = ev.repeat;
  if (!r || !r.freq || r.freq === 'none') return dateStr === ev.date;
  if (r.until && dateStr > r.until) return false;
  const iv = Math.max(1, Number(r.interval) || 1);
  const s = parseYmd(ev.date);
  const d = parseYmd(dateStr);
  const diff = dayNum(d) - dayNum(s);
  switch (r.freq) {
    case 'daily':
      return diff % iv === 0;
    case 'weekly': {
      const days = r.days && r.days.length ? r.days : [s.getDay()];
      if (!days.includes(d.getDay())) return false;
      const monday = (x) => dayNum(x) - ((x.getDay() + 6) % 7);
      return Math.round((monday(d) - monday(s)) / 7) % iv === 0;
    }
    case 'monthly': {
      if (d.getDate() !== s.getDate()) return false;
      const m = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      return m % iv === 0;
    }
    case 'yearly':
      return d.getDate() === s.getDate() && d.getMonth() === s.getMonth() &&
        (d.getFullYear() - s.getFullYear()) % iv === 0;
  }
  return false;
}

// Todas las apariciones entre dos fechas (YYYY-MM-DD, ambas incluidas).
export function expand(events, fromStr, toStr) {
  const out = [];
  let d = parseYmd(fromStr);
  const end = parseYmd(toStr);
  while (d <= end) {
    const ds = ymd(d);
    for (const ev of events) if (occursOn(ev, ds)) out.push({ ev, date: ds });
    d = addDays(d, 1);
  }
  return out;
}

const at = (dateStr, hhmm) => {
  const d = parseYmd(dateStr);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};
export const startOf = (o) => (o.ev.start ? at(o.date, o.ev.start) : parseYmd(o.date));
export function endOf(o) {
  if (!o.ev.start) {
    const d = parseYmd(o.date);
    d.setHours(23, 59, 59, 0);
    return d;
  }
  const e = at(o.date, o.ev.end || o.ev.start);
  if (o.ev.end && o.ev.end < o.ev.start) e.setDate(e.getDate() + 1); // turno de noche
  return e;
}
export const isDone = (o) => !!(o.ev.done && o.ev.done[o.date]);

// Momento del aviso (los eventos de todo el día usan las 9:00 como referencia).
export function reminderTime(o) {
  const r = o.ev.reminder;
  if (r === null || r === undefined || r === '') return null;
  const base = at(o.date, o.ev.start || '09:00');
  return new Date(base.getTime() - Number(r) * 60000);
}

export const sortOcc = (a, b) =>
  a.date.localeCompare(b.date) ||
  (a.ev.start ? 1 : 0) - (b.ev.start ? 1 : 0) ||
  (a.ev.start || '').localeCompare(b.ev.start || '') ||
  (a.ev.title || '').localeCompare(b.ev.title || '');
