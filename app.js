import { store, configured } from './store.js';
import {
  CATEGORIES, REMINDERS, holidayName, setExtraHolidays, catEmoji, ymd, parseYmd, addDays, expand,
  endOf, isDone, sortOcc,
} from './core.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('sa_ui_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sa_ui_' + k, JSON.stringify(v)); } catch {} },
};

const S = {
  user: undefined,
  people: [],
  events: [],
  holidays: [],
  view: ls.get('view', '48h'),
  filter: new Set(ls.get('filter', [])),
  month: (() => { const d = new Date(); d.setDate(1); return d; })(),
  selDay: ymd(new Date()),
};

const DEFAULT_PEOPLE = [
  { name: 'Yo', emoji: '🙂', color: '#2f6fed', order: 1 },
  { name: 'Pareja', emoji: '😊', color: '#d63384', order: 2 },
  { name: 'Bebé', emoji: '👶', color: '#f08c00', order: 3 },
];
const SWATCHES = ['#2f6fed', '#d63384', '#f08c00', '#12a150', '#7b4ddb', '#0e9aa7', '#c2410c', '#64748b'];

const person = (id) => S.people.find((p) => p.id === id);
const sortedPeople = () => [...S.people].sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Arranque ----------
export const VERSION = '5';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => {
    r.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update().catch(() => {}); });
  }).catch(() => {});
  // Cuando llega una versión nueva, recargar una vez para usarla.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || document.querySelector('.backdrop')) return;
    reloaded = true;
    location.reload();
  });
}

let watching = false;
const boot = () => store.onAuth((u) => {
  S.user = u;
  if (u && !watching) {
    watching = true;
    let seeded = false;
    store.watch('people', (list, meta) => {
      S.people = list;
      if (!list.length && !seeded && !meta?.fromCache) {
        seeded = true;
        DEFAULT_PEOPLE.forEach((p) => store.add('people', p));
      }
      render();
    });
    store.watch('events', (list) => { S.events = list; render(); });
    store.watch('holidays', (list) => { S.holidays = list; setExtraHolidays(list); render(); });
  }
  if (!u) watching = false;
  render();
});
setInterval(() => { if (S.user && !document.querySelector('.backdrop')) render(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) render(); });

// ---------- Render principal ----------
function render() {
  if (S.user === undefined) { $app.innerHTML = ''; return; }
  if (!S.user) return renderPin();
  const scroll = window.scrollY;
  $app.innerHTML = `
  <div class="wrap">
    <header>
      <div class="top">
        <div class="brand">SUPER<span>ANDER</span>TXU</div>
        <button class="iconbtn" id="settings" aria-label="Ajustes">⚙️</button>
      </div>
      ${store.demo ? '<div class="banner">Modo prueba: los datos se guardan solo en este dispositivo.</div>' : ''}
      <div class="seg">
        <button data-view="48h" class="${S.view === '48h' ? 'on' : ''}">Próximos 7 días</button>
        <button data-view="mes" class="${S.view === 'mes' ? 'on' : ''}">Mes</button>
      </div>
      <div class="filters">${filterChips()}</div>
    </header>
    <main>${S.view === '48h' ? view48() : viewMonth()}</main>
  </div>
  <button class="fab" id="add" aria-label="Añadir">+</button>`;
  window.scrollTo(0, scroll);

  $app.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { S.view = b.dataset.view; ls.set('view', S.view); window.scrollTo(0, 0); render(); });
  $app.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => {
    const f = b.dataset.filter;
    if (f === 'all') S.filter.clear();
    else S.filter.has(f) ? S.filter.delete(f) : S.filter.add(f);
    ls.set('filter', [...S.filter]);
    render();
  });
  $app.querySelector('#settings').onclick = openSettings;
  $app.querySelector('#add').onclick = () => openForm(null, S.view === 'mes' ? S.selDay : ymd(new Date()));
  bindItems($app);
  if (S.view === 'mes') bindMonth();
}

function filterChips() {
  const all = `<button class="fchip plain ${S.filter.size ? '' : 'on'}" data-filter="all">Todos</button>`;
  const ps = sortedPeople().map((p) => `
    <button class="fchip ${S.filter.has(p.id) ? 'on' : ''}" data-filter="${p.id}" style="--c:${p.color}">
      <span class="dot" style="--c:${p.color}">${esc(p.emoji || p.name[0])}</span>${esc(p.name)}</button>`).join('');
  const none = `<button class="fchip ${S.filter.has('_none') ? 'on' : ''}" data-filter="_none">
      <span class="dot none"></span>Sin asignar</button>`;
  return all + ps + none;
}

