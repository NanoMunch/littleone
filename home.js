// Home plan: the bedtime routine, the days-ahead plan, appointments and carer questions.
// Pure functions (no page needed) so they can be tested. Everything here is shared between parents inside the profile.
const pad = (n) => String(n).padStart(2, '0');
const YMD = /^\d{4}-\d{2}-\d{2}$/; const HM = /^([01]\d|2[0-3]):[0-5]\d$/; const HEX = /^[a-f0-9]{6,40}$/;
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
export const dowOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const daysBetween = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const mins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
const ts = (v) => (+v > 0 ? +v : 0);
export const hexId = (s) => { let a = 0x811c9dc5; let b = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; } return (a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')); };
export const tickId = (date, stepId, who) => hexId(`tick|${date}|${stepId}|${who || ''}`);

// ---------------- cleaning
export function cleanSteps(list) {
  const out = []; const seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, 40).forEach((s) => {
    if (!s || !HM.test(s.time || '')) return; const text = str(s.text, 80); if (!text) return;
    const id = HEX.test(s.id || '') && !seen.has(s.id) ? s.id : hexId(`s|${s.time}|${text}|${out.length}`); seen.add(id);
    out.push({ id, time: s.time, end: HM.test(s.end || '') && mins(s.end) > mins(s.time) ? s.end : '', text, note: str(s.note, 200), parentsOnly: !!s.parentsOnly });
  });
  return out.sort((a, b) => mins(a.time) - mins(b.time));
}
export function cleanRoutine(r) {
  const variants = {}; const overrides = {}; const src = r && typeof r === 'object' ? r : {};
  Object.entries(src.variants || {}).slice(0, 12).forEach(([id, v]) => {
    if (!HEX.test(id) || !v) return;
    variants[id] = { id, name: str(v.name, 40) || 'Routine', days: Array.from(new Set((Array.isArray(v.days) ? v.days : []).map(Number).filter((d) => d >= 0 && d <= 6))).sort(), steps: cleanSteps(v.steps), carers: !!v.carers, removed: !!v.removed, updatedAt: ts(v.updatedAt) };
  });
  Object.entries(src.overrides || {}).slice(0, 400).forEach(([d, o]) => { if (YMD.test(d) && o && (o.v === 'none' || o.v === '' || HEX.test(o.v || ''))) overrides[d] = { v: o.v, updatedAt: ts(o.updatedAt) }; });
  return { variants, overrides };
}
export function cleanDays(m) {
  const out = {}; Object.entries(m && typeof m === 'object' ? m : {}).slice(0, 400).forEach(([d, x]) => {
    if (!YMD.test(d) || !x) return; out[d] = { food: str(x.food, 300), where: str(x.where, 300), note: str(x.note, 600), carers: !!x.carers, removed: !!x.removed, updatedAt: ts(x.updatedAt) };
  }); return out;
}
export const REPEATS = { none: 'Does not repeat', weekly: 'Every week', fortnightly: 'Every fortnight', monthly: 'Every month' };
export function cleanAppts(m) {
  const out = {}; Object.entries(m && typeof m === 'object' ? m : {}).slice(0, 600).forEach(([id, a]) => {
    if (!HEX.test(id) || !a || !YMD.test(a.date || '')) return;
    const done = {}; Object.entries(a.done || {}).slice(0, 400).forEach(([d, o]) => { if (YMD.test(d) && o) done[d] = { at: ts(o.at), skip: !!o.skip }; });
    out[id] = { id, who: str(a.who, 60) || 'Appointment', what: str(a.what, 80), place: str(a.place, 120), date: a.date, time: HM.test(a.time || '') ? a.time : '', len: Math.max(0, Math.min(600, Math.round(+a.len) || 0)),
      repeat: REPEATS[a.repeat] ? a.repeat : 'none', until: YMD.test(a.until || '') ? a.until : '', skip: Array.from(new Set((Array.isArray(a.skip) ? a.skip : []).filter((d) => YMD.test(d)))).slice(0, 200),
      carers: !!a.carers, remind: ['on', 'off', 'cal'].includes(a.remind) ? a.remind : 'on', notes: str(a.notes, 600), done, removed: !!a.removed, updatedAt: ts(a.updatedAt) };
  }); return out;
}
export function cleanQa(m) {
  const out = {}; Object.entries(m && typeof m === 'object' ? m : {}).slice(0, 600).forEach(([id, q]) => {
    if (!HEX.test(id) || !q) return; out[id] = { a: str(q.a, 600), by: str(q.by, 40), at: ts(q.at), resolved: !!q.resolved, updatedAt: ts(q.updatedAt) };
  }); return out;
}
export function cleanHome(h) {
  const x = h && typeof h === 'object' ? h : {}; const r = cleanRoutine(x.routine);
  return { routine: r, days: cleanDays(x.days), appts: cleanAppts(x.appts), qa: cleanQa(x.qa), cfg: { carerDays: Math.max(1, Math.min(7, Math.round(+(x.cfg && x.cfg.carerDays)) || 7)), updatedAt: ts(x.cfg && x.cfg.updatedAt) } };
}
const mergeMap = (a, b) => { const out = { ...a }; Object.entries(b).forEach(([k, v]) => { if (!out[k] || (v.updatedAt || 0) > (out[k].updatedAt || 0)) out[k] = v; }); return out; };
export function mergeHome(a, b) {
  const x = cleanHome(a); const y = cleanHome(b);
  return { routine: { variants: mergeMap(x.routine.variants, y.routine.variants), overrides: mergeMap(x.routine.overrides, y.routine.overrides) }, days: mergeMap(x.days, y.days), appts: mergeMap(x.appts, y.appts), qa: mergeMap(x.qa, y.qa), cfg: y.cfg.updatedAt > x.cfg.updatedAt ? y.cfg : x.cfg };
}

