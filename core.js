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

// Festivos oficiales de Euskadi (Decreto 82/2025 para 2026 y Decreto 90/2026 para 2027).
export const HOLIDAYS = {
  '2026-01-01': 'Año Nuevo', '2026-01-06': 'Reyes', '2026-03-19': 'San José',
  '2026-04-02': 'Jueves Santo', '2026-04-03': 'Viernes Santo', '2026-04-06': 'Lunes de Pascua',
  '2026-05-01': 'Fiesta del Trabajo', '2026-07-25': 'Santiago Apóstol', '2026-08-15': 'Asunción',
  '2026-10-12': 'Fiesta Nacional', '2026-12-08': 'Inmaculada', '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo', '2027-01-06': 'Reyes', '2027-03-25': 'Jueves Santo',
  '2027-03-26': 'Viernes Santo', '2027-03-29': 'Lunes de Pascua', '2027-05-01': 'Fiesta del Trabajo',
  '2027-10-07': 'Aniversario del primer Gobierno Vasco', '2027-10-12': 'Fiesta Nacional',
  '2027-11-01': 'Todos los Santos', '2027-12-06': 'Día de la Constitución', '2027-12-08': 'Inmaculada',
  '2027-12-25': 'Navidad',
};
let extraHolidays = {};
// Festivos locales añadidos por la familia en Ajustes: [{ date, name }]
export const setExtraHolidays = (list) => {
  extraHolidays = {};
  (list || []).forEach((h) => { if (h.date) extraHolidays[h.date] = h.name || 'Festivo local'; });
};
export const holidayName = (d) => extraHolidays[d] || HOLIDAYS[d] || '';

export function occursOn(ev, dateStr) {
  if (!ev.date || dateStr < ev.date) return false;
  if ((ev.exdates || []).includes(dateStr)) return false;
  const r = ev.repeat;
  if (!r || !r.freq || r.freq === 'none') return dateStr === ev.date;
  if (r.until && dateStr > r.until) return false;
  if (r.skipHolidays && holidayName(dateStr)) return false;
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