const holTag = (d) => (holidayName(d) ? ` <span class="holtag">🎉 ${esc(holidayName(d))}</span>` : '');

const passFilter = (ev) => {
  if (!S.filter.size) return true;
  const ids = (ev.people || []).filter(person);
  if (!ids.length) return S.filter.has('_none');
  return ids.some((id) => S.filter.has(id));
};
const visibleEvents = () => S.events.filter(passFilter);

// ---------- Vista próximos 7 días ----------
function view48() {
  const now = new Date();
  const DAYS = 7;
  const evs = visibleEvents();
  const today = ymd(now);
  let html = '';

  // Tareas atrasadas sin hacer (últimos 30 días)
  const late = expand(evs.filter((e) => e.kind === 'tarea'), ymd(addDays(now, -30)), ymd(addDays(now, -1)))
    .filter((o) => !isDone(o)).sort(sortOcc);
  if (late.length) html += `<h2 class="late">Pendiente de días anteriores</h2>` + late.map((o) => itemHtml(o, { showDate: true })).join('');

  const occ = expand(evs, today, ymd(addDays(now, DAYS - 1))).sort(sortOcc);
  for (let i = 0; i < DAYS; i++) {
    const d = ymd(addDays(now, i));
    const list = occ.filter((o) => o.date === d);
    const when = i < 2 ? `${['Hoy', 'Mañana'][i]} <span class="when">· ${fmtDay(d)}</span>`
      : `${fmtDay(d, { weekday: 'long' })} <span class="when">· ${fmtDay(d, { day: 'numeric', month: 'long' })}</span>`;
    html += `<h2>${when}${holTag(d)}</h2>`;
    html += list.length ? list.map((o) => itemHtml(o)).join('') : `<div class="empty">Nada previsto${i === 0 ? ' 🎉' : ''}</div>`;
  }
  return html;
}

const fmtDay = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('es-ES', opts).format(parseYmd(d));

function itemHtml(o, { showDate = false } = {}) {
  const ev = o.ev;
  const ids = (ev.people || []).filter(person);
  const colors = ids.map((id) => person(id).color);
  const bar = colors.length
    ? (colors.length === 1 ? colors[0] : `linear-gradient(180deg,${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(',')})`)
    : '';
  const done = isDone(o);
  const past = ev.kind !== 'tarea' && endOf(o) < new Date();
  const time = ev.start
    ? `${ev.start}${ev.end ? `<small>${ev.end}</small>` : ''}`
    : `<span class="allday">Todo el día</span>`;
  const meta = [
    showDate ? fmtDay(o.date, { weekday: 'short', day: 'numeric', month: 'short' }) : '',
    ev.location ? `📍 ${esc(ev.location)}` : '',
    ev.repeat?.freq && ev.repeat.freq !== 'none' ? '🔁' : '',
    ev.reminder !== '' && ev.reminder != null ? '🔔' : '',
  ].filter(Boolean).join(' · ');
  const who = ids.length
    ? ids.map((id) => { const p = person(id); return `<span class="pchip" style="--c:${p.color}"><span class="dot" style="--c:${p.color}">${esc(p.emoji || p.name[0])}</span>${esc(p.name)}</span>`; }).join('')
    : `<span class="pchip none">Sin asignar</span>`;
  return `
  <div class="item ${done ? 'done' : ''} ${past ? 'past' : ''}" data-open="${ev.id}" data-date="${o.date}" role="button">
    <div class="bar ${colors.length ? '' : 'none'}" style="--bar:${bar}"></div>
    <div class="time">${time}</div>
    <div class="body">
      <div class="title">${catEmoji(ev.category) ? catEmoji(ev.category) + ' ' : ''}${esc(ev.title)}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      <div class="who">${who}</div>
    </div>
    ${ev.kind === 'tarea' ? `<button class="check" data-check="${ev.id}" data-date="${o.date}" aria-label="Hecho">${done ? '✓' : ''}</button>` : ''}
  </div>`;
}

function bindItems(root) {
  root.querySelectorAll('[data-check]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const ev = S.events.find((x) => x.id === b.dataset.check);
    const d = b.dataset.date;
    const val = !(ev.done && ev.done[d]);
    store.update('events', ev.id, { [`done.${d}`]: val });
    if (val) toast('¡Hecho! ✓');
  });
  root.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => {
    const ev = S.events.find((x) => x.id === el.dataset.open);
    if (ev) openForm(ev, el.dataset.date);
  });
}

