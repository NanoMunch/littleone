// Medicine plan: schedule, doses, and patterns. Pure functions so they can be tested without the page.
export const EFFECTS = [
  ['drowsy', 'Drowsy or tired'], ['restless', 'Restless or wired'], ['appetite_down', 'Eating less'], ['appetite_up', 'Eating more'],
  ['sleep_trouble', 'Trouble sleeping'], ['irritable', 'Irritable or moody'], ['low_mood', 'Flat or low'], ['tummy', 'Upset tummy'],
  ['headache', 'Headache'], ['dizzy', 'Dizzy'], ['other', 'Something else'],
];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const dow = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const mins = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };

// Cleans one plan item. times: sorted unique HH:MM (empty means "as needed"). days: weekdays 0-6 (empty means every day).
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// A saved supplement or medicine item: name, amount, and what's in it, as recorded in the log.
export function cleanItem(i) {
  if (!i || typeof i !== 'object') return null;
  const med = txt(i.med, 60); if (!med) return null;
  const contents = (Array.isArray(i.contents) ? i.contents : []).map((c) => ({ name: txt(c && c.name, 40), amount: txt(c && c.amount, 30) })).filter((c) => c.name).slice(0, 20);
  return { med, dose: txt(i.dose, 60), contents, product: txt(i.product, 40), units: txt(i.units, 20) };
}
// Does a backup give any of the same things as the main item (e.g. iron for iron)? With nothing recorded for the main item, yes.
export function sameNutrient(main, backup) {
  if (!backup) return false; const a = (main && main.contents) || []; if (!a.length) return true;
  const names = new Set(a.map((c) => c.name.toLowerCase())); return (backup.contents || []).some((c) => names.has(c.name.toLowerCase()));
}
export function cleanPlan(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').trim().slice(0, 60); if (!name) return null;
  const times = Array.from(new Set((Array.isArray(x.times) ? x.times : []).map(String).filter((t) => /^\d{2}:\d{2}$/.test(t)))).sort().slice(0, 6);
  const days = Array.from(new Set((Array.isArray(x.days) ? x.days : []).map(Number).filter((d) => d >= 0 && d <= 6))).sort();
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  const history = (Array.isArray(x.history) ? x.history : []).map((h) => ({ date: date(h && h.date), dose: String((h && h.dose) || '').trim().slice(0, 60) })).filter((h) => h.date && h.dose).slice(-30);
  return { name, dose: String(x.dose || '').trim().slice(0, 60), times, days, notes: String(x.notes || '').trim().slice(0, 200), start: date(x.start), end: date(x.end), carers: !!x.carers, kind: x.kind === 'supplement' ? 'supplement' : 'medicine', retest: date(x.retest), retestLabel: String(x.retestLabel || '').trim().slice(0, 40), history, item: cleanItem(x.item), backups: (Array.isArray(x.backups) ? x.backups : []).map(cleanItem).filter(Boolean).slice(0, 4), oos: !!x.oos, removed: !!x.removed, updatedAt: +x.updatedAt || 0 };
}
export function cleanPlans(m) {
  const out = {};
  Object.keys(m && typeof m === 'object' ? m : {}).sort().forEach((id) => { if (!/^[a-f0-9]{8,40}$/.test(id)) return; const p = cleanPlan(m[id]); if (p) out[id] = p; });
  return out;
}
export function mergePlans(a, b) {
  const o = cleanPlans(a); const r = cleanPlans(b);
  for (const id of Object.keys(r)) if (!o[id] || r[id].updatedAt > o[id].updatedAt) o[id] = r[id];
  return o;
}

// Is this plan item active on a date?
export const activeOn = (p, date) => !p.removed && (!p.start || date >= p.start) && (!p.end || date <= p.end);
// The scheduled times for a date ([] if none, or as-needed).
export function slotsFor(p, date) {
  if (!activeOn(p, date) || !p.times.length) return [];
  if (p.days.length && !p.days.includes(dow(date))) return [];
  return p.times;
}
export const isPrn = (p) => !p.times.length;

