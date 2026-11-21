// Sick days: as-needed dose timing, temperatures, reasons, and unwell-day history. Pure functions (no DOM) apart from the
// chart, which returns an SVG string. The app records what parents enter; it never suggests a dose or interval.
export const REASONS = { fever: 'Fever', cold: 'Cold or cough', throat: 'Sore throat', ear: 'Ear pain', tummy: 'Tummy bug', teeth: 'Teething', pain: 'Injury or pain', vax: 'After a vaccination', head: 'Headache', unsure: 'Not sure' };
const DAY = 86400000;
export const atMs = (date, hm) => { const [y, m, d] = String(date).split('-').map(Number); const [h, mi] = String(hm || '12:00').split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };
export const doseMs = (d) => atMs(d.date, d.takenAt || d.slot);
// plan: { gapH, max24 }; doses: this plan's dose entries. Returns null if none given in the last 24 hours.
export function prnStatus(plan, doses, now) {
  const given = doses.filter((d) => d && !d.deleted && d.status !== 'missed').map(doseMs).filter((t) => t <= now && now - t < DAY).sort((a, b) => a - b);
  if (!given.length) return null;
  const last = given[given.length - 1]; let next = 0; let reason = '';
  if (plan.gapH > 0) { next = last + plan.gapH * 3600000; reason = 'gap'; }
  if (plan.max24 > 0 && given.length >= plan.max24) { const n2 = given[given.length - plan.max24] + DAY; if (n2 > next) { next = n2; reason = 'max'; } }
  return { last, count: given.length, next, canNow: !next || now >= next, reason, max24: plan.max24 || 0 };
}
const tempNum = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return n >= 33 && n <= 43 ? Math.round(n * 10) / 10 : null; };
// Temperatures from quick readings (cat 'temp') and from health log entries that include a temperature.
export function temps(entries) {
  const out = [];
  for (const e of entries) {
    if (!e || e.deleted || !e.date) continue;
    if (e.cat === 'temp' || (e.cat === 'health' && e.temp)) { const v = tempNum(e.value != null ? e.value : e.temp); if (v != null) out.push({ ms: atMs(e.date, e.time), value: v, id: e.id, date: e.date, time: e.time || '' }); }
  }
  return out.sort((a, b) => a.ms - b.ms);
}
// Unwell days: a sick-day marker or an as-needed dose with reasons. Map date -> Set of reason keys.
export function unwellDays(entries) {
  const m = new Map(); const add = (d, rs) => { if (!m.has(d)) m.set(d, new Set()); (rs || []).forEach((r) => { if (REASONS[r] || String(r).startsWith('o:')) m.get(d).add(r); }); };
  for (const e of entries) { if (!e || e.deleted || !e.date) continue; if (e.cat === 'sickday') add(e.date, e.reasons); else if (e.cat === 'meddose' && Array.isArray(e.reasons) && e.reasons.length) add(e.date, e.reasons); }
  return m;
}
export const reasonLabel = (r) => (REASONS[r] || String(r).replace(/^o:/, ''));
// Back-to-back days count as one spell of illness.
export function spells(dates) {
  const ds = Array.from(dates).sort(); const out = []; let cur = null;
  for (const d of ds) { const prev = cur && atMs(cur.end, '12:00'); if (cur && atMs(d, '12:00') - prev <= DAY * 1.5) cur.end = d; else { cur = { start: d, end: d }; out.push(cur); } }
  return out.map((s) => ({ ...s, days: Math.round((atMs(s.end, '12:00') - atMs(s.start, '12:00')) / DAY) + 1 }));
}
// Small chart: temperature line plus dose ticks and the parent-set gap as a faint band. 24 hours to now.
export function sickChart(readings, doseMarks, now, { width = 330, height = 56 } = {}) {
  const W = width; const H = height; const pad = 10;
  // Window: from the first reading or dose in the last 24 hours (less an hour), at least 6 hours, up to now.
  const first = Math.min(...readings.filter((r) => r.ms >= now - DAY && r.ms <= now).map((r) => r.ms), ...doseMarks.filter((d) => d.ms >= now - DAY).map((d) => d.ms), now);
  const t0 = Math.max(now - DAY, Math.min(first - 3600000, now - 6 * 3600000)); const span = now - t0;
  const rs = readings.filter((r) => r.ms >= t0 && r.ms <= now);
  const vals = rs.map((r) => r.value); const lo = Math.min(37, ...vals) - 0.2; const hi = Math.max(38.6, ...vals) + 0.2;
  const X = (ms) => pad + ((ms - t0) / span) * (W - pad * 2); const Y = (v) => 4 + ((hi - v) / (hi - lo)) * (H - 20);
  const f = (n) => n.toFixed(1);
  let s = '';
  for (const d of doseMarks) if (d.ms >= t0 && d.gapH > 0) { const x = X(d.ms); const x2 = Math.min(X(d.ms + d.gapH * 3600000), W - pad); s += `<rect x="${f(x)}" y="2" width="${f(Math.max(1, x2 - x))}" height="${H - 16}" rx="3" class="sc-band" data-c="${d.c}"/>`; }
  s += `<line x1="${pad}" x2="${W - pad}" y1="${f(Y(38))}" y2="${f(Y(38))}" class="sc-ref"/><text x="${W - pad}" y="${f(Y(38) - 2)}" class="sc-lbl" text-anchor="end">38°</text>`;
  for (let i = 0; i <= 4; i++) { const ms = t0 + (span * i) / 4; const dt = new Date(ms); const hr = dt.getHours(); const mi = dt.getMinutes(); const lab = `${hr % 12 || 12}${mi ? `:${String(mi).padStart(2, '0')}` : ''}${hr < 12 ? 'a' : 'p'}`; s += `<text x="${f(X(ms))}" y="${H - 2}" class="sc-lbl" text-anchor="middle">${lab}</text>`; }
  if (rs.length > 1) s += `<polyline points="${rs.map((r) => `${f(X(r.ms))},${f(Y(r.value))}`).join(' ')}" class="sc-line"/>`;
  rs.forEach((r) => { s += `<circle cx="${f(X(r.ms))}" cy="${f(Y(r.value))}" r="2.3" class="sc-dot"/>`; });
  for (const d of doseMarks) if (d.ms >= t0) s += `<text x="${f(X(d.ms))}" y="${H - 11}" class="sc-dose" data-c="${d.c}" text-anchor="middle">${d.letter}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="sick-chart" role="img" aria-label="Temperatures and doses over the last 24 hours">${s}</svg>`;
}