// ---------- Vista mes ----------
function viewMonth() {
  const m = S.month;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  const end = addDays(last, 6 - ((last.getDay() + 6) % 7));
  const occ = expand(visibleEvents(), ymd(start), ymd(end));
  const byDay = {};
  occ.forEach((o) => (byDay[o.date] = byDay[o.date] || []).push(o));
  const today = ymd(new Date());
  let cells = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ds = ymd(d);
    const list = (byDay[ds] || []).sort(sortOcc);
    const ticks = list.slice(0, 6).map((o) => {
      const cs = (o.ev.people || []).filter(person).map((id) => person(id).color);
      if (!cs.length) return `<i class="tk none"></i>`;
      const bg = cs.length === 1 ? cs[0]
        : `conic-gradient(${cs.map((c, i) => `${c} ${(i / cs.length) * 360}deg ${((i + 1) / cs.length) * 360}deg`).join(',')})`;
      return `<i class="tk" style="--c:${bg}"></i>`;
    }).join('');
    cells += `<button class="cell ${d.getMonth() !== m.getMonth() ? 'out' : ''} ${holidayName(ds) ? 'hol' : ''} ${ds === today ? 'today' : ''} ${ds === S.selDay ? 'sel' : ''}" data-day="${ds}">
      <span class="n">${d.getDate()}</span><span class="ticks">${ticks}</span>${list.length > 6 ? `<span class="more">+${list.length - 6}</span>` : ''}</button>`;
  }
  const sel = (byDay[S.selDay] || []).sort(sortOcc);
  const t0 = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(m);
  const title = t0[0].toUpperCase() + t0.slice(1);
  return `
    <div class="mhead">
      <button class="iconbtn" data-mon="-1" aria-label="Mes anterior">‹</button>
      <b>${title}</b>
      <button class="iconbtn" data-mon="1" aria-label="Mes siguiente">›</button>
    </div>
    <div class="grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((w) => `<div class="wd">${w}</div>`).join('')}${cells}</div>
    <h2>${fmtDay(S.selDay)}${holTag(S.selDay)}</h2>
    ${sel.length ? sel.map((o) => itemHtml(o)).join('') : '<div class="empty">Nada este día</div>'}`;
}

function bindMonth() {
  $app.querySelectorAll('[data-mon]').forEach((b) => b.onclick = () => {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + Number(b.dataset.mon), 1);
    render();
  });
  $app.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { S.selDay = b.dataset.day; render(); });
}

// ---------- Hoja (modal) ----------
function sheet(html) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(bd);
  document.body.style.overflow = 'hidden';
  const close = () => { bd.remove(); document.body.style.overflow = ''; };
  bd.onclick = (e) => { if (e.target === bd) close(); };
  return { el: bd.querySelector('.sheet'), close };
}

function choose(title, options) {
  return new Promise((resolve) => {
    const { el, close } = sheet(`<div class="shead"><b>${esc(title)}</b></div>
      ${options.map((o, i) => `<button class="btn ${o.cls || 'ghost'}" data-i="${i}">${esc(o.label)}</button>`).join('')}
      <button class="btn danger" data-i="-1">Cancelar</button>`);
    el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { close(); resolve(b.dataset.i === '-1' ? null : options[b.dataset.i].v); });
  });
}

// ---------- Formulario ----------
const isWeekdays = (r) => r?.freq === 'weekly' && (Number(r.interval) || 1) === 1 && [...(r.days || [])].sort().join() === '1,2,3,4,5';
const WD = [['L', 1], ['M', 2], ['X', 3], ['J', 4], ['V', 5], ['S', 6], ['D', 0]];