// ---------------- routine
export function variantFor(routine, date) {
  const r = cleanRoutine(routine); const live = Object.values(r.variants).filter((v) => !v.removed);
  const o = r.overrides[date]; if (o && o.v !== '') { if (o.v === 'none') return null; if (r.variants[o.v] && !r.variants[o.v].removed) return r.variants[o.v]; }
  const dow = dowOf(date); const specific = live.filter((v) => v.days.includes(dow)).sort((a, b) => a.days.length - b.days.length)[0];
  return specific || live.filter((v) => !v.days.length).sort((a, b) => (a.name < b.name ? -1 : 1))[0] || null;
}
// ticks: Map or object of stepId -> { at, skip, by }
export function stepStatus(steps, ticks, nowHM, isToday) {
  const t = ticks || {}; const items = steps.map((s) => {
    const k = t[s.id]; const state = k ? (k.skip ? 'skipped' : 'done') : 'open';
    const past = !!isToday && state === 'open' && mins(s.time) <= mins(nowHM);
    return { step: s, state, missed: past && (mins(s.end || s.time) <= mins(nowHM) || mins(s.time) + 10 <= mins(nowHM)), tick: k || null };
  });
  let here = items.findIndex((i) => mins(i.step.time) > mins(nowHM)); if (here < 0) here = items.length;
  return { items, here, next: items[here] || null, done: items.filter((i) => i.state === 'done').length, open: items.filter((i) => i.state === 'open').length };
}
// How many of the last 7 evenings had every (non-skipped) step done. ticksByDate: date -> {stepId: tick}
export function routineWeek(routine, ticksByDate, today) {
  let nights = 0; let full = 0; let steps = 0; let done = 0;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i); const v = variantFor(routine, d); if (!v || !v.steps.length) continue;
    const t = ticksByDate[d] || {}; const ticked = v.steps.filter((s) => t[s.id]);
    if (!ticked.length) continue; // a night nobody used the checklist isn't counted either way
    nights++; const need = v.steps.filter((s) => !(t[s.id] && t[s.id].skip)); const got = need.filter((s) => t[s.id]);
    steps += need.length; done += got.length; if (got.length === need.length) full++;
  }
  return { nights, full, steps, done };
}

