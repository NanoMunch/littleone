// Time with people, eating, and the day breakdown. Pure functions only (no DOM), so they can be tested alone.
export const WITH_KINDS = { cared: 'Looked after them', pickup: 'School or daycare pick-up', play: 'Played together', one: 'One-on-one time', stay: 'Stayed at their place' };
export const PORTIONS = { little: 'A little', half: 'About half', most: 'Most', all: 'All' };
export const EAT_LEVELS = { low: 'Low', usual: 'Usual', big: 'Big' };
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ymdOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const cleanText = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

export function withMins(e) {
  if (e && HM.test(e.time || '') && HM.test(e.end || '')) { let d = toMin(e.end) - toMin(e.time); if (d < 0) d += 1440; return d; }
  return Math.max(0, Math.min(1440, Math.round(+e.mins || 0)));
}
export function cleanWith(e) {
  if (!e || e.cat !== 'with' || !WITH_KINDS[e.kind] || !ymdOk(e.date)) return null;
  const who = cleanText(e.who, 40); if (!who) return null;
  return { who, kind: e.kind, date: e.date, time: HM.test(e.time || '') ? e.time : '', end: HM.test(e.end || '') ? e.end : '', mins: withMins(e), note: cleanText(e.notes, 200) };
}
// Latest "how they ate" level for a date, from entries { cat:'eat', kind:'level', level, date, updatedAt }
export function eatLevel(entries, date) {
  let best = null;
  for (const e of entries) if (e && !e.deleted && e.cat === 'eat' && e.kind === 'level' && e.date === date && EAT_LEVELS[e.level] && (!best || (e.updatedAt || 0) > (best.updatedAt || 0))) best = e;
  return best ? best.level : '';
}
export function meals(entries, date) {
  return entries.filter((e) => e && !e.deleted && e.cat === 'eat' && (e.kind === 'meal' || e.kind === 'snack') && e.date === date && PORTIONS[e.portion])
    .map((e) => ({ id: e.id, kind: e.kind, time: HM.test(e.time || '') ? e.time : '', portion: e.portion, note: cleanText(e.notes, 200), title: cleanText(e.title, 60), foods: Array.isArray(e.foods) ? e.foods.map(String).slice(0, 20) : [], serves: +e.serves > 0 ? +e.serves : 0 }))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
// Rows for one day: [{ time, kind, text, id? }] sorted by time. Items without a time go last.
export function breakdown(entries, date, extra = []) {
  const rows = [];
  for (const e of entries) {
    if (!e || e.deleted || e.date !== date) continue;
    if (e.cat === 'with') {
      const c = cleanWith(e); if (!c) continue;
      const span = c.time && c.end ? `${c.time} to ${c.end}` : c.mins ? `${c.mins} min` : '';
      rows.push({ time: c.time, kind: 'with', id: e.id, text: `${WITH_KINDS[c.kind]}: ${c.who}${span && !(c.time && c.end) ? ` (${span})` : ''}`, to: c.end });
    }
  }
  for (const m of meals(entries, date)) rows.push({ time: m.time, kind: 'eat', id: m.id, text: `${m.kind === 'snack' ? 'Snack' : 'Meal'}${m.title ? `: ${m.title}` : ''}, ${PORTIONS[m.portion].toLowerCase()}${m.note ? ` (${m.note})` : ''}` });
  for (const x of extra) rows.push(x);
  return rows.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}
export function withTotals(entries, from, to) {
  const out = {};
  for (const e of entries) { const c = e && !e.deleted && cleanWith(e); if (c && c.date >= from && c.date <= to) { out[c.who] = out[c.who] || { mins: 0, one: 0, stays: 0 }; out[c.who].mins += c.mins; if (c.kind === 'one') out[c.who].one += c.mins; if (c.kind === 'stay') out[c.who].stays++; } }
  return out;
}
// Gentle observations for the outlook. Returns [] when there is nothing worth saying.
export function withNotes(entries, today, prev, bumpyYesterday) {
  const notes = [];
  const y = prev(today, 1); const wk = withTotals(entries, prev(today, 6), today);
  const oneMins = Object.values(wk).reduce((s, v) => s + v.one, 0);
  const yd = withTotals(entries, y, y); const ydCalm = Object.keys(yd).filter((k) => yd[k].mins >= 30);
  if (bumpyYesterday && ydCalm.length) notes.push(`Yesterday had time with ${ydCalm[0]}, which can help. A little of that again today may be worth it.`);
  else if (!oneMins && Object.keys(wk).length) notes.push('No one-on-one time logged this week yet. Even ten minutes before the evening routine can help.');
  return notes;
}