function openForm(ev, occDate) {
  const isNew = !ev;
  const recurring = ev && ev.repeat?.freq && ev.repeat.freq !== 'none';
  const f = {
    title: ev?.title || '',
    kind: ev?.kind || 'evento',
    date: occDate || ev?.date || ymd(new Date()),
    start: ev?.start || '',
    end: ev?.end || '',
    people: [...(ev?.people || [])].filter(person),
    category: ev?.category || '',
    location: ev?.location || '',
    notes: ev?.notes || '',
    freq: isWeekdays(ev?.repeat) ? 'weekdays' : (ev?.repeat?.freq || 'none'),
    interval: ev?.repeat?.interval || 1,
    days: ev?.repeat?.days?.length ? [...ev.repeat.days] : [parseYmd(occDate || ymd(new Date())).getDay()],
    until: ev?.repeat?.until || '',
    skipHolidays: ev ? !!ev.repeat?.skipHolidays : true,
    reminder: ev?.reminder ?? '',
  };
  if (isNew && S.filter.size === 1) {
    const only = [...S.filter][0];
    if (person(only)) f.people = [only];
  }

  const { el, close } = sheet(`
    <div class="shead"><button class="link" id="cancel">Cancelar</button><b>${isNew ? 'Nuevo' : 'Editar'}</b><button class="link" id="save">Guardar</button></div>
    <div class="field"><input class="big" id="title" placeholder="Título (obligatorio)" value="${esc(f.title)}" autocomplete="off"></div>
    <div class="seg" style="margin:0 0 10px">
      <button data-kind="evento" class="${f.kind === 'evento' ? 'on' : ''}">📅 Evento</button>
      <button data-kind="tarea" class="${f.kind === 'tarea' ? 'on' : ''}">✅ Tarea / obligación</button>
    </div>
    <div class="field">
      <div class="row"><label for="date" id="dateLbl">${f.freq === 'none' ? 'Fecha' : 'Desde'}</label><input type="date" id="date" value="${f.date}"></div>
      <div class="row"><label for="start">Hora inicio</label><input type="time" id="start" value="${f.start}"><button class="clear" data-clear="start">⊗</button></div>
      <div class="row"><label for="end">Hora fin</label><input type="time" id="end" value="${f.end}"><button class="clear" data-clear="end">⊗</button></div>
    </div>
    <div class="note" id="allday" ${f.start ? 'hidden' : ''}>Sin hora = todo el día.</div>
    <div class="lbl">¿De quién es? / ¿Quién se encarga?</div>
    <div class="chips" id="people"></div>
    <div class="note">Puedes elegir varias personas, o ninguna.</div>
    <div class="lbl">Categoría</div>
    <div class="chips" id="cats"></div>
    <div class="lbl">Repetir y avisar</div>
    <div class="field">
      <div class="row"><label for="freq">Repetir</label>
        <select id="freq">
          ${[['none', 'Nunca'], ['daily', 'Cada día'], ['weekdays', 'Días laborables (L-V)'], ['weekly', 'Cada semana'], ['monthly', 'Cada mes'], ['yearly', 'Cada año']].map(([v, l]) => `<option value="${v}" ${f.freq === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div id="repOpts"></div>
      <div class="row"><label for="reminder">Aviso</label>
        <select id="reminder">${REMINDERS.map((r) => `<option value="${r.v}" ${String(f.reminder) === String(r.v) ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
    </div>
    <div class="note" id="remnote" ${f.start ? 'hidden' : ''}>En eventos de todo el día, el aviso toma como referencia las 9:00.</div>
    <div class="lbl">Más detalles (opcional)</div>
    <div class="field">
      <div class="row"><input id="location" placeholder="Lugar" value="${esc(f.location)}" style="text-align:left;flex:1"></div>
      <div class="row" style="align-items:flex-start"><textarea id="notes" placeholder="Notas">${esc(f.notes)}</textarea></div>
    </div>
    ${isNew ? '' : '<button class="btn danger" id="del">Eliminar</button>'}
  `);
  const q = (s) => el.querySelector(s);

  const drawPeople = () => {
    q('#people').innerHTML = sortedPeople().map((p) => `<button class="opt ${f.people.includes(p.id) ? 'on' : ''}" data-p="${p.id}" style="--c:${p.color}">
      <span class="dot" style="--c:${p.color}">${esc(p.emoji || p.name[0])}</span>${esc(p.name)}</button>`).join('') +
      `<button class="opt" id="addPerson">＋ Otra persona</button>`;
    q('#people').querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
      const id = b.dataset.p;
      f.people = f.people.includes(id) ? f.people.filter((x) => x !== id) : [...f.people, id];
      drawPeople();
    });
    q('#addPerson').onclick = async () => {
      const name = prompt('Nombre (p. ej. Abuela Maite, Tío Iker):');
      if (!name?.trim()) return;
      const used = new Set(S.people.map((p) => p.color));
      const color = SWATCHES.find((c) => !used.has(c)) || SWATCHES[S.people.length % SWATCHES.length];
      const id = await store.add('people', { name: name.trim(), emoji: name.trim()[0].toUpperCase(), color, order: S.people.length + 1 });
      f.people.push(id);
      setTimeout(drawPeople, 50);
    };
  };
  const drawCats = () => {
    q('#cats').innerHTML = CATEGORIES.map((c) => `<button class="opt ${f.category === c.id ? 'on' : ''}" data-c="${c.id}">${c.emoji} ${c.label}</button>`).join('');
    q('#cats').querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { f.category = f.category === b.dataset.c ? '' : b.dataset.c; drawCats(); });
  };
  const skipRow = () => `<div class="row"><label for="skipHol">Saltar festivos</label><input type="checkbox" id="skipHol" class="switch" ${f.skipHolidays ? 'checked' : ''}></div>`;
  const bindSkip = () => { q('#skipHol').onchange = (e) => (f.skipHolidays = e.target.checked); };
  const drawRep = () => {
    const unit = { daily: ['día', 'días'], weekly: ['semana', 'semanas'], monthly: ['mes', 'meses'], yearly: ['año', 'años'] }[f.freq];
    q('#dateLbl').textContent = f.freq === 'none' ? 'Fecha' : 'Desde';
    if (f.freq === 'none') { q('#repOpts').innerHTML = ''; return; }
    if (f.freq === 'weekdays') {
      q('#repOpts').innerHTML = `<div class="row"><label for="until">Hasta</label><input type="date" id="until" value="${f.until}"><button class="clear" data-clear="until">⊗</button></div>${skipRow()}`;
      q('#until').onchange = (e) => (f.until = e.target.value);
      bindSkip();
      bindClear(q('#repOpts'));
      return;
    }
    q('#repOpts').innerHTML = `
      ${f.freq === 'weekly' ? `<div class="days">${WD.map(([l, n]) => `<button data-wd="${n}" class="${f.days.includes(n) ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="row"><label for="interval">Cada</label><select id="interval">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${Number(f.interval) === n ? 'selected' : ''}>${n} ${n === 1 ? unit[0] : unit[1]}</option>`).join('')}</select></div>
      <div class="row"><label for="until">Hasta (opcional)</label><input type="date" id="until" value="${f.until}"><button class="clear" data-clear="until">⊗</button></div>${skipRow()}`;
    bindSkip();
    q('#repOpts').querySelectorAll('[data-wd]').forEach((b) => b.onclick = () => {
      const n = Number(b.dataset.wd);
      f.days = f.days.includes(n) ? f.days.filter((x) => x !== n) : [...f.days, n];
      if (!f.days.length) f.days = [n];
      drawRep();
    });
    q('#interval').onchange = (e) => (f.interval = Number(e.target.value));
    q('#until').onchange = (e) => (f.until = e.target.value);
    bindClear(q('#repOpts'));
  };
  const bindClear = (root) => root.querySelectorAll('[data-clear]').forEach((b) => b.onclick = () => {
    const k = b.dataset.clear;
    f[k] = '';
    q('#' + k).value = '';
    syncTimeNotes();
  });
  const syncTimeNotes = () => { q('#allday').hidden = !!f.start; q('#remnote').hidden = !!f.start; };

  drawPeople(); drawCats(); drawRep(); bindClear(el);
  el.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
    f.kind = b.dataset.kind;
    el.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
  });
  q('#title').oninput = (e) => (f.title = e.target.value);
  q('#date').onchange = (e) => (f.date = e.target.value);
  q('#start').onchange = (e) => { f.start = e.target.value; syncTimeNotes(); };
  q('#end').onchange = (e) => (f.end = e.target.value);
  q('#freq').onchange = (e) => {
    f.freq = e.target.value;
    if (f.freq === 'weekly' && f.date) f.days = f.days.length ? f.days : [parseYmd(f.date).getDay()];
    drawRep();
  };
  q('#reminder').onchange = (e) => (f.reminder = e.target.value === '' ? '' : Number(e.target.value));
  q('#location').oninput = (e) => (f.location = e.target.value);
  q('#notes').oninput = (e) => (f.notes = e.target.value);
  q('#cancel').onclick = close;
  if (isNew) setTimeout(() => q('#title').focus(), 250);

  q('#save').onclick = async () => {
    f.title = q('#title').value.trim();
    f.date = q('#date').value;
    if (!f.title) { toast('Escribe un título'); q('#title').focus(); return; }
    if (!f.date) { toast('Elige una fecha'); return; }
    if (f.freq !== 'none' && f.until && f.until < f.date) { toast('La fecha «Hasta» es anterior a «Desde»'); return; }
    const data = {
      title: f.title, kind: f.kind, date: f.date, start: f.start || '', end: f.start ? (f.end || '') : '',
      people: f.people, category: f.category, location: f.location.trim(), notes: f.notes.trim(),
      repeat: f.freq === 'none' ? { freq: 'none' } : f.freq === 'weekdays' ? { freq: 'weekly', interval: 1, until: f.until || '', days: [1, 2, 3, 4, 5], skipHolidays: f.skipHolidays } : {
        skipHolidays: f.skipHolidays,
        freq: f.freq, interval: Number(f.interval) || 1, until: f.until || '',
        days: f.freq === 'weekly' ? [...f.days].sort() : [],
      },
      reminder: f.reminder === '' ? '' : Number(f.reminder),
      updatedAt: Date.now(),
    };
    try {
      if (isNew) {
        await store.add('events', { ...data, exdates: [], done: {}, createdAt: Date.now() });
      } else if (recurring) {
        const scope = await choose('Este evento se repite', [
          { label: 'Cambiar solo este día', v: 'one' },
          { label: 'Cambiar toda la serie', v: 'all' },
        ]);
        if (!scope) return;
        if (scope === 'one') {
          await store.update('events', ev.id, { exdates: [...(ev.exdates || []), occDate] });
          await store.add('events', { ...data, repeat: { freq: 'none' }, exdates: [], done: ev.done?.[occDate] ? { [f.date]: true } : {}, createdAt: Date.now() });
        } else {
          if (data.date === occDate) data.date = ev.date; // mantener el inicio de la serie
          await store.update('events', ev.id, data);
        }
      } else {
        await store.update('events', ev.id, data);
      }
      close();
      toast('Guardado');
    } catch (e) {
      toast('Error al guardar: ' + e.message);
    }
  };

  if (!isNew) q('#del').onclick = async () => {
    if (recurring) {
      const scope = await choose('¿Qué quieres eliminar?', [
        { label: 'Solo este día', v: 'one', cls: 'ghost' },
        { label: 'Toda la serie', v: 'all', cls: 'danger' },
      ]);
      if (!scope) return;
      if (scope === 'one') await store.update('events', ev.id, { exdates: [...(ev.exdates || []), occDate] });
      else await store.remove('events', ev.id);
    } else {
      const ok = await choose(`¿Eliminar «${ev.title}»?`, [{ label: 'Eliminar', v: true, cls: 'danger' }]);
      if (!ok) return;
      await store.remove('events', ev.id);
    }
    close();
    toast('Eliminado');
  };
}

// ---------- Ajustes ----------
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function vapidPublicKey() {
  let v = await store.get('config', 'vapid');
  if (!v?.publicKey) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    v = { publicKey: pub, privateKey: jwk.d, createdAt: Date.now() };
    await store.set('config', 'vapid', v);
  }
  return v.publicKey;
}

const isStandalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function saveSubscription() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(await vapidPublicKey()) });
  const json = sub.toJSON();
  const id = await sha(json.endpoint);
  await store.set('subs', id, {
    sub: json, personId: ls.get('me', ''), mode: ls.get('notifyMode', 'mine'),
    device: navigator.userAgent.slice(0, 120), updatedAt: Date.now(),
  });
  ls.set('subId', id);
}

async function openSettings() {
  const me = ls.get('me', '');
  const mode = ls.get('notifyMode', 'mine');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const subOn = perm === 'granted' && ls.get('subId', '');
  let notifHtml;
  if (store.demo) notifHtml = '<div class="note">Los avisos funcionarán cuando la app esté conectada a Firebase.</div>';
  else if (!isStandalone()) notifHtml = `<div class="note">Para recibir avisos en el iPhone, primero instala la app:<br>
    Safari → botón <b>Compartir</b> (□↑) → <b>Añadir a pantalla de inicio</b>. Luego ábrela desde el icono y vuelve aquí.</div>`;
  else if (!pushSupported()) notifHtml = '<div class="note">Este dispositivo no admite avisos. Actualiza iOS a la versión 16.4 o superior.</div>';
  else notifHtml = `
    <div class="row"><label>Estado</label>${subOn ? '<span class="ok">Activados ✓</span>' : perm === 'denied' ? '<span>Bloqueados</span>' : '<span>Desactivados</span>'}</div>
    <div class="row"><label for="mode">Avisarme de</label><select id="mode">
      <option value="mine" ${mode === 'mine' ? 'selected' : ''}>Lo mío y lo sin asignar</option>
      <option value="all" ${mode === 'all' ? 'selected' : ''}>Todo</option></select></div>`;

  const { el, close } = sheet(`
    <div class="shead"><span></span><b>Ajustes</b><button class="link" id="done">Listo</button></div>
    <div class="lbl">Este dispositivo es de</div>
    <div class="chips" id="me">${sortedPeople().map((p) => `<button class="opt ${me === p.id ? 'on' : ''}" data-me="${p.id}" style="--c:${p.color}">
      <span class="dot" style="--c:${p.color}">${esc(p.emoji || p.name[0])}</span>${esc(p.name)}</button>`).join('')}</div>
    <div class="lbl">Avisos</div>
    <div class="field">${notifHtml}</div>
    ${!store.demo && isStandalone() && pushSupported() && perm !== 'denied' ? `<button class="btn" id="enable">${subOn ? 'Probar / actualizar avisos' : 'Activar avisos'}</button>` : ''}
    ${perm === 'denied' ? '<div class="note">Los bloqueaste. Actívalos en Ajustes del iPhone → Notificaciones → SUPERANDERTXU.</div>' : ''}
    <div class="lbl">Personas</div>
    <div class="field" id="plist"></div>
    <button class="btn ghost" id="addp">＋ Añadir persona (abuelos, tíos, canguro…)</button>
    <div class="lbl">Festivos</div>
    <div class="note">Ya están incluidos los festivos oficiales de Euskadi de 2026 y 2027. Añade aquí los de vuestro municipio u otros días sin actividad (puentes, vacaciones de la guardería…).</div>
    <div class="field" id="hlist"></div>
    <div class="field"><div class="row"><label for="hdate">Nuevo festivo</label><input type="date" id="hdate"></div></div>
    <button class="btn ghost" id="addh">＋ Añadir festivo</button>
    <div class="lbl">Seguridad</div>
    ${store.demo ? '' : '<button class="btn ghost" id="pin">Cambiar PIN familiar</button>'}
    <button class="btn danger" id="logout">Cerrar sesión en este dispositivo</button>
    <div class="note" style="text-align:center;margin-top:18px">SUPERANDERTXU · versión ${VERSION} · ${configured ? 'conectado' : 'modo prueba'}</div>
  `);
  const q = (s) => el.querySelector(s);
  q('#done').onclick = () => { close(); render(); };

  el.querySelectorAll('[data-me]').forEach((b) => b.onclick = async () => {
    ls.set('me', b.dataset.me);
    el.querySelectorAll('[data-me]').forEach((x) => x.classList.toggle('on', x === b));
    if (ls.get('subId', '') && !store.demo) store.update('subs', ls.get('subId', ''), { personId: b.dataset.me }).catch(() => {});
  });
  q('#mode')?.addEventListener('change', (e) => {
    ls.set('notifyMode', e.target.value);
    if (ls.get('subId', '')) store.update('subs', ls.get('subId', ''), { mode: e.target.value }).catch(() => {});
  });
  q('#enable')?.addEventListener('click', async () => {
    if (!ls.get('me', '')) { toast('Primero elige de quién es este dispositivo'); return; }
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { toast('No se concedió el permiso'); return; }
      await saveSubscription();
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('SUPERANDERTXU', { body: '¡Avisos activados! 🔔', icon: 'icon-192.png' });
      close(); openSettings();
    } catch (e) {
      toast('No se pudieron activar: ' + e.message);
    }
  });

  const drawPeople = () => {
    q('#plist').innerHTML = sortedPeople().map((p) => `
      <div class="person" data-id="${p.id}">
        <input class="emo" type="text" value="${esc(p.emoji || '')}" maxlength="4" aria-label="Emoji">
        <input type="text" class="pname" value="${esc(p.name)}" aria-label="Nombre">
        <input type="color" value="${p.color}" aria-label="Color">
        <button class="clear" data-delp="${p.id}" aria-label="Eliminar">🗑</button>
      </div>`).join('');
    q('#plist').querySelectorAll('.person').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.emo').onchange = (e) => store.update('people', id, { emoji: e.target.value.trim() });
      row.querySelector('.pname').onchange = (e) => e.target.value.trim() && store.update('people', id, { name: e.target.value.trim() });
      row.querySelector('[type=color]').onchange = (e) => store.update('people', id, { color: e.target.value });
      row.querySelector('[data-delp]').onclick = async () => {
        const p = person(id);
        const n = S.events.filter((ev) => (ev.people || []).includes(id)).length;
        const ok = await choose(`¿Eliminar a ${p.name}?${n ? ` Sus ${n} actividades quedarán sin asignar.` : ''}`, [{ label: 'Eliminar', v: true, cls: 'danger' }]);
        if (!ok) return;
        await store.remove('people', id);
        S.people = S.people.filter((x) => x.id !== id);
        drawPeople();
      };
    });
  };
  drawPeople();
  const drawHol = () => {
    const list = [...S.holidays].sort((a, b) => a.date.localeCompare(b.date));
    q('#hlist').innerHTML = list.length ? list.map((h) => `<div class="person"><span style="flex:1"><b>${esc(fmtDay(h.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</b> · ${esc(h.name)}</span>
      <button class="clear" data-delh="${h.id}" aria-label="Eliminar">🗑</button></div>`).join('') : '<div class="note">Todavía no hay festivos propios.</div>';
    q('#hlist').querySelectorAll('[data-delh]').forEach((b) => b.onclick = async () => {
      await store.remove('holidays', b.dataset.delh);
      S.holidays = S.holidays.filter((x) => x.id !== b.dataset.delh);
      setExtraHolidays(S.holidays);
      drawHol();
    });
  };
  drawHol();
  q('#addh').onclick = async () => {
    const date = q('#hdate').value;
    if (!date) { toast('Elige primero la fecha'); return; }
    const name = prompt('Nombre del festivo (p. ej. San Ignacio, fiestas del pueblo):', 'Festivo local');
    if (name === null) return;
    const id = await store.add('holidays', { date, name: name.trim() || 'Festivo local' });
    if (!S.holidays.some((h) => h.id === id)) S.holidays.push({ id, date, name: name.trim() || 'Festivo local' });
    setExtraHolidays(S.holidays);
    q('#hdate').value = '';
    drawHol();
  };
  q('#addp').onclick = async () => {
    const name = prompt('Nombre (p. ej. Abuela Maite, Tío Iker):');
    if (!name?.trim()) return;
    const used = new Set(S.people.map((p) => p.color));
    const color = SWATCHES.find((c) => !used.has(c)) || SWATCHES[S.people.length % SWATCHES.length];
    await store.add('people', { name: name.trim(), emoji: name.trim()[0].toUpperCase(), color, order: S.people.length + 1 });
    setTimeout(drawPeople, 100);
  };
  q('#pin')?.addEventListener('click', async () => {
    const oldPin = prompt('PIN actual:');
    if (!oldPin) return;
    const newPin = prompt('Nuevo PIN (mínimo 6 números):');
    if (!/^\d{6,}$/.test(newPin || '')) { toast('El PIN debe tener al menos 6 números'); return; }
    try {
      await store.changePin(oldPin, newPin);
      alert('PIN cambiado. Recuerda actualizarlo también en GitHub (secreto FAMILY_PIN) para que sigan llegando los avisos.');
    } catch { toast('PIN actual incorrecto'); }
  });
  q('#logout').onclick = async () => {
    const ok = await choose('¿Cerrar sesión en este dispositivo?', [{ label: 'Cerrar sesión', v: true, cls: 'danger' }]);
    if (!ok) return;
    close();
    await store.logout();
  };
}

// ---------- Pantalla PIN ----------
function renderPin() {
  let pin = '';
  let busy = false;
  $app.innerHTML = `
    <div class="pin">
      <h1>SUPER<span>ANDER</span>TXU</h1>
      <div class="note" style="text-align:center">Introduce el PIN familiar${store.demo ? ' (modo prueba: cualquier PIN de 6 cifras)' : ''}</div>
      <div class="pdots" id="dots"></div>
      <div class="err" id="err"></div>
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
        <button class="x" id="del">Borrar</button><button data-n="0">0</button><button class="x" id="go">Entrar</button>
      </div>
      <div class="note" style="text-align:center;max-width:300px">La primera vez que alguien entra, el PIN que escriba (mínimo 6 números) se convierte en el PIN familiar.</div>
    </div>`;
  const dots = () => {
    document.getElementById('dots').innerHTML = Array.from({ length: Math.max(6, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('');
  };
  const err = (m) => (document.getElementById('err').textContent = m);
  const go = async () => {
    if (busy) return;
    if (pin.length < 6) { err('El PIN tiene al menos 6 números'); return; }
    busy = true; err('Entrando…');
    try {
      const r = await store.login(pin);
      if (r.created) setTimeout(() => alert(`PIN familiar creado: ${pin}\nCompártelo con quien quieras que use la app.`), 300);
    } catch (e) {
      pin = ''; dots(); err(e.message);
    }
    busy = false;
  };
  $app.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { if (pin.length < 10) { pin += b.dataset.n; dots(); err(''); } });
  $app.querySelector('#del').onclick = () => { pin = pin.slice(0, -1); dots(); };
  $app.querySelector('#go').onclick = go;
  dots();
}

boot();