// Deterministic id so two phones that mark the same dose end up with one record.
export function doseId(planId, date, slot) {
  let h = 2166136261; const s = `${planId}|${date}|${slot}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0') + planId.slice(0, 10);
}

// doses: entries { planId, date, slot, status: 'taken'|'late'|'backup'|'missed' }. A backup counts as given.
export function statusMap(doses) { const m = new Map(); for (const d of doses) m.set(`${d.planId}|${d.date}|${d.slot}`, d); return m; }

// Today's rows: every scheduled slot with its status, and how overdue (minutes) when nothing is logged yet.
export function todayRows(plans, doses, date, nowMin) {
  const sm = statusMap(doses); const rows = [];
  for (const [id, p] of Object.entries(plans)) for (const slot of slotsFor(p, date)) {
    const d = sm.get(`${id}|${date}|${slot}`); const due = mins(slot);
    rows.push({ id, plan: p, slot, dose: d || null, status: d ? d.status : '', overdue: !d && nowMin - due >= 30 ? nowMin - due : 0 });
  }
  return rows.sort((a, b) => a.slot.localeCompare(b.slot) || a.plan.name.localeCompare(b.plan.name));
}

// Past days (excluding today): how many scheduled doses were taken (on time or late), late, or missed or unlogged.
export function adherence(plans, doses, todayStr, days = 14) {
  const sm = statusMap(doses); const out = {};
  for (const [id, p] of Object.entries(plans)) {
    let due = 0; let taken = 0; let late = 0; let missed = 0; let unlogged = 0;
    for (let i = 1; i <= days; i++) for (const slot of slotsFor(p, addDays(todayStr, -i))) {
      due++; const d = sm.get(`${id}|${addDays(todayStr, -i)}|${slot}`);
      if (!d) unlogged++; else if (d.status === 'missed') missed++; else { taken++; if (d.status === 'late') late++; }
    }
    if (due) out[id] = { name: p.name, due, taken, late, missed, unlogged };
  }
  return out;
}

// Changes worth marking: starting a medicine, and each dose change.
export function changePoints(plans) {
  const out = [];
  for (const [id, p] of Object.entries(plans)) {
    if (p.start) out.push({ id, name: p.name, date: p.start, label: `started ${p.name}${p.dose ? ` ${p.dose}` : ''}` });
    for (const h of p.history) out.push({ id, name: p.name, date: h.date, label: `changed ${p.name} to ${h.dose}` });
    if (p.end) out.push({ id, name: p.name, date: p.end, label: `stopped ${p.name}`, stop: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// For each change, the child's day ratings and sleep before and after (up to 21 days each side, at least 5 rated days each side).
// ratings: Map date -> 1..4. nights: [{wakeDate, mins}].
export function beforeAfter(points, ratings, nights, todayStr) {
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sleepBy = new Map(nights.map((n) => [n.wakeDate, n.mins]));
  const out = [];
  for (const pt of points) {
    const side = (from, to) => { const r = []; const s = []; for (let d = from; d <= to; d = addDays(d, 1)) { if (ratings.has(d)) r.push(ratings.get(d)); if (sleepBy.has(d)) s.push(sleepBy.get(d)); } return { r, s }; };
    const before = side(addDays(pt.date, -21), addDays(pt.date, -1)); const afterEnd = addDays(pt.date, 21) < todayStr ? addDays(pt.date, 21) : todayStr;
    const after = side(pt.date, afterEnd);
    if (before.r.length < 5 || after.r.length < 5) continue;
    const row = { ...pt, beforeRating: avg(before.r), afterRating: avg(after.r), beforeN: before.r.length, afterN: after.r.length };
    if (before.s.length >= 5 && after.s.length >= 5) { row.beforeSleep = avg(before.s); row.afterSleep = avg(after.s); }
    if (Math.abs(row.afterRating - row.beforeRating) >= 0.4 || (row.beforeSleep != null && Math.abs(row.afterSleep - row.beforeSleep) >= 30)) out.push(row);
  }
  return out;
}

// Days where every scheduled dose was taken compared with days where a dose was missed or late, by the child's rating that day.
export function missedLink(plans, doses, ratings, todayStr, days = 60) {
  const sm = statusMap(doses); const good = []; const bad = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(todayStr, -i); if (!ratings.has(date)) continue;
    let any = false; let off = false;
    for (const [id, p] of Object.entries(plans)) for (const slot of slotsFor(p, date)) { const d = sm.get(`${id}|${date}|${slot}`); if (!d) continue; any = true; if (d.status !== 'taken' && d.status !== 'backup') off = true; }
    if (!any) continue;
    (off ? bad : good).push(ratings.get(date));
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  if (good.length < 4 || bad.length < 4 || Math.abs(avg(bad) - avg(good)) < 0.4) return null;
  return { allTaken: avg(good), offDays: avg(bad), allTakenN: good.length, offN: bad.length };
}

// Side-effect notes: counts by key over the last N days. notes: entries { effects: [], date }.
export function effectCounts(notes, todayStr, days = 30) {
  const from = addDays(todayStr, -(days - 1)); const c = {};
  for (const n of notes) if (n.date >= from && n.date <= todayStr) for (const k of n.effects || []) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

// A check or retest date tied to a plan: a countdown, a gentle daily line and a count of days given. Kind and never guilt-making.
const daysBetween = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (s) => { const [, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
export function retestInfo(p, id, doses, today) {
  if (!p || !p.retest || p.removed) return null;
  const days = daysBetween(today, p.retest);
  if (days < -14) return null;
  const what = p.retestLabel || 'Check-up';
  // Days given in the last 28 days (or since it started): counted on scheduled days only, today only if already given.
  const from = p.start && p.start > addDays(today, -27) ? p.start : addDays(today, -27);
  let sched = 0; let given = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const slots = slotsFor(p, d); if (!slots.length) continue;
    const got = doses.some((x) => x.planId === id && x.date === d && (x.status === 'taken' || x.status === 'late' || (x.status === 'backup' && x.sameNut !== false)));
    if (d === today && !got) continue;
    sched++; if (got) given++;
  }
  // Only shown when it is encouraging; a lower count simply isn't pointed out.
  const tally = sched >= 3 && given / sched >= 0.7 ? `${given} of the last ${sched} days given` : '';
  const n = p.name; const seed = today.length + days;
  const rot = (a) => a[Math.abs(seed) % a.length];
  let head; let line; let short;
  if (days > 14) { head = `${what} in ${days} days (${shortDate(p.retest)}).`; line = rot([`Steady daily ${n} gives the result the best chance of showing a clear picture.`, `A regular daily dose now helps the ${what.toLowerCase()} mean something. Easy does it.`]); short = `${what} in ${days} days`; }
  else if (days > 7) { head = `${what} in ${days} days.`; line = rot([`Keeping up ${n} each day helps get an effective result.`, `You're building a good run. Keep ${n} going so the result reflects it.`]); short = `${what} in ${days} days`; }
  else if (days > 1) { head = `${what} in ${days} days.`; line = rot([`Nearly there. Keep up the ${n} so the result is a useful one.`, `Just a few more days of ${n} and then the test.`]); short = `${what} in ${days} days`; }
  else if (days === 1) { head = `${what} is tomorrow.`; line = `Keep up today's ${n} dose. Then it's done.`; short = `${what} tomorrow`; }
  else if (days === 0) { head = `${what} is today.`; line = `Today's ${n} dose as usual, unless the clinic has said otherwise. Afterwards you can note the outcome.`; short = `${what} today`; }
  else { head = `${what} was ${shortDate(p.retest)}.`; line = `Once you have the result, you can clear this date or update the plan with what's next.`; short = `${what} date has passed`; }
  return { days, head, line, tally, short };
}
// A calendar file: repeats daily until the retest date, at the plan's first time, with a pop-up reminder. Times are "floating" (local to the phone).
export function reminderIcs(p, today, uid) {
  if (!p || !p.retest || !p.times.length || p.retest < today) return '';
  const t = p.times[0].replace(':', ''); const d = (s) => s.replace(/-/g, '');
  const esc = (v) => String(v).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = d(today) + 'T000000Z';
  const end = String(Math.min(2359, +t + 10)).padStart(4, '0');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little One//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}@littleone`, `DTSTAMP:${stamp}`,
    `DTSTART:${d(today)}T${t}00`, `DTEND:${d(today)}T${end}00`, `RRULE:FREQ=DAILY;UNTIL=${d(p.retest)}T235900`,
    `SUMMARY:${esc(`${p.name}${p.dose ? ' ' + p.dose : ''}`)}`, `DESCRIPTION:${esc(`Keep up the daily dose so the ${p.retestLabel || 'retest'} gives an effective result.`)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(p.name)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