// ---------------- appointments
export function occurrences(a, from, to) {
  if (!a || a.removed || !YMD.test(a.date || '')) return [];
  const out = []; const stop = a.until && a.until < to ? a.until : to; const skip = new Set(a.skip || []);
  const push = (d) => { if (d >= from && d <= stop && !skip.has(d)) out.push({ id: a.id, date: d, time: a.time || '', key: `${a.id}|${d}` }); };
  if (a.repeat === 'weekly' || a.repeat === 'fortnightly') {
    const step = a.repeat === 'weekly' ? 7 : 14; const gap = Math.max(0, daysBetween(a.date, from)); let d = addDays(a.date, Math.floor(gap / step) * step);
    for (let n = 0; d <= stop && n < 800; n++, d = addDays(d, step)) push(d);
  } else if (a.repeat === 'monthly') {
    const [y, m, day] = a.date.split('-').map(Number);
    for (let k = 0; k < 600; k++) { const t = new Date(y, m - 1 + k, day); if (t.getDate() !== day) continue; const d = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; if (d > stop) break; push(d); }
  } else push(a.date);
  return out;
}
export function upcoming(appts, today, nowHM, days) {
  const out = []; Object.values(cleanAppts(appts)).forEach((a) => { occurrences(a, today, addDays(today, days)).forEach((o) => { if (o.date === today && o.time && o.time < nowHM && (a.done || {})[o.date]) return; out.push({ ...o, appt: a }); }); });
  return out.sort((x, y) => (x.date + (x.time || '99:99') < y.date + (y.time || '99:99') ? -1 : 1));
}
// "How did it go?": from 30 minutes after an appointment ends, until the end of the next day.
export function followUps(appts, today, nowHM) {
  const out = []; const from = addDays(today, -1);
  Object.values(cleanAppts(appts)).forEach((a) => {
    occurrences(a, from, today).forEach((o) => {
      if ((a.done || {})[o.date] || !o.time) return;
      const end = mins(o.time) + (a.len || 30) + 30; const passed = o.date < today || mins(nowHM) >= end;
      if (passed) out.push({ ...o, appt: a });
    });
  });
  return out.sort((x, y) => (x.date + x.time < y.date + y.time ? -1 : 1));
}
// Reminders: appointments tomorrow (shown from the evening before) and today, unless switched off or already in a calendar.
export function reminders(appts, today) {
  return upcoming(appts, today, '00:00', 1).filter((o) => o.appt.remind === 'on');
}
export function apptIcs(a, uid, today) {
  if (!a || !YMD.test(a.date || '')) return '';
  const d = (s) => s.replace(/-/g, ''); const t = a.time ? a.time.replace(':', '') + '00' : '';
  const esc = (v) => String(v).replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const endHM = a.time ? (() => { const m = Math.min(1439, mins(a.time) + (a.len || 30)); return `${pad(Math.floor(m / 60))}${pad(m % 60)}00`; })() : '';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little One//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}@littleone`, `DTSTAMP:${d(today)}T000000Z`];
  L.push(t ? `DTSTART:${d(a.date)}T${t}` : `DTSTART;VALUE=DATE:${d(a.date)}`, t ? `DTEND:${d(a.date)}T${endHM}` : `DTEND;VALUE=DATE:${d(addDays(a.date, 1))}`);
  const freq = { weekly: 'FREQ=WEEKLY', fortnightly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY' }[a.repeat];
  if (freq) L.push(`RRULE:${freq}${a.until ? `;UNTIL=${d(a.until)}${t ? 'T235900' : ''}` : ''}`);
  (a.skip || []).forEach((s) => L.push(t ? `EXDATE:${d(s)}T${t}` : `EXDATE;VALUE=DATE:${d(s)}`));
  L.push(`SUMMARY:${esc([a.who, a.what].filter(Boolean).join(': '))}`);
  if (a.place) L.push(`LOCATION:${esc(a.place)}`);
  if (a.notes) L.push(`DESCRIPTION:${esc(a.notes)}`);
  if (t) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(a.who)}`, 'TRIGGER:-PT1H', 'END:VALARM');
  L.push('END:VEVENT', 'END:VCALENDAR', '');
  return L.join('\r\n');
}

// ---------------- what a carer receives (only what has been opted in)
export function carerView(home, today, nowHM, medsForCarers) {
  const h = cleanHome(home); const days = h.cfg.carerDays;
  const variants = {}; Object.values(h.routine.variants).forEach((v) => { if (v.carers && !v.removed) variants[v.id] = { ...v, steps: v.steps.filter((s) => !s.parentsOnly), updatedAt: 0 }; });
  const overrides = {}; for (let i = 0; i < days; i++) { const d = addDays(today, i); const o = h.routine.overrides[d]; if (o && (o.v === 'none' || variants[o.v])) overrides[d] = { v: o.v, updatedAt: 0 }; }
  const outDays = {}; for (let i = 0; i < days; i++) { const d = addDays(today, i); const x = h.days[d]; if (x && x.carers && !x.removed) outDays[d] = { food: x.food, where: x.where, note: x.note, carers: true, updatedAt: 0 }; }
  const appts = upcoming(h.appts, today, nowHM, days - 1).filter((o) => o.appt.carers).map((o) => ({ date: o.date, time: o.time, who: o.appt.who, what: o.appt.what, place: o.appt.place, notes: o.appt.notes }));
  return { routine: { variants, overrides }, days: outDays, appts, meds: medsForCarers || [], span: days };
}
