import { getAllEntries, putEntries, kvGet, kvSet, kvDel } from './db.js';
import * as Sync from './sync.js';
import { PRODUCTS, productFor, scaledNutrients, productDose, fmtAmount, standardUnits } from './products.js';
import { AGE_GROUPS, dayCheck, fmtNum } from './nutrients.js';
import { WHAT, WHY, REPAIR, CUP, CUP_TAGS, SUPPORT, tipsFor, cupTips, momentSummary, childLink, cupLink } from './me.js';
import { cleanHome, mergeHome, variantFor, stepStatus, routineWeek, occurrences, upcoming, followUps, reminders, apptIcs, carerView, tickId, REPEATS } from './home.js';
import { DETAILS, DETAIL_NUMS, cleanDetail, cleanNum, hasDetail as hasMoment, detailText, detailTitle, momentCards, tallyStats, tallyNotes } from './moments.js';
import { watchIcons } from './icons.js';
import { WITH_KINDS, PORTIONS, EAT_LEVELS, cleanWith, eatLevel, meals as mealsOf, breakdown as dayBreakdown, withMins, withTotals, withNotes } from './daylog.js';
import { EFFECTS, DAY_NAMES, retestInfo, reminderIcs, slotsFor, cleanPlans, mergePlans, activeOn, isPrn, doseId, todayRows, adherence, changePoints, beforeAfter, missedLink, effectCounts } from './meds.js';
import { listedFor } from './meds-info.js';
import { moveTargets, moveTotals, moveNudge, screenCounted, screenNote } from './moves.js';
import { growthPercentile, valueAtPercentile, ageMonths, pctText, ageText, normCdf } from './growth.js';

export const APP_VERSION = '1.28.0';

// ---------------------------------------------------------------- constants
export const CATS = [
  { k: 'behaviour', label: 'Behaviour', em: '🌊', ph: 'e.g. Meltdown when leaving the park' },
  { k: 'emotion', label: 'Emotion', em: '💛', ph: 'e.g. Worried about going to kinder' },
  { k: 'sleep', label: 'Sleep', em: '🌙', ph: 'e.g. Woke at 2am, hard to settle' },
  { k: 'eating', label: 'Eating', em: '🍎', ph: 'e.g. Only ate the fruit at lunch' },
  { k: 'health', label: 'Health', em: '🤒', ph: 'e.g. Runny nose and a cough' },
  { k: 'medication', label: 'Medicine', em: '💊', ph: 'e.g. For a fever' },
  { k: 'supplement', label: 'Supplement', em: '🫙', ph: 'e.g. With breakfast' },
  { k: 'bloodtest', label: 'Blood test', em: '🧪', ph: 'e.g. Iron studies ordered by the GP' },
  { k: 'growth', label: 'Height & weight', em: '📏', ph: 'e.g. Measured at the GP or at home' },
  { k: 'appointment', label: 'Appointment', em: '🩺', ph: 'e.g. GP check-up' },
  { k: 'social', label: 'Social', em: '🤝', ph: 'e.g. Played well with a new friend' },
  { k: 'development', label: 'Development', em: '🌱', ph: 'e.g. Wrote their name for the first time' },
  { k: 'lesson', label: 'Lessons & sport', em: '🏊', ph: 'e.g. Swimming lesson' },
  { k: 'school', label: 'Kinder & school', em: '🎒', ph: 'e.g. Day at kinder' },
  { k: 'selfcare', label: 'Self-care', em: '🪥', ph: 'e.g. Brushed teeth' },
  { k: 'tantrum', label: 'Tantrum', em: '🌋', ph: 'e.g. At the shops' },
  { k: 'win', label: 'Win', em: '⭐', ph: 'e.g. Used words to say they were upset' },
  { k: 'other', label: 'Other', em: '📝', ph: 'A short description' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.k, c]));
export const SOURCES = [
  { k: 'parent', label: 'Parents', em: '👤' },
  { k: 'family', label: 'Family', em: '👪' },
  { k: 'teacher', label: 'Teacher', em: '🏫' },
  { k: 'carer', label: 'Carer', em: '🤲' },
  { k: 'doctor', label: 'Doctor', em: '🩺' },
  { k: 'other', label: 'Other', em: '💬' },
];
export const SRC = Object.fromEntries(SOURCES.map((s) => [s.k, s]));
export const TODS = [
  { k: 'Morning', em: '🌅' }, { k: 'Midday', em: '☀️' }, { k: 'Afternoon', em: '🌤' },
  { k: 'Evening', em: '🌆' }, { k: 'Night', em: '🌙' }, { k: 'Overnight', em: '🌑' },
];
const TOD_RANK = { Overnight: 0, Morning: 1, Midday: 2, Afternoon: 3, Evening: 4, Night: 5 };
export const SEV = { 1: 'Mild', 2: 'Moderate', 3: 'High' };
const EXTRA_FIELDS = { sleep: ['time'], health: ['temp', 'time'], medication: ['med', 'dose', 'time'], supplement: ['med', 'dose', 'time'], appointment: ['time'], bloodtest: [], growth: ['height', 'weight'] };
// Areas where a concern level doesn't apply (shown without one, and left out of concern counts).
export const NO_CONCERN = new Set(['win', 'supplement', 'bloodtest', 'growth', 'lesson', 'school', 'selfcare']);
export const noConcern = (e) => NO_CONCERN.has(e.cat) || !e.sev;
export const ITEM_LABEL = { medication: 'Medicine', supplement: 'Supplement' };
const ITEM_PLURAL = { medication: 'medicines', supplement: 'supplements' };

// ---------------------------------------------------------------- overnight sleep
// Sleep entries can be marked "went to sleep" (sleep: 'bed') or "woke up" (sleep: 'wake'), each with a time.
// A bedtime followed by the next wake-up 3–16 hours later makes one night.
export const SLEEP_GUIDES = {
  '3-5': { lo: 600, hi: 780, short: '10–13 h', text: '10–13 hours a day for ages 3–5, including naps' },
  '5-13': { lo: 540, hi: 660, short: '9–11 h', text: '9–11 hours a night for ages 5–13' },
};
const SLEEP_KINDS = [['bed', '😴', 'Went to sleep'], ['wake', '☀️', 'Woke up'], ['waking', '🌙', 'Night wake-up'], ['', '📝', 'Something else']];
const SLEEP_KIND_KEYS = ['bed', 'wake', 'waking'];
export const QUICK_AWAKE = '3–5';
function kindForTod(tod) { return tod === 'Evening' || tod === 'Night' ? 'bed' : tod === 'Morning' ? 'wake' : tod === 'Overnight' ? 'waking' : ''; }
// Minutes awake from text such as "3–5" (uses the middle) or "15".
export function parseAwake(s) {
  const t = String(s || ''); const m = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/.exec(t);
  if (m) return (+m[1] + +m[2]) / 2;
  const n = parseFloat(t); return isFinite(n) ? n : 0;
}
function todForTime(t) {
  const m = /^(\d{1,2}):/.exec(t || ''); if (!m) return null; const h = +m[1];
  if (h < 5) return 'Overnight'; if (h < 11) return 'Morning'; if (h < 13) return 'Midday';
  if (h < 17) return 'Afternoon'; if (h < 20) return 'Evening'; return 'Night';
}
export function fmtDur(mins) { const t = Math.round(mins); const h = Math.floor(t / 60); const m = t % 60; return m ? `${h} h ${m} min` : `${h} h`; }
function evtTime(e, fallback) {
  const [y, mo, d] = String(e.date).split('-').map(Number);
  const m = /^(\d{1,2}):(\d{2})/.exec(e.time || '');
  if (m) return new Date(y, mo - 1, d, +m[1], +m[2]).getTime();
  return fallback ? new Date(y, mo - 1, d, fallback, 0).getTime() : null;
}
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function sleepNights(list) {
  const ev = list.filter((e) => e.cat === 'sleep' && (e.sleep === 'bed' || e.sleep === 'wake'))
    .map((e) => ({ e, t: evtTime(e) })).filter((x) => x.t != null).sort((a, b) => a.t - b.t);
  const wakings = list.filter((e) => e.cat === 'sleep' && (!e.sleep || e.sleep === 'waking'))
    .map((e) => ({ t: evtTime(e, e.tod === 'Overnight' ? 2 : 0), mins: e.sleep === 'waking' ? parseAwake(e.awake) : 0 })).filter((w) => w.t != null);
  const nights = []; let bed = null;
  for (const x of ev) {
    if (x.e.sleep === 'bed') { bed = x; continue; }
    if (!bed) continue;
    const mins = Math.round((x.t - bed.t) / 60000);
    if (mins >= 180 && mins <= 960) {
      const during = wakings.filter((w) => w.t > bed.t && w.t < x.t);
      const awake = Math.round(during.reduce((a, w) => a + w.mins, 0));
      nights.push({ date: bed.e.date, wakeDate: x.e.date, bed: hhmm(bed.t), wake: hhmm(x.t), mins: mins - awake, inBed: mins, awake, wakings: during.length, bedId: bed.e.id, wakeId: x.e.id });
      bed = null;
    } else if (mins > 960) bed = null;
  }
  return nights;
}
function clockAvg(times, wrap) {
  const mins = times.map((t) => { const [h, m] = t.split(':').map(Number); const v = h * 60 + m; return wrap && v < 720 ? v + 1440 : v; });
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) % 1440;
  return `${pad(Math.floor(avg / 60))}:${pad(avg % 60)}`;
}
export function sleepSummary(nights) {
  if (!nights.length) return null;
  return {
    n: nights.length, avg: nights.reduce((a, b) => a + b.mins, 0) / nights.length,
    bed: clockAvg(nights.map((x) => x.bed), true), wake: clockAvg(nights.map((x) => x.wake), false),
    woke: nights.filter((x) => x.wakings).length,
    wakings: nights.reduce((a, b) => a + b.wakings, 0), awake: nights.reduce((a, b) => a + b.awake, 0),
  };
}
export function wokeText(n) {
  if (!n.wakings) return '';
  return `woke ${n.wakings === 1 ? 'once' : n.wakings === 2 ? 'twice' : n.wakings + ' times'}${n.awake ? ` (about ${Math.round(n.awake)} min awake)` : ''}`;
}
export function sleepGuide() { const k = S.profile.sleepGuide || '3-5'; return k === 'off' ? null : SLEEP_GUIDES[k] || SLEEP_GUIDES['3-5']; }

// ---------------------------------------------------------------- blood tests
// Each blood test entry holds a list of results: { name, value, unit, low, high }.
// Normal ranges come from the report itself (they differ between labs and ages), never from the app.
export const LAB_PRESETS = [
  { name: 'Ferritin', unit: 'µg/L' }, { name: 'Haemoglobin', unit: 'g/L' }, { name: 'Iron', unit: 'µmol/L' },
  { name: 'Transferrin saturation', unit: '%' }, { name: 'Vitamin D', unit: 'nmol/L' }, { name: 'Vitamin B12', unit: 'pmol/L' },
  { name: 'Folate', unit: 'nmol/L' }, { name: 'CRP', unit: 'mg/L' },
];
export const FLAG_LABEL = { low: 'Low', high: 'High', ok: 'In range' };
export function labNum(v) { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
export function labFlag(r) {
  const v = labNum(r.value); const lo = labNum(r.low); const hi = labNum(r.high);
  if (!isFinite(v)) return '';
  if (isFinite(lo) && v < lo) return 'low';
  if (isFinite(hi) && v > hi) return 'high';
  return isFinite(lo) || isFinite(hi) ? 'ok' : '';
}
export function labRange(r) {
  const lo = String(r.low || '').trim(); const hi = String(r.high || '').trim();
  if (lo && hi) return `${lo}–${hi}`; if (lo) return `${lo} or more`; if (hi) return `up to ${hi}`; return '';
}
const labKey = (n) => String(n || '').trim().toLowerCase();
export function labSeries(list) {
  const map = new Map();
  for (const e of list) {
    if (e.cat !== 'bloodtest' || !Array.isArray(e.results)) continue;
    for (const r of e.results) {
      const name = String((r && r.name) || '').trim(); const value = String((r && r.value) || '').trim();
      if (!name || !value) continue;
      const k = labKey(name);
      if (!map.has(k)) map.set(k, { name, unit: '', points: [] });
      map.get(k).points.push({ date: e.date, value, num: labNum(value), unit: String(r.unit || '').trim(), low: String(r.low || '').trim(), high: String(r.high || '').trim(), flag: labFlag(r), created: e.createdAt || 0 });
    }
  }
  const out = Array.from(map.values());
  out.forEach((s) => {
    s.points.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.created - b.created));
    s.latest = s.points[s.points.length - 1];
    s.unit = s.latest.unit || (s.points.find((p) => p.unit) || {}).unit || '';
  });
  return out.sort((a, b) => (a.latest.date !== b.latest.date ? (a.latest.date < b.latest.date ? 1 : -1) : a.name.localeCompare(b.name)));
}
// Chart scale: fit the results, and include a normal-range edge only when it's near them,
// so a wide range (e.g. ferritin 20–200) doesn't flatten the trend.
export function labDomain(nums, lo, hi) {
  const dmin = Math.min(...nums); const dmax = Math.max(...nums);
  const span = Math.max(dmax - dmin, Math.abs(dmax) * 0.2, 1);
  const near = (b) => isFinite(b) && b >= dmin - 1.5 * span && b <= dmax + 1.5 * span;
  const showLo = near(lo); const showHi = near(hi);
  const vals = nums.concat(showLo ? [lo] : [], showHi ? [hi] : []);
  let vmin = Math.min(...vals); let vmax = Math.max(...vals);
  if (vmin === vmax) { vmin -= 1; vmax += 1; }
  const pad = (vmax - vmin) * 0.16; vmax += pad; vmin = vmin >= 0 ? Math.max(0, vmin - pad) : vmin - pad;
  return { vmin, vmax, showLo, showHi };
}
function lastRangeFor(name) {
  const s = labSeries(live()).find((x) => labKey(x.name) === labKey(name)); if (!s) return null;
  const r = s.points.slice().reverse().find((p) => p.low || p.high) || {};
  return { unit: s.unit, low: r.low || '', high: r.high || '' };
}
export const contentsText = (e) => (Array.isArray(e.contents) ? e.contents.map((c) => [c.name, c.amount].filter((v) => String(v || '').trim()).join(' ')).filter(Boolean).join(', ') : '');
const flagHTML = (f) => (f ? `<span class="flag ${f}">${f === 'low' ? '↓ ' : f === 'high' ? '↑ ' : ''}${FLAG_LABEL[f]}</span>` : '');
function ironCounts(all, prevDate, date) {
  const iron = all.filter((e) => (e.cat === 'supplement' || e.cat === 'medication')
    && (/iron|ferr/i.test(e.med || '') || (Array.isArray(e.contents) && e.contents.some((c) => /iron|ferr/i.test(c.name || '')))));
  return { between: prevDate ? iron.filter((e) => e.date > prevDate && e.date <= date).length : 0, since: iron.filter((e) => e.date > date).length };
}

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strong = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const thisYear = () => new Date().getFullYear();
export function fmtDayLong(s) {
  const d = parseYmd(s); const o = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== thisYear()) o.year = 'numeric';
  return d.toLocaleDateString('en-AU', o);
}
export function fmtDayShort(s) {
  const d = parseYmd(s); const o = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== thisYear()) o.year = 'numeric';
  return d.toLocaleDateString('en-AU', o).replace(',', '');
}
export const fmtDateFull = (s) => parseYmd(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
export function fmtTime(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return '';
  const h = +m[1]; return `${((h + 11) % 12) + 1}:${m[2]}${h >= 12 ? 'pm' : 'am'}`;
}
export function fmtTemp(t) { const n = parseFloat(String(t).replace(',', '.')); return isFinite(n) ? `${n.toFixed(1)} °C` : String(t); }
function ago(ms) {
  if (!ms) return 'never';
  const s = (Date.now() - ms) / 1000;
  if (s < 50) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} hour${h > 1 ? 's' : ''} ago`; }
  const d = Math.round(s / 86400); return `${d} day${d > 1 ? 's' : ''} ago`;
}
function currentTod() {
  const h = new Date().getHours();
  if (h < 5) return 'Overnight'; if (h < 11) return 'Morning'; if (h < 13) return 'Midday';
  if (h < 17) return 'Afternoon'; if (h < 20) return 'Evening'; return 'Night';
}
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const possessive = (n) => (n ? `${n}'s` : '');
export const srcKey = (e) => (e.src && SRC[e.src] ? e.src : 'parent');
export function srcLabel(e) {
  const k = srcKey(e);
  if (k === 'parent') return e.srcName || e.by || 'Parent';
  if (k === 'family') return e.srcName || 'Family';
  return e.srcName || SRC[k].label;
}
// What to show as an entry's heading. The description is optional when something else describes
// the entry (a medicine or supplement, a temperature, or notes).
export function headline(e, allowNotes = true) {
  if (e.cat === 'sleep' && SLEEP_KIND_KEYS.includes(e.sleep)) return { text: `${{ bed: 'Went to sleep', wake: 'Woke up', waking: 'Woke in the night' }[e.sleep]}${e.time ? ` at ${fmtTime(e.time)}` : ''}`, from: 'sleep' };
  const t = String(e.title || '').trim();
  if (t) return { text: t, from: 'title' };
  const res = Array.isArray(e.results) ? e.results.filter((r) => r && String(r.name || '').trim()).map((r) => String(r.name).trim()) : [];
  if (res.length) return { text: res.length > 3 ? `${res.slice(0, 3).join(', ')} and ${res.length - 3} more` : res.length > 1 ? `${res.slice(0, -1).join(', ')} and ${res[res.length - 1]}` : res[0], from: 'results' };
  if (DETAILS[e.cat] && !String(e.notes || '').trim() && hasMoment(e.cat, e.dt, e)) return { text: detailTitle(e), from: 'detail' };
  const med = String(e.med || '').trim();
  if (med) return { text: [med, String(e.dose || '').trim()].filter(Boolean).join(', '), from: 'med' };
  if (String(e.temp || '').trim()) return { text: `Temperature ${fmtTemp(e.temp)}`, from: 'temp' };
  if (e.cat === 'growth' && (String(e.height || '').trim() || String(e.weight || '').trim())) return { text: growthText(e), from: 'growth' };
  const n = String(e.notes || '').trim();
  if (n && allowNotes) {
    const first = n.split('\n')[0].trim();
    const short = first.length > 70 ? first.slice(0, 68).replace(/\s+\S*$/, '') + '…' : first;
    return { text: short, from: short === n ? 'notes-all' : 'notes' };
  }
  return { text: (CAT[e.cat] || CAT.other).label, from: 'cat' };
}
function applySizes(root) {
  $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w + '%'; });
  $$('[data-h]', root).forEach((el) => { el.style.height = el.dataset.h + '%'; });
}

// ---------------------------------------------------------------- state
const S = {
  entries: new Map(),
  deviceId: '', myName: '', profile: { childName: '', updatedAt: 0 },
  sync: null, members: {}, lastSyncAt: 0, syncStatus: 'off', syncError: null,
  tab: 'today',
  hist: { cat: 'all', q: '', limit: 60, days: 1, open: new Set(), groups: new Map() },
  insightRange: '30',
  exp: null, lastPdf: null, pdfUrl: null,
  hiddenItems: {},
  // Family members ("helpers") use the app with their own code: S.role 'helper', S.fam their storage and key.
  role: 'parent', fam: null, famErr: null, famSeen: {},
  // Care time: a private record on this phone only. It is never added to the synced log or any sync file.
  care: [], careRun: null, actRun: null, scrRun: null, me: [], meView: 'checkin', timeRange: '7',
  track: loadTrack(), fold: {}, plan: null,
};
// What this phone shows. Only a display choice on this phone (localStorage), never synced.
const TRACK_CARDS = [['dayfeel', 'How did today feel?'], ['activity', 'Outdoors and active play'], ['screen', 'Screen time'], ['tally', 'Quick taps'], ['meds', 'Medicines and supplements'], ['routine', "Tonight's routine"], ['plan', 'Days ahead'], ['appt', 'Appointments'], ['ask', 'Carer questions'], ['setup', 'Getting set up list'], ['timer', 'Timers']];
function loadTrack() {
  try { const t = JSON.parse(localStorage.getItem('lo-track') || '{}') || {}; const arr = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 40) : []); return { openCards: !!t.openCards, hide: arr(t.hide), hideCats: arr(t.hideCats), histAll: !!t.histAll }; }
  catch { return { openCards: false, hide: [], hideCats: [], histAll: false }; }
}
function saveTrack() { try { localStorage.setItem('lo-track', JSON.stringify(S.track)); } catch { /* ignore */ } }
const cardHidden = (k) => S.track.hide.includes(k);
const foldOpen = (k, dflt) => (S.fold[k] !== undefined ? S.fold[k] : !!(S.track.openCards || dflt));
// A card that shows one summary line and opens to its detail.
function foldCard(key, title, summary, body, dflt, cls, act) {
  const open = foldOpen(key, dflt);
  return `<div class="card fold ${cls || ''}" data-fold="${key}"><div class="fold-top"><button type="button" class="fold-head" data-foldtoggle="${key}" aria-expanded="${open}"><span class="fold-title">${esc(title)}</span><span class="fold-sum">${esc(summary || '')}</span><span class="fold-chev" aria-hidden="true"></span></button>${act ? `<button type="button" class="chip fold-act" ${act.attr}>${esc(act.label)}</button>` : ''}</div><div class="fold-body"${open ? '' : ' hidden'}>${body}</div></div>`;
}
function setupFolds() {
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-foldtoggle]'); if (!t) return;
    const k = t.dataset.foldtoggle; const wrap = t.closest('[data-fold]'); const body = wrap && $('.fold-body', wrap); if (!body) return;
    const open = body.hidden; S.fold[k] = open; body.hidden = !open; t.setAttribute('aria-expanded', String(open));
  });
}
const live = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.date && e.cat !== 'dayfeel' && e.cat !== 'tally' && e.cat !== 'tick' && e.cat !== 'ask' && e.cat !== 'activity' && e.cat !== 'screen' && e.cat !== 'feedback' && e.cat !== 'meddose' && e.cat !== 'sidefx' && e.cat !== 'with' && e.cat !== 'eat');

// ---------------------------------------------------------------- height and weight
// Height in centimetres and weight in kilograms, as typed ("104.5", "104,5", "17.2 kg"). Returns NaN when
// it isn't a believable measurement for a child.
export function growthNum(v, kind) {
  const m = String(v ?? '').replace(',', '.').match(/\d+(\.\d+)?/); const n = m ? parseFloat(m[0]) : NaN;
  const [lo, hi] = kind === 'height' ? [30, 200] : [2, 120];
  return isFinite(n) && n >= lo && n <= hi ? n : NaN;
}
const trimNum = (n) => String(Math.round(n * 100) / 100);
export function growthText(e) {
  const h = growthNum(e.height, 'height'); const w = growthNum(e.weight, 'weight');
  return [isFinite(h) ? `Height ${trimNum(h)} cm` : '', isFinite(w) ? `Weight ${trimNum(w)} kg` : ''].filter(Boolean).join(', ');
}
// Series shaped like the blood test ones so the same line chart can draw them.
export function growthSeries(list) {
  const mk = (kind, name, unit) => {
    const pts = list.filter((e) => e.cat === 'growth' && isFinite(growthNum(e[kind], kind))).map((e) => {
      const num = growthNum(e[kind], kind);
      return { date: e.date, value: trimNum(num), num, unit, low: '', high: '', flag: '', created: e.createdAt || 0 };
    }).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.created - b.created));
    return pts.length ? { name, unit, points: pts, latest: pts[pts.length - 1] } : null;
  };
  return [mk('height', 'Height', 'cm'), mk('weight', 'Weight', 'kg')].filter(Boolean);
}
// Plain-language change between the last two measurements, and a yearly rate when they are 3+ months apart.
export function growthChange(s) {
  if (s.points.length < 2) return '';
  const a = s.points[s.points.length - 2]; const b = s.latest;
  const d = Math.round((b.num - a.num) * 100) / 100;
  const days = Math.round((parseYmd(b.date) - parseYmd(a.date)) / 86400000);
  let t = d === 0 ? `Same as on ${fmtDateFull(a.date)}` : `${d > 0 ? 'Up' : 'Down'} ${trimNum(Math.abs(d))} ${s.unit} from ${a.value} ${s.unit} on ${fmtDateFull(a.date)}`;
  if (days >= 90) { const yr = (d / days) * 365; t += ` (about ${Math.round(Math.abs(yr) * 10) / 10} ${s.unit} a year ${yr < 0 ? 'down' : 'up'})`; }
  return t;
}

// ---------------------------------------------------------------- how the day felt
// One tap a day. Ratings are stored as small synced entries (cat 'dayfeel') that stay out of History, counts,
// the PDF and the CSV, and feed the sleep comparison in Insights.
export const DAYFEEL = [[1, '😌', 'Calm and easy'], [2, '🙂', 'Mostly fine'], [3, '😣', 'Bumpy'], [4, '😖', 'Hard']];
const dayEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'dayfeel' && e.date);
const dayfeelEntries = () => dayEntries().filter((e) => e.rating >= 1 && e.rating <= 4);
// What the day looked like: a few optional taps. Stored on the same small daily entry as the rating.
export const DAYTAGS = [
  { k: 'outdoors', em: '🌳', label: 'Time outdoors', good: true }, { k: 'play', em: '🏃', label: 'Active play', good: true },
  { k: 'connect', em: '💞', label: 'One-on-one time', good: true }, { k: 'calmam', em: '🌅', label: 'Calm morning', good: true },
  { k: 'bedroutine', em: '🛁', label: 'Bedtime routine', good: true }, { k: 'lowscreen', em: '📵', label: 'Low screen time', good: true },
  { k: 'unwell', em: '🤒', label: 'Unwell' }, { k: 'changed', em: '🔀', label: 'Routine changed' },
  { k: 'busy', em: '👥', label: 'Busy or visitors' }, { k: 'bigday', em: '🎒', label: 'Big day out' },
];
const TAG = Object.fromEntries(DAYTAGS.map((t) => [t.k, t]));
const DAYTAGS_UI = DAYTAGS.filter((t) => t.k !== 'outdoors' && t.k !== 'play'); // those two come from the activity card
const activityEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'activity' && e.date && (e.kind === 'outdoors' || e.kind === 'play'));
const tagSource = () => dayEntries().concat(activityEntries());
// date -> Set of tags from everyone's entries
export function dayTagMap(list) {
  const m = new Map();
  for (const e of list) {
    if (e.cat === 'activity' && (e.kind === 'outdoors' || e.kind === 'play')) { const st = m.get(e.date) || new Set(); st.add(e.kind); m.set(e.date, st); continue; } if (!Array.isArray(e.tags) || !e.tags.length) continue; const st = m.get(e.date) || new Set(); e.tags.forEach((t) => { if (TAG[t]) st.add(t); }); m.set(e.date, st); }
  return m;
}
// date -> average of everyone's rating that day
export function dayRatings(list) {
  const m = new Map();
  for (const e of list) { const r = m.get(e.date) || { sum: 0, n: 0 }; r.sum += e.rating; r.n++; m.set(e.date, r); }
  return new Map(Array.from(m, ([d, r]) => [d, r.sum / r.n]));
}
const myDayfeel = (date) => dayEntries().find((e) => e.date === date && e.byDev === S.deviceId);
async function setDayTag(date, key) {
  const mine = myDayfeel(date); const now = Date.now(); let e;
  const had = mine && Array.isArray(mine.tags) ? mine.tags : [];
  const tags = had.includes(key) ? had.filter((t) => t !== key) : [...had, key];
  if (mine) e = tags.length || mine.rating ? { ...mine, tags, updatedAt: now } : { id: mine.id, deleted: true, updatedAt: now, by: S.myName || '' };
  else e = { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, date, tod: 'Evening', cat: 'dayfeel', tags, src: 'parent', srcName: S.myName || 'Me', title: '', notes: '', sev: 0 };
  if (!tags.length) delete e.tags;
  S.entries.set(e.id, e); await putEntries([e]); scheduleSync();
}
async function setDayFeel(date, rating) {
  const mine = myDayfeel(date); const now = Date.now(); let e;
  if (mine && mine.rating === rating) e = (mine.tags && mine.tags.length) ? (() => { const x = { ...mine, updatedAt: now }; delete x.rating; return x; })() : { id: mine.id, deleted: true, updatedAt: now, by: S.myName || '' };
  else if (mine) e = { ...mine, rating, updatedAt: now };
  else e = { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, date, tod: 'Evening', cat: 'dayfeel', rating, src: 'parent', srcName: S.myName || 'Me', title: '', notes: '', sev: 0 };
  S.entries.set(e.id, e); await putEntries([e]); scheduleSync();
}
function dayFeelButtons(date) {
  const mine = myDayfeel(date);
  return DAYFEEL.map(([v, em, l]) => `<button type="button" class="feel" data-feel="${v}" data-date="${date}" aria-pressed="${!!mine && mine.rating === v}" aria-label="${esc(l)}"><span class="em" aria-hidden="true">${em}</span><span class="fl">${esc(l)}</span></button>`).join('');
}
function renderDayCard() {
  const box = $('#dayfeel-card'); if (!box) return;
  if (isHelper() || cardHidden('dayfeel')) { box.innerHTML = ''; return; }
  const t = today();
  const others = dayfeelEntries().filter((e) => e.date === t && e.byDev !== S.deviceId);
  const mineToday = myDayfeel(t); const myTags = new Set(mineToday && Array.isArray(mineToday.tags) ? mineToday.tags : []);
  const otherTags = Array.from(new Set(dayEntries().filter((e) => e.date === t && e.byDev !== S.deviceId).flatMap((e) => (Array.isArray(e.tags) ? e.tags : [])))).filter((k) => TAG[k] && !myTags.has(k));
  const alsoText = others.length ? `${others.map((e) => `${esc(e.srcName || e.by || 'Partner')}: ${esc(DAYFEEL[e.rating - 1][2].toLowerCase())}`).join(', ')}` : '';
  const dsum = mineToday && DAYFEEL[mineToday.rating - 1] ? `${DAYFEEL[mineToday.rating - 1][1]} ${DAYFEEL[mineToday.rating - 1][2]}` : 'Not rated yet';
  box.innerHTML = foldCard('dayfeel', 'How did today feel?', dsum, `
    <div class="feel-row" role="group" aria-label="How did today feel?">${dayFeelButtons(t)}</div>
    <p class="hint feel-hint">${alsoText ? `Also rated: ${alsoText}. ` : ''}Tap again to clear. <button type="button" class="link-btn" data-act="feel-catchup">Rate recent days</button></p>
    <details class="feel-more"${S.feelOpen ? ' open' : ''}><summary>What did today look like?${myTags.size ? ` <span class="n">${myTags.size} picked</span>` : ''}</summary>
      <p class="hint">Optional taps. Over time these show what goes with calmer days.</p>
      <div class="chips" role="group" aria-label="What today looked like">${DAYTAGS_UI.map((t) => `<button type="button" class="chip" data-daytag="${t.k}" aria-pressed="${myTags.has(t.k)}">${t.em} ${esc(t.label)}</button>`).join('')}</div>
      ${otherTags.length ? `<p class="hint">Also added: ${otherTags.map((k) => esc(TAG[k].label)).join(', ')}.</p>` : ''}</details>`, !mineToday, 'feel-card');
  box.onclick = async (ev) => {
    const b = ev.target.closest('[data-feel]');
    if (b) { await setDayFeel(b.dataset.date, +b.dataset.feel); renderDayCard(); renderOutlook(); if (S.tab === 'insights') renderInsights(); return; }
    const sm = ev.target.closest('summary'); if (sm) { S.feelOpen = !sm.parentElement.open; return; }
    const tg = ev.target.closest('[data-daytag]');
    if (tg) { S.feelOpen = true; await setDayTag(today(), tg.dataset.daytag); renderDayCard(); renderOutlook(); return; }
    if (ev.target.closest('[data-act="feel-catchup"]')) openFeelCatchup();
  };
}
function openFeelCatchup() {
  const days = []; for (let i = 0; i < 21; i++) days.push(addDays(today(), -i));
  openSheet('Rate recent days', `<p class="hint intro">Look back over the last few weeks and tap how each day felt. Even a rough guess helps the sleep comparison in Insights. Skip any you can't remember.</p>
    ${days.map((d) => `<div class="feel-day" data-day="${d}"><div class="feel-date">${esc(fmtDayShort(d))}</div><div class="feel-row">${dayFeelButtons(d)}</div></div>`).join('')}`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const f = ev.target.closest('[data-feel]'); if (!f) return;
        await setDayFeel(f.dataset.date, +f.dataset.feel);
        $('.feel-row', f.closest('.feel-day')).innerHTML = dayFeelButtons(f.dataset.date);
        renderDayCard(); if (S.tab === 'insights') renderInsights();
      };
    },
  });
}

// ---------------------------------------------------------------- outdoors and active play (shared)
// Minutes of outdoor time and active play, kept as small synced entries (cat 'activity') that stay out of History and the PDF.
const ACT_KINDS = { outdoors: { em: '🌳', label: 'Outdoors' }, play: { em: '🏃', label: 'Active play' } };
const todOf = (hhmm) => (hhmm ? todForTime(hhmm) : '') || 'Midday';
function whoChoices() {
  const me = { src: 'parent', name: S.myName || 'Me' };
  const out = [me];
  const add = (src, name) => { name = String(name || '').trim(); if (name && !out.some((x) => x.name === name)) out.push({ src, name }); };
  parentNames('').forEach((n) => add('parent', n));
  peopleList(false).forEach(([, x]) => add(x.role, x.name));
  return out;
}
async function saveActivity(e) { S.entries.set(e.id, e); await putEntries([e]); scheduleSync(); }
function newActivity(f) {
  const now = Date.now();
  return { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'activity', title: '', notes: '', sev: 0, src: f.src || 'parent', srcName: f.srcName || S.myName || 'Me', kind: f.kind, mins: f.mins, date: f.date, time: f.time || '', end: f.end || '', tod: todOf(f.time) };
}
async function deleteActivity(e) { await saveActivity({ id: e.id, deleted: true, updatedAt: Date.now(), by: S.myName || '' }); }
function actTargets() { return moveTargets(ageMonths(S.profile.childBirth, today())); }
const cleanActRun = (r) => (r && ACT_KINDS[r.kind] && +r.start > 0 && +r.start <= Date.now() + 60000 ? { kind: r.kind, start: +r.start, acc: Math.max(0, +r.acc || 0), resumedAt: +r.resumedAt || +r.start, paused: !!r.paused } : null);
export function renderActivityCard() {
  const box = $('#activity-card'); if (!box) return;
  if (isHelper() || cardHidden('activity')) { box.innerHTML = ''; return; }
  const t = today(); const all = activityEntries(); const tot = moveTotals(all, t); const tg = actTargets();
  const todays = all.filter((e) => e.date === t).sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt);
  const min = (m) => (m >= 60 ? fmtDur(m) : `${Math.round(m)} min`);
  const bar = (label, got, goal, note) => `<div class="act-prog"><div class="act-head"><span>${label}</span><span class="act-num">${min(got)} of ${min(goal)}</span></div><div class="bar"><div class="track"><div class="fill" data-w="${Math.max(got ? 3 : 0, Math.min(100, Math.round((got / Math.max(1, goal)) * 100)))}"></div></div></div>${note ? `<p class="hint person-kinds">${note}</p>` : ''}</div>`;
  let targets = '';
  if (tg) {
    targets = (tg.band === 'school'
      ? bar('Active', tot.moving, tg.moving, 'Moderate to vigorous activity: outdoors and active play together.')
      : bar('Moving about', tot.moving, tg.moving, 'Outdoors and active play together, spread through the day.')
        + (tg.band === 'toddler' ? '' : bar('Energetic play', tot.play, tg.energetic, 'Running, jumping, climbing: puffing a bit.')))
      + bar('Outdoors', tot.outdoors, tg.outdoors, 'A suggestion, not an official guideline.');
  } else if (!S.profile.childBirth) targets = '<p class="hint">Set your child\'s birth month in Settings to see daily targets.</p>';
  const nudge = tg ? moveNudge(tg, tot, new Date().getHours()) : '';
  const quick = (k) => `<div class="act-row"><span class="act-name"><span aria-hidden="true">${ACT_KINDS[k].em}</span> ${ACT_KINDS[k].label}${tot[k] ? ` <small>${min(tot[k])} today</small>` : ''}</span>
    <span class="act-btns">${[10, 30, 60].map((m) => `<button type="button" class="chip" data-actq="${k}:${m}">+${m}</button>`).join('')}<button type="button" class="chip" data-actother="${k}">Other</button></span></div>`;
  const rows = todays.map((e) => `<button type="button" class="time-row" data-actedit="${esc(e.id)}"><span><b>${ACT_KINDS[e.kind].em} ${ACT_KINDS[e.kind].label}</b><small>${esc(srcLabel(e))}${e.time ? ` · ${esc(fmtTime(e.time))}${e.end ? ` to ${esc(fmtTime(e.end))}` : ''}` : ''}</small></span><span class="dur">${e.mins ? min(e.mins) : 'some'}</span></button>`).join('');
  const sum = tot.moving || tot.outdoors ? [tot.outdoors ? `${min(tot.outdoors)} outdoors` : '', tot.play ? `${min(tot.play)} active play` : ''].filter(Boolean).join(' · ') + (tg ? ` · ${Math.round(tot.moving)} of ${Math.round(tg.moving)} min moving` : '') : 'Nothing yet';
  box.innerHTML = foldCard('activity', 'Outdoors and active play', sum, `${targets}
    ${nudge ? `<p class="outlook-tip"><b>Might help:</b> ${esc(nudge)}</p>` : ''}
    ${quick('outdoors')}${quick('play')}${rows ? `<div class="act-list">${rows}</div>` : ''}
    <p class="hint">${tg ? `Based on the Australian 24-hour movement guidelines for ${esc(tg.label)}. ` : ''}Shared with everyone using this log. Time it from the timer card above. <button type="button" class="chip" data-actother="outdoors" data-actday="1">Add for another day</button></p>`, false, 'act-card', { label: '+30 outdoors', attr: 'data-actq="outdoors:30"' });
  applySizes(box);
  box.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const refresh = () => { renderActivityCard(); renderOutlook(); if (S.tab === 'insights') renderInsights(); };
    if (b.dataset.actq) { const [k, m] = b.dataset.actq.split(':'); await saveActivity(newActivity({ kind: k, mins: +m, date: today(), time: '' })); refresh(); toast(`Added ${m} min`, { label: 'Undo', fn: async () => { const last = activityEntries().filter((e) => e.byDev === S.deviceId && e.kind === k && e.mins === +m).sort((a, c) => c.createdAt - a.createdAt)[0]; if (last) { await deleteActivity(last); refresh(); } } }); }
    else if (b.dataset.actother) openActivitySheet(null, b.dataset.actother, !!b.dataset.actday);
    else if (b.dataset.actedit) { const e = S.entries.get(b.dataset.actedit); if (e) openActivitySheet(e, e.kind, false); }
  };
}


// ---------------------------------------------------------------- one-tap counters (shared)
// Whining and "I don't love you": a tap each, kept as small synced entries (cat 'tally') out of History and the PDF.
const TALLY = { whine: { em: '😩', label: 'Whining' }, notlove: { em: '💔', label: 'Said they don\'t love me' } };
const tallyEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'tally' && e.date && TALLY[e.kind]);
export function renderTallyCard() {
  const box = $('#tally-card'); if (!box) return;
  if (isHelper() || cardHidden('tally')) { box.innerHTML = ''; return; }
  const st = tallyStats(tallyEntries(), today());
  const sum = st.whine.today || st.notlove.today ? [st.whine.today ? `${st.whine.today} whining` : '', st.notlove.today ? `${st.notlove.today} tough words` : ''].filter(Boolean).join(' · ') : 'Tap to count';
  box.innerHTML = foldCard('tally', 'Quick taps', sum, `<div class="act-row tally-row">${Object.entries(TALLY).map(([k, v]) => `<button type="button" class="chip tally-btn" data-tally="${k}"><span aria-hidden="true">${v.em}</span> ${esc(v.label)} <b>${st[k].today || ''}</b></button>`).join('')}</div>
    <p class="hint">One tap each time it happens. Only counts, with a gentle pattern in Insights. Shared with everyone using this log.</p>`, true, 'act-card');
  box.onclick = async (ev) => {
    const b = ev.target.closest('[data-tally]'); if (!b) return; const k = b.dataset.tally; const now = Date.now();
    const e = { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'tally', kind: k, title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me', date: today(), time: nowHHMM(), tod: todOf(nowHHMM()) };
    await saveActivity(e); renderTallyCard(); if (S.tab === 'insights') renderInsights();
    toast(`${TALLY[k].label} counted`, { label: 'Undo', fn: async () => { await deleteActivity(e); renderTallyCard(); if (S.tab === 'insights') renderInsights(); } });
  };
}
function tallyInsightHTML() {
  if (isHelper()) return '';
  const list = tallyEntries(); if (!list.length) return '';
  const st = tallyStats(list, today()); const nt = tallyNotes(st);
  const line = (k) => `<div class="kv"><span>${TALLY[k].em} ${esc(TALLY[k].label)}</span><span>${st[k].week} this week · ${st[k].prev} the week before</span></div>`;
  return `<div class="card"><h3 class="card-title">Whining and tough words</h3>${line('whine')}${line('notlove')}
    ${nt.notes.length ? `<p class="hint">${nt.notes.map(esc).join(' ')}</p>` : '<p class="hint">Nothing stands out. Counts alone don\'t say much, so this only speaks up if a pattern builds.</p>'}
    ${nt.tips.length ? `<p class="outlook-tip"><b>Might help:</b> ${nt.tips.map(esc).join(' ')}</p>` : ''}</div>`;
}
function momentsInsightHTML() {
  if (isHelper()) return '';
  return momentCards(live(), today()).map((c) => `<div class="card"><h3 class="card-title">${esc(c.title)}</h3><p class="hint">${c.facts.map(esc).join(' ')}</p>${c.tips.length ? `<p class="outlook-tip"><b>Might help:</b> ${c.tips.map(esc).join(' ')}</p>` : ''}</div>`).join('');
}


const minText = (m) => (m >= 60 ? fmtDur(m) : `${Math.round(m)} min`);
// ---------------------------------------------------------------- Time with people, eating, and the day breakdown
const allEntries = () => Array.from(S.entries.values());
function whoSuggestions() {
  const seen = new Map(); const add = (n) => { const k = String(n || '').trim(); if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); };
  if (!isHelper()) { peopleList(false).forEach(([, x]) => add(x.name)); }
  allEntries().forEach((e) => { if (e && !e.deleted && e.cat === 'with') add(e.who); });
  return Array.from(seen.values()).slice(0, 14);
}
const withToday = () => allEntries().filter((e) => e && !e.deleted && e.cat === 'with' && cleanWith(e) && e.date === today()).sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')));
function withRowText(e) { const c = cleanWith(e); const span = c.time ? `${fmtTime(c.time)}${c.end ? ` to ${fmtTime(c.end)}` : ''}` : ''; return { title: `${WITH_KINDS[c.kind]}: ${c.who}`, sub: [span, c.mins && !c.end ? `${c.mins} min` : c.mins ? minText(c.mins) : '', c.note].filter(Boolean).join(' · ') }; }
export function renderWithCard() {
  const box = $('#with-card'); if (!box) return;
  const list = withToday();
  const totalMins = list.reduce((a, e) => a + withMins(e), 0);
  const sum = list.length ? `${list.length} logged${totalMins ? ` · ${minText(totalMins)}` : ''}` : 'Who they were with';
  const rows = list.map((e) => { const r = withRowText(e); return `<button type="button" class="time-row" data-withedit="${esc(e.id)}"><span><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span></button>`; }).join('');
  box.innerHTML = foldCard('with', 'Time with people', sum, `${rows || '<p class="hint">Who looked after them, played, or had one-on-one time. A stay at someone\'s place can have a start and end.</p>'}
    <div class="chips mt10">${Object.entries(WITH_KINDS).map(([k, l]) => `<button type="button" class="chip" data-withadd="${k}">${esc(l)}</button>`).join('')}</div>`, list.length > 0, 'act-card', { label: 'Add', attr: 'data-withadd="one"' });
  box.onclick = (ev) => {
    const a = ev.target.closest('[data-withadd]'); const ed = ev.target.closest('[data-withedit]');
    if (a) openWithSheet(null, a.dataset.withadd); else if (ed) openWithSheet(S.entries.get(ed.dataset.withedit));
  };
}
function openWithSheet(cur, kind) {
  const c = cur ? cleanWith(cur) : null; const k0 = c ? c.kind : (WITH_KINDS[kind] ? kind : 'one');
  const sug = whoSuggestions(); const date = c ? c.date : today();
  openSheet(c ? 'Edit time with people' : 'Time with people', `
    <div class="field"><label class="label" for="wp-who">Who</label><input class="input" id="wp-who" maxlength="40" autocomplete="off" value="${esc(c ? c.who : '')}" placeholder="e.g. Auntie">
      <div class="chips mt10">${sug.map((n) => `<button type="button" class="chip" data-wpwho="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
    <div class="field"><span class="label">What</span><div class="chips" id="wp-kinds">${Object.entries(WITH_KINDS).map(([k, l]) => `<button type="button" class="chip" data-wpkind="${k}" aria-pressed="${k === k0}">${esc(l)}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="wp-date">Date</label><input class="input" id="wp-date" type="date" value="${esc(date)}" max="${esc(today())}"></div>
    <div class="field two"><div><label class="label" for="wp-start">From</label><input class="input" id="wp-start" type="time" value="${esc(c ? c.time : '')}"></div><div><label class="label" for="wp-end">To</label><input class="input" id="wp-end" type="time" value="${esc(c ? c.end : '')}"></div></div>
    <div class="field"><label class="label" for="wp-mins">Or minutes</label><input class="input" id="wp-mins" type="number" inputmode="numeric" min="0" max="1440" value="${c && !c.end && c.mins ? c.mins : ''}" placeholder="e.g. 20"></div>
    <div class="field"><label class="label" for="wp-note">Note (optional)</label><input class="input" id="wp-note" maxlength="200" autocomplete="off" value="${esc(c ? c.note : '')}"></div>
    <div class="actions"><button type="button" class="btn primary" data-act="wp-save">Save</button>${c ? '<button type="button" class="btn ghost" data-act="wp-del">Delete</button>' : ''}</div>`);
  let kind0 = k0; const b = $('#sheet-body');
  b.onclick = async (ev) => {
    const w = ev.target.closest('[data-wpwho]'); const kk = ev.target.closest('[data-wpkind]'); const a = ev.target.closest('[data-act]');
    if (w) { $('#wp-who', b).value = w.dataset.wpwho; return; }
    if (kk) { kind0 = kk.dataset.wpkind; $$('[data-wpkind]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === kk))); return; }
    if (!a) return;
    if (a.dataset.act === 'wp-del' && cur) { await deleteActivity(cur); closeSheet(); afterDayLog(); return; }
    if (a.dataset.act !== 'wp-save') return;
    const who = $('#wp-who', b).value.trim(); if (!who) { toast('Add who it was with.'); return; }
    const d = $('#wp-date', b).value || today(); const st = $('#wp-start', b).value; const en = $('#wp-end', b).value; const mins = Math.max(0, Math.min(1440, Math.round(+$('#wp-mins', b).value || 0)));
    if (!st && !en && !mins) { toast('Add a start and end, or minutes.'); return; }
    const now = Date.now();
    const e = { ...(cur || { id: Sync.randomId(12), createdAt: now, by: S.myName || '', byDev: S.deviceId, src: isHelper() ? 'family' : 'parent', srcName: S.myName || 'Me', title: '', sev: 0 }), cat: 'with', updatedAt: now, kind: kind0, who, date: d, time: st || '', end: st && en ? en : '', mins: st && en ? 0 : mins, notes: $('#wp-note', b).value.trim(), tod: todOf(st) };
    await saveActivity(e); closeSheet(); afterDayLog();
  };
}
function afterDayLog() { renderWithCard(); renderEatCard(); renderBreakdownCard(); renderOutlook(); if (S.tab === 'history') renderHistory(); }

// Eating: one tap for the day, plus meals and snacks if wanted. Parents only.
const mealsToday = () => mealsOf(allEntries(), today());
export function renderEatCard() {
  const box = $('#eat-card'); if (!box) return;
  if (isHelper()) { box.innerHTML = ''; return; }
  const lvl = eatLevel(allEntries(), today()); const ms = mealsToday();
  const sum = [lvl ? EAT_LEVELS[lvl] : '', ms.length ? `${ms.length} meal${ms.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'How they ate';
  box.innerHTML = foldCard('eat', 'How they ate', sum, `<div class="chips" role="group" aria-label="How they ate today">${Object.entries(EAT_LEVELS).map(([k, l]) => `<button type="button" class="chip" data-eatlvl="${k}" aria-pressed="${lvl === k}">${esc(l)}</button>`).join('')}</div>
    ${ms.map((m) => `<button type="button" class="time-row" data-eatedit="${esc(m.id)}"><span><b>${m.kind === 'snack' ? 'Snack' : 'Meal'}${m.title ? `: ${esc(m.title)}` : ''}</b><small>${esc([m.time ? fmtTime(m.time) : '', PORTIONS[m.portion], m.note].filter(Boolean).join(' · '))}</small></span></button>`).join('')}
    <div class="chips mt10"><button type="button" class="chip" data-eatadd="meal">Add a meal</button><button type="button" class="chip" data-eatadd="snack">Add a snack</button></div>
    <button type="button" class="chip mt10" data-eatnote="1">Write a longer eating note</button><p class="hint">Only what you log is used. Not logging never reads as not eating.</p>`, false, 'act-card');
  box.onclick = async (ev) => {
    if (ev.target.closest('[data-eatnote]')) { openLogFor('eating'); return; }
    const l = ev.target.closest('[data-eatlvl]'); const a = ev.target.closest('[data-eatadd]'); const ed = ev.target.closest('[data-eatedit]');
    if (l) {
      const now = Date.now(); const k = l.dataset.eatlvl;
      if (lvl === k) { const cur = allEntries().filter((e) => e && !e.deleted && e.cat === 'eat' && e.kind === 'level' && e.date === today()); for (const e of cur) await deleteActivity(e); }
      else await saveActivity({ id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'eat', kind: 'level', level: k, title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me', date: today(), time: nowHHMM(), tod: todOf(nowHHMM()) });
      afterDayLog();
    } else if (a) openMealSheet(null, a.dataset.eatadd); else if (ed) openMealSheet(S.entries.get(ed.dataset.eatedit));
  };
}
function openMealSheet(cur, kind) {
  const k0 = cur ? cur.kind : (kind === 'snack' ? 'snack' : 'meal'); let portion = cur ? cur.portion : 'most';
  openSheet(cur ? 'Edit meal' : 'Meal or snack', `
    <div class="field"><span class="label">Type</span><div class="chips">${[['meal', 'Meal'], ['snack', 'Snack']].map(([k, l]) => `<button type="button" class="chip" data-mkind="${k}" aria-pressed="${k === k0}">${l}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="ml-title">What (optional)</label><input class="input" id="ml-title" maxlength="60" autocomplete="off" value="${esc(cur ? cur.title : '')}" placeholder="e.g. Pasta"></div>
    <div class="field"><label class="label" for="ml-time">Time</label><input class="input" id="ml-time" type="time" value="${esc(cur ? cur.time : nowHHMM())}"></div>
    <div class="field"><span class="label">How much was eaten</span><div class="chips">${Object.entries(PORTIONS).map(([k, l]) => `<button type="button" class="chip" data-mport="${k}" aria-pressed="${k === portion}">${l}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="ml-note">Note (optional)</label><input class="input" id="ml-note" maxlength="200" autocomplete="off" value="${esc(cur ? cur.notes : '')}"></div>
    <div class="actions"><button type="button" class="btn primary" data-act="ml-save">Save</button>${cur ? '<button type="button" class="btn ghost" data-act="ml-del">Delete</button>' : ''}</div>`);
  let kind0 = k0; const b = $('#sheet-body');
  b.onclick = async (ev) => {
    const mk = ev.target.closest('[data-mkind]'); const mp = ev.target.closest('[data-mport]'); const a = ev.target.closest('[data-act]');
    if (mk) { kind0 = mk.dataset.mkind; $$('[data-mkind]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === mk))); return; }
    if (mp) { portion = mp.dataset.mport; $$('[data-mport]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === mp))); return; }
    if (!a) return;
    if (a.dataset.act === 'ml-del' && cur) { await deleteActivity(cur); closeSheet(); afterDayLog(); return; }
    if (a.dataset.act !== 'ml-save') return;
    const now = Date.now(); const tm = $('#ml-time', b).value || nowHHMM();
    const e = { ...(cur || { id: Sync.randomId(12), createdAt: now, by: S.myName || '', byDev: S.deviceId, src: 'parent', srcName: S.myName || 'Me', sev: 0, date: today() }), cat: 'eat', updatedAt: now, kind: kind0, portion, title: $('#ml-title', b).value.trim(), notes: $('#ml-note', b).value.trim(), time: tm, tod: todOf(tm) };
    await saveActivity(e); closeSheet(); afterDayLog();
  };
}

// The day so far as one timeline.
function dayExtras(date) {
  const out = []; const plans = medPlans();
  allEntries().forEach((e) => {
    if (!e || e.deleted || e.date !== date) return;
    if (e.cat === 'meddose' && (e.status === 'taken' || e.status === 'late')) out.push({ time: e.takenAt || '', kind: 'med', text: `${(plans[e.planId] && plans[e.planId].name) || 'Medicine'} ${e.status === 'late' ? 'given late' : 'given'}` });
    else if (e.cat === 'activity' && ACT_KINDS[e.kind]) out.push({ time: e.time || '', kind: 'act', text: `${ACT_KINDS[e.kind].label}${e.mins ? `, ${minText(e.mins)}` : ''}` });
    else if (e.cat === 'screen' && SCR_KINDS[e.kind]) out.push({ time: e.time || '', kind: 'scr', text: `Screen: ${SCR_KINDS[e.kind].label}${e.mins ? `, ${minText(e.mins)}` : ''}` });
    else if (e.cat === 'tick' && e.at && !e.skip && !e.member) out.push({ time: hmFromMs(e.at), kind: 'rt', text: 'Routine step done' });
    else if (CAT[e.cat] && e.cat !== 'eating' && !['dayfeel', 'tally', 'ask', 'activity', 'screen', 'meddose', 'sidefx', 'with', 'eat', 'feedback'].includes(e.cat)) out.push({ time: e.time || '', kind: 'log', text: `${CAT[e.cat].label}${e.title ? `: ${e.title}` : ''}` });
  });
  return out;
}
function breakdownHTML(date) {
  const rows = dayBreakdown(allEntries(), date, dayExtras(date));
  if (!rows.length) return '<p class="hint">Nothing logged for this day yet.</p>';
  return `<ul class="bd-list">${rows.map((r) => `<li class="bd-${r.kind}"><span class="bd-time">${r.time ? esc(fmtTime(r.time)) : ''}${r.to ? `<small>to ${esc(fmtTime(r.to))}</small>` : ''}</span><span class="bd-text">${esc(r.text)}</span></li>`).join('')}</ul>`;
}
export function renderBreakdownCard() {
  const box = $('#breakdown-card'); if (!box) return;
  const rows = dayBreakdown(allEntries(), today(), dayExtras(today()));
  box.innerHTML = foldCard('breakdown', 'Day breakdown', rows.length ? `${rows.length} so far` : 'Builds as you log', breakdownHTML(today()), true, 'act-card');
}
function openDayBreakdown(date) { openSheet(date === today() ? 'Today' : fmtDayLong(date), breakdownHTML(date)); }

// ---------------------------------------------------------------- Today tab: what needs attention, set-up list, quick links, order
S.attn = {};
function setAttn(k, v) { S.attn[k] = !!v; const d = $('#today-dot'); if (d) d.hidden = !Object.values(S.attn).some(Boolean); }
async function openPeople() { await openSettings(); setTimeout(() => { const el = $('[data-act="fam-add"]') || $('[data-act="fam-setup"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 50); }

// ---------------------------------------------------------------- Log tiles (each person picks their own, saved on this phone)
const CARD_RENDER = () => ({ 'timer-card': renderTimerCard, 'meds-card': renderMedsCard, 'routine-card': renderRoutineCard, 'appt-card': renderApptCard, 'ask-card': renderAskCard, 'plan-card': renderPlanCard, 'dayfeel-card': renderDayCard, 'eat-card': renderEatCard, 'with-card': renderWithCard, 'activity-card': renderActivityCard, 'screen-card': renderScreenCard, 'tally-card': renderTallyCard });
function tileDefs() {
  const d = {
    ate: { label: 'Ate', em: '🍽', card: 'eat-card', parent: true },
    sleep: { label: 'Slept', em: '🌙', cat: 'sleep' },
    played: { label: 'Played', em: '🏃', card: 'activity-card', parent: true },
    with: { label: 'With someone', em: '👥', card: 'with-card' },
    meds: { label: 'Medicines and supplements', short: 'Medicines', em: '💊', card: 'meds-card', parent: true },
    mood: { label: 'Mood', em: '🙂', card: 'dayfeel-card', parent: true },
    unwell: { label: 'Unwell', em: '🤒', cat: 'health' },
    screen: { label: 'Screen time', em: '📺', card: 'screen-card', parent: true },
    taps: { label: 'Quick taps', em: '😩', card: 'tally-card', parent: true },
    timer: { label: 'Timer', em: '⏱', card: 'timer-card', parent: true },
    routine: { label: 'Bedtime routine', short: 'Routine', em: '🛁', card: 'routine-card' },
    plans: { label: 'Days ahead', em: '📅', card: 'plan-card' },
    appts: { label: 'Appointments', em: '🩺', card: 'appt-card', parent: true },
    ask: { label: 'Carer questions', short: 'Questions', em: '💬', card: 'ask-card', parent: true },
  };
  CATS.forEach((c) => { if (c.k === 'eating') d[`cat:${c.k}`] = { label: c.label, em: c.em, card: 'eat-card', parent: true }; else if (c.k !== 'health' && c.k !== 'sleep') d[`cat:${c.k}`] = { label: c.label, em: c.em, cat: c.k }; });
  if (isHelper()) Object.keys(d).forEach((k) => { if (d[k].parent) delete d[k]; });
  return d;
}
const TILE_DEFAULT = ['ate', 'sleep', 'played', 'with', 'meds', 'mood', 'unwell'];
const TILE_DEFAULT_HELPER = ['sleep', 'with', 'routine', 'plans', 'unwell', 'cat:behaviour', 'cat:win'];
function chosenTiles() {
  const d = tileDefs(); let list = null;
  try { list = JSON.parse(localStorage.getItem(isHelper() ? 'lo-tiles-h' : 'lo-tiles') || 'null'); } catch { /* ignore */ }
  if (!Array.isArray(list)) list = isHelper() ? TILE_DEFAULT_HELPER : TILE_DEFAULT;
  return list.filter((k) => d[k]).slice(0, 7);
}
function saveTiles(list) { try { localStorage.setItem(isHelper() ? 'lo-tiles-h' : 'lo-tiles', JSON.stringify(list)); } catch { /* ignore */ } }
function tileBtn(k, t) { return `<button type="button" class="tile" data-tile="${esc(k)}"><span class="tile-ic" aria-hidden="true">${t.em}</span><span>${esc(t.short || t.label)}</span></button>`; }
function renderTiles() {
  const box = $('#tiles'); if (!box) return;
  const d = tileDefs();
  box.innerHTML = chosenTiles().map((k) => tileBtn(k, d[k])).join('') + '<button type="button" class="tile" data-tile="more"><span class="tile-ic" aria-hidden="true">•••</span><span>More</span></button>';
  box.onclick = (ev) => { const b = ev.target.closest('[data-tile]'); if (b) openTile(b.dataset.tile); };
}
function restoreSheetCard() {
  if (!S.sheetCard) return; const el = document.getElementById(S.sheetCard); S.sheetCard = null;
  if (el) $('#card-store').appendChild(el);
  renderToday();
}
function openTile(k) {
  if (k === 'more') { openMoreTiles(); return; }
  const t = tileDefs()[k]; if (!t) return;
  if (t.cat) { openLogFor(t.cat); return; }
  const el = document.getElementById(t.card); if (!el) return;
  const fn = CARD_RENDER()[t.card];
  const key = (el.querySelector('[data-fold]') || {}).dataset; if (key && key.fold) S.fold[key.fold] = true;
  if (fn) fn();
  const f = el.querySelector('[data-fold]'); if (f) S.fold[f.dataset.fold] = true; if (fn) fn();
  openSheet(t.label, '<div id="tile-slot"></div>');
  if (!el.innerHTML.trim()) { $('#tile-slot').innerHTML = `<p class="hint">Nothing to show here right now.${t.card === 'routine-card' && !isHelper() ? ' Add a bedtime routine in Settings.' : ''}</p>`; return; }
  $('#tile-slot').appendChild(el); S.sheetCard = t.card; $('#now-sec').hidden = !$('#now').children.length;
}
function openLogFor(cat) {
  closeSheet(); S.fromTile = true; switchTab('log');
  const b = $(`#log-form .cat-btn[data-cat="${cat}"]`);
  if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
}
function openMoreTiles() {
  const d = tileDefs(); const mine = new Set(chosenTiles());
  const rest = Object.keys(d).filter((k) => !mine.has(k));
  openSheet('More', `<div class="tiles tiles-more">${rest.map((k) => tileBtn(k, d[k])).join('')}</div>
    <button type="button" class="btn ghost block mt10" data-act="tiles-edit">Choose my tiles</button>
    <p class="hint">Pick the ones you use most for the Today screen. Your partner can pick their own on their phone.</p>`);
  $('#sheet-body').onclick = (ev) => { const b = ev.target.closest('[data-tile]'); if (b) { closeSheet(); openTile(b.dataset.tile); return; } if (ev.target.closest('[data-act="tiles-edit"]')) openTileEditor(); };
}
function openTileEditor() {
  const d = tileDefs(); let list = chosenTiles();
  const draw = () => {
    $('#sheet-body').innerHTML = `<p class="hint">Up to 7 tiles, plus More. Use the arrows to change the order.</p>
      <ol class="tile-edit">${list.map((k, i) => `<li><span>${d[k].em} ${esc(d[k].label)}</span><span class="act-btns"><button type="button" class="chip" data-tup="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" class="chip" data-tdown="${i}" aria-label="Move down"${i < list.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="chip" data-toff="${esc(k)}">Remove</button></span></li>`).join('')}</ol>
      <h4 class="feel-sub">Add a tile</h4><div class="chips">${Object.keys(d).filter((k) => !list.includes(k)).map((k) => `<button type="button" class="chip" data-ton="${esc(k)}"${list.length >= 7 ? ' disabled' : ''}>${d[k].em} ${esc(d[k].label)}</button>`).join('')}</div>
      <div class="actions mt10"><button type="button" class="btn primary" data-act="tiles-save">Save</button><button type="button" class="btn ghost" data-act="tiles-reset">Back to the usual set</button></div>`;
  };
  openSheet('Choose my tiles', ''); draw();
  $('#sheet-body').onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return; const ds = b.dataset;
    if (ds.tup) { const i = +ds.tup; [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); }
    else if (ds.tdown) { const i = +ds.tdown; [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); }
    else if (ds.toff) { list = list.filter((x) => x !== ds.toff); draw(); }
    else if (ds.ton && list.length < 7) { list.push(ds.ton); draw(); }
    else if (ds.act === 'tiles-reset') { list = (isHelper() ? TILE_DEFAULT_HELPER : TILE_DEFAULT).slice(); draw(); }
    else if (ds.act === 'tiles-save') { saveTiles(list); closeSheet(); renderTiles(); toast('Tiles saved on this phone'); }
  };
}

// Today: Now (only what needs you), Log tiles, the day, worth knowing. Cards not needed right now wait in a hidden store
// and open in a sheet from their tile, so nothing shows twice.
const NOW_ORDER = ['timer-card', 'meds-card', 'routine-card', 'appt-card', 'ask-card', 'plan-card'];
function nowWanted(id) {
  const el = document.getElementById(id); if (!el || !el.innerHTML.trim()) return false;
  if (id === 'timer-card') return !!(S.actRun || S.scrRun || S.careRun);
  if (id === 'meds-card') return !!S.attn.meds;
  if (id === 'routine-card') return !!(S.attn.routine || S.rtWindow || (isHelper() && el.innerHTML.trim()));
  if (id === 'appt-card') return !!S.attn.appt;
  if (id === 'ask-card') return !!S.attn.ask;
  if (id === 'plan-card') return isHelper();
  return false;
}
export function renderToday() {
  const panel = $('#tab-today'); if (!panel) return;
  const now = $('#now'); const store = $('#card-store');
  NOW_ORDER.forEach((id) => { const el = document.getElementById(id); if (!el || S.sheetCard === id) return; if (nowWanted(id)) now.appendChild(el); else if (el.parentNode !== store) store.appendChild(el); });
  $('#now-sec').hidden = !now.children.length;
  const oc = $('#outlook-card'); $('#know-sec').hidden = !(oc && oc.innerHTML.trim());
  renderTiles();
  renderSetupCard();
  const links = $('#today-links');
  if (links) {
    links.innerHTML = isHelper() ? '' : `<button type="button" class="btn ghost" data-tl="people">People and carers<small>Invite family and choose what carers can see</small></button>
      <button type="button" class="btn ghost" data-tl="export">Share or export a report<small>A PDF or summary for a clinician, or to keep</small></button>
      <button type="button" class="btn ghost" data-tl="settings">Settings and backup<small>Child details, what to show, backup and restore</small></button>`;
    links.onclick = (ev) => { const b = ev.target.closest('[data-tl]'); if (!b) return; const k = b.dataset.tl; if (k === 'people') openPeople(); else if (k === 'export') switchTab('export'); else openSettings(); };
  }
}
function renderSetupCard() {
  const box = $('#setup-card'); if (!box) return;
  if (isHelper() || cardHidden('setup')) { box.innerHTML = ''; return; }
  const h = home(); const items = [];
  if (!S.profile.childName) items.push(['name', "Add your child's name and birth date", 'It tailors the guidance to their age.', 'Open settings']);
  if (!Object.values(h.routine.variants).some((v) => !v.removed)) items.push(['routine', 'Add a bedtime routine', 'A checklist anyone can follow, with notes on where things are.', 'Add']);
  if (!Object.keys(medPlans()).length) items.push(['meds', 'Add a medicine or supplement', 'Daily reminders and how it relates to the day.', 'Add']);
  if (!Object.values(h.appts).some((a) => !a.removed)) items.push(['appt', 'Add an appointment', 'With reminders and a prompt for how it went.', 'Add']);
  if (!familyMembers(false).length) items.push(['people', 'Invite a carer or family member', 'Choose what they can see.', 'Invite']);
  if (!items.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card setup-card"><h3 class="card-title">Getting set up</h3>${items.map(([k, t, d, b]) => `<div class="setup-item"><span><b>${esc(t)}</b><small>${esc(d)}</small></span><button type="button" class="chip" data-setup="${k}">${esc(b)}</button></div>`).join('')}
    <div class="rt-foot"><button type="button" class="chip" data-setup="hide">Hide this list</button></div></div>`;
  box.onclick = (ev) => {
    const b = ev.target.closest('[data-setup]'); if (!b) return; const k = b.dataset.setup;
    if (k === 'name') openSettings(); else if (k === 'routine') openRoutineEditor(); else if (k === 'meds') openMedManage(); else if (k === 'appt') openApptSheet('', {}); else if (k === 'people') openPeople();
    else if (k === 'hide') { S.track.hide = Array.from(new Set([...S.track.hide, 'setup'])); saveTrack(); renderSetupCard(); toast('Hidden. You can bring it back in Settings, What I track.'); }
  };
}

// ---------------------------------------------------------------- bedtime routine, days ahead, appointments, carer questions
// Shared between parents (inside the profile). Carers only receive what is opted in, locked with their own key.
const home = () => cleanHome(S.profile && S.profile.home);
async function saveHome(h) { S.profile = { ...S.profile, home: cleanHome(h), updatedAt: Date.now() }; await kvSet('profile', S.profile); scheduleSync(300); renderHomeCards(); }
const planData = () => (isHelper() && S.plan && !S.plan.empty ? S.plan : null);
const whoId = () => (isHelper() && S.fam ? S.fam.id : '');
const hmMin = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return h * 60 + m; };
const hmFromMs = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
function ticksFor(date) {
  const out = {};
  if (isHelper() && S.plan && Array.isArray(S.plan.ticks)) S.plan.ticks.forEach((k) => { if (k && k.date === date) out[k.stepId] = { at: k.at, skip: !!k.skip, by: k.by }; });
  S.entries.forEach((e) => { if (e && e.cat === 'tick' && !e.deleted && e.date === date) out[e.stepId] = { at: e.at, skip: !!e.skip, by: e.by }; });
  return out;
}
async function tickStep(date, step, mode) {
  const id = tickId(date, step.id, whoId()); const now = Date.now();
  if (mode === 'clear') await deleteActivity({ id });
  else await saveActivity({ id, createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'tick', stepId: step.id, at: now, skip: mode === 'skip', title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me', date, time: nowHHMM(), tod: todOf(nowHHMM()) });
  renderRoutineCard(); if (S.tab === 'insights') renderInsights();
}
// Questions and notes from carers (entries of kind 'ask'), and the parents' answers (profile.home.qa).
const askEntries = () => Array.from(S.entries.values()).filter((e) => e && e.cat === 'ask' && !e.deleted && e.text);
function qaOf(id) { return isHelper() ? ((S.plan && S.plan.qa) || {})[id] : home().qa[id]; }
function openAskSheet(ref) {
  openSheet(ref.kind === 'note' ? 'Note for the parents' : 'Ask a question', `<p class="hint intro">${esc(ref.label || '')}</p>
    <div class="field"><label class="label" for="ask-text">${ref.kind === 'note' ? 'Your note' : 'Your question'}</label><textarea class="input" id="ask-text" rows="3" maxlength="300" placeholder="${ref.kind === 'note' ? 'e.g. We ran out of milk' : 'e.g. Where is the dinner?'}"></textarea></div>
    <button type="button" class="btn dark block" data-act="ask-send">Send</button>
    <p class="hint">The parents see it next time they open the app and reply here. For anything urgent, call them.</p>`, { onMount: (b) => {
    b.onclick = async (ev) => {
      if (!ev.target.closest('[data-act="ask-send"]')) return; const text = $('#ask-text', b).value.trim(); if (!text) { toast('Write a line first'); return; }
      const now = Date.now();
      await saveActivity({ id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'ask', kind: ref.kind || 'q', text: text.slice(0, 300), refKey: ref.key || '', refLabel: String(ref.label || '').slice(0, 80), title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me', date: today(), time: nowHHMM(), tod: todOf(nowHHMM()) });
      closeSheet(); toast('Sent'); renderHomeCards();
    };
  } });
}
function qaBlock(refKey) {
  if (!isHelper()) return '';
  const list = askEntries().filter((e) => e.refKey === refKey).slice(-3);
  return list.map((e) => { const a = qaOf(e.id); return `<span class="rt-qa"><small>${e.kind === 'note' ? 'Note' : 'You asked'}: ${esc(e.text)}</small>${a && a.a ? `<small class="rt-ans"><b>Answer:</b> ${esc(a.a)}</small>` : ''}</span>`; }).join('');
}

// ---- tonight's routine
export function renderRoutineCard() {
  const box = $('#routine-card'); if (!box) return;
  const routine = isHelper() ? (planData() && planData().routine) : home().routine;
  setAttn('routine', false); S.rtWindow = false;
  if (!routine || cardHidden('routine')) { box.innerHTML = ''; return; }
  const t = today(); const v = variantFor(routine, t);
  if (!v || !v.steps.length) { box.innerHTML = ''; return; }
  const now = nowHHMM(); const st = stepStatus(v.steps, ticksFor(t), now, true);
  const first = hmMin(v.steps[0].time); const last = hmMin((v.steps[v.steps.length - 1].end || v.steps[v.steps.length - 1].time));
  const inWindow = hmMin(now) >= first - 60 && hmMin(now) <= last + 90; S.rtWindow = inWindow;
  const nextOpen = st.items.find((i) => i.state === 'open');
  const sum = !nextOpen ? `All done (${st.done} of ${st.items.length})` : nextOpen.missed ? `Still to do: ${nextOpen.step.text}` : `Next: ${nextOpen.step.text} ${fmtTime(nextOpen.step.time)}`;
  const rows = st.items.map((i, ix) => {
    const s = i.step; const here = ix === st.here ? `<li class="rt-here" aria-label="Now"><span>Now ${esc(fmtTime(now))}</span></li>` : '';
    const doneTxt = i.state === 'done' && i.tick ? `Done ${fmtTime(hmFromMs(i.tick.at))}${i.tick.by && i.tick.by !== S.myName ? ` by ${esc(i.tick.by)}` : ''}` : i.state === 'skipped' ? 'Skipped' : '';
    return `${here}<li class="rt-step ${i.state}${i.missed ? ' missed' : ''}"><span class="rt-time">${esc(fmtTime(s.time))}${s.end ? `<small>to ${esc(fmtTime(s.end))}</small>` : ''}</span>
      <span class="rt-text"><b>${esc(s.text)}</b>${s.note ? `<small>${esc(s.note)}</small>` : ''}${doneTxt ? `<small class="rt-done">${doneTxt}</small>` : ''}${i.missed ? '<small class="rt-tag">Still to do</small>' : ''}${qaBlock(s.id)}</span>
      <span class="rt-btns">${i.state === 'open' ? `<button type="button" class="chip" data-rt="done|${s.id}">Done</button><button type="button" class="chip" data-rt="skip|${s.id}">Skip</button>` : `<button type="button" class="chip" data-rt="clear|${s.id}">Undo</button>`}${isHelper() ? `<button type="button" class="chip" data-rt="ask|${s.id}">Ask</button>` : ''}</span></li>`;
  }).join('') + (st.here >= st.items.length ? `<li class="rt-here" aria-label="Now"><span>Now ${esc(fmtTime(now))}</span></li>` : '');
  box.innerHTML = foldCard('routine', `Tonight's routine${v.name && v.name !== 'Routine' ? ` · ${v.name}` : ''}`, sum, `<ol class="rt-list">${rows}</ol>
    <div class="rt-foot">${isHelper() ? '' : '<button type="button" class="chip" data-rt="tonight|">Different routine tonight</button> <button type="button" class="chip" data-rt="edit|">Edit routines</button>'}</div>`, inWindow, 'rt-card', nextOpen && !isHelper() ? { label: 'Done', attr: `data-rt="done|${nextOpen.step.id}" aria-label="Mark ${esc(nextOpen.step.text)} done"` } : nextOpen ? { label: 'Done', attr: `data-rt="done|${nextOpen.step.id}"` } : null);
  setAttn('routine', inWindow && st.items.some((i) => i.missed));
  box.onclick = (ev) => {
    const b = ev.target.closest('[data-rt]'); if (!b) return; const [act, id] = b.dataset.rt.split('|'); const step = v.steps.find((x) => x.id === id);
    if (act === 'tonight') openTonightSheet(); else if (act === 'edit') openRoutineEditor();
    else if (act === 'ask' && step) openAskSheet({ kind: 'q', key: step.id, label: `About: ${step.text} (${fmtTime(step.time)})` });
    else if (step) tickStep(t, step, act);
  };
}
function openTonightSheet() {
  const h = home(); const t = today(); const cur = h.routine.overrides[t]; const vs = Object.values(h.routine.variants).filter((v) => !v.removed);
  openSheet('Routine tonight', `<div class="chips" data-tn>${vs.map((v) => `<button type="button" class="chip" data-tn="${v.id}" aria-pressed="${!!cur && cur.v === v.id}">${esc(v.name)}</button>`).join('')}<button type="button" class="chip" data-tn="none" aria-pressed="${!!cur && cur.v === 'none'}">No routine tonight</button><button type="button" class="chip" data-tn="" aria-pressed="${!cur}">Back to the usual</button></div>`, { onMount: (b) => {
    b.onclick = async (ev) => { const c = ev.target.closest('[data-tn]'); if (!c) return; const hh = home();
      hh.routine.overrides[t] = { v: c.dataset.tn, updatedAt: Date.now() }; closeSheet(); await saveHome(hh); };
  } });
}

// ---- editing the routines
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysLabel = (d) => (!d.length ? 'Usual routine' : d.length === 7 ? 'Every day' : d.map((x) => DOW[x]).join(', '));
function openRoutineEditor() {
  const h = home(); const vs = Object.values(h.routine.variants).filter((v) => !v.removed).sort((a, b) => (a.days.length ? 1 : 0) - (b.days.length ? 1 : 0));
  const t = today(); const ovs = Object.entries(h.routine.overrides).filter(([d, o]) => d >= t && o.v !== '').sort();
  const nameOf = (v) => (v === 'none' ? 'No routine' : (h.routine.variants[v] || {}).name || '?');
  openSheet('Bedtime routines', `<p class="hint intro">One usual routine, plus different ones for particular days (weekends, swimming nights). Each step has a time and an optional note, such as where things are.</p>
    ${vs.length ? `<div class="card kv-card">${vs.map((v) => `<div class="kv helper-row"><span><b>${esc(v.name)}</b><small>${esc(daysLabel(v.days))} · ${v.steps.length} step${v.steps.length === 1 ? '' : 's'}${v.carers ? ' · shared with carers' : ''}</small></span><span class="mini-links"><button type="button" data-rv="edit|${v.id}">Edit</button><button type="button" data-rv="del|${v.id}">Remove</button></span></div>`).join('')}</div>` : '<p class="hint">No routine yet.</p>'}
    <button type="button" class="btn dark block" data-rv="new|">Add a routine</button>
    <h4 class="feel-sub">A different routine on one night</h4>
    <div class="row2"><input class="input" type="date" id="ov-date" min="${t}" value="${t}" aria-label="Night"><select class="input" id="ov-v" aria-label="Routine">${vs.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}<option value="none">No routine</option></select></div>
    <button type="button" class="btn ghost block" data-rv="ov|">Set for that night</button>
    ${ovs.length ? `<div class="card kv-card">${ovs.map(([d, o]) => `<div class="kv helper-row"><span><b>${esc(fmtDayShort(d))}</b><small>${esc(nameOf(o.v))}</small></span><span class="mini-links"><button type="button" data-rv="clr|${d}">Clear</button></span></div>`).join('')}</div>` : ''}
    <div class="field"><label class="label" for="cv-days">Days ahead carers can see</label><select class="input" id="cv-days">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${h.cfg.carerDays === n ? ' selected' : ''}>${n} day${n === 1 ? '' : 's'}</option>`).join('')}</select></div>`, { onMount: (b) => {
    $('#cv-days', b).onchange = async (ev) => { const hh = home(); hh.cfg = { carerDays: +ev.target.value, updatedAt: Date.now() }; await saveHome(hh); toast('Saved'); };
    b.onclick = async (ev) => {
      const c = ev.target.closest('[data-rv]'); if (!c) return; const [act, id] = c.dataset.rv.split('|'); const hh = home();
      if (act === 'new' || act === 'edit') openVariantSheet(id || '');
      else if (act === 'del') { hh.routine.variants[id] = { ...hh.routine.variants[id], removed: true, updatedAt: Date.now() }; await saveHome(hh); openRoutineEditor(); }
      else if (act === 'ov') { const d = $('#ov-date', b).value; if (!d) return; hh.routine.overrides[d] = { v: $('#ov-v', b).value, updatedAt: Date.now() }; await saveHome(hh); openRoutineEditor(); }
      else if (act === 'clr') { hh.routine.overrides[id] = { v: '', updatedAt: Date.now() }; await saveHome(hh); openRoutineEditor(); }
    };
  } });
}
function stepRowHTML(s) {
  return `<div class="rt-edit" data-srow="${esc(s.id || '')}"><div class="row2"><input class="input" type="time" data-s="time" value="${esc(s.time || '')}" aria-label="Time"><input class="input" type="time" data-s="end" value="${esc(s.end || '')}" aria-label="Ends (optional)"></div>
    <input class="input" data-s="text" maxlength="80" placeholder="e.g. Bath" value="${esc(s.text || '')}" aria-label="Step">
    <input class="input" data-s="note" maxlength="200" placeholder="Note, e.g. towels are in the blue basket" value="${esc(s.note || '')}" aria-label="Note">
    <label class="check"><input type="checkbox" data-s="parentsOnly"${s.parentsOnly ? ' checked' : ''}> Parents only</label> <button type="button" class="link-btn" data-s-del="1">Remove step</button></div>`;
}
function openVariantSheet(id) {
  const h = home(); const cur = id ? h.routine.variants[id] : null;
  const v = cur || { name: '', days: [], steps: [], carers: false };
  openSheet(cur ? 'Edit routine' : 'New routine', `
    <div class="field"><label class="label" for="rv-name">Name</label><input class="input" id="rv-name" maxlength="40" placeholder="e.g. Usual, Weekend, Swimming night" value="${esc(v.name)}"></div>
    <div class="field"><span class="label">Which days</span><div class="chips" data-rdays>${DOW.map((n, i) => `<button type="button" class="chip" data-rd="${i}" aria-pressed="${v.days.includes(i)}">${n}</button>`).join('')}</div><p class="hint">Leave all off for the usual routine on every other day.</p></div>
    <label class="check"><input type="checkbox" id="rv-carers"${v.carers ? ' checked' : ''}> Share with carers</label>
    <div class="field"><span class="label">Steps</span><div id="rv-steps">${v.steps.map(stepRowHTML).join('')}</div><button type="button" class="btn ghost block" data-rv2="add">Add a step</button></div>
    <button type="button" class="btn dark block" data-rv2="save">Save</button>`, { full: true, onMount: (b) => {
    const days = new Set(v.days);
    b.onclick = async (ev) => {
      const d = ev.target.closest('[data-rd]'); if (d) { const n = +d.dataset.rd; if (days.has(n)) days.delete(n); else days.add(n); d.setAttribute('aria-pressed', String(days.has(n))); return; }
      const del = ev.target.closest('[data-s-del]'); if (del) { del.closest('.rt-edit').remove(); return; }
      const c = ev.target.closest('[data-rv2]'); if (!c) return;
      if (c.dataset.rv2 === 'add') { const last = $$('[data-s="time"]', b).pop(); const wrap = document.createElement('div'); wrap.innerHTML = stepRowHTML({ time: '' }); $('#rv-steps', b).appendChild(wrap.firstElementChild); if (last) { /* keep order by time on save */ } return; }
      const steps = $$('.rt-edit', b).map((r) => ({ id: r.dataset.srow || '', time: $('[data-s="time"]', r).value, end: $('[data-s="end"]', r).value, text: $('[data-s="text"]', r).value, note: $('[data-s="note"]', r).value, parentsOnly: $('[data-s="parentsOnly"]', r).checked }));
      const name = $('#rv-name', b).value.trim() || 'Routine'; const hh = home(); const vid = cur ? cur.id : Sync.randomId(8);
      if (!steps.some((s) => s.time && s.text.trim())) { toast('Add at least one step with a time'); return; }
      hh.routine.variants[vid] = { id: vid, name, days: Array.from(days).sort(), steps, carers: $('#rv-carers', b).checked, removed: false, updatedAt: Date.now() };
      await saveHome(hh); toast('Saved'); openRoutineEditor();
    };
  } });
}

// ---- days ahead
const dayName = (d) => (d === today() ? 'Today' : d === addDays(today(), 1) ? 'Tomorrow' : fmtDayShort(d));
function medsOnDay(d) {
  const list = isHelper() ? ((planData() && planData().meds) || []) : Object.values(cleanPlans(S.profile.meds));
  return list.filter((p) => p && !isPrn(p) && slotsFor(p, d).length).map((p) => `${p.name}${p.dose ? ` ${p.dose}` : ''} at ${slotsFor(p, d).map(fmtTime).join(', ')}`);
}
export function renderPlanCard() {
  const box = $('#plan-card'); if (!box) return;
  if (cardHidden('plan')) { box.innerHTML = ''; return; }
  const t = today(); const now = nowHHMM(); const h = home(); const pd = planData();
  if (isHelper() && !pd) { box.innerHTML = ''; return; }
  const n = isHelper() ? Math.max(1, Math.min(7, pd.span || 7)) : 7;
  const appts = isHelper() ? pd.appts.map((o) => ({ date: o.date, time: o.time, who: o.who, what: o.what, place: o.place })) : upcoming(h.appts, t, now, n - 1).map((o) => ({ date: o.date, time: o.time, who: o.appt.who, what: o.appt.what, place: o.appt.place, shared: o.appt.carers }));
  const days = isHelper() ? pd.days : h.days;
  const rows = []; let any = false;
  for (let i = 0; i < n; i++) {
    const d = addDays(t, i); const x = days[d] && !days[d].removed ? days[d] : null; const ap = appts.filter((a) => a.date === d); const md = medsOnDay(d);
    const lines = [...ap.map((a) => `<div class="pl-line">📅 <b>${esc([a.who, a.what].filter(Boolean).join(': '))}</b>${a.time ? ` ${esc(fmtTime(a.time))}` : ''}${a.place ? ` · ${esc(a.place)}` : ''}</div>`),
      ...md.map((m) => `<div class="pl-line">💊 ${esc(m)}</div>`),
      x && x.food ? `<div class="pl-line">🍽️ ${esc(x.food)}</div>` : '', x && x.where ? `<div class="pl-line">📍 ${esc(x.where)}</div>` : '', x && x.note ? `<div class="pl-line">📝 ${esc(x.note)}</div>` : ''].filter(Boolean);
    if (lines.length) any = true;
    rows.push(`<div class="pl-day"><div class="pl-head"><b>${esc(dayName(d))}</b>${isHelper() ? `<button type="button" class="link-btn" data-pl="ask|${d}">Ask</button>` : `<button type="button" class="link-btn" data-pl="edit|${d}">${x ? 'Edit' : 'Add'}${x && x.carers ? ' · carers see' : ''}</button>`}</div>${lines.join('') || '<div class="pl-line pl-none">Nothing planned</div>'}${isHelper() ? qaBlock(`day:${d}`) : ''}</div>`);
  }
  const firstAp = appts[0];
  const sum = firstAp ? `Next: ${[firstAp.who, dayName(firstAp.date)].join(', ')}` : any ? 'Food and plans noted' : (isHelper() ? 'Nothing planned' : 'Add food, places and notes');
  if (isHelper() && !any && !(pd.routine && Object.keys(pd.routine.variants || {}).length)) { box.innerHTML = ''; return; }
  box.innerHTML = foldCard('plan', isHelper() ? 'Days ahead' : 'Days ahead', sum, `${rows.join('')}<div class="rt-foot">${isHelper() ? '<button type="button" class="chip" data-pl="note|">Leave a note for the parents</button>' : '<button type="button" class="chip" data-pl="appts|">Appointments</button> <button type="button" class="chip" data-pl="routines|">Routines</button>'}</div>`, false, 'rt-card');
  box.onclick = (ev) => {
    const b = ev.target.closest('[data-pl]'); if (!b) return; const [act, d] = b.dataset.pl.split('|');
    if (act === 'edit') openDaySheet(d); else if (act === 'appts') openApptList(); else if (act === 'routines') openRoutineEditor();
    else if (act === 'ask') openAskSheet({ kind: 'q', key: `day:${d}`, label: `About ${dayName(d)}` });
    else if (act === 'note') openAskSheet({ kind: 'note', key: 'note', label: 'A general note' });
  };
}
function openDaySheet(d) {
  const h = home(); const x = h.days[d] && !h.days[d].removed ? h.days[d] : { food: '', where: '', note: '', carers: false };
  openSheet(dayName(d), `
    <div class="field"><label class="label" for="dy-food">Food</label><input class="input" id="dy-food" maxlength="300" placeholder="e.g. Pasta bake" value="${esc(x.food)}"></div>
    <div class="field"><label class="label" for="dy-where">Where to find things</label><input class="input" id="dy-where" maxlength="300" placeholder="e.g. Dinner is in the fridge, second shelf" value="${esc(x.where)}"></div>
    <div class="field"><label class="label" for="dy-note">Other notes</label><textarea class="input" id="dy-note" rows="2" maxlength="600">${esc(x.note)}</textarea></div>
    <label class="check"><input type="checkbox" id="dy-carers"${x.carers ? ' checked' : ''}> Show carers this day (and its appointments marked for carers)</label>
    <button type="button" class="btn dark block" data-act="dy-save">Save</button>${h.days[d] ? '<button type="button" class="btn ghost block" data-act="dy-clear">Clear this day</button>' : ''}`, { onMount: (b) => {
    b.onclick = async (ev) => {
      const a = ev.target.closest('[data-act]'); if (!a) return; const hh = home();
      if (a.dataset.act === 'dy-save') hh.days[d] = { food: $('#dy-food', b).value, where: $('#dy-where', b).value, note: $('#dy-note', b).value, carers: $('#dy-carers', b).checked, removed: false, updatedAt: Date.now() };
      else if (a.dataset.act === 'dy-clear') hh.days[d] = { ...hh.days[d], food: '', where: '', note: '', carers: false, removed: true, updatedAt: Date.now() };
      else return; closeSheet(); await saveHome(hh); toast('Saved');
    };
  } });
}

// ---- appointments
const apptWho = () => Array.from(new Set(Object.values(home().appts).filter((a) => !a.removed).map((a) => a.who))).sort();
function apptLine(o) {
  const a = o.appt; return `<button type="button" class="time-row appt-row" data-ap="open|${a.id}|${o.date}"><span><b>${esc(a.who)}${a.what ? `: ${esc(a.what)}` : ''}</b><small>${esc(dayName(o.date))}${o.time ? ` · ${esc(fmtTime(o.time))}` : ''}${a.place ? ` · ${esc(a.place)}` : ''}${a.repeat !== 'none' ? ` · ${esc(REPEATS[a.repeat].toLowerCase())}` : ''}${a.carers ? ' · carers see' : ''}</small></span></button>`;
}
export function renderApptCard() {
  const box = $('#appt-card'); if (!box) return;
  setAttn('appt', false);
  if (isHelper() || cardHidden('appt')) { box.innerHTML = ''; return; }
  const h = home(); const t = today(); const now = nowHHMM();
  const ups = upcoming(h.appts, t, now, 60); const fu = followUps(h.appts, t, now); const rem = reminders(h.appts, t).filter((o) => !fu.some((f) => f.key === o.key));
  const sum = fu.length ? `How did it go? ${fu[0].appt.who}` : rem.length ? `${dayName(rem[0].date)}: ${rem[0].appt.who}${rem[0].time ? ` ${fmtTime(rem[0].time)}` : ''}` : ups.length ? `Next: ${ups[0].appt.who}, ${dayName(ups[0].date)}` : 'None coming up';
  const body = `${fu.map((o) => `<div class="appt-follow"><b>How did ${esc(o.appt.who)}${o.appt.what ? ` (${esc(o.appt.what)})` : ''} go?</b><small>${esc(dayName(o.date))}</small><div class="chips"><button type="button" class="chip" data-ap="follow|${o.appt.id}|${o.date}">Add outcome</button><button type="button" class="chip" data-ap="skipf|${o.appt.id}|${o.date}">Didn't happen</button></div></div>`).join('')}
    ${rem.map((o) => `<p class="outlook-tip"><b>${esc(dayName(o.date))}:</b> ${esc(o.appt.who)}${o.time ? ` at ${esc(fmtTime(o.time))}` : ''}${o.appt.place ? `, ${esc(o.appt.place)}` : ''}</p>`).join('')}
    ${ups.length ? `<div class="act-list">${ups.slice(0, 6).map(apptLine).join('')}</div>` : '<p class="hint">Nothing coming up.</p>'}
    <div class="rt-foot"><button type="button" class="chip" data-ap="add||">Add an appointment</button> <button type="button" class="chip" data-ap="all||">All and past</button></div>`;
  box.innerHTML = foldCard('appt', 'Appointments', sum, body, fu.length > 0 || rem.length > 0, 'rt-card', fu.length ? { label: 'Add outcome', attr: `data-ap="follow|${fu[0].appt.id}|${fu[0].date}"` } : null);
  setAttn('appt', fu.length > 0 || rem.some((o) => o.date === t));
  box.onclick = (ev) => {
    const b = ev.target.closest('[data-ap]'); if (!b) return; const [act, id, d] = b.dataset.ap.split('|'); const a = home().appts[id];
    if (act === 'add') openApptSheet('', {}); else if (act === 'all') openApptList(); else if (act === 'open' && a) openApptSheet(id, { date: d });
    else if (act === 'follow' && a) openFollowUp(a, d); else if (act === 'skipf' && a) markApptDone(a, d, true);
  };
}
async function markApptDone(a, d, skip) { const h = home(); const x = h.appts[a.id]; x.done = { ...x.done, [d]: { at: Date.now(), skip: !!skip } }; x.updatedAt = Date.now(); await saveHome(h); }
function openApptList() {
  const h = home(); const t = today(); const all = Object.values(h.appts).filter((a) => !a.removed);
  const past = []; all.forEach((a) => occurrences(a, a.date, t).forEach((o) => { if (o.date < t) past.push({ ...o, appt: a }); }));
  past.sort((x, y) => (x.date < y.date ? 1 : -1));
  const ups = upcoming(h.appts, t, nowHHMM(), 365);
  openSheet('Appointments', `<button type="button" class="btn dark block" data-ap="add||">Add an appointment</button>
    <h4 class="feel-sub">Coming up</h4>${ups.length ? `<div class="act-list">${ups.slice(0, 40).map(apptLine).join('')}</div>` : '<p class="hint">Nothing coming up.</p>'}
    <h4 class="feel-sub">Past</h4>${past.length ? `<div class="act-list">${past.slice(0, 60).map((o) => `<button type="button" class="time-row appt-row" data-ap="open|${o.appt.id}|${o.date}"><span><b>${esc(o.appt.who)}${o.appt.what ? `: ${esc(o.appt.what)}` : ''}</b><small>${esc(fmtDayShort(o.date))}${(o.appt.done || {})[o.date] ? ((o.appt.done[o.date].skip) ? ' · didn\'t happen' : ' · outcome noted') : ''}</small></span></button>`).join('')}</div>` : '<p class="hint">Past appointments stay here so you can look back.</p>'}`, { onMount: (b) => {
    b.onclick = (ev) => { const c = ev.target.closest('[data-ap]'); if (!c) return; const [act, id, d] = c.dataset.ap.split('|'); if (act === 'add') openApptSheet('', {}); else if (act === 'open') openApptSheet(id, { date: d }); };
  } });
}
function openApptSheet(id, preset) {
  const h = home(); const cur = id ? h.appts[id] : null;
  const a = cur || { who: preset.who || '', what: preset.what || '', place: preset.place || '', date: preset.date || today(), time: preset.time || '', len: preset.len || 30, repeat: 'none', until: '', carers: false, remind: 'on', notes: '', skip: [], done: {} };
  const opt = (v, l, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${l}</option>`;
  openSheet(cur ? 'Appointment' : 'New appointment', `
    <div class="field"><label class="label" for="ap-who">Doctor or service</label><input class="input" id="ap-who" list="ap-whos" maxlength="60" placeholder="e.g. Dr Lee, Speech therapy" value="${esc(a.who)}"><datalist id="ap-whos">${apptWho().map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
    <div class="field"><label class="label" for="ap-what">What for (optional)</label><input class="input" id="ap-what" maxlength="80" placeholder="e.g. Iron retest" value="${esc(a.what)}"></div>
    <div class="row2"><div class="field"><label class="label" for="ap-date">Date</label><input class="input" type="date" id="ap-date" value="${esc(a.date)}"></div><div class="field"><label class="label" for="ap-time">Time</label><input class="input" type="time" id="ap-time" value="${esc(a.time)}"></div></div>
    <div class="field"><label class="label" for="ap-place">Where (optional)</label><input class="input" id="ap-place" maxlength="120" value="${esc(a.place)}"></div>
    <div class="row2"><div class="field"><label class="label" for="ap-len">Length</label><select class="input" id="ap-len">${[15, 30, 45, 60, 90, 120].map((n) => opt(n, `${n} min`, +a.len === n)).join('')}</select></div>
    <div class="field"><label class="label" for="ap-rep">Repeats</label><select class="input" id="ap-rep">${Object.entries(REPEATS).map(([k, l]) => opt(k, l, a.repeat === k)).join('')}</select></div></div>
    <div class="field"><label class="label" for="ap-until">Repeat until (optional)</label><input class="input" type="date" id="ap-until" value="${esc(a.until)}"></div>
    <div class="field"><label class="label" for="ap-rem">Reminder in the app</label><select class="input" id="ap-rem">${opt('on', 'Remind me the day before and on the day', a.remind === 'on')}${opt('off', 'No reminder', a.remind === 'off')}${opt('cal', 'It is in my calendar, no reminder needed', a.remind === 'cal')}</select></div>
    <label class="check"><input type="checkbox" id="ap-carers"${a.carers ? ' checked' : ''}> Include in the carer plan</label>
    <div class="field"><label class="label" for="ap-notes">Notes (optional)</label><textarea class="input" id="ap-notes" rows="2" maxlength="600">${esc(a.notes)}</textarea></div>
    <button type="button" class="btn dark block" data-act="ap-save">Save</button>
    ${cur ? `<button type="button" class="btn ghost block" data-act="ap-ics">Add to my calendar</button>${cur.repeat !== 'none' ? `<button type="button" class="btn ghost block" data-act="ap-skip">Skip ${esc(fmtDayShort(preset.date || cur.date))} only</button>` : ''}<button type="button" class="btn ghost block" data-act="ap-del">Delete</button>` : ''}`, { full: true, onMount: (b) => {
    b.onclick = async (ev) => {
      const c = ev.target.closest('[data-act]'); if (!c) return; const hh = home(); const aid = cur ? cur.id : Sync.randomId(8); const act = c.dataset.act;
      if (act === 'ap-save') {
        const who = $('#ap-who', b).value.trim(); const date = $('#ap-date', b).value; if (!who || !date) { toast('Add who it is with and a date'); return; }
        hh.appts[aid] = { ...(cur || {}), id: aid, who, what: $('#ap-what', b).value, place: $('#ap-place', b).value, date, time: $('#ap-time', b).value, len: +$('#ap-len', b).value, repeat: $('#ap-rep', b).value, until: $('#ap-until', b).value, carers: $('#ap-carers', b).checked, remind: $('#ap-rem', b).value, notes: $('#ap-notes', b).value, skip: (cur && cur.skip) || [], done: (cur && cur.done) || {}, removed: false, updatedAt: Date.now() };
        closeSheet(); await saveHome(hh); toast('Saved');
      } else if (act === 'ap-del') { hh.appts[aid] = { ...cur, removed: true, updatedAt: Date.now() }; closeSheet(); await saveHome(hh); toast('Deleted'); }
      else if (act === 'ap-skip') { const d = preset.date || cur.date; hh.appts[aid] = { ...cur, skip: [...(cur.skip || []), d], updatedAt: Date.now() }; closeSheet(); await saveHome(hh); toast('Skipped that one'); }
      else if (act === 'ap-ics') { const ics = apptIcs(cur, Sync.randomId(12), today()); if (!ics) return; const ok = await shareFile(new Blob([ics], { type: 'text/calendar' }), `${cur.who.replace(/[^\w]+/g, '-').slice(0, 30)}.ics`, 'text/calendar'); if (ok) toast('Open the file to add it to your calendar.'); }
    };
  } });
}
function openFollowUp(a, d) {
  openSheet(`How did ${a.who} go?`, `<p class="hint intro">${esc(fmtDayLong(d))}</p>
    <div class="field"><label class="label" for="fu-out">How it went</label><textarea class="input" id="fu-out" rows="3" maxlength="600" placeholder="e.g. All fine, results next week"></textarea></div>
    <div class="field"><label class="label" for="fu-next">Next steps (optional)</label><textarea class="input" id="fu-next" rows="2" maxlength="400" placeholder="e.g. Repeat test in 3 months"></textarea></div>
    <button type="button" class="btn dark block" data-act="fu-save">Save to the log</button><button type="button" class="btn ghost block" data-act="fu-next">Save and add the next appointment</button>`, { onMount: (b) => {
    b.onclick = async (ev) => {
      const c = ev.target.closest('[data-act]'); if (!c) return; const out = $('#fu-out', b).value.trim(); const nx = $('#fu-next', b).value.trim();
      if (!out && !nx) { toast('Add a line first'); return; }
      const now = Date.now(); const time = a.time || nowHHMM();
      await saveActivity({ id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'health', title: `${a.who}${a.what ? `: ${a.what}` : ''}`.slice(0, 80), notes: [out && `How it went: ${out}`, nx && `Next steps: ${nx}`].filter(Boolean).join('\n'), sev: 0, src: 'parent', srcName: S.myName || 'Me', date: d, time, tod: todOf(time) });
      await markApptDone(a, d, false); closeSheet(); toast('Saved to the log');
      if (c.dataset.act === 'fu-next') openApptSheet('', { who: a.who, what: a.what, place: a.place, len: a.len, time: a.time });
    };
  } });
}

// ---- carer questions, for the parents
export function renderAskCard() {
  const box = $('#ask-card'); if (!box) return;
  setAttn('ask', false);
  if (isHelper() || cardHidden('ask')) { box.innerHTML = ''; return; }
  const h = home(); const list = askEntries().filter((e) => !(h.qa[e.id] && h.qa[e.id].resolved)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) { box.innerHTML = ''; return; }
  const open = list.filter((e) => !(h.qa[e.id] && h.qa[e.id].a)).length;
  box.innerHTML = foldCard('ask', 'Carer questions and notes', open ? `${open} to answer` : `${list.length} noted`, `<div class="act-list">${list.slice(0, 20).map((e) => { const q = h.qa[e.id]; return `<button type="button" class="time-row" data-ask="${e.id}"><span><b>${esc(e.text)}</b><small>${esc(e.by || 'Carer')} · ${esc(e.refLabel || (e.kind === 'note' ? 'Note' : 'Question'))}${q && q.a ? ` · answered` : ''}</small></span></button>`; }).join('')}</div>`, open > 0, 'rt-card');
  setAttn('ask', open > 0);
  box.onclick = (ev) => { const b = ev.target.closest('[data-ask]'); if (b) openAnswerSheet(b.dataset.ask); };
}
function openAnswerSheet(id) {
  const e = S.entries.get(id); if (!e) return; const q = home().qa[id] || { a: '' };
  openSheet(e.kind === 'note' ? 'Note from a carer' : 'Question from a carer', `<p class="hint intro">${esc(e.by || 'Carer')} · ${esc(e.refLabel || '')}</p><p><b>${esc(e.text)}</b></p>
    <div class="field"><label class="label" for="an-text">${e.kind === 'note' ? 'Reply (optional)' : 'Your answer'}</label><textarea class="input" id="an-text" rows="3" maxlength="600">${esc(q.a)}</textarea></div>
    <button type="button" class="btn dark block" data-act="an-save">Send reply</button><button type="button" class="btn ghost block" data-act="an-done">Mark as sorted and tidy away</button>`, { onMount: (b) => {
    b.onclick = async (ev) => {
      const c = ev.target.closest('[data-act]'); if (!c) return; const hh = home(); const text = $('#an-text', b).value.trim();
      hh.qa[id] = { a: text, by: S.myName || '', at: Date.now(), resolved: c.dataset.act === 'an-done', updatedAt: Date.now() };
      closeSheet(); await saveHome(hh); toast(c.dataset.act === 'an-done' ? 'Tidied away' : 'Reply sent');
    };
  } });
}
function renderHomeCards() { renderRoutineCard(); renderPlanCard(); renderApptCard(); renderAskCard(); renderSetupCard(); }

// What a given carer receives: only what is opted in, plus answers to their own questions and the parents' ticks.
function buildCarerPayload(helperId) {
  const t = today(); const h = home();
  const meds = Object.entries(cleanPlans(S.profile.meds)).filter(([, p]) => p.carers && !p.removed && activeOn(p, t)).map(([id, p]) => ({ ...p, id }));
  const view = carerView(h, t, nowHHMM(), meds);
  const qa = {}; S.entries.forEach((e) => { if (e && e.cat === 'ask' && !e.deleted && e.member === helperId && h.qa[e.id]) qa[e.id] = { a: h.qa[e.id].a, resolved: h.qa[e.id].resolved }; });
  const y = addDays(t, -1); const ticks = [];
  S.entries.forEach((e) => { if (e && e.cat === 'tick' && !e.deleted && !e.member && (e.date === t || e.date === y)) ticks.push({ date: e.date, stepId: e.stepId, at: e.at, skip: !!e.skip, by: e.by || '' }); });
  ticks.sort((a, b) => (a.date + a.stepId < b.date + b.stepId ? -1 : 1));
  return { ...view, qa, ticks, child: S.profile.childName || '' };
}
// How the routine is going: evenings with every step done, and bedtimes against the routine's last step.
function routineInsightHTML() {
  if (isHelper()) return ''; const h = home(); if (!Object.values(h.routine.variants).some((v) => !v.removed)) return '';
  const t = today(); const byDate = {}; for (let i = 1; i <= 7; i++) byDate[addDays(t, -i)] = ticksFor(addDays(t, -i));
  const w = routineWeek(h.routine, byDate, t);
  const nights = sleepNights(live()).filter((n) => n.date >= addDays(t, -7) && n.date < t); let onTime = 0; let counted = 0;
  nights.forEach((n) => { const v = variantFor(h.routine, n.date); if (!v || !v.steps.length) return; const target = hmMin(v.steps[v.steps.length - 1].time); const bed = hmMin(n.bed); counted++; if (bed >= 720 && bed <= target + 15) onTime++; });
  if (!w.nights && !counted) return '';
  return `<div class="card"><h3 class="card-title">Bedtime routine this week</h3>
    ${w.nights ? `<div class="kv"><span>Checklist used</span><span>${w.nights} evening${w.nights === 1 ? '' : 's'}, every step on ${w.full}</span></div>` : ''}
    ${counted ? `<div class="kv"><span>Asleep by the routine's last step</span><span>${onTime} of ${counted} night${counted === 1 ? '' : 's'}</span></div>` : ''}
    <p class="hint">Just a picture of the week. Plans change, and a late night now and then is normal.</p></div>`;
}

// ---------------------------------------------------------------- one timer card
// Active play, outdoors and screen time (synced entries) and your own care time (private to this phone) share one card.
const runElapsed = (r) => r.acc + (r.paused ? 0 : Math.max(0, Date.now() - r.resumedAt));
const hmOf = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
let tmTick = null;
function refreshMoves() { renderTimerCard(); renderActivityCard(); renderScreenCard(); renderOutlook(); if (S.tab === 'insights') renderInsights(); if (S.tab === 'time') renderTime(); }
async function startActTimer(kind) { const n = Date.now(); S.actRun = { kind, start: n, acc: 0, resumedAt: n, paused: false }; await kvSet('actRun', S.actRun); renderTimerCard(); }
async function startScrTimer(kind) { const n = Date.now(); S.scrRun = { kind, start: n, acc: 0, resumedAt: n, paused: false }; await kvSet('scrRun', S.scrRun); renderTimerCard(); }
async function startCareTimer(kind) { S.careRun = { start: Date.now(), kind, who: S.careWho || '' }; await kvSet('careRun', S.careRun); renderTimerCard(); if (S.tab === 'time') renderTime(); }
async function pauseRun(which) {
  const key = which === 'act' ? 'actRun' : 'scrRun'; const r = S[key]; if (!r) return;
  const n = { ...r }; if (n.paused) { n.paused = false; n.resumedAt = Date.now(); } else { n.acc = runElapsed(r); n.paused = true; }
  S[key] = n; await kvSet(key, n); renderTimerCard();
}
async function discardRun(which) {
  const key = which === 'act' ? 'actRun' : which === 'scr' ? 'scrRun' : 'careRun'; S[key] = null; await kvDel(key); toast('Discarded'); refreshMoves();
}
async function stopRun(which) {
  if (which === 'care') {
    const r = S.careRun; if (!r) return; const end = Date.now();
    const item = { id: Sync.randomId(9), start: r.start, end: Math.max(end, r.start + 1000), who: r.who || '', kind: r.kind, note: '', createdAt: end, updatedAt: end };
    S.care.push(item); S.careRun = null; await saveCare(); await kvDel('careRun'); refreshMoves();
    toast(`Saved ${careDur(careMins(item))}`, { label: 'Undo', fn: async () => { S.care = S.care.filter((x) => x.id !== item.id); await saveCare(); refreshMoves(); } });
    return;
  }
  const key = which === 'act' ? 'actRun' : 'scrRun'; const r = S[key]; if (!r) return;
  const end = Date.now(); const mins = Math.max(1, Math.round(runElapsed(r) / 60000));
  const f = { kind: r.kind, mins, date: ymd(new Date(r.start)), time: hmOf(r.start), end: hmOf(end) };
  await saveActivity(which === 'act' ? newActivity(f) : newScreen(f));
  S[key] = null; await kvDel(key); refreshMoves(); toast(`Saved ${mins} min`);
}
export function renderTimerCard() {
  const box = $('#timer-card'); if (!box) return;
  clearInterval(tmTick);
  if (isHelper() || cardHidden('timer')) { box.innerHTML = ''; return; }
  const a = S.actRun; const sc = S.scrRun; const c = S.careRun;
  const clockBtns = (p, r, paused) => `<span class="act-btns"><button type="button" class="chip" data-act="${p}-discard">Discard</button>${paused ? `<button type="button" class="chip" data-act="${p}-pause">${r.paused ? 'Resume' : 'Pause'}</button>` : ''}<button type="button" class="chip" aria-pressed="true" data-act="${p}-stop">Stop and save</button></span>`;
  let rows = '';
  if (a) rows += `<div class="act-timer"><span><b>${ACT_KINDS[a.kind].em} ${ACT_KINDS[a.kind].label}</b> <span data-act-elapsed>${clock(runElapsed(a))}</span>${a.paused ? ' <small>(paused)</small>' : ''}</span>${clockBtns('act', a, true)}</div>`;
  if (sc) { const tg = actTargets(); const note = screenNote(tg, screenCounted(screenEntries(), today()) + (sc.kind !== 'call' ? runElapsed(sc) / 60000 : 0));
    rows += `<div class="act-timer"><span><b>${SCR_KINDS[sc.kind].em} ${SCR_KINDS[sc.kind].label}</b> <span data-scr-elapsed>${clock(runElapsed(sc))}</span>${sc.paused ? ' <small>(paused)</small>' : ''}</span>${clockBtns('scr', sc, true)}</div>
      <p class="outlook-tip scr-note" data-scr-note${note ? '' : ' hidden'}>${esc(note)}</p>`; }
  if (c) rows += `<div class="act-timer"><span><b>${CARE_KIND[c.kind].em} ${CARE_KIND[c.kind].label}</b> <span data-tcare-elapsed>${clock(Date.now() - c.start)}</span> <small>(private)</small></span>${clockBtns('tcare', c, false)}</div>`;
  const all3 = a && sc && c;
  box.innerHTML = `<div class="card timer-one${rows ? '' : ' bare'}">${rows}${all3 ? '' : `<button type="button" class="btn ${rows ? 'ghost' : 'dark'} block" data-act="timer-pick">${rows ? '+ Another timer' : 'Start a timer'}</button>`}</div>`;
  if (a || sc || c) tmTick = setInterval(() => {
    const ea = $('[data-act-elapsed]'); if (ea && S.actRun) ea.textContent = clock(runElapsed(S.actRun));
    const es = $('[data-scr-elapsed]'); if (es && S.scrRun) { es.textContent = clock(runElapsed(S.scrRun)); const n = $('[data-scr-note]'); if (n) { const msg = screenNote(actTargets(), screenCounted(screenEntries(), today()) + (S.scrRun.kind !== 'call' ? runElapsed(S.scrRun) / 60000 : 0)); n.textContent = msg; n.hidden = !msg; } }
    const ec = $('[data-tcare-elapsed]'); if (ec && S.careRun) ec.textContent = clock(Date.now() - S.careRun.start);
  }, 1000);
  box.onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return; const d = b.dataset.act || '';
    if (d === 'timer-pick') openTimerPicker();
    else if (d === 'act-pause') pauseRun('act'); else if (d === 'scr-pause') pauseRun('scr');
    else if (d === 'act-stop') stopRun('act'); else if (d === 'scr-stop') stopRun('scr'); else if (d === 'tcare-stop') stopRun('care');
    else if (d === 'act-discard') discardRun('act'); else if (d === 'scr-discard') discardRun('scr'); else if (d === 'tcare-discard') discardRun('care');
  };
}
function openTimerPicker() {
  const who = whoOptions();
  const g1 = S.actRun ? '' : `<h4 class="feel-sub">Your child's day</h4><div class="chips">${Object.entries(ACT_KINDS).map(([k, v]) => `<button type="button" class="chip" data-acttimer="${k}">▶ ${v.em} ${v.label}</button>`).join('')}</div>`;
  const g2 = S.scrRun ? '' : `<h4 class="feel-sub">Screen time</h4><div class="chips">${Object.entries(SCR_KINDS).map(([k, v]) => `<button type="button" class="chip" data-scrtimer="${k}">▶ ${v.em} ${v.label}</button>`).join('')}</div><p class="hint">Pause when there's a break you expect them to come back from.</p>`;
  const g3 = S.careRun ? '' : `<h4 class="feel-sub">Your care time</h4><p class="hint">Private to this phone. Your partner and family can't see it.</p>${who.length > 1 ? `<div class="chips" data-pwhos>${whoChips(S.careWho, 'data-pwho')}</div>` : ''}<div class="chips mt10">${CARE_KINDS.map(([k, em, l]) => `<button type="button" class="chip" data-caretimer="${k}">▶ ${em} ${l}</button>`).join('')}</div>`;
  openSheet('Start a timer', `${g1}${g2}${g3}`, { onMount: (b) => {
    b.onclick = async (ev) => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.pwho !== undefined) { S.careWho = t.dataset.pwho; $$('[data-pwho]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === t))); return; }
      if (t.dataset.acttimer) { closeSheet(); await startActTimer(t.dataset.acttimer); }
      else if (t.dataset.scrtimer) { closeSheet(); await startScrTimer(t.dataset.scrtimer); }
      else if (t.dataset.caretimer) { closeSheet(); await startCareTimer(t.dataset.caretimer); }
    };
  } });
}
function openActivitySheet(item, kind0, pickDay) {
  let kind = item ? item.kind : kind0 || 'outdoors'; const who = whoChoices();
  let wi = Math.max(0, item ? who.findIndex((x) => x.name === item.srcName) : 0);
  openSheet(item ? 'Edit activity' : 'Add activity', `
    <div class="field"><span class="label">What</span><div class="chips" data-akinds>${Object.entries(ACT_KINDS).map(([k, v]) => `<button type="button" class="chip" data-ak="${k}" aria-pressed="${kind === k}"><span aria-hidden="true">${v.em}</span>${v.label}</button>`).join('')}</div></div>
    <div class="row2 field"><div><label class="label" for="ac-date">Date</label><input class="input" type="date" id="ac-date" max="${today()}" value="${esc(item ? item.date : today())}"></div>
      <div><label class="label" for="ac-mins">Minutes</label><input class="input" type="number" inputmode="numeric" min="1" max="720" id="ac-mins" value="${item && item.mins ? item.mins : ''}" placeholder="e.g. 45"></div></div>
    <p class="hint">Or enter a start and end time, and the minutes are worked out.</p>
    <div class="row2 field"><div><label class="label" for="ac-start">From</label><input class="input" type="time" id="ac-start" value="${esc(item ? item.time || '' : '')}"></div>
      <div><label class="label" for="ac-end">To</label><input class="input" type="time" id="ac-end" value="${esc(item ? item.end || '' : '')}"></div></div>
    ${who.length > 1 ? `<div class="field"><span class="label">Who</span><div class="chips" data-awho>${who.map((x, i) => `<button type="button" class="chip" data-aw="${i}" aria-pressed="${wi === i}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
    <div id="ac-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="ac-save">${item ? 'Save changes' : 'Add'}</button>
    ${item ? '<button type="button" class="btn danger block mt10" data-act="ac-del">Delete</button>' : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.ak) { kind = btn.dataset.ak; $$('[data-ak]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        if (btn.dataset.aw !== undefined) { wi = +btn.dataset.aw; $$('[data-aw]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        const done = () => { closeSheet(); renderActivityCard(); renderOutlook(); if (S.tab === 'insights') renderInsights(); };
        if (btn.dataset.act === 'ac-del' && item) { await deleteActivity(item); done(); toast('Deleted'); return; }
        if (btn.dataset.act !== 'ac-save') return;
        const msg = $('#ac-msg', b); const date = $('#ac-date', b).value; const from = $('#ac-start', b).value; const to = $('#ac-end', b).value;
        let mins = Math.round(+$('#ac-mins', b).value);
        if (!date) return showMsg(msg, 'warn', 'Choose a date.');
        if (date > today()) return showMsg(msg, 'warn', "The date can't be in the future.");
        if (from && to) { const a = toMs(date, from); let z = toMs(date, to); if (z <= a) z += 86400000; mins = Math.round((z - a) / 60000); }
        if (!(mins >= 1 && mins <= 720)) return showMsg(msg, 'warn', 'Add the minutes, or a start and end time.');
        const w = who[wi] || who[0];
        if (item) await saveActivity({ ...item, kind, mins, date, time: from, end: from && to ? to : '', tod: todOf(from), src: w.src, srcName: w.name, updatedAt: Date.now() });
        else await saveActivity(newActivity({ kind, mins, date, time: from, end: from && to ? to : '', src: w.src, srcName: w.name }));
        done(); toast(item ? 'Saved' : `Added ${mins} min`);
      };
    },
  });
}
// Insights: minutes by day, and who did them.
function activityInsightHTML() {
  if (isHelper()) return '';
  const list = activityEntries(); if (!list.length) return '';
  const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(today(), -i));
  const totals = days.map((d) => ({ d, ...moveTotals(list, d) }));
  const max = Math.max(60, ...totals.map((x) => x.moving));
  const min = (m) => (m >= 60 ? fmtDur(m) : `${Math.round(m)} min`);
  const rows = totals.slice().reverse().map((x) => `<div class="bar"><span>${esc(x.d === today() ? 'Today' : fmtDayShort ? fmtDayShort(x.d) : x.d)}</span><div class="track"><div class="fill" data-w="${x.moving ? Math.max(3, Math.round((x.moving / max) * 100)) : 0}"></div></div><span class="n time-n">${x.moving ? min(x.moving) : '–'}</span></div>`).join('');
  const recent = list.filter((e) => e.date >= days[0]); const by = new Map();
  recent.forEach((e) => { const k = srcLabel(e); by.set(k, (by.get(k) || 0) + (+e.mins || 0)); });
  const who = Array.from(by.entries()).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
  const avg = totals.reduce((t, x) => t + x.moving, 0) / 14;
  return `<div class="card"><h3 class="card-title">Outdoors and active play</h3>
    <p class="hint">Last 14 days: an average of ${min(avg)} a day (outdoors and active play together).</p>
    <div class="bars time-bars">${rows}</div>
    ${who.length > 1 ? `<h4 class="feel-sub">Who spent that time</h4><p class="hint">${who.map(([n, m]) => `${esc(n)} ${esc(min(m))}`).join(' · ')}</p>` : ''}</div>`;
}

// ---------------------------------------------------------------- screen time (shared)
// Minutes of screen time as small synced entries (cat 'screen'), kept out of History and the PDF. Video calls are logged but don't count toward the limit.
const SCR_KINDS = { show: { em: '📺', label: 'Shows' }, game: { em: '🎮', label: 'Games and apps' }, learn: { em: '📚', label: 'Learning' }, call: { em: '📞', label: 'Video calls' } };
const screenEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'screen' && e.date && SCR_KINDS[e.kind]);
function newScreen(f) {
  const now = Date.now();
  return { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'screen', title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me', kind: f.kind, mins: f.mins, date: f.date, time: f.time || '', end: f.end || '', tod: todOf(f.time) };
}
const cleanScrRun = (r) => (r && SCR_KINDS[r.kind] && +r.start > 0 && +r.start <= Date.now() + 60000 ? { kind: r.kind, start: +r.start, acc: Math.max(0, +r.acc || 0), resumedAt: +r.resumedAt || +r.start, paused: !!r.paused } : null);
const scrElapsed = (r) => r.acc + (r.paused ? 0 : Math.max(0, Date.now() - r.resumedAt));
export function renderScreenCard() {
  const box = $('#screen-card'); if (!box) return;
  if (isHelper() || cardHidden('screen')) { box.innerHTML = ''; return; }
  const t = today(); const all = screenEntries(); const tg = actTargets();
  const todays = all.filter((e) => e.date === t).sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.createdAt - a.createdAt);
  const counted = screenCounted(all, t); const min = (m) => (m >= 60 ? fmtDur(m) : `${Math.round(m)} min`);
  const limit = tg && tg.screenMax > 0 ? tg.screenMax : 0;
  const prog = limit ? `<div class="act-prog"><div class="act-head"><span>Screen time</span><span class="act-num">${min(counted)} of ${min(limit)}</span></div><div class="bar"><div class="track"><div class="fill${counted > limit ? ' over' : ''}" data-w="${Math.max(counted ? 3 : 0, Math.min(100, Math.round((counted / limit) * 100)))}"></div></div></div></div>`
    : `<p class="hint">${counted ? `${min(counted)} so far today.` : ''}${tg && tg.screenMax === 0 ? ' Guidelines suggest no screen time before age 2.' : !tg && !S.profile.childBirth ? ' Set your child\'s birth month in Settings for the daily guideline.' : ''}</p>`;
  const quick = `<div class="act-row"><span class="act-name">Add time</span><span class="act-btns">${[10, 20, 30].map((m) => `<button type="button" class="chip" data-scrq="${m}">+${m}</button>`).join('')}<button type="button" class="chip" data-scrother="1">Other</button></span></div>`;
  const rows = todays.map((e) => `<button type="button" class="time-row" data-scredit="${esc(e.id)}"><span><b>${SCR_KINDS[e.kind].em} ${SCR_KINDS[e.kind].label}</b><small>${e.kind === 'call' ? 'Not counted toward the limit' : 'Counts toward the limit'}${e.time ? ` · ${esc(fmtTime(e.time))}${e.end ? ` to ${esc(fmtTime(e.end))}` : ''}` : ''}</small></span><span class="dur">${min(e.mins)}</span></button>`).join('');
  const note = screenNote(tg, counted);
  const sum = counted ? (limit ? `${min(counted)} of ${min(limit)}` : `${min(counted)} so far`) : 'None logged today';
  box.innerHTML = foldCard('screen', 'Screen time', sum, `${prog}
    <p class="outlook-tip scr-note"${note ? '' : ' hidden'}>${esc(note)}</p>
    ${quick}${rows ? `<div class="act-list">${rows}</div>` : ''}
    <p class="hint">${tg && tg.screenMax ? `Based on the Australian 24-hour movement guidelines for ${esc(tg.label)}. ` : ''}Shared with everyone using this log. Time it from the timer card above. <button type="button" class="chip" data-scrother="1" data-scrday="1">Add for another day</button></p>`, false, 'act-card');
  applySizes(box);
  const refresh = () => { renderScreenCard(); if (S.tab === 'insights') renderInsights(); };
  box.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.scrq) { const m = +b.dataset.scrq; await saveActivity(newScreen({ kind: 'show', mins: m, date: today() })); refresh(); toast(`Added ${m} min`, { label: 'Undo', fn: async () => { const last = screenEntries().filter((e) => e.byDev === S.deviceId && e.kind === 'show' && e.mins === m).sort((a, c) => c.createdAt - a.createdAt)[0]; if (last) { await deleteActivity(last); refresh(); } } }); }
    else if (b.dataset.scrother) openScreenSheet(null);
    else if (b.dataset.scredit) { const e = S.entries.get(b.dataset.scredit); if (e) openScreenSheet(e); }
  };
}
function openScreenSheet(item) {
  let kind = item ? item.kind : 'show';
  openSheet(item ? 'Edit screen time' : 'Add screen time', `
    <div class="field"><span class="label">What</span><div class="chips">${Object.entries(SCR_KINDS).map(([k, v]) => `<button type="button" class="chip" data-sk="${k}" aria-pressed="${kind === k}"><span aria-hidden="true">${v.em}</span>${v.label}</button>`).join('')}</div></div>
    <div class="row2 field"><div><label class="label" for="sc-date">Date</label><input class="input" type="date" id="sc-date" max="${today()}" value="${esc(item ? item.date : today())}"></div>
      <div><label class="label" for="sc-mins">Minutes</label><input class="input" type="number" inputmode="numeric" min="1" max="720" id="sc-mins" value="${item && item.mins ? item.mins : ''}" placeholder="e.g. 30"></div></div>
    <p class="hint">Or enter a start and end time, and the minutes are worked out. Video calls are saved but not counted toward the limit.</p>
    <div class="row2 field"><div><label class="label" for="sc-start">From</label><input class="input" type="time" id="sc-start" value="${esc(item ? item.time || '' : '')}"></div>
      <div><label class="label" for="sc-end">To</label><input class="input" type="time" id="sc-end" value="${esc(item ? item.end || '' : '')}"></div></div>
    <div id="sc-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="sc-save">${item ? 'Save changes' : 'Add'}</button>
    ${item ? '<button type="button" class="btn danger block mt10" data-act="sc-del">Delete</button>' : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.sk) { kind = btn.dataset.sk; $$('[data-sk]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        const done = () => { closeSheet(); renderScreenCard(); if (S.tab === 'insights') renderInsights(); };
        if (btn.dataset.act === 'sc-del' && item) { await deleteActivity(item); done(); toast('Deleted'); return; }
        if (btn.dataset.act !== 'sc-save') return;
        const msg = $('#sc-msg', b); const date = $('#sc-date', b).value; const from = $('#sc-start', b).value; const to = $('#sc-end', b).value;
        let mins = Math.round(+$('#sc-mins', b).value);
        if (!date) return showMsg(msg, 'warn', 'Choose a date.');
        if (date > today()) return showMsg(msg, 'warn', "The date can't be in the future.");
        if (from && to) { const a = toMs(date, from); let z = toMs(date, to); if (z <= a) z += 86400000; mins = Math.round((z - a) / 60000); }
        if (!(mins >= 1 && mins <= 720)) return showMsg(msg, 'warn', 'Add the minutes, or a start and end time.');
        if (item) await saveActivity({ ...item, kind, mins, date, time: from, end: from && to ? to : '', tod: todOf(from), updatedAt: Date.now() });
        else await saveActivity(newScreen({ kind, mins, date, time: from, end: from && to ? to : '' }));
        done(); toast(item ? 'Saved' : `Added ${mins} min`);
      };
    },
  });
}
function screenInsightHTML() {
  if (isHelper()) return '';
  const list = screenEntries(); if (!list.length) return '';
  const tg = actTargets(); const limit = tg && tg.screenMax ? tg.screenMax : 0;
  const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(today(), -i));
  const per = days.map((d) => ({ d, m: screenCounted(list, d) }));
  const max = Math.max(limit || 60, ...per.map((x) => x.m)); const min = (m) => (m >= 60 ? fmtDur(m) : `${Math.round(m)} min`);
  const rows = per.slice().reverse().map((x) => `<div class="bar"><span>${esc(x.d === today() ? 'Today' : fmtDayShort(x.d))}</span><div class="track"><div class="fill${limit && x.m > limit ? ' over' : ''}" data-w="${x.m ? Math.max(3, Math.round((x.m / max) * 100)) : 0}"></div></div><span class="n time-n">${x.m ? min(x.m) : '–'}</span></div>`).join('');
  const recent = list.filter((e) => e.date >= days[0]); const byKind = {};
  recent.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + e.mins; });
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]);
  const over = limit ? per.filter((x) => x.m > limit).length : 0;
  const logged = per.filter((x) => x.m > 0).length;
  const avg = per.reduce((t, x) => t + x.m, 0) / 14;
  return `<div class="card"><h3 class="card-title">Screen time</h3>
    <p class="hint">Last 14 days: an average of ${min(avg)} a day${limit && logged ? `, over the guideline on ${over} of ${logged} logged day${logged === 1 ? '' : 's'}` : ''}.</p>
    <div class="bars time-bars">${rows}</div>
    ${kinds.length ? `<h4 class="feel-sub">What kind</h4><p class="hint">${kinds.map(([k, m]) => `${SCR_KINDS[k].label} ${esc(min(m))}`).join(' · ')}</p>` : ''}</div>`;
}

// Pure: for each tag, how the days with it were rated compared with the days without it (rated days only).
export function tagStats(ratings, tagMap) {
  const out = [];
  for (const t of DAYTAGS) {
    const w = []; const wo = [];
    for (const [d, r] of ratings) (tagMap.get(d) && tagMap.get(d).has(t.k) ? w : wo).push(r);
    if (w.length < 4 || wo.length < 4) continue;
    const mw = w.reduce((a, b) => a + b, 0) / w.length; const mo = wo.reduce((a, b) => a + b, 0) / wo.length;
    if (Math.abs(mw - mo) >= 0.4) out.push({ tag: t, withN: w.length, withoutN: wo.length, withAvg: mw, withoutAvg: mo, diff: mw - mo });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 4);
}

// ---------------------------------------------------------------- today's outlook
// A plain-rules heads-up at the top of the Log tab. It only uses what has been logged, compares with this
// child's own recent sleep, and always lists its reasons. It never predicts; it says "may".
export function outlook(all, nights, ratings, todayStr, nowHour, tagMap = new Map(), meds = {}, extra = {}) {
  const reasons = []; const tips = new Set();
  const byWake = new Map(nights.map((n) => [n.wakeDate, n]));
  const base = nights.filter((n) => n.wakeDate < todayStr && n.wakeDate >= addDays(todayStr, -15));
  const baseAvg = base.length >= 5 ? base.reduce((a, n) => a + n.mins, 0) / base.length : null;
  const last = byWake.get(todayStr);
  let strong = false;
  // The wording changes with the day, and notices what is carrying on from yesterday, so it reads as following their week.
  const pick = (arr) => arr[Array.from(todayStr).reduce((a, ch) => a + ch.charCodeAt(0), 0) % arr.length];
  const yNight = byWake.get(addDays(todayStr, -1));
  const yShort = !!(yNight && baseAvg != null && baseAvg - yNight.mins >= 45); const yBroken = !!(yNight && yNight.wakings >= 2);
  const todayShort = !!(last && baseAvg != null && baseAvg - last.mins >= 45);
  if (todayShort) {
    const lessBy = fmtDur(Math.round((baseAvg - last.mins) / 5) * 5);
    reasons.push(yShort
      ? pick([`A second shorter night in a row: ${fmtDur(last.mins)}, about ${lessBy} under their usual ${fmtDur(baseAvg)}.`, `Sleep was short again last night (${fmtDur(last.mins)}), after a short one the night before.`])
      : pick([`Last night was ${fmtDur(last.mins)}, about ${lessBy} less than their usual ${fmtDur(baseAvg)}.`, `A shorter night: ${fmtDur(last.mins)} against their usual ${fmtDur(baseAvg)}.`, `Sleep came in at ${fmtDur(last.mins)} last night, a little under their usual ${fmtDur(baseAvg)}.`]));
    tips.add(yShort ? 'Two short nights can add up. A slower morning, extra warning before switches and an earlier wind-down tonight may help, for you as well as them.' : 'A calmer start, a warning before each switch and a snack a bit earlier can help on short-sleep days. An earlier bedtime tonight may help too.'); strong = true;
  } else if (last && (yShort || yBroken) && !(last.wakings >= 2)) {
    reasons.push(pick(['Sleep is closer to their usual today after a rougher night. Yesterday\'s effects may be easing.', 'A steadier night than yesterday. If today feels a little easier, that may be why.']));
    tips.add('Keeping the evening routine steady can help this settle.');
  }
  if (last && last.wakings >= 2) {
    reasons.push(`${last.wakings === 2 ? 'Two' : last.wakings} night wake-ups last night${last.awake ? ` (about ${Math.round(last.awake)} min awake)` : ''}.`); strong = true;
    tips.add('Broken sleep can make transitions harder. Keep the morning simple where you can.');
  }
  if (baseAvg != null) {
    const recent = [1, 2, 3].map((i) => byWake.get(addDays(todayStr, -i))).filter(Boolean);
    const lowRun = recent.filter((n) => baseAvg - n.mins >= 30).length;
    if (recent.length >= 2 && lowRun >= 2 && !(last && baseAvg - last.mins >= 45)) { reasons.push(`Sleep has been below their usual on ${lowRun} of the last ${recent.length} nights.`); strong = true; tips.add('An earlier wind-down for a few nights is the simplest thing to try.'); }
  }
  const yd = ratings.get(addDays(todayStr, -1));
  const yd2 = ratings.get(addDays(todayStr, -2));
  if (yd != null && yd >= 2.5 && yd2 != null && yd2 >= 2.5) { reasons.push(pick(['A couple of bumpier days in a row, so today might want a little extra slack.', `Yesterday and the day before were both rated ${dayFeelWord(Math.max(yd, yd2))}.`])); tips.add('A bit of space in the plan, or a short break for you, can be worth it on a run like this. Ten minutes of one-on-one time before the first request can also help.'); }
  else if (yd != null && yd >= 2.5) { reasons.push(`Yesterday was rated ${dayFeelWord(yd)}.`); tips.add('Starting with 10 minutes of one-on-one time before the first request can help the day get going.'); }
  // Food is never assumed: only what has actually been logged shows, so no logging doesn't read as no eating.
  if (extra.eatLevel === 'low') { reasons.push('Eating has been on the low side today.'); tips.add('Small, easy snacks offered now and then can help, and low energy can make requests harder.'); }
  (extra.notes || []).forEach((n) => tips.add(n));
  if (meds.missed) { reasons.push(meds.missed === 1 ? 'A dose was missed today.' : 'Doses were missed today.'); tips.add('Noting how the day goes helps show whether it made a difference.'); }
  else if (meds.late) reasons.push('A dose was given late today.');
  const tt = tagMap.get(todayStr) || new Set();
  if (tt.has('unwell')) { reasons.push('Marked unwell today.'); tips.add('Unwell days are usually harder. Keeping requests few and simple can help.'); strong = true; }
  if (tt.has('changed')) { reasons.push('Routine changed today.'); tips.add('Extra warning before each switch can help when the routine is different.'); }
  const tagDays = Array.from(tagMap.keys()).filter((d) => d >= addDays(todayStr, -14) && d < todayStr).length;
  if (tagDays >= 4 && nowHour >= 16 && !tt.has('connect')) { reasons.push('No one-on-one time logged yet today.'); tips.add('Even 10 minutes of one-on-one time before the evening routine can help.'); }
  if (!reasons.length) return null;
  return { level: strong || reasons.length >= 2 ? 'harder' : 'note', reasons, tips: Array.from(tips).slice(0, 2) };
}
function renderOutlook() { renderOutlookInner(); const k = $('#know-sec'); const oc = $('#outlook-card'); if (k && oc) k.hidden = !oc.innerHTML.trim(); }
function renderOutlookInner() {
  const box = $('#outlook-card'); if (!box) return;
  const off = !!(S.outlook && S.outlook.off) || (S.outlook && S.outlook.hideDay === today());
  if (isHelper() || off) { box.innerHTML = ''; return; }
  const all = live();
  const o = outlook(all, sleepNights(all), dayRatings(dayfeelEntries()), today(), new Date().getHours(), dayTagMap(tagSource()), { missed: medDoses().filter((d) => d.date === today() && d.status === 'missed').length, late: medDoses().filter((d) => d.date === today() && d.status === 'late').length }, { eatLevel: eatLevel(Array.from(S.entries.values()), today()), notes: withNotes(Array.from(S.entries.values()), today(), (d, n) => addDays(d, -n), (dayRatings(dayfeelEntries()).get(addDays(today(), -1)) || 0) >= 2.5) });
  if (!o) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card outlook ${o.level}" role="region" aria-label="Today's outlook">
    <h3 class="card-title">${o.level === 'harder' ? 'Today may be a bit harder' : 'Worth knowing today'}</h3>
    <ul class="outlook-list">${o.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${o.tips.length ? `<p class="outlook-tip"><b>Might help:</b> ${esc(o.tips[0])}</p>${o.tips.length > 1 ? `<details class="outlook-more"><summary>More ideas</summary><p class="outlook-tip">${o.tips.slice(1).map(esc).join(' ')}</p></details>` : ''}` : ''}
    <p class="hint outlook-foot">Based only on what's been logged, so it can miss things. It isn't a prediction. <button type="button" class="link-btn" data-act="outlook-hide">Hide for today</button> · <button type="button" class="link-btn" data-act="outlook-off">Turn off</button></p></div>`;
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'outlook-hide') S.outlook = { ...(S.outlook || {}), hideDay: today() };
    else if (a.dataset.act === 'outlook-off') { S.outlook = { ...(S.outlook || {}), off: true }; toast("Turned off. You can turn it back on in Settings."); }
    else return;
    await kvSet('outlook', S.outlook); renderOutlook();
  };
}

// Pure: compares nights of sleep with how the following days felt.
export function dayFeelStats(ratings, nights, todayStr) {
  const byWake = new Map(nights.map((n) => [n.wakeDate, n]));
  const rows = [];
  for (const [d, r] of ratings) { const n = byWake.get(d); if (n) rows.push({ d, r, n }); }
  const avg = (a, f) => (a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : null);
  const mk = (a) => (a.length ? { n: a.length, sleep: avg(a, (x) => x.n.mins), bed: clockAvg(a.map((x) => x.n.bed), true), rating: avg(a, (x) => x.r) } : null);
  const easy = rows.filter((x) => x.r <= 2); const hard = rows.filter((x) => x.r >= 3);
  const out = { rated: ratings.size, paired: rows.length, easy: mk(easy), hard: mk(hard), enough: easy.length >= 4 && hard.length >= 4 };
  // Easiest stretch: the 14-day window with the lowest average rating (at least 7 rated days), compared with the last 14 days.
  const days = Array.from(ratings.keys()).sort();
  let best = null;
  for (const start of days) {
    const end = addDays(start, 13); if (end > todayStr) continue;
    const inWin = days.filter((d) => d >= start && d <= end);
    if (inWin.length < 7) continue;
    const mean = inWin.reduce((a, d) => a + ratings.get(d), 0) / inWin.length;
    if (!best || mean < best.mean - 1e-9) best = { start, end, mean, n: inWin.length };
  }
  const winStats = (a, b) => {
    const rs = days.filter((d) => d >= a && d <= b); const ns = nights.filter((n) => n.wakeDate >= a && n.wakeDate <= b);
    return { rated: rs.length, rating: rs.length ? rs.reduce((x, d) => x + ratings.get(d), 0) / rs.length : null, nights: ns.length, sleep: avg(ns, (n) => n.mins), bed: ns.length ? clockAvg(ns.map((n) => n.bed), true) : null };
  };
  const recentStart = addDays(todayStr, -13);
  if (best && best.end < recentStart) {
    out.best = { ...best, ...winStats(best.start, best.end) };
    out.recent = winStats(recentStart, todayStr);
    if (out.best.nights < 5 || out.recent.nights < 5 || out.recent.rated < 5) { out.best = null; out.recent = null; }
  }
  return out;
}
function dayFeelWord(r) { return r < 1.5 ? 'calm and easy' : r < 2.5 ? 'mostly fine' : r < 3.5 ? 'bumpy' : 'hard'; }
const minsOfClock = (t) => { const [h, m] = t.split(':').map(Number); let v = h * 60 + m; if (v < 720) v += 1440; return v; };
const isHelper = () => S.role === 'helper';
const homeSrc = () => (isHelper() ? 'family' : 'parent');
const syncOn = () => !!(isHelper() ? S.fam : S.sync);
function sortEntries(list) {
  return list.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1)
    : (TOD_RANK[b.tod] ?? 0) - (TOD_RANK[a.tod] ?? 0) || String(b.time || '').localeCompare(String(a.time || '')) || (b.createdAt || 0) - (a.createdAt || 0)));
}

// ---------------------------------------------------------------- toast & sheet
let toastTimer = null;
function toast(msg, action) {
  const t = $('#toast'); const btn = $('#toast-action');
  $('#toast-text').textContent = msg;
  if (action) { btn.hidden = false; btn.textContent = action.label; btn.onclick = () => { t.classList.remove('show'); action.fn(); }; } else { btn.hidden = true; btn.onclick = null; }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}
// A row of jump links at the top of Settings, so each part is one tap away.
const SET_GROUPS = [['Your child', 'Child'], ['You', 'You'], ['Family and carers', 'People'], ['People', 'People'], ['Medicines', 'Medicines'], ['Sync', 'Sync'], ['Backup file', 'Backup'], ['Feedback', 'Feedback'], ['Privacy', 'Privacy']];
function addSettingsJump(body) {
  const secs = Array.from(body.querySelectorAll('.set-section > h3')); const seen = new Set(); const links = [];
  secs.forEach((h, i) => { const g = SET_GROUPS.find(([t]) => h.textContent.trim().startsWith(t)); if (!g || seen.has(g[1])) return; seen.add(g[1]); h.id = `set-sec-${i}`; links.push([h.id, g[1]]); });
  if (links.length < 3) return;
  const nav = document.createElement('div'); nav.className = 'chips set-jump'; nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', 'Jump to');
  nav.innerHTML = links.map(([id, l]) => `<button type="button" class="chip" data-jump="${id}">${esc(l)}</button>`).join('');
  nav.addEventListener('click', (ev) => { const b = ev.target.closest('[data-jump]'); const t = b && document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ block: 'start' }); });
  body.insertBefore(nav, body.firstChild);
}
function openSheet(title, html, { full = false, onMount } = {}) {
  restoreSheetCard();
  $('#sheet-title').textContent = title;
  const sheet = $('#sheet'); sheet.classList.toggle('full', full);
  const body = $('#sheet-body'); body.innerHTML = html; body.scrollTop = 0;
  if (title === 'Settings') addSettingsJump(body);
  body.onclick = null; body.oninput = null; body.onchange = null; body.onsubmit = null;
  $('#sheet-wrap').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(body);
}
function closeSheet() {
  restoreSheetCard();
  $('#sheet-wrap').classList.remove('open');
  $('#sheet-body').innerHTML = '';
  document.body.style.overflow = '';
}
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; } else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function showMsg(el, kind, html) { if (!el) return; el.className = `notice ${kind}`; el.innerHTML = html; el.hidden = false; }

// ---------------------------------------------------------------- screens
function show(screen) { $('#app').dataset.screen = screen; }

function showMain(opts = {}) {
  show('main');
  $('#app').dataset.role = isHelper() ? 'helper' : 'parent';
  renderHeader();
  renderDayCard();
  renderActivityCard();
  renderScreenCard();
  renderTallyCard();
  renderMedsCard();
  renderOutlook();
  renderTimerCard();
  renderHomeCards();
  renderWithCard(); renderEatCard(); renderBreakdownCard();
  renderToday();
  mountLogForm();
  switchTab(S.tab);
  updateSyncPill();
  if (syncOn() && opts.sync !== false) runSync();
}

function renderHeader() {
  const n = S.profile.childName;
  if (isHelper()) { $('#child-line').textContent = `${n ? `For ${n}` : 'Family log'} · ${S.myName || 'Family'}`; return; }
  $('#child-line').textContent = n ? `${possessive(n)} journal` : 'Add your child\'s name in Settings';
}

export function switchTab(tab) {
  if (isHelper() && tab !== 'today' && tab !== 'log' && tab !== 'history') tab = 'today';
  if (tab !== 'time') clearInterval(careTick);
  if (tab === 'history' && S.tab !== 'history') S.hist.days = S.track.histAll ? 100000 : 1;
  S.tab = tab;
  if (tab === 'log') refreshFormClock();
  $$('.tabbar [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  renderTab();
  window.scrollTo({ top: 0 });
}
function renderTab() {
  if (S.tab === 'history') renderHistory();
  else if (S.tab === 'insights') renderInsights();
  else if (S.tab === 'export') renderExport();
  else if (S.tab === 'time') renderTime();
  else if (S.tab === 'today') renderToday();
}
function renderDependent() { renderHeader(); renderTab(); renderDayCard(); renderActivityCard(); renderScreenCard(); renderTallyCard(); renderMedsCard(); renderOutlook(); renderTimerCard(); renderHomeCards(); renderWithCard(); renderEatCard(); renderBreakdownCard(); renderToday(); }

// ---------------------------------------------------------------- entry form
// ---- people (shared): partner, carers, family. Stored in the shared profile so every phone sees the same list.
const PEOPLE_ROLES = [['parent', '👤', 'Parent'], ['family', '👪', 'Family'], ['carer', '🤲', 'Carer'], ['teacher', '🏫', 'Teacher or daycare'], ['other', '💬', 'Other']];
const PEOPLE_ROLE = Object.fromEntries(PEOPLE_ROLES.map(([k, em, l]) => [k, { em, label: l }]));
export function cleanPeople(m) {
  const out = {};
  Object.keys(m && typeof m === 'object' ? m : {}).sort().forEach((id) => {
    const x = m[id]; if (!/^[a-f0-9]{8,40}$/.test(id) || !x || typeof x !== 'object') return;
    const name = String(x.name || '').trim().slice(0, 40); if (!name) return;
    out[id] = { name, role: PEOPLE_ROLE[x.role] ? x.role : 'other', removed: !!x.removed, updatedAt: +x.updatedAt || 0 };
  });
  return out;
}
export function mergePeople(a, b) {
  const o = cleanPeople(a); const r = cleanPeople(b);
  for (const id of Object.keys(r)) if (!o[id] || r[id].updatedAt > o[id].updatedAt) o[id] = r[id];
  return o;
}
const peopleList = (all) => Object.entries(cleanPeople(S.profile.people)).filter(([, x]) => all || !x.removed).sort((a, b) => a[1].name.localeCompare(b[1].name));
async function savePeople(map) { S.profile = { ...S.profile, people: cleanPeople(map), updatedAt: Date.now() }; await kvSet('profile', S.profile); scheduleSync(300); }
function parentNames(extra) {
  const names = [];
  const add = (n) => { n = String(n || '').trim(); if (n && !names.includes(n)) names.push(n); };
  add(S.myName || 'Me');
  Object.values(S.members).sort((a, b) => (b.at || 0) - (a.at || 0)).forEach((m) => add(m.name));
  if (!isHelper()) peopleList(false).filter(([, x]) => x.role === 'parent').forEach(([, x]) => add(x.name));
  if (names.length === 1) add('Partner');
  add(extra);
  return names;
}

function formHTML(st, e, mode) {
  const uid = mode === 'edit' ? 'ed' : 'lg';
  const meta = mode === 'edit' ? `<p class="hint">Added by ${esc(e.by || 'someone')}${e.createdAt ? ' on ' + esc(new Date(e.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })) : ''}${e.editedBy ? `. Last changed by ${esc(e.editedBy)}.` : '.'}</p>` : '';
  return `
  <div class="row2 field">
    <div><label class="label" for="${uid}-date">Date</label><input class="input" type="date" id="${uid}-date" data-f="date" max="${today()}" value="${esc(e.date || today())}"></div>
    <div><label class="label" for="${uid}-time" data-timelabel>Time</label><input class="input" type="time" id="${uid}-time" data-x="time" value="${esc(st.extra.time || '')}"></div>
  </div>
  <div class="field" data-todwrap>
    <label class="label" for="${uid}-tod">Time of day</label><select class="select" id="${uid}-tod" data-f="tod">${TODS.map((t) => `<option value="${t.k}">${t.em} ${t.k}</option>`).join('')}</select>
    <p class="hint">No exact time? Choose roughly when it happened, or add the time above.</p>
  </div>
  <div class="field">
    <span class="label" id="${uid}-catl">Area</span>
    <div class="cat-grid" role="group" aria-labelledby="${uid}-catl">${CATS.filter((c) => mode === 'edit' || st.cat === c.k || !S.track.hideCats.includes(c.k)).map((c) => `<button type="button" class="cat-btn" data-cat="${c.k}" aria-pressed="${st.cat === c.k}"><span class="em" aria-hidden="true">${c.em}</span>${c.label}</button>`).join('')}</div>
  </div>
  <div class="extra" data-extra hidden></div>
  <div class="field">
    <span class="label" id="${uid}-srcl">Seen or reported by</span>
    <div class="chips" role="group" aria-labelledby="${uid}-srcl" data-srcs>${sourceChipsHTML(st)}</div>
  </div>
  <div class="field"><label class="label" for="${uid}-title" data-titlelabel>What happened?</label><input class="input" id="${uid}-title" data-f="title" maxlength="160" autocomplete="off" enterkeyhint="next" value="${esc(e.title || '')}"></div>
  <div class="field"><label class="label" for="${uid}-notes">Notes</label><textarea class="textarea" id="${uid}-notes" data-f="notes" placeholder="What was happening before? How long did it last? What helped?">${esc(e.notes || '')}</textarea></div>
  <div class="field" data-sevwrap>
    <span class="label" id="${uid}-sevl" data-sevlabel>Concern level</span>
    <div class="sev-row" role="group" aria-labelledby="${uid}-sevl">${[1, 2, 3].map((n) => `<button type="button" class="sev-btn" data-sev="${n}" aria-pressed="${st.sev === n}"><span class="sw" aria-hidden="true"></span>${SEV[n]}</button>`).join('')}</div>
  </div>
  <button class="btn primary block" type="button" data-act="save-entry">${mode === 'edit' ? 'Save changes' : 'Save entry'}</button>
  ${mode === 'edit' ? `<button class="btn ghost block mt10" type="button" data-act="repeat-entry">Log this again</button><button class="btn danger block mt10" type="button" data-act="delete-entry">Delete entry</button>${meta}` : ''}`;
}

function sourceChipsHTML(st) {
  const chip = (src, name, em, label, on) => `<button type="button" class="chip" data-src="${src}"${name ? ` data-name="${esc(name)}"` : ''} aria-pressed="${on}"><span aria-hidden="true">${em}</span>${esc(label)}</button>`;
  const rest = (skip) => SOURCES.filter((s) => !skip.includes(s.k)).map((s) => chip(s.k, '', s.em, s.label, st.src === s.k && !st.srcName)).join('');
  if (isHelper()) { const me = S.myName || 'Me'; return chip('family', me, SRC.family.em, me, st.src === 'family') + rest(['parent', 'family']); }
  const parentChips = parentNames(st.src === 'parent' ? st.srcName : '').map((n) => chip('parent', n, '👤', n, st.src === 'parent' && st.srcName === n)).join('');
  const people = peopleList(false).filter(([, x]) => x.role !== 'parent');
  const named = new Set(people.map(([, x]) => x.name));
  const fam = st.src === 'family' && !named.has(st.srcName) ? st.srcName : '';
  const personChips = people.map(([, x]) => chip(x.role, x.name, PEOPLE_ROLE[x.role].em, x.name, st.src === x.role && st.srcName === x.name)).join('');
  return parentChips + personChips + chip('family', fam, SRC.family.em, fam || SRC.family.label, st.src === 'family' && !named.has(st.srcName)) + rest(['parent', 'family']);
}
function refreshSourceChips(el) {
  if (!el || !el._st) return;
  const box = $('[data-srcs]', el); if (box) box.innerHTML = sourceChipsHTML(el._st);
}

function detailFormHTML(st, inp) {
  const spec = DETAILS[st.cat]; const cur = st.dt || {};
  const groups = spec.groups.map((g) => `<div class="field"><span class="label">${esc(g.l)}</span><div class="chips" role="group" aria-label="${esc(g.l)}">${g.opts.map((o, i) => `<button type="button" class="chip" data-dt="${g.f}|${i}" aria-pressed="${cur[g.f] === o}">${esc(o)}</button>`).join('')}</div></div>`).join('');
  const nums = spec.nums.length ? `<div class="row2">${spec.nums.map((n) => inp(n.f, n.l, `inputmode="decimal" placeholder="${esc(n.ph)}"`)).join('')}</div>` : '';
  return `${groups}${nums}<p class="hint">All optional. Tap a chip again to clear it. Patterns and gentle ideas appear in Insights.</p>`;
}
function renderExtra(el) {
  const st = el._st; const x = st.extra; const box = $('[data-extra]', el);
  const uid = st.mode === 'edit' ? 'ed' : 'lg';
  const inp = (f, label, attrs = '') => `<div class="field"><label class="label" for="${uid}-x-${f}">${label}</label><input class="input" id="${uid}-x-${f}" data-x="${f}" value="${esc(x[f] || '')}" autocomplete="off" ${attrs}></div>`;
  let html = '';
  if (DETAILS[st.cat]) html = detailFormHTML(st, inp);
  else if (st.cat === 'health') html = `<div class="row2">${inp('temp', 'Temperature (°C)', 'inputmode="decimal" placeholder="e.g. 38.2"')}</div>`;
  else if (st.cat === 'growth') html = `<div class="row2">${inp('height', 'Height (cm)', 'inputmode="decimal" placeholder="e.g. 104.5"')}${inp('weight', 'Weight (kg)', 'inputmode="decimal" placeholder="e.g. 17.2"')}</div><p class="hint">Either one is fine. Measuring without shoes, in light clothes, at about the same time of day keeps results comparable.</p>`;
  else if (ITEM_LABEL[st.cat] && st.mode === 'new' && st.batch.length >= 2) html = `${savedHTML(st)}${batchHTML(st, uid)}`;
  else if (st.cat === 'medication') html = `${savedHTML(st)}${inp('med', 'Medicine', 'placeholder="e.g. Paracetamol"')}${inp('dose', 'Dose', 'placeholder="e.g. 7.5 mL"')}${contentsHTML(st, uid)}`;
  else if (st.cat === 'supplement' && st.product && PRODUCTS[st.product]) html = productFormHTML(st, uid, inp);
  else if (st.cat === 'supplement') html = `${savedHTML(st)}${readyHTML()}${inp('med', 'Supplement', 'placeholder="e.g. Kids multivitamin gummy"')}${inp('dose', 'Amount given', 'placeholder="e.g. 2 gummies"')}${contentsHTML(st, uid)}`;
  else if (st.cat === 'bloodtest') html = labFormHTML(st, uid);
  else if (st.cat === 'sleep') {
    const k = st.sleepKind;
    const quick = st.mode === 'new' ? `<button type="button" class="btn dark block quick-wake" data-act="quick-wake"><span aria-hidden="true">🌙</span> Log a night wake-up now</button>
      <p class="hint quick-hint">One tap saves a ${QUICK_AWAKE} minute wake-up at the current time, or at the date and time you set on this form. Tap it in History to change the details.</p>` : '';
    const hint = { bed: "Pairs with the next wake-up to work out the night's sleep.", wake: "Pairs with last night's sleep time to work out how long they slept.", waking: "Time awake is taken off the night's total." }[k];
    html = `${quick}<span class="label">${quick ? 'Or choose what this entry is' : 'This entry is'}</span>
      <div class="chips">${SLEEP_KINDS.map(([v, em, l]) => `<button type="button" class="chip solid" data-kind="${v}" aria-pressed="${k === v}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div>
      ${k === 'waking' ? `<div class="row2 mt14">${inp('awake', 'Awake for (minutes)', `inputmode="numeric" maxlength="9" placeholder="${QUICK_AWAKE}"`)}</div>` : '<div class="mt10"></div>'}
      ${hint ? `<p class="hint sleep-hint">${hint}</p>` : ''}`;
  }
  if (ITEM_LABEL[st.cat]) html += '<div data-check></div>';
  box.innerHTML = html; box.hidden = !html;
  if (ITEM_LABEL[st.cat]) refreshCheck(el);
  // The exact-time field sits above this block; keep it in step with any time set here.
  const mt = $('[data-timelabel] + input', el);
  if (mt && mt.value !== (st.extra.time || '')) mt.value = st.extra.time || '';
  syncTimeBits(el);
}
// ---------------------------------------------------------------- supplement check (see nutrients.js)
const nrvAge = () => (AGE_GROUPS[S.profile.nrvAge] ? S.profile.nrvAge : '4-8');
const stdUnits = (key) => standardUnits(key, nrvAge());
const fullContents = (e) => (e.product && PRODUCTS[e.product] ? scaledNutrients(e.product, +e.units || stdUnits(e.product), false) : e.contents);
function checkEntriesFor(date, excludeId) {
  return live().filter((e) => e.date === date && ITEM_LABEL[e.cat] && e.id !== excludeId).map((e) => ({ ...e, contents: fullContents(e) }));
}
function pendingEntries(el) {
  const st = el._st; if (!ITEM_LABEL[st.cat]) return [];
  const date = $('[data-f="date"]', el).value || today();
  const time = String(st.extra.time || '').trim();
  const base = { date, time, tod: time ? todForTime(time) : $('[data-f="tod"]', el).value, cat: st.cat, _pending: true };
  const one = (med, dose, contents, product, units) => {
    if (product && PRODUCTS[product]) {
      const u = parseFloat(String(units || stdUnits(product)).replace(',', '.')) || 0;
      return { ...base, med, product, units: u, dose: productDose(product, u), contents: u > 0 ? scaledNutrients(product, u, false) : [] };
    }
    return { ...base, med, dose, contents: (contents || []).filter((c) => c && String(c.name || '').trim()) };
  };
  if (st.mode === 'new' && st.batch.length >= 2) return st.batch.map((b) => one(b.med, b.dose, b.contents, b.product, b.units));
  if (!String(st.extra.med || '').trim() && !st.product) return [];
  return [one(st.extra.med || PRODUCTS[st.product].name, st.extra.dose, st.contents, st.product, st.units)];
}
function dayWord(date) { return date === today() ? 'today' : `on ${fmtDayShort(date)}`; }
function checkHTML(res, o) {
  const age = AGE_GROUPS[nrvAge()];
  const flagged = res.totals.filter((t) => t.level !== 'ok').sort((a, b) => b.pct - a.pct);
  const pairs = o.pendingOnly ? res.pairs.filter((p) => p.pending) : res.pairs;
  const lines = [];
  for (const t of flagged) {
    lines.push(`<div class="chk ${t.level}"><b>${t.level === 'over' ? '↑ ' : ''}${esc(t.label)}: ${fmtNum(t.total)} ${t.unit}</b> ${t.level === 'over' ? 'is above' : 'is close to'} the upper level of ${fmtNum(t.ul)} ${t.unit} a day for ${age}.
      <small>${t.parts.map((p) => `${esc(p.src)} ${fmtNum(p.amount)} ${t.unit}${p.detail ? ` (${esc(p.detail)})` : ''}`).join(', ')}</small></div>`);
  }
  const seen = new Set();
  for (const p of pairs) {
    const k = `${p.type}|${p.a}|${p.b}`; if (seen.has(k)) continue; seen.add(k);
    if (p.type === 'iron-calcium') lines.push(`<div class="chk near"><b>Iron and calcium close together.</b> ${esc(p.a)} and ${esc(p.b)} are less than 2 hours apart. Calcium, including milk and PediaSure, can reduce how much iron is absorbed, so health services suggest giving iron at least 2 hours apart from them.</div>`);
    else lines.push(`<div class="chk near"><b>Iron and zinc close together.</b> ${esc(p.a)} and ${esc(p.b)} are less than 2 hours apart. Iron can reduce how much zinc is absorbed when they're given together.</div>`);
  }
  if (o.pendingOnly && res.tipIron) lines.push('<div class="chk tip">Tip: iron is absorbed better with vitamin C, such as a little orange juice, and away from milk.</div>');
  if (!res.totals.length && !lines.length && !res.unknown.length) return '';
  if (!flagged.length && !pairs.length && res.totals.length) lines.unshift(`<div class="chk ok">✓ Nothing logged ${esc(dayWord(o.date))} is near an upper level for ${age}.</div>`);
  if (res.unknown.length) lines.push(`<div class="chk muted">Not counted: ${res.unknown.map(esc).join(', ')}. Add the strength under "What's in it" to include ${res.unknown.length > 1 ? 'them' : 'it'}.</div>`);
  const all = res.totals.length ? `<details class="chk-all"><summary>All nutrients ${esc(dayWord(o.date))}</summary>${res.totals.map((t) => `<div class="nutri-row"><span>${esc(t.label)}</span><b>${fmtNum(t.total)} ${t.unit} <small>of ${fmtNum(t.ul)} (${Math.round(t.pct)}%)</small></b></div>`).join('')}</details>` : '';
  return `<div class="scheck">${o.title === false ? '' : `<span class="label">Supplement check ${esc(dayWord(o.date))}</span>`}${lines.join('')}${all}
    <p class="hint">${isHelper() ? `Counts only the supplements and medicines you've logged here, not what ${esc(S.profile.childName || 'your child')}'s parents have logged, and not food.` : 'Counts supplements and medicines logged in Little One, not food.'} Upper levels are from Australia's Nutrient Reference Values for everyday intake (${age}). A doctor may prescribe more on purpose, such as iron for low ferritin, so follow their advice, and ask your GP or pharmacist if you're unsure.</p></div>`;
}
function refreshCheck(el) {
  const box = $('[data-check]', el); if (!box) return;
  const st = el._st; const date = $('[data-f="date"]', el).value || today();
  const res = dayCheck([...checkEntriesFor(date, st.id), ...pendingEntries(el)], nrvAge());
  box.innerHTML = checkHTML(res, { date, pendingOnly: true });
}
let checkTimer = null;
function scheduleCheck(el) { clearTimeout(checkTimer); checkTimer = setTimeout(() => refreshCheck(el), 250); }
function dayIssues(date) {
  const res = dayCheck(checkEntriesFor(date, null), nrvAge());
  return { res, issue: res.totals.some((t) => t.level !== 'ok') || res.pairs.length > 0, over: res.totals.some((t) => t.level === 'over') };
}
function suppCheckCardHTML(list) {
  const dates = Array.from(new Set(list.filter((e) => ITEM_LABEL[e.cat]).map((e) => e.date))).sort().reverse();
  if (!dates.length) return '';
  const days = dates.map((d) => ({ d, ...dayIssues(d) }));
  if (!days.some((x) => x.res.totals.length)) return '';
  const bad = days.filter((x) => x.issue);
  const age = AGE_GROUPS[nrvAge()];
  const summary = (x) => [
    ...x.res.totals.filter((t) => t.level !== 'ok').map((t) => `${t.label} ${t.level === 'over' ? 'above' : 'close to'} the upper level (${fmtNum(t.total)} ${t.unit})`),
    ...Array.from(new Set(x.res.pairs.map((p) => (p.type === 'iron-calcium' ? 'iron within 2 hours of calcium' : 'iron within 2 hours of zinc')))),
  ].join('; ');
  return `<div class="card"><h3 class="card-title">Supplement check</h3>
    ${bad.length ? `<p class="hint intro">${bad.length} of ${days.length} day${days.length > 1 ? 's' : ''} with supplements or medicines had something to look at (${age}). Tap a day for details.</p>
      ${bad.slice(0, 6).map((x) => `<button type="button" class="chk-day" data-check-day="${x.d}"><b>${esc(fmtDayShort(x.d))}</b><span>${esc(summary(x))}</span></button>`).join('')}`
      : `<div class="chk ok">✓ On the ${days.length} day${days.length > 1 ? 's' : ''} with supplements or medicines in this period, nothing went above or near an upper level for ${age}, and iron wasn't given within 2 hours of calcium or zinc.</div>`}
    <p class="hint">Counts what's logged in Little One, not food.</p></div>`;
}
function openDayCheck(date) {
  const { res } = dayIssues(date);
  openSheet(`Supplement check, ${fmtDayShort(date)}`, checkHTML(res, { date, title: false }) || '<p class="hint">Nothing to check for this day.</p>');
}

// Ready-made products (see products.js): nutrition comes from the label and scales with the amount given.
function readyHTML(cur) {
  return `<div class="ready"><span class="label">Ready-made</span><div class="chips">${Object.entries(PRODUCTS).map(([k, p]) => `<button type="button" class="chip${cur ? ' solid' : ''}" data-product="${k}"${cur ? ` aria-pressed="${k === cur}"` : ''}><span aria-hidden="true">${p.em || '🥛'}</span> ${esc(p.name)}</button>`).join('')}</div>
    ${cur ? '' : '<p class="hint">Fills in the nutrition from the label, scaled to the amount given.</p>'}</div>`;
}
const nutriRows = (rows) => rows.map((r) => `<div class="nutri-row"><span>${esc(r.name)}</span><b>${esc(r.amount)}</b></div>`).join('');
function unitsHint(p, u) {
  return `${esc(p.serveText)}.${u > 0 && p.mlPerUnit ? ` ${fmtAmount(u)} ${u === 1 ? p.unit : p.units} makes about ${fmtAmount(u * p.mlPerUnit)} mL.` : ''}`;
}
function productFormHTML(st, uid, inp) {
  const p = PRODUCTS[st.product]; const u = parseFloat(String(st.units).replace(',', '.')) || 0;
  const cap = p.units.charAt(0).toUpperCase() + p.units.slice(1);
  return `${savedHTML(st)}${Object.keys(PRODUCTS).length > 1 ? readyHTML(st.product) : ''}
    ${inp('med', ITEM_LABEL[st.cat], '')}
    <div class="row2">
      <div><label class="label" for="${uid}-units">${cap} given</label>
        <div class="stepper"><button type="button" class="step" data-act="units-minus" aria-label="One ${p.unit} less">−</button><input class="input" id="${uid}-units" data-units inputmode="decimal" maxlength="5" value="${esc(st.units)}"><button type="button" class="step" data-act="units-plus" aria-label="One ${p.unit} more">+</button></div>
      </div>
    </div>
    <p class="hint units-hint" data-units-hint>${unitsHint(p, u)}</p>
    <span class="label">Nutrition in this amount</span>
    <div class="nutri" data-nutri>${nutriRows(u > 0 ? scaledNutrients(st.product, u, true) : [])}</div>
    <details class="howto nutri-full"><summary>Full nutrition panel for this amount</summary><div class="nutri" data-nutri-full>${nutriRows(u > 0 ? scaledNutrients(st.product, u, false) : [])}</div></details>
    <p class="hint">From ${esc(p.source)}. ${esc(p.check || 'Check it against the label.')}</p>
    <button type="button" class="linkish" data-act="product-off">Enter the ingredients myself instead</button>`;
}
function refreshProduct(el) {
  const st = el._st; const p = PRODUCTS[st.product]; if (!p) return;
  const u = parseFloat(String(st.units).replace(',', '.')) || 0;
  if (u > 0) st.extra.dose = productDose(st.product, u);
  const set = (sel, html) => { const n = $(sel, el); if (n) n.innerHTML = html; };
  set('[data-nutri]', nutriRows(u > 0 ? scaledNutrients(st.product, u, true) : []));
  set('[data-nutri-full]', nutriRows(u > 0 ? scaledNutrients(st.product, u, false) : []));
  set('[data-units-hint]', unitsHint(p, u));
}
function useProduct(el, key, units) {
  const st = el._st; const p = PRODUCTS[key];
  st.product = key; st.productOff = false; st.units = String(units || stdUnits(key)); st.contents = [];
  if (!String(st.extra.med || '').trim() || productFor(st.extra.med) !== key) st.extra.med = p.name;
  st.extra.dose = productDose(key, parseFloat(st.units));
  if (!st.extra.time && st.mode === 'new') st.extra.time = nowHHMM();
}

// Ingredients in a product (e.g. a multivitamin gummy with vitamin D and iron), each with its strength from the label.
function contentsHTML(st, uid) {
  const what = ITEM_LABEL[st.cat].toLowerCase();
  const rows = st.contents.map((c, i) => `
    <div class="content-row">
      <input class="input" id="${uid}-c${i}-name" data-c="${i}" data-cf="name" value="${esc(c.name)}" placeholder="e.g. Vitamin D" aria-label="Ingredient" autocomplete="off" maxlength="40">
      <input class="input" id="${uid}-c${i}-amount" data-c="${i}" data-cf="amount" value="${esc(c.amount)}" placeholder="e.g. 10 µg" aria-label="Strength" autocomplete="off" maxlength="20">
      <button type="button" class="icon-btn" data-cdel="${i}" aria-label="Remove ${esc(c.name || 'this ingredient')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>`).join('');
  return `<div class="contents">
    <span class="label">What's in it (optional)</span>
    ${rows ? `<div class="content-head" aria-hidden="true"><span>Ingredient</span><span>Strength</span><span></span></div>${rows}<p class="hint content-hint">Strength as printed on the label, per gummy, drop or tablet. For liquids, enter the strength in the amount given.</p>` : `<p class="hint content-hint">For products with more than one ingredient, like a multivitamin gummy. It's saved with the ${what}, so next time it fills in for you.</p>`}
    <button type="button" class="chip" data-act="add-content"><span aria-hidden="true">+</span> Add ${st.contents.length ? 'another' : 'an'} ingredient</button>
  </div>`;
}

// Medicines and supplements already logged, most recent first, so they can be added again in one tap.
function itemKey(cat, med, dose) { return `${cat}|${String(med || '').trim().toLowerCase()}|${String(dose || '').trim().toLowerCase()}`; }
function savedItems(cat) {
  const map = new Map();
  for (const e of live()) {
    if (e.cat !== cat || !String(e.med || '').trim()) continue;
    const key = itemKey(cat, e.med, e.dose);
    const at = Math.max(e.createdAt || 0, parseYmd(e.date).getTime());
    const cur = map.get(key);
    if (!cur || at > cur.at) map.set(key, { key, med: e.med.trim(), dose: String(e.dose || '').trim(), title: e.title, contents: Array.isArray(e.contents) ? e.contents : [], product: e.product || '', units: e.units || '', at, count: (cur ? cur.count : 0) + 1 });
    else cur.count++;
  }
  return Array.from(map.values())
    .filter((i) => !(S.hiddenItems[i.key] && S.hiddenItems[i.key] >= i.at))
    .sort((a, b) => b.at - a.at).slice(0, 12);
}
function savedHTML(st) {
  const items = savedItems(st.cat); st.savedList = items;
  const what = ITEM_LABEL[st.cat].toLowerCase();
  if (!items.length) return `<p class="hint saved-empty">Each ${what} you log is remembered here, so next time you can fill it in with one tap.</p>`;
  const cur = itemKey(st.cat, st.extra.med, st.extra.dose);
  const picked = st.mode === 'new' ? new Set(st.batch.map((b) => b.key)) : null;
  return `<div class="saved${st.editSaved ? ' editing' : ''}">
    <div class="saved-head"><span class="label">Used before</span><button type="button" class="mini" data-act="saved-edit">${st.editSaved ? 'Done' : 'Edit list'}</button></div>
    <div class="chips">${items.map((i, n) => `<span class="saved-chip"><button type="button" class="chip solid" data-use="${n}" aria-pressed="${picked ? picked.has(i.key) : cur === i.key}">${esc(i.med)}${i.dose ? ` <span class="n">${esc(i.dose)}</span>` : ''}</button><button type="button" class="forget" data-forget="${n}" aria-label="Remove ${esc(i.med)} from this list">×</button></span>`).join('')}</div>
    ${st.editSaved ? '<p class="hint">Removing an item only hides it from this list. Past entries stay as they are.</p>' : st.mode === 'new' ? `<p class="hint saved-tip">Tap one, or several to log them together.</p>` : ''}
  </div>`;
}
function batchHTML(st, uid) {
  const rows = st.batch.map((b, i) => {
    const p = b.product && PRODUCTS[b.product];
    const ct = p ? '' : contentsText(b);
    const amt = p
      ? `<div class="batch-amt"><input class="input" id="${uid}-b${i}" data-bi="${i}" data-bf="units" inputmode="decimal" maxlength="5" value="${esc(b.units || stdUnits(b.product))}" aria-label="${esc(p.units)} of ${esc(b.med)}"><span>${esc(p.units)}</span></div>`
      : `<input class="input" id="${uid}-b${i}" data-bi="${i}" data-bf="dose" maxlength="60" value="${esc(b.dose)}" placeholder="Amount" aria-label="Amount of ${esc(b.med)}">`;
    return `<div class="batch-row">
      <div class="batch-name"><b>${esc(b.med)}</b>${ct ? `<small>Contains ${esc(ct)}</small>` : p ? '<small>Nutrition from the label</small>' : ''}</div>
      ${amt}
      <button type="button" class="icon-btn" data-bdel="${i}" aria-label="Remove ${esc(b.med)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>`;
  }).join('');
  return `<div class="batch"><span class="label">Logging together</span>${rows}
    <p class="hint">Each is saved as its own entry, with the date, time and notes from this form.</p></div>`;
}
function batchItem(item) {
  return { key: item.key, med: item.med, dose: item.dose, title: item.title || '', contents: (item.contents || []).map((c) => ({ ...c })), product: item.product || '', units: item.units || '' };
}
function useSavedItem(el, item) {
  const st = el._st;
  st.extra.med = item.med; st.extra.dose = item.dose;
  st.contents = (item.contents || []).map((c) => ({ name: c.name || '', amount: c.amount || '' }));
  if (item.product && PRODUCTS[item.product]) useProduct(el, item.product, item.units); else st.product = '';
  const now = new Date();
  if (!st.extra.time && st.mode === 'new') st.extra.time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const t = $('[data-f="title"]', el);
  if (!t.value.trim() || t.value === st.autoTitle) { t.value = item.title || ''; st.autoTitle = t.value; }
  renderExtra(el); saveDraft(el);
}

function labFormHTML(st, uid) {
  const id = (i, f) => `${uid}-r${i}-${f}`;
  const field = (i, f, label, attrs) => `<div><label class="label" for="${id(i, f)}">${label}</label><input class="input" id="${id(i, f)}" data-r="${i}" data-rf="${f}" value="${esc(st.results[i][f])}" autocomplete="off" ${attrs}></div>`;
  const rows = st.results.map((r, i) => `
    <div class="lab-row">
      <div class="lab-top">
        <input class="input lab-name" id="${id(i, 'name')}" data-r="${i}" data-rf="name" value="${esc(r.name)}" placeholder="Test name" aria-label="Test name" autocomplete="off" maxlength="60">
        <button type="button" class="icon-btn lab-del" data-rdel="${i}" aria-label="Remove ${esc(r.name || 'this result')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="lab-grid">
        ${field(i, 'value', 'Result', 'inputmode="decimal" maxlength="20" placeholder="e.g. 12"')}
        ${field(i, 'unit', 'Unit', 'maxlength="20" autocapitalize="off"')}
        ${field(i, 'low', 'Normal from', 'inputmode="decimal" maxlength="12"')}
        ${field(i, 'high', 'Normal to', 'inputmode="decimal" maxlength="12"')}
      </div>
      <div class="lab-flag" data-flag="${i}">${flagHTML(labFlag(r))}</div>
    </div>`).join('');
  const have = new Set(st.results.map((r) => labKey(r.name)));
  const names = [];
  [...labSeries(live()).map((s) => s.name), ...LAB_PRESETS.map((p) => p.name)].forEach((n) => { const k = labKey(n); if (!have.has(k) && !names.some((x) => labKey(x) === k)) names.push(n); });
  return `<span class="label">Results</span>
    ${rows || '<p class="hint lab-empty">Add each result from the report, starting with a test below.</p>'}
    <span class="label lab-add-label">Add a result</span>
    <div class="chips">${names.slice(0, 10).map((n) => `<button type="button" class="chip" data-radd="${esc(n)}"><span aria-hidden="true">+</span> ${esc(n)}</button>`).join('')}<button type="button" class="chip" data-radd=""><span aria-hidden="true">+</span> Other test</button></div>
    <p class="hint">Copy the normal range printed next to each result. Ranges differ between labs and ages, so Little One compares against the range you enter. Next time, it fills in the last range you used.</p>`;
}

function syncTimeBits(el) {
  const st = el._st; if (!st) return;
  const lab = $('[data-timelabel]', el); const wrap = $('[data-todwrap]', el);
  if (lab) {
    const sk = st.cat === 'sleep' ? { bed: 'Asleep at', wake: 'Woke up at', waking: 'Woke at' }[st.sleepKind] : '';
    lab.textContent = sk || (ITEM_LABEL[st.cat] ? 'Time given' : st.cat === 'appointment' ? 'Appointment time' : 'Time');
  }
  if (wrap) wrap.hidden = !!st.extra.time;
}
function sleepKindOn(st) { return st.cat === 'sleep' && SLEEP_KIND_KEYS.includes(st.sleepKind); }
function syncFormBits(el) {
  const st = el._st;
  const wrap = $('[data-sevwrap]', el); wrap.hidden = NO_CONCERN.has(st.cat);
  const sk = sleepKindOn(st);
  $('[data-sevlabel]', el).textContent = 'Concern level (optional)';
  $('[data-f="title"]', el).placeholder = sk ? ({ bed: 'e.g. Settled quickly after a story', wake: 'e.g. Woke up happy', waking: 'e.g. Needed a drink of water' }[st.sleepKind]) : (CAT[st.cat] || CAT.other).ph;
  $('[data-titlelabel]', el).textContent = ITEM_LABEL[st.cat] || sk ? 'Description (optional)' : 'What happened?';
  if (st.mode === 'new') {
    const n = ITEM_LABEL[st.cat] ? st.batch.length : 0;
    $('[data-act="save-entry"]', el).textContent = n >= 2 ? `Save ${n} ${ITEM_PLURAL[st.cat]}` : 'Save entry';
  }
  syncTimeBits(el);
}
function nowHHMM() { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; }
function autoSleepKind(el) {
  const st = el._st;
  if (st.cat !== 'sleep' || st.kindTouched) return;
  st.sleepKind = kindForTod($('[data-f="tod"]', el).value);
  if (st.sleepKind && !st.extra.time && st.mode === 'new') st.extra.time = nowHHMM();
  if (st.sleepKind === 'waking' && !st.extra.awake) st.extra.awake = QUICK_AWAKE;
}

function mountForm(el, entry, mode) {
  const e = entry || {};
  const src = e.src && SRC[e.src] && !(isHelper() && e.src === 'parent') ? e.src : homeSrc();
  const st = {
    mode, id: mode === 'edit' ? e.id : null,
    cat: e.cat || '', src,
    srcName: src === 'parent' ? (e.srcName || (mode === 'edit' ? e.by : '') || S.myName || 'Me') : src === 'family' ? (e.srcName || (isHelper() ? S.myName || 'Me' : '')) : (e.srcName || ''),
    sev: e.sev || 0,
    extra: { temp: e.temp || '', height: e.height || '', weight: e.weight || '', med: e.med || '', dose: e.dose || '', time: e.time || (mode === 'new' && !('time' in e) ? nowHHMM() : ''), awake: e.awake || '', mins: e.mins || '', hrs: e.hrs || '', melt: e.melt || '' },
    dt: cleanDetail(e.cat, e.dt),
    timeTouched: mode === 'edit' || !!e.timeTouched, dateTouched: mode === 'edit' || !!e.dateTouched, mountDate: '', autoTime: '',
    results: Array.isArray(e.results) ? e.results.map((r) => ({ name: r.name || '', value: r.value || '', unit: r.unit || '', low: r.low || '', high: r.high || '' })) : [],
    contents: Array.isArray(e.contents) ? e.contents.map((c) => ({ name: c.name || '', amount: c.amount || '' })) : [],
    product: e.product && PRODUCTS[e.product] ? e.product : '', units: e.units != null && e.units !== '' ? String(e.units) : '', productOff: false,
    batch: mode === 'new' && Array.isArray(e.batch) ? e.batch : [],
    srcTouched: mode === 'edit', srcAuto: false,
    sleepKind: e.sleep || '', kindTouched: mode === 'edit' || !!e.kindTouched,
  };
  el._st = st;
  el.innerHTML = formHTML(st, e, mode);
  st.mountDate = $('[data-f="date"]', el).value;
  if (mode === 'new' && !st.timeTouched) st.autoTime = st.extra.time;
  $('[data-f="tod"]', el).value = st.extra.time ? todForTime(st.extra.time) : e.tod || currentTod();
  renderExtra(el); syncFormBits(el);

  el.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.cat) {
      if (st.cat !== b.dataset.cat) { st.batch = []; st.dt = {}; } // a selection belongs to one area
      st.cat = b.dataset.cat;
      $$('.cat-btn', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (st.cat === 'bloodtest' && !st.srcTouched && st.src === homeSrc()) { st.src = 'doctor'; st.srcName = ''; st.srcAuto = true; refreshSourceChips(el); }
      else if (st.cat !== 'bloodtest' && st.srcAuto) { st.src = homeSrc(); st.srcName = S.myName || 'Me'; st.srcAuto = false; refreshSourceChips(el); }
      autoSleepKind(el);
      renderExtra(el); syncFormBits(el); saveDraft(el);
    } else if (b.dataset.dt) {
      const [f, i] = b.dataset.dt.split('|'); const g = (DETAILS[st.cat] || { groups: [] }).groups.find((x) => x.f === f); const v = g && g.opts[+i];
      if (v) { if (st.dt[f] === v) delete st.dt[f]; else st.dt[f] = v; $$(`[data-dt^="${f}|"]`, el).forEach((x) => x.setAttribute('aria-pressed', String(st.dt[f] === g.opts[+x.dataset.dt.split('|')[1]]))); saveDraft(el); }
    } else if (b.hasAttribute('data-kind')) {
      st.sleepKind = b.dataset.kind; st.kindTouched = true;
      if (st.sleepKind && !st.extra.time && st.mode === 'new') st.extra.time = nowHHMM();
      if (st.sleepKind === 'waking' && !st.extra.awake) st.extra.awake = QUICK_AWAKE;
      renderExtra(el); syncFormBits(el); saveDraft(el);
    } else if (b.dataset.src) {
      st.src = b.dataset.src; st.srcName = b.dataset.name || ''; st.srcTouched = true; st.srcAuto = false;
      $$('[data-src]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      saveDraft(el);
    } else if (b.dataset.sev) {
      st.sev = st.sev === +b.dataset.sev ? 0 : +b.dataset.sev; // tap the chosen level again to clear it
      $$('.sev-btn', el).forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.sev === st.sev)));
      saveDraft(el);
    } else if (b.dataset.act === 'save-entry') {
      await saveForm(el);
    } else if (b.dataset.use) {
      const item = st.savedList && st.savedList[+b.dataset.use]; if (!item) return;
      if (st.mode !== 'new') { useSavedItem(el, item); return; }
      const at = st.batch.findIndex((x) => x.key === item.key);
      if (at >= 0) st.batch.splice(at, 1);
      else {
        if (st.batch.length === 1 && st.extra.med === st.batch[0].med) {
          // Carry over any change made to the first item before adding a second.
          const first = st.batch[0]; first.dose = st.extra.dose; first.units = st.units || first.units;
          if (!first.product) first.contents = st.contents.filter((c) => c.name).map((c) => ({ ...c }));
        }
        st.batch.push(batchItem(item));
      }
      if (st.batch.length === 1) useSavedItem(el, st.savedList.find((x) => x.key === st.batch[0].key) || st.batch[0]);
      else {
        if (!st.batch.length) { st.extra.med = ''; st.extra.dose = ''; st.contents = []; st.product = ''; st.units = ''; }
        renderExtra(el);
      }
      syncFormBits(el); saveDraft(el);
    } else if (b.dataset.forget) {
      const item = st.savedList && st.savedList[+b.dataset.forget];
      if (item) { S.hiddenItems[item.key] = Date.now(); st.batch = st.batch.filter((x) => x.key !== item.key); renderExtra(el); syncFormBits(el); toast(`${item.med} removed from the list`); kvSet('hiddenItems', S.hiddenItems).catch(() => {}); }
    } else if (b.hasAttribute('data-radd')) {
      const name = b.dataset.radd;
      const preset = LAB_PRESETS.find((p) => labKey(p.name) === labKey(name));
      const prev = name ? lastRangeFor(name) : null;
      st.results.push({ name, value: '', unit: (prev && prev.unit) || (preset && preset.unit) || '', low: prev ? prev.low : '', high: prev ? prev.high : '' });
      renderExtra(el); saveDraft(el);
      const f = $(`[data-r="${st.results.length - 1}"][data-rf="${name ? 'value' : 'name'}"]`, el); if (f) f.focus();
    } else if (b.dataset.product) {
      st.batch = []; useProduct(el, b.dataset.product); renderExtra(el); syncFormBits(el); saveDraft(el);
    } else if (b.dataset.bdel !== undefined) {
      st.batch.splice(+b.dataset.bdel, 1);
      if (st.batch.length === 1) useSavedItem(el, st.batch[0]); else renderExtra(el);
      syncFormBits(el); saveDraft(el);
    } else if (b.dataset.act === 'units-minus' || b.dataset.act === 'units-plus') {
      const u = parseFloat(String(st.units).replace(',', '.')) || stdUnits(st.product);
      const next = b.dataset.act === 'units-plus' ? Math.min(30, u + 1) : Math.max(PRODUCTS[st.product].minUnits || 0.5, u - 1);
      st.units = fmtAmount(next); const inpU = $('[data-units]', el); if (inpU) inpU.value = st.units;
      refreshProduct(el); scheduleCheck(el); saveDraft(el);
    } else if (b.dataset.act === 'product-off') {
      const u = parseFloat(String(st.units).replace(',', '.')) || 0;
      st.contents = u > 0 ? scaledNutrients(st.product, u, true) : [];
      st.product = ''; st.productOff = true; renderExtra(el); saveDraft(el);
    } else if (b.dataset.act === 'add-content') {
      st.contents.push({ name: '', amount: '' }); renderExtra(el); saveDraft(el);
      const f = $(`[data-c="${st.contents.length - 1}"][data-cf="name"]`, el); if (f) f.focus();
    } else if (b.dataset.cdel !== undefined) {
      st.contents.splice(+b.dataset.cdel, 1); renderExtra(el); saveDraft(el);
    } else if (b.dataset.rdel !== undefined) {
      st.results.splice(+b.dataset.rdel, 1); renderExtra(el); saveDraft(el);
    } else if (b.dataset.act === 'saved-edit') {
      st.editSaved = !st.editSaved; renderExtra(el);
    } else if (b.dataset.act === 'save-entry') {
      await saveForm(el);
    } else if (b.dataset.act === 'quick-wake') {
      await quickWake(el);
    } else if (b.dataset.act === 'repeat-entry') {
      repeatEntry(S.entries.get(st.id));
    } else if (b.dataset.act === 'delete-entry') {
      await deleteEntry(st.id);
    }
  };
  el.oninput = (ev) => {
    const t = ev.target;
    const f = t.dataset.x; if (f) st.extra[f] = t.value;
    if (t.dataset.bi !== undefined && t.dataset.bf) { const b = st.batch[+t.dataset.bi]; if (b) b[t.dataset.bf] = t.value; }
    if (t.dataset.f === 'date' && ev.isTrusted !== false) st.dateTouched = true;
    if (t.dataset.x === 'time') {
      if (ev.isTrusted !== false) st.timeTouched = true;
      if (t.value) { const tod = todForTime(t.value); if (tod) $('[data-f="tod"]', el).value = tod; }
      syncTimeBits(el);
    }
    if (t.dataset.cf && t.dataset.c !== undefined) { const c = st.contents[+t.dataset.c]; if (c) c[t.dataset.cf] = t.value; }
    if (t.hasAttribute('data-units')) { st.units = t.value; refreshProduct(el); }
    if (ITEM_LABEL[st.cat]) scheduleCheck(el);
    if (t.dataset.rf && t.dataset.r !== undefined) {
      const r = st.results[+t.dataset.r];
      if (r) { r[t.dataset.rf] = t.value; const fl = $(`[data-flag="${t.dataset.r}"]`, el); if (fl) fl.innerHTML = flagHTML(labFlag(r)); }
    }
    saveDraft(el);
  };
  el.onchange = (ev) => {
    el.oninput(ev);
    const t = ev.target;
    if (t.dataset.x === 'time' && t.value) {
      // Keep "time of day" in step with the exact time entered.
      const tod = todForTime(t.value); const sel = $('[data-f="tod"]', el);
      if (tod && sel.value !== tod) { sel.value = tod; if (st.cat === 'sleep' && !st.kindTouched) { autoSleepKind(el); renderExtra(el); syncFormBits(el); } }
    }
    if (t.dataset.f === 'tod' && st.cat === 'sleep' && !st.kindTouched) { autoSleepKind(el); renderExtra(el); syncFormBits(el); }
    if (t.dataset.f === 'date' && ITEM_LABEL[st.cat]) scheduleCheck(el);
    if (t.dataset.f === 'date' && st.mode === 'new' && !st.timeTouched && t.value && t.value !== today() && st.extra.time) {
      // Logging an earlier day: drop the automatic "now" time so it isn't recorded by mistake.
      st.extra.time = ''; renderExtra(el);
    }
    if (t.dataset.x === 'med' && st.cat === 'supplement' && !st.product && !st.productOff) {
      // Typing a ready-made product's name switches to its nutrition panel.
      const k = productFor(t.value); if (k) { useProduct(el, k); renderExtra(el); }
    }
    if (t.dataset.rf === 'name') {
      // A known test name fills in its usual unit and the last normal range used for it.
      const r = st.results[+t.dataset.r]; if (!r || !r.name.trim()) return;
      const prev = lastRangeFor(r.name); const preset = LAB_PRESETS.find((p) => labKey(p.name) === labKey(r.name));
      let changed = false;
      if (!r.unit && ((prev && prev.unit) || preset)) { r.unit = (prev && prev.unit) || preset.unit; changed = true; }
      if (prev && !r.low && !r.high && (prev.low || prev.high)) { r.low = prev.low; r.high = prev.high; changed = true; }
      if (changed) renderExtra(el);
    }
  };
}

let draftTimer = null;
function saveDraft(el) {
  if (!el._st || el._st.mode !== 'new') return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const st = el._st;
    const d = {
      date: $('[data-f="date"]', el).value, tod: $('[data-f="tod"]', el).value,
      title: $('[data-f="title"]', el).value, notes: $('[data-f="notes"]', el).value,
      cat: st.cat, src: st.src, srcName: st.srcName, sev: st.sev, ...st.extra, results: st.results, contents: st.contents, product: st.product, units: st.units, batch: st.batch, timeTouched: st.timeTouched, dateTouched: st.dateTouched, sleep: st.sleepKind, kindTouched: st.kindTouched, dt: st.dt, savedAt: Date.now(),
    };
    if (d.title || d.notes || d.cat) kvSet('draft', d).catch(() => {}); else kvDel('draft').catch(() => {});
  }, 400);
}

async function mountLogForm() {
  const el = $('#log-form');
  let draft = null;
  try { draft = await kvGet('draft'); } catch (e) { /* ignore */ }
  if (draft && Date.now() - (draft.savedAt || 0) > 3 * 86400000) draft = null;
  // A draft that still has its automatic date and time is out of date once some time has passed.
  if (draft && !draft.timeTouched && !draft.dateTouched && Date.now() - (draft.savedAt || 0) > 10 * 60000) { delete draft.time; delete draft.date; delete draft.tod; }
  mountForm(el, draft, 'new');
}

// The fields on screen are the truth when saving: take whatever time and date are showing, even if the phone
// didn't send an event for them (iOS pickers can save before they report a change). A time that was only
// filled in automatically is dropped when the entry is for an earlier day, so it can't pass as "now".
function settleClock(el) {
  const st = el._st; if (!st || st.mode !== 'new') return;
  const tf = $('[data-x="time"]', el); const df = $('[data-f="date"]', el);
  if (tf && tf.value !== (st.extra.time || '')) st.extra.time = tf.value;
  if (tf && !st.timeTouched && tf.value !== (st.autoTime || '')) st.timeTouched = true;
  if (df && df.value && df.value !== st.mountDate) st.dateTouched = true;
  if (!st.timeTouched && st.extra.time && df && df.value && df.value !== today()) { st.extra.time = ''; if (tf) tf.value = ''; }
}
// Back in the app after a while: an untouched form moves to the current date and time.
function refreshFormClock() {
  if (S.tab === 'today' || !S.tab) renderOutlook();
  const el = $('#log-form'); const st = el && el._st;
  if (!st || st.mode !== 'new' || st.timeTouched || st.dateTouched) return;
  const df = $('[data-f="date"]', el);
  if ($('[data-f="title"]', el).value || $('[data-f="notes"]', el).value) return;
  if (df.value !== today() || (st.extra.time && st.extra.time !== nowHHMM())) {
    df.value = today(); df.max = today(); st.mountDate = df.value;
    if (st.extra.time) { st.extra.time = nowHHMM(); st.autoTime = st.extra.time; const tf = $('[data-x="time"]', el); if (tf) tf.value = st.extra.time; }
    const tod = st.extra.time ? todForTime(st.extra.time) : currentTod();
    if (tod) $('[data-f="tod"]', el).value = tod;
    if (st.cat === 'sleep' && !st.kindTouched) autoSleepKind(el);
    syncTimeBits(el);
  }
}

// Say when an entry was saved for, so a wrong time or date shows straight away.
function savedWhen(date, time) {
  const day = date === today() ? '' : date === addDays(today(), -1) ? ' for yesterday' : ` for ${fmtDayShort(date)}`;
  return time ? `${day || ' for today'} at ${fmtTime(time)}` : day;
}
async function saveForm(el) {
  settleClock(el);
  const st = el._st;
  const val = (f) => $(`[data-f="${f}"]`, el).value;
  const title = val('title').trim(); const notes = val('notes').trim();
  const date = val('date'); const tod = st.extra.time ? (todForTime(st.extra.time) || val('tod')) : val('tod');
  if (!st.cat) { toast('Choose an area first'); return; }
  if (st.mode === 'new' && ITEM_LABEL[st.cat] && st.batch.length >= 2) { await saveBatch(el); return; }
  const prodOn = st.cat === 'supplement' && st.product && PRODUCTS[st.product];
  const prodUnits = prodOn ? parseFloat(String(st.units).replace(',', '.')) : 0;
  if (prodOn) {
    if (!(prodUnits > 0)) { toast(`Add how many ${PRODUCTS[st.product].units} were given`); const f = $('[data-units]', el); if (f) f.focus(); return; }
    st.extra.dose = productDose(st.product, prodUnits);
    if (!String(st.extra.med || '').trim()) st.extra.med = PRODUCTS[st.product].name;
  }
  if (ITEM_LABEL[st.cat] && !String(st.extra.med || '').trim()) { toast(`Add the ${ITEM_LABEL[st.cat].toLowerCase()} name`); const m = $('[data-x="med"]', el); if (m) m.focus(); return; }
  const keepNow = EXTRA_FIELDS[st.cat] || [];
  const hasDetail = (f) => keepNow.includes(f) && String(st.extra[f] || '').trim();
  let results = [];
  if (st.cat === 'bloodtest') {
    const rows = st.results.map((r) => ({ name: String(r.name || '').trim().slice(0, 60), value: String(r.value || '').trim().slice(0, 20), unit: String(r.unit || '').trim().slice(0, 20), low: String(r.low || '').trim().slice(0, 12), high: String(r.high || '').trim().slice(0, 12) }));
    const noValue = rows.find((r) => r.name && !r.value);
    if (noValue) { toast(`Add the result for ${noValue.name}, or remove it`); return; }
    results = rows.filter((r) => r.name && r.value);
    if (!results.length) { toast('Add at least one result, with the test name and value'); return; }
  }
  const sk = sleepKindOn(st);
  if (sk && !hasDetail('time')) { toast(st.sleepKind === 'bed' ? 'Add the time they went to sleep' : 'Add the time they woke up'); const tf = $('[data-x="time"]', el); if (tf) tf.focus(); return; }
  if (st.cat === 'growth') {
    const h = String(st.extra.height || '').trim(); const w = String(st.extra.weight || '').trim();
    if (!h && !w) { toast('Add a height or a weight'); const f = $('[data-x="height"]', el); if (f) f.focus(); return; }
    if (h && !isFinite(growthNum(h, 'height'))) { toast('Height should be in centimetres, between 30 and 200'); $('[data-x="height"]', el).focus(); return; }
    if (w && !isFinite(growthNum(w, 'weight'))) { toast('Weight should be in kilograms, between 2 and 120'); $('[data-x="weight"]', el).focus(); return; }
  }
  if (!title && !notes && !hasDetail('med') && !hasDetail('temp') && !hasDetail('height') && !hasDetail('weight') && !results.length && !sk && !hasMoment(st.cat, st.dt, st.extra)) { toast('Add a short description or a note'); $('[data-f="title"]', el).focus(); return; }
  if (!date) { toast('Choose a date'); return; }
  if (date > today()) { toast("The date can't be in the future"); return; }
  const now = Date.now();
  const prev = st.id ? S.entries.get(st.id) : null;
  const e = prev && !prev.deleted ? { ...prev } : { id: Sync.randomId(12), createdAt: now, by: S.myName || '', byDev: S.deviceId };
  Object.assign(e, {
    date, tod, cat: st.cat, src: st.src, srcName: st.srcName || '',
    title: title.slice(0, 160), notes: notes.slice(0, 8000), sev: NO_CONCERN.has(st.cat) ? 1 : st.sev || 0, updatedAt: now,
  });
  const keep = [...(EXTRA_FIELDS[st.cat] || []), 'time'];
  if (sk && st.sleepKind === 'waking') keep.push('awake');
  for (const f of ['temp', 'height', 'weight', 'med', 'dose', 'time', 'awake']) {
    const v = String(st.extra[f] || '').trim();
    if (keep.includes(f) && v) e[f] = v.slice(0, 60); else delete e[f];
  }
  const dd = cleanDetail(st.cat, st.dt); if (Object.keys(dd).length) e.dt = dd; else delete e.dt;
  for (const f of DETAIL_NUMS) { const v = DETAILS[st.cat] && DETAILS[st.cat].nums.some((n) => n.f === f) ? cleanNum(st.extra[f]) : ''; if (v) e[f] = v; else delete e[f]; }
  if (results.length) e.results = results; else delete e.results;
  const contents = ITEM_LABEL[st.cat] ? st.contents.map((c) => ({ name: String(c.name || '').trim().slice(0, 40), amount: String(c.amount || '').trim().slice(0, 20) })).filter((c) => c.name) : [];
  if (contents.length) e.contents = contents; else delete e.contents;
  if (prodOn) { e.product = st.product; e.units = prodUnits; e.contents = scaledNutrients(st.product, prodUnits, true); } else { delete e.product; delete e.units; }
  if (sk) e.sleep = st.sleepKind; else delete e.sleep;
  if (prev) e.editedBy = S.myName || '';
  S.entries.set(e.id, e);
  try { await putEntries([e]); } catch (err) { toast("Couldn't save on this phone: " + (err.message || err)); return; }
  scheduleSync();
  if (st.mode === 'edit') {
    closeSheet(); renderDependent(); toast('Changes saved');
  } else {
    clearTimeout(draftTimer); await kvDel('draft').catch(() => {});
    mountForm(el, null, 'new');
    if (S.fromTile) { S.fromTile = false; switchTab('today'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Entry saved${savedWhen(date, e.time)}`, { label: 'View', fn: () => switchTab('history') });
  }
}

async function saveBatch(el) {
  settleClock(el);
  const st = el._st; const val = (f) => $(`[data-f="${f}"]`, el).value;
  const date = val('date');
  if (!date) { toast('Choose a date'); return; }
  if (date > today()) { toast("The date can't be in the future"); return; }
  const time = String(st.extra.time || '').trim();
  const tod = time ? (todForTime(time) || val('tod')) : val('tod');
  const title = val('title').trim(); const notes = val('notes').trim();
  const now = Date.now(); const list = [];
  for (const b of st.batch) {
    const e = {
      id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId,
      date, tod, cat: st.cat, src: st.src, srcName: st.srcName || '',
      title: (title || b.title || '').slice(0, 160), notes: notes.slice(0, 8000), sev: NO_CONCERN.has(st.cat) ? 1 : st.sev || 0, med: b.med,
    };
    if (time) e.time = time;
    const p = b.product && PRODUCTS[b.product];
    if (p) {
      const u = parseFloat(String(b.units || stdUnits(b.product)).replace(',', '.'));
      if (!(u > 0)) { toast(`Add how many ${p.units} of ${b.med}`); return; }
      e.product = b.product; e.units = u; e.dose = productDose(b.product, u); e.contents = scaledNutrients(b.product, u, true);
    } else {
      const d = String(b.dose || '').trim(); if (d) e.dose = d.slice(0, 60);
      const c = (b.contents || []).filter((x) => x && String(x.name || '').trim()).map((x) => ({ name: String(x.name).trim().slice(0, 40), amount: String(x.amount || '').trim().slice(0, 20) }));
      if (c.length) e.contents = c;
    }
    list.push(e);
  }
  list.forEach((e) => S.entries.set(e.id, e));
  try { await putEntries(list); } catch (err) { toast("Couldn't save on this phone: " + (err.message || err)); return; }
  scheduleSync();
  clearTimeout(draftTimer); await kvDel('draft').catch(() => {});
  const word = ITEM_PLURAL[st.cat];
  mountForm(el, null, 'new');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDependent();
  toast(`${list.length} ${word} saved${savedWhen(date, time)}`, {
    label: 'Undo',
    fn: async () => {
      const tombs = list.map((e) => ({ id: e.id, deleted: true, updatedAt: Date.now(), by: S.myName || '' }));
      tombs.forEach((t) => S.entries.set(t.id, t)); await putEntries(tombs); scheduleSync(); renderDependent(); toast(`${list.length} ${word} removed`);
    },
  });
}

async function quickWake(el) {
  // Uses the date and time on the form if they were changed (a wake-up logged from memory), otherwise right now.
  settleClock(el); const st = el._st; const df = $('[data-f="date"]', el);
  const date = st.dateTouched && df && df.value ? df.value : today();
  if (date > today()) { toast("The date can't be in the future"); return; }
  let time = st.timeTouched && st.extra.time ? st.extra.time : (date === today() ? nowHHMM() : '');
  if (!time) { toast('Add the time of the wake-up first'); const tf = $('[data-x="time"]', el); if (tf) tf.focus(); return; }
  const now = Date.now();
  const e = {
    id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId,
    date, tod: todForTime(time) || currentTod(), time, cat: 'sleep', sleep: 'waking', awake: QUICK_AWAKE,
    src: homeSrc(), srcName: S.myName || 'Me', title: '', notes: '', sev: 0,
  };
  S.entries.set(e.id, e);
  try { await putEntries([e]); } catch (err) { toast("Couldn't save on this phone: " + (err.message || err)); return; }
  scheduleSync();
  clearTimeout(draftTimer); await kvDel('draft').catch(() => {});
  mountForm(el, null, 'new');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDependent();
  toast(`Night wake-up logged${savedWhen(e.date, e.time)}`, {
    label: 'Undo',
    fn: async () => {
      const tomb = { id: e.id, deleted: true, updatedAt: Date.now(), by: S.myName || '' };
      S.entries.set(e.id, tomb); await putEntries([tomb]); scheduleSync(); renderDependent(); toast('Wake-up removed');
    },
  });
}

function repeatEntry(e) {
  if (!e || e.deleted) return;
  const now = new Date();
  const k0 = srcKey(e); const k = k0 === 'parent' || k0 === 'family' ? homeSrc() : k0;
  const draft = {
    date: today(), tod: currentTod(), cat: e.cat, title: e.title, notes: '',
    src: k, srcName: k === homeSrc() ? (S.myName || 'Me') : '', sev: e.sev,
    med: e.med || '', dose: e.dose || '', temp: '', height: '', weight: '', time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    results: Array.isArray(e.results) ? e.results.map((r) => ({ name: r.name, unit: r.unit || '', low: r.low || '', high: r.high || '', value: '' })) : [],
    sleep: e.sleep || '', kindTouched: !!e.sleep,
    contents: Array.isArray(e.contents) ? e.contents.map((c) => ({ name: c.name, amount: c.amount || '' })) : [],
    product: e.product || '', units: e.units || '',
  };
  closeSheet(); switchTab('log');
  const el = $('#log-form'); mountForm(el, draft, 'new'); saveDraft(el);
  toast('Filled in from that entry. Check the details, then tap Save entry.');
}

async function deleteEntry(id) {
  const prev = S.entries.get(id); if (!prev) return;
  const tomb = { id, deleted: true, updatedAt: Date.now(), by: S.myName || '' };
  S.entries.set(id, tomb); await putEntries([tomb]);
  scheduleSync(); closeSheet(); renderDependent();
  toast('Entry deleted', {
    label: 'Undo',
    fn: async () => {
      const back = { ...prev, updatedAt: Date.now() };
      S.entries.set(id, back); await putEntries([back]);
      scheduleSync(); renderDependent(); toast('Entry restored');
    },
  });
}

function openEntry(id) {
  const e = S.entries.get(id); if (!e || e.deleted) return;
  openSheet('Edit entry', '<div id="edit-form"></div>', { onMount: (b) => mountForm($('#edit-form', b), e, 'edit') });
}

// ---------------------------------------------------------------- history
// Supplements or medicines one person gave together (within 15 minutes), and a night's wake-ups, show as one line
// in History, which opens to show each entry.
const GROUP_MINUTES = 15;
const hhmmMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
function groupKind(e) { return ITEM_LABEL[e.cat] ? e.cat : e.cat === 'sleep' && e.sleep === 'waking' ? 'waking' : ''; }
// One day's entries (already sorted) -> [{ kind, items }], in the order they appear.
export function groupDay(list) {
  const out = []; const open = [];
  for (const e of list) {
    const k = groupKind(e); const t = hhmmMin(e.time); const who = `${srcKey(e)}|${srcLabel(e)}`;
    let g = null;
    if (k === 'waking') { const last = out[out.length - 1]; if (last && last.kind === 'waking' && last.who === who) g = last; }
    else if (k) g = open.find((x) => x.kind === k && x.who === who && (t != null && x.t != null ? Math.abs(x.t - t) <= GROUP_MINUTES : t == null && x.t == null && x.tod === e.tod));
    if (g) { g.items.push(e); continue; }
    const n = { kind: k, items: [e], t, tod: e.tod, who };
    out.push(n); if (k && k !== 'waking') open.push(n);
  }
  return out;
}
const andList = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '');
function fmtRange(a, b) {
  const x = fmtTime(a); const y = fmtTime(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -2)}–${y}` : `${x}–${y}`;
}
const srcPill = (e) => { const k = srcKey(e); return `<span class="tag ${k === 'parent' ? 'src-parent' : k === 'family' ? 'src-family' : 'src-other'}"><span aria-hidden="true">${SRC[k].em}</span> ${esc(srcLabel(e))}</span>`; };
const chevron = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// Earliest first, keeping the order they were picked in when logged together.
function chrono(list) {
  return list.map((e, i) => ({ e, i })).sort((a, b) => (hhmmMin(a.e.time) ?? 0) - (hhmmMin(b.e.time) ?? 0) || (a.e.createdAt || 0) - (b.e.createdAt || 0) || a.i - b.i).map((x) => x.e);
}
function groupHTML(g, nightByWake) {
  const items = chrono(g.items);
  const first = items.reduce((a, e) => (((e.createdAt || 0) < (a.createdAt || 0) || ((e.createdAt || 0) === (a.createdAt || 0) && e.id < a.id)) ? e : a));
  const gid = first.id; const isOpen = S.hist.open.has(gid);
  S.hist.groups.set(gid, items);
  const c = CAT[items[0].cat] || CAT.other;
  const waking = g.kind === 'waking';
  const times = items.map((e) => e.time).filter(Boolean).sort();
  const when = times.length ? (times[0] === times[times.length - 1] ? fmtTime(times[0]) : fmtRange(times[0], times[times.length - 1])) : items[0].tod || '';
  const srcs = new Set(items.map((e) => `${srcKey(e)}|${srcLabel(e)}`));
  const oneSrc = srcs.size === 1;
  let label; let title;
  if (waking) {
    label = `${items.length} night wake-ups`;
    title = times.length === items.length ? `Woke at ${andList(times.map(fmtTime))}` : `Woke ${items.length} times in the night`;
  } else {
    label = `${items.length} ${ITEM_PLURAL[g.kind]}`;
    const names = [];
    items.forEach((e) => {
      const n = String(e.med || '').trim() || headline(e, false).text;
      const at = names.find((x) => x.n.toLowerCase() === n.toLowerCase());
      if (at) at.k++; else names.push({ n, k: 1 });
    });
    title = andList(names.map((x) => (x.k > 1 ? `${x.n} ×${x.k}` : x.n)));
  }
  const sev = Math.max(...items.map((e) => (noConcern(e) ? 0 : e.sev || 0)));
  const canRepeat = !waking && items.some((e) => String(e.med || '').trim());
  return `<div class="entry-group${isOpen ? ' open' : ''}" data-cat="${esc(items[0].cat)}" data-sev="${sev}" data-kind="${esc(g.kind)}">
    <button type="button" class="grp-head" data-group="${esc(gid)}" aria-expanded="${isOpen}" aria-controls="grp-${esc(gid)}">
      <div class="entry-top"><span class="entry-cat"><span aria-hidden="true">${c.em}</span> ${esc(label)}</span>${oneSrc ? srcPill(items[0]) : ''}<span class="entry-when">${esc(when)}</span>${chevron}</div>
      <div class="entry-title">${esc(title)}</div>
    </button>
    <div class="group-body" id="grp-${esc(gid)}"${isOpen ? '' : ' hidden'}>
      ${items.map((e) => entryCardHTML(e, nightByWake, { when, oneSrc })).join('')}
      ${canRepeat ? `<div class="group-foot"><button type="button" class="mini" data-repeat-group="${esc(gid)}">Log these again</button></div>` : ''}
    </div>
  </div>`;
}

// Fill the Log form with every supplement or medicine in a group, ready to save together.
function repeatGroup(list) {
  const items = []; const seen = new Set();
  for (const e of list) {
    const med = String(e.med || '').trim(); if (!med) continue;
    const key = itemKey(e.cat, med, e.dose);
    if (seen.has(key)) continue; seen.add(key);
    items.push(batchItem({ key, med, dose: String(e.dose || '').trim(), title: e.title || '', contents: Array.isArray(e.contents) ? e.contents : [], product: e.product || '', units: e.units || '' }));
  }
  if (items.length < 2) { repeatEntry(list.find((e) => String(e.med || '').trim()) || list[0]); return; }
  const cat = list[0].cat; const k0 = srcKey(list[0]); const k = k0 === 'parent' || k0 === 'family' ? homeSrc() : k0;
  const draft = {
    date: today(), tod: currentTod(), time: nowHHMM(), cat, title: '', notes: '', sev: 0,
    src: k, srcName: k === homeSrc() ? (S.myName || 'Me') : '', med: '', dose: '', contents: [], product: '', units: '', batch: items,
  };
  switchTab('log');
  const el = $('#log-form'); mountForm(el, draft, 'new'); saveDraft(el);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(`Filled in ${items.length} ${ITEM_PLURAL[cat]}. Check the amounts, then tap Save.`);
}

function entryCardHTML(e, nightByWake, grp) {
  const c = CAT[e.cat] || CAT.other;
  const k = srcKey(e);
  const when = e.time ? fmtTime(e.time) : e.tod || '';
  const hl = headline(e);
  const extra = [];
  if (hl.from === 'sleep' && String(e.title || '').trim()) extra.push(esc(e.title));
  if (e.temp && hl.from !== 'temp') extra.push(`Temperature ${esc(fmtTemp(e.temp))}`);
  if (e.cat === 'growth' && hl.from !== 'growth' && growthText(e)) extra.push(esc(growthText(e)));
  if ((e.med || e.dose) && hl.from !== 'med') extra.push(`${esc(e.med || ITEM_LABEL[e.cat] || 'Medicine')}${e.dose ? ', ' + esc(e.dose) : ''}`);
  if (contentsText(e)) {
    const n = e.contents.length; const shown = n > 6 ? contentsText({ contents: e.contents.slice(0, 5) }) + ` and ${n - 5} more` : contentsText(e);
    extra.push(`Contains ${esc(shown)}`);
  }
  const flagged = Array.isArray(e.results) && e.results.some((r) => /low|high/.test(labFlag(r)));
  const night = nightByWake && e.sleep === 'wake' ? nightByWake.get(e.id) : null;
  if (night) extra.push(`Slept ${fmtDur(night.mins)} from ${fmtTime(night.bed)}${night.wakings ? `, ${wokeText(night)}` : ''}`);
  if (e.cat === 'sleep' && e.sleep === 'waking' && e.awake) extra.push(`Awake ${esc(e.awake)} min`);
  if (DETAILS[e.cat] && detailText(e) && hl.from !== 'detail') extra.push(esc(detailText(e)));
  else if (hl.from === 'detail' && detailText(e)) extra.push(esc(detailText(e)));
  const tags = [];
  if (!noConcern(e)) tags.push(`<span class="tag">${SEV[e.sev] || 'Mild'} concern</span>`);
  if (grp && !grp.oneSrc) tags.push(srcPill(e));
  if (e.by && !((k === 'parent' || k === 'family') && srcLabel(e) === e.by)) tags.push(`<span class="tag">Logged by ${esc(e.by)}</span>`);
  // Inside a group the area, time and who are on the group's line; an entry shows its own time only when it differs.
  const ownWhen = grp && when !== grp.when && !(hl.from === 'sleep' && e.time) ? `<span class="entry-when">${esc(when)}</span>` : '';
  const top = grp
    ? `<div class="sub-head"><span class="entry-title">${esc(hl.text)}</span>${ownWhen}</div>`
    : `<div class="entry-top"><span class="entry-cat"><span aria-hidden="true">${c.em}</span> ${c.label}</span>${srcPill(e)}<span class="entry-when">${esc(when)}</span></div>
    <div class="entry-title">${esc(hl.text)}</div>`;
  return `<button type="button" class="entry-card${grp ? ' sub' : ''}" data-id="${esc(e.id)}" data-sev="${e.sev || 0}" data-cat="${esc(e.cat)}"${flagged ? ' data-flagged="1"' : ''}>
    ${top}
    ${extra.length ? `<div class="entry-extra">${extra.join(' · ')}</div>` : ''}
    ${Array.isArray(e.results) && e.results.length ? `<div class="lab-results">${e.results.map((r) => `<div class="lab-res"><span class="lab-res-name">${esc(r.name)}</span><span class="lab-res-val">${esc(r.value)} ${esc(r.unit || '')}</span>${flagHTML(labFlag(r))}</div>`).join('')}</div>` : ''}
    ${e.notes && hl.from !== 'notes-all' ? `<div class="entry-notes">${esc(e.notes)}</div>` : ''}
    ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
  </button>`;
}

function renderHistory() {
  const all = sortEntries(live());
  const counts = {}; all.forEach((e) => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
  const fr = $('#filter-row');
  fr.innerHTML = `<button type="button" class="chip" data-filter="all" aria-pressed="${S.hist.cat === 'all'}">All <span class="n">${all.length}</span></button>`
    + CATS.filter((c) => counts[c.k] || S.hist.cat === c.k).map((c) => `<button type="button" class="chip" data-filter="${c.k}" aria-pressed="${S.hist.cat === c.k}"><span aria-hidden="true">${c.em}</span>${c.label} <span class="n">${counts[c.k] || 0}</span></button>`).join('');
  fr.onclick = (ev) => { const b = ev.target.closest('[data-filter]'); if (!b) return; S.hist.cat = b.dataset.filter; S.hist.limit = 60; renderHistory(); };

  const q = S.hist.q.trim().toLowerCase();
  // By default only the last 24 hours (and today) show; "Show earlier" adds a week at a time. Searching looks through everything.
  const cutoffMs = Date.now() - 86400000; const cutoffDate = addDays(today(), -(S.hist.days - 1));
  const inWindow = (e) => q || S.hist.days > 99999 || (S.hist.days <= 1 ? (e.date >= today() || toMs(e.date, e.time || '23:59') >= cutoffMs) : e.date >= cutoffDate);
  const matched = all.filter((e) => (S.hist.cat === 'all' || e.cat === S.hist.cat)
    && (!q || [e.title, e.notes, e.med, e.dose, srcLabel(e), e.by, (CAT[e.cat] || {}).label, ...(Array.isArray(e.results) ? e.results.map((r) => r.name) : []), contentsText(e)].join(' ').toLowerCase().includes(q)));
  const list = matched.filter(inWindow); const hiddenOlder = matched.length - list.length;
  const earlierBtn = hiddenOlder > 0 ? `<button type="button" class="btn ghost more-btn" data-earlier>Show earlier (${hiddenOlder} more)</button>` : '';
  const box = $('#entry-list');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big" aria-hidden="true">📋</div><p>${hiddenOlder ? 'Nothing in the last 24 hours.' : all.length ? 'Nothing matches that search or filter.' : 'No entries yet. Add the first one from the Log tab.'}</p></div>${earlierBtn}`;
    box.onclick = (ev) => { if (ev.target.closest('[data-earlier]')) { S.hist.days = S.hist.days <= 1 ? 8 : S.hist.days + 7; renderHistory(); } };
    return;
  }
  const t = today(); const y = addDays(t, -1);
  const nightByWake = new Map(sleepNights(all).map((n) => [n.wakeId, n]));
  let html = ''; let last = '';
  const shown = list.slice(0, S.hist.limit);
  const flagDays = new Map();
  Array.from(new Set(shown.filter((e) => ITEM_LABEL[e.cat]).map((e) => e.date))).forEach((d) => { const r = dayIssues(d); if (r.issue) flagDays.set(d, r.over); });
  const days = [];
  shown.forEach((e) => { if (e.date !== last) { last = e.date; days.push({ date: e.date, list: [] }); } days[days.length - 1].list.push(e); });
  S.hist.groups = new Map();
  days.forEach(({ date, list: dayList }) => {
    const flag = flagDays.has(date) ? ` <button type="button" class="day-flag${flagDays.get(date) ? ' over' : ''}" data-check-day="${date}">⚠ Supplement check</button>` : '';
    html += `<h3 class="day-head">${date === t ? 'Today' : date === y ? 'Yesterday' : esc(fmtDayLong(date))}${flag} <button type="button" class="day-flag bd-btn" data-bd-day="${date}">Day breakdown</button></h3>`;
    groupDay(dayList).forEach((g) => { html += g.items.length > 1 ? groupHTML(g, nightByWake) : entryCardHTML(g.items[0], nightByWake); });
  });
  if (list.length > S.hist.limit) html += `<button type="button" class="btn ghost more-btn" data-more>Show ${Math.min(60, list.length - S.hist.limit)} more</button>`;
  html += earlierBtn;
  box.innerHTML = html;
  box.onclick = (ev) => {
    const bd = ev.target.closest('[data-bd-day]'); if (bd) { openDayBreakdown(bd.dataset.bdDay); return; }
    if (ev.target.closest('[data-more]')) { S.hist.limit += 60; renderHistory(); return; }
    if (ev.target.closest('[data-earlier]')) { S.hist.days = S.hist.days <= 1 ? 8 : S.hist.days + 7; renderHistory(); return; }
    const dc = ev.target.closest('[data-check-day]'); if (dc) { openDayCheck(dc.dataset.checkDay); return; }
    const gh = ev.target.closest('[data-group]');
    if (gh) {
      const id = gh.dataset.group; const open = !S.hist.open.has(id);
      if (open) S.hist.open.add(id); else S.hist.open.delete(id);
      gh.setAttribute('aria-expanded', String(open));
      gh.parentElement.classList.toggle('open', open);
      const body = document.getElementById(`grp-${id}`); if (body) body.hidden = !open;
      return;
    }
    const rg = ev.target.closest('[data-repeat-group]');
    if (rg) { const items = S.hist.groups.get(rg.dataset.repeatGroup); if (items) repeatGroup(items); return; }
    const c = ev.target.closest('.entry-card'); if (c) openEntry(c.dataset.id);
  };
}

// ---------------------------------------------------------------- insights (shared with the PDF report)
export function rangeFilter(list, from, to) { return list.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)); }

export function computeStats(list) {
  const t = today();
  const st = {
    total: list.length,
    days: new Set(list.map((e) => e.date)).size,
    high: list.filter((e) => e.sev === 3 && !noConcern(e)).length,
    last7: list.filter((e) => e.date > addDays(t, -7)).length,
    byCat: {}, byTod: {}, bySrc: {}, patterns: [],
  };
  list.forEach((e) => {
    st.byCat[e.cat] = (st.byCat[e.cat] || 0) + 1;
    if (e.tod) st.byTod[e.tod] = (st.byTod[e.tod] || 0) + 1;
    const k = srcKey(e); st.bySrc[k] = (st.bySrc[k] || 0) + 1;
  });
  st.patterns = findPatterns(list, st);
  return st;
}

function top(obj) { return Object.entries(obj).sort((a, b) => b[1] - a[1])[0]; }

function findPatterns(list, st) {
  const P = [];
  labSeries(list).forEach((s) => {
    const p = s.latest;
    if (p.flag === 'low' || p.flag === 'high') P.push({ ic: '🧪', text: `**${s.name}** was **${p.flag}** at the latest test: ${p.value} ${p.unit || s.unit} on ${fmtDayShort(p.date)} (normal ${labRange(p)}).` });
  });
  const t = today();
  const hard = list.filter((e) => e.sev >= 2 && !noConcern(e));
  if (list.length >= 3) {
    const tt = top(st.byTod); if (tt) P.push({ ic: '📍', text: `Most entries happen in the **${tt[0].toLowerCase()}** (${tt[1]} of ${list.length}).` });
  }
  const highTod = {}; list.filter((e) => e.sev === 3 && !noConcern(e)).forEach((e) => { highTod[e.tod] = (highTod[e.tod] || 0) + 1; });
  const ht = top(highTod); if (ht && ht[1] >= 2) P.push({ ic: '⚡', text: `High-concern moments are most common in the **${ht[0].toLowerCase()}** (${ht[1]}).` });
  const tc = top(st.byCat); if (tc && list.length >= 3) P.push({ ic: '📊', text: `**${(CAT[tc[0]] || CAT.other).label}** is the most logged area (${tc[1]} ${tc[1] === 1 ? 'entry' : 'entries'}).` });

  if (hard.length >= 6) {
    const wd = [0, 0, 0, 0, 0, 0, 0]; hard.forEach((e) => { wd[parseYmd(e.date).getDay()]++; });
    const max = Math.max(...wd); const idx = wd.indexOf(max);
    if (max >= 3 && max >= (hard.length / 7) * 2) {
      const name = new Date(2024, 0, 7 + idx).toLocaleDateString('en-AU', { weekday: 'long' });
      P.push({ ic: '🗓', text: `Harder moments come up most on **${name}s** (${max} of ${hard.length} moderate or high entries).` });
    }
  }
  const home = list.filter((e) => srcKey(e) === 'parent' && !noConcern(e));
  const school = list.filter((e) => srcKey(e) === 'teacher' && !noConcern(e));
  if (home.length >= 3 && school.length >= 3) {
    const a = Math.round(100 * school.filter((e) => e.sev >= 2).length / school.length);
    const b = Math.round(100 * home.filter((e) => e.sev >= 2).length / home.length);
    if (Math.abs(a - b) >= 20) P.push({ ic: '🏫', text: `Teacher reports were moderate or high concern **${a}%** of the time, compared with **${b}%** at home.` });
  }
  const nights = sleepNights(list);
  if (nights.length >= 3) {
    const sm = sleepSummary(nights);
    P.push({ ic: '😴', text: `Average overnight sleep was **${fmtDur(sm.avg)}** over ${sm.n} nights (asleep around ${fmtTime(sm.bed)}, awake around ${fmtTime(sm.wake)}).` });
    const lo = (sleepGuide() || SLEEP_GUIDES['3-5']).lo;
    const short = nights.filter((n) => n.mins < lo);
    if (short.length >= 3) {
      const hardDays = new Set(list.filter((e) => (e.cat === 'behaviour' || e.cat === 'emotion') && e.sev >= 2).map((e) => e.date));
      const k = short.filter((n) => hardDays.has(n.wakeDate)).length;
      if (k / short.length >= 0.5) P.push({ ic: '🌙', text: `After **${k} of ${short.length}** nights under ${fmtDur(lo)}, a moderate or high behaviour or emotion entry followed the next day.` });
    }
  }
  const rough = list.filter((e) => e.cat === 'sleep' && e.sev >= 2);
  if (rough.length >= 3) {
    const byDate = new Set(list.filter((e) => (e.cat === 'behaviour' || e.cat === 'emotion') && e.sev >= 2).map((e) => e.date));
    const nights = Array.from(new Set(rough.map((e) => e.date)));
    const followed = nights.filter((d) => byDate.has(d) || byDate.has(addDays(d, 1))).length;
    if (nights.length >= 3 && followed / nights.length >= 0.5) P.push({ ic: '🌙', text: `After **${followed} of ${nights.length}** harder nights, a moderate or high behaviour or emotion entry followed the same or next day.` });
  }
  const recent = hard.filter((e) => e.date > addDays(t, -14)).length;
  const before = hard.filter((e) => e.date <= addDays(t, -14) && e.date > addDays(t, -28)).length;
  if ((recent >= 3 || before >= 3) && recent !== before && list.some((e) => e.date <= addDays(t, -14))) {
    P.push({ ic: recent < before ? '📉' : '📈', text: `Moderate or high entries are **${recent < before ? 'down' : 'up'}** from ${before} to ${recent} over the last two weeks.` });
  }
  for (const [cat, ic, word] of [['medication', '💊', 'Medicine'], ['supplement', '🫙', 'Supplements']]) {
    const meds = list.filter((e) => e.cat === cat);
    if (!meds.length) continue;
    const names = {}; meds.forEach((e) => { const n = (e.med || '').trim(); if (n) names[n] = (names[n] || 0) + 1; });
    const listN = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ×${c}`).join(', ');
    P.push({ ic, text: `${word} ${meds.length > 1 && cat === 'supplement' ? 'were' : 'was'} logged **${meds.length}** time${meds.length > 1 ? 's' : ''}${listN ? ` (${listN})` : ''}.` });
  }
  const temps = list.filter((e) => e.temp && isFinite(parseFloat(e.temp)));
  if (temps.length) {
    const m = temps.reduce((a, b) => (parseFloat(b.temp) > parseFloat(a.temp) ? b : a));
    P.push({ ic: '🌡', text: `Highest temperature logged: **${fmtTemp(m.temp)}** on ${fmtDayShort(m.date)}.` });
  }
  const wins = list.filter((e) => e.cat === 'win').length;
  if (wins) P.push({ ic: '⭐', text: `**${wins}** win${wins > 1 ? 's' : ''} recorded. Worth celebrating.` });
  const recentHigh = list.filter((e) => e.sev === 3 && !noConcern(e) && e.date > addDays(t, -7)).length;
  if (recentHigh >= 3) P.push({ ic: '🔴', text: `**${recentHigh}** high-concern entries in the last 7 days. It may be worth talking with your GP or paediatrician.` });
  if (!P.length) P.push({ ic: '📝', text: 'Keep logging. Patterns will show up over time.' });
  return P;
}

export function concernBadge(st) {
  if (st.high >= 5) return { tone: 'red', text: `${st.high} high-concern entries. Worth discussing with a professional.` };
  if (st.high >= 2) return { tone: 'yellow', text: `${st.high} high-concern entries logged.` };
  return { tone: 'green', text: st.high === 1 ? 'One high-concern entry logged.' : 'No high-concern entries in this period.' };
}

function barsHTML(rows, max, cls = '') {
  return `<div class="bars">${rows.map(([label, n]) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill ${cls}" data-w="${max ? Math.max(2, Math.round((n / max) * 100)) : 0}"></div></div><span class="n">${n}</span></div>`).join('')}</div>`;
}

function weeksHTML(list) {
  const t = today(); const dow = (parseYmd(t).getDay() + 6) % 7; const monday = addDays(t, -dow);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(monday, -7 * i); const end = addDays(start, 6);
    const inW = list.filter((e) => e.date >= start && e.date <= end);
    weeks.push({ start, all: inW.length, hi: inW.filter((e) => e.sev === 3 && !noConcern(e)).length });
  }
  const max = Math.max(1, ...weeks.map((w) => w.all));
  return `<div class="weeks" aria-hidden="true">${weeks.map((w) => `<div class="week" title="${w.all} entries"><div class="seg" data-h="${Math.round(((w.all - w.hi) / max) * 100)}"></div><div class="seg hi" data-h="${Math.round((w.hi / max) * 100)}"></div></div>`).join('')}</div>
  <div class="weeks-axis">${weeks.map((w, i) => { const d = parseYmd(w.start); return `<span>${i === 7 ? 'Now' : i % 2 === 1 ? `${d.getDate()}/${d.getMonth() + 1}` : ''}</span>`; }).join('')}</div>
  <div class="legend"><span><i></i>Entries</span><span><i class="hi"></i>High concern</span></div>
  <p class="sr-only">${weeks.map((w) => `Week of ${w.start}: ${w.all} entries, ${w.hi} high concern`).join('. ')}</p>`;
}

function labChartSVG(s, si) {
  const pts = s.points.filter((p) => isFinite(p.num)); if (pts.length < 2) return '';
  const W = 320; const H = 124; const L = 6; const R = 44; const T = 18; const B = 24;
  const lo = labNum(s.latest.low); const hi = labNum(s.latest.high);
  const { vmin, vmax, showLo, showHi } = labDomain(pts.map((p) => p.num), lo, hi);
  const t0 = parseYmd(pts[0].date).getTime(); const t1 = parseYmd(pts[pts.length - 1].date).getTime();
  const x = (d) => (t1 === t0 ? (L + W - R) / 2 : L + ((parseYmd(d).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - vmin) / (vmax - vmin)) * (H - T - B);
  const f1 = (n) => n.toFixed(1);
  const short = (d) => { const dt = parseYmd(d); return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }); };
  let svg = `<svg class="lab-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.name)} results over time">`;
  const bandShown = (isFinite(lo) && (showLo || lo < vmin)) || (isFinite(hi) && (showHi || hi > vmax));
  if (bandShown && !(isFinite(lo) && lo > vmax) && !(isFinite(hi) && hi < vmin)) {
    const yt = isFinite(hi) && showHi ? y(hi) : 2; const yb = isFinite(lo) && showLo ? y(lo) : H - B;
    svg += `<rect class="lab-band" x="${L}" y="${f1(yt)}" width="${W - L - R}" height="${f1(Math.max(1, yb - yt))}" rx="3"></rect>`;
  }
  if (isFinite(hi)) svg += showHi ? `<text class="lab-axis" x="${W - R + 6}" y="${f1(y(hi) + 3.5)}">${esc(s.latest.high)}</text>` : hi > vmax ? `<text class="lab-axis" x="${W - R + 6}" y="11">↑ ${esc(s.latest.high)}</text>` : '';
  if (isFinite(lo)) svg += showLo ? `<text class="lab-axis" x="${W - R + 6}" y="${f1(y(lo) + 3.5)}">${esc(s.latest.low)}</text>` : lo < vmin ? `<text class="lab-axis" x="${W - R + 6}" y="${H - B - 2}">↓ ${esc(s.latest.low)}</text>` : '';
  svg += `<line class="lab-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"></line>`;
  svg += `<path class="lab-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${f1(x(p.date))},${f1(y(p.num))}`).join(' ')}"></path>`;
  pts.forEach((p, i) => {
    const label = `${p.value} ${p.unit || s.unit} on ${fmtDateFull(p.date)}${p.flag ? ` (${FLAG_LABEL[p.flag].toLowerCase()})` : ''}`;
    svg += `<circle class="lab-pt ${p.flag}" data-series="${si}" data-i="${i}" cx="${f1(x(p.date))}" cy="${f1(y(p.num))}" r="4.5"><title>${esc(label)}</title></circle>`;
    svg += `<circle class="lab-hit" data-pt="${esc(label)}" data-series="${si}" data-i="${i}" cx="${f1(x(p.date))}" cy="${f1(y(p.num))}" r="16"></circle>`;
  });
  const last = pts[pts.length - 1];
  const lx = x(last.date); const ly = y(last.num);
  svg += `<text class="lab-val" x="${f1(lx)}" y="${f1(ly - 9)}" text-anchor="end">${esc(last.value)}</text>`;
  svg += `<text class="lab-axis" x="${L}" y="${H - 7}">${esc(short(pts[0].date))}</text><text class="lab-axis" x="${W - R}" y="${H - 7}" text-anchor="end">${esc(short(last.date))}</text>`;
  return svg + '</svg>';
}

function sleepChartSVG(all) {
  const nights = sleepNights(all); const byDate = new Map(nights.map((n) => [n.date, n]));
  const slots = []; for (let i = 14; i >= 1; i--) { const d = addDays(today(), -i); slots.push({ d, n: byDate.get(d) }); }
  if (!slots.some((s) => s.n)) return '';
  const guide = sleepGuide();
  const W = 320; const H = 150; const L = 4; const R = 38; const T = 10; const B = 22;
  const maxM = Math.max(780, ...slots.filter((s) => s.n).map((s) => s.n.mins + 30));
  const y = (m) => T + (1 - m / maxM) * (H - T - B);
  const sw = (W - L - R) / slots.length; const bw = Math.min(16, sw * 0.64);
  const f1 = (n) => n.toFixed(1);
  let svg = `<svg class="sleep-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hours slept each night for the last two weeks">`;
  if (guide) {
    svg += `<rect class="sleep-band" x="${L}" y="${f1(y(guide.hi))}" width="${W - L - R}" height="${f1(y(guide.lo) - y(guide.hi))}" rx="3"></rect>`;
    svg += `<text class="lab-axis" x="${W - R + 5}" y="${f1(y(guide.hi) + 3.5)}">${guide.hi / 60} h</text><text class="lab-axis" x="${W - R + 5}" y="${f1(y(guide.lo) + 3.5)}">${guide.lo / 60} h</text>`;
  } else {
    [480, 600, 720].forEach((m) => { svg += `<text class="lab-axis" x="${W - R + 5}" y="${f1(y(m) + 3.5)}">${m / 60} h</text>`; });
  }
  svg += `<line class="lab-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"></line>`;
  const shown = slots.filter((s) => s.n);
  slots.forEach((s, i) => {
    const cx = L + i * sw + sw / 2;
    if (s.n) {
      const x0 = cx - bw / 2; const top = y(s.n.mins); const base = H - B; const r = Math.min(4, bw / 2, base - top);
      svg += `<path class="sleep-bar" data-i="${i}" d="M${f1(x0)},${base} V${f1(top + r)} Q${f1(x0)},${f1(top)} ${f1(x0 + r)},${f1(top)} H${f1(x0 + bw - r)} Q${f1(x0 + bw)},${f1(top)} ${f1(x0 + bw)},${f1(top + r)} V${base} Z"><title>${esc(`${fmtDayShort(s.d)}: ${fmtDur(s.n.mins)}`)}</title></path>`;
      const label = `Night of ${fmtDayShort(s.d)}: ${fmtDur(s.n.mins)} asleep, ${fmtTime(s.n.bed)} to ${fmtTime(s.n.wake)}${s.n.wakings ? `, ${wokeText(s.n)}` : ''}`;
      svg += `<rect class="lab-hit" data-night="${esc(label)}" data-i="${i}" x="${f1(L + i * sw)}" y="${T}" width="${f1(sw)}" height="${H - T - B}"></rect>`;
    }
    if (i === 0 || i === 7 || i === slots.length - 1) {
      const dt = parseYmd(s.d);
      svg += `<text class="lab-axis" x="${f1(cx)}" y="${H - 7}" text-anchor="middle">${dt.getDate()}/${dt.getMonth() + 1}</text>`;
    }
  });
  if (shown.length >= 2) {
    const avg = shown.reduce((a, b) => a + b.n.mins, 0) / shown.length;
    svg += `<line class="sleep-avg" x1="${L}" x2="${W - R}" y1="${f1(y(avg))}" y2="${f1(y(avg))}"><title>${esc(`Average ${fmtDur(avg)}`)}</title></line>`;
  }
  return svg + '</svg>';
}

function sleepCardHTML(all) {
  const nightsAll = sleepNights(all);
  if (!nightsAll.length) {
    if (!all.some((e) => e.cat === 'sleep')) return '';
    return `<div class="card"><h3 class="card-title">Overnight sleep</h3><p class="hint intro">When you log Sleep in the evening it's saved as the time they went to sleep, and in the morning as the time they woke up. Once a night has both, the hours slept appear here.</p></div>`;
  }
  const from = S.insightRange === 'all' ? '' : addDays(today(), -(+S.insightRange - 1));
  const nights = nightsAll.filter((n) => !from || n.date >= from);
  const sm = sleepSummary(nights);
  const wk = (a, b) => nightsAll.filter((n) => n.date >= addDays(today(), -a) && n.date < addDays(today(), -b));
  const last7 = sleepSummary(wk(7, 0)); const prev7 = sleepSummary(wk(14, 7));
  let trend = '';
  if (last7 && prev7) { const d = Math.round(last7.avg - prev7.avg); trend = `Last 7 nights: ${fmtDur(last7.avg)} on average, ${d === 0 ? 'the same as' : `${fmtDur(Math.abs(d))} ${d > 0 ? 'more than' : 'less than'}`} the week before.`; }
  else if (last7) trend = `Last 7 nights: ${fmtDur(last7.avg)} on average.`;
  const guide = sleepGuide();
  const chart = sleepChartSVG(all);
  return `<div class="card"><h3 class="card-title">Overnight sleep</h3>
    ${sm ? `<div class="lab-latest"><span class="lab-big">${esc(fmtDur(sm.avg))}</span> average over ${sm.n} night${sm.n > 1 ? 's' : ''}<span class="lab-when">Asleep around ${esc(fmtTime(sm.bed))}, awake around ${esc(fmtTime(sm.wake))}</span></div>` : '<p class="hint">No complete nights in this period.</p>'}
    ${trend ? `<div class="lab-change">${esc(trend)}</div>` : ''}
    ${chart ? `${chart}<p class="lab-tip" data-tip="sleep" aria-live="polite"></p><p class="hint">Bars show each of the last 14 nights; tap one for details. The orange line is their average.${guide ? ` The shaded band is the guideline of ${esc(guide.text)}.` : ''}</p>` : ''}
    ${sm && sm.woke ? `<div class="lab-note">Woke during the night on ${sm.woke} of ${sm.n} nights${sm.wakings > sm.woke ? ` (${sm.wakings} wake-ups in all)` : ''}${sm.awake ? `, about ${Math.round(sm.awake / sm.woke)} min awake on those nights` : ''}. Time awake is taken off each night's total.</div>` : ''}
  </div>`;
}

function dayFeelChartSVG(ratings, nights) {
  const byWake = new Map(nights.map((n) => [n.wakeDate, n]));
  const slots = []; for (let i = 27; i >= 0; i--) { const d = addDays(today(), -i); slots.push({ d, n: byWake.get(d), r: ratings.get(d) }); }
  if (!slots.some((x) => x.n && x.r)) return '';
  const W = 320; const H = 130; const L = 4; const R = 8; const T = 8; const B = 22;
  const maxM = Math.max(780, ...slots.filter((x) => x.n).map((x) => x.n.mins + 30));
  const y = (m) => T + (1 - m / maxM) * (H - T - B);
  const sw = (W - L - R) / slots.length; const bw = Math.max(3, sw * 0.7); const f1 = (n) => n.toFixed(1);
  let svg = `<svg class="sleep-chart feel-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hours slept before each of the last 28 days, coloured by how the day felt">`;
  svg += `<line class="lab-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"></line>`;
  slots.forEach((x, i) => {
    const cx = L + i * sw + sw / 2;
    if (x.n) {
      const cls = x.r ? `fe${Math.min(4, Math.max(1, Math.round(x.r)))}` : 'fe0';
      svg += `<rect class="feel-bar ${cls}" x="${f1(cx - bw / 2)}" y="${f1(y(x.n.mins))}" width="${f1(bw)}" height="${f1(H - B - y(x.n.mins))}" rx="1.5"></rect>`;
      const label = `${fmtDayShort(x.d)}: slept ${fmtDur(x.n.mins)} the night before; ${x.r ? `the day felt ${dayFeelWord(x.r)}` : 'day not rated'}`;
      svg += `<rect class="lab-hit" data-night="${esc(label)}" data-i="f${i}" x="${f1(L + i * sw)}" y="${T}" width="${f1(sw)}" height="${H - T - B}"></rect>`;
    }
    if (i === 0 || i === 14 || i === slots.length - 1) { const dt = parseYmd(x.d); svg += `<text class="lab-axis" x="${f1(cx)}" y="${H - 7}" text-anchor="middle">${dt.getDate()}/${dt.getMonth() + 1}</text>`; }
  });
  return svg + '</svg>';
}
function tagSectionHTML(ratings) {
  const tm = dayTagMap(tagSource()); const stats = tagStats(ratings, tm);
  const tagged = Array.from(tm.keys()).length;
  if (!stats.length) return tagged ? '<p class="hint">Once a few more days are tagged and rated, this will show which of the things you tap seem to go with calmer or rougher days.</p>' : '';
  const f = (n) => (Math.round(n * 10) / 10).toFixed(1);
  return `<h4 class="feel-sub">What goes with calmer days</h4><ul class="feel-tags">${stats.map((x) => `<li><b>${x.tag.em} ${esc(x.tag.label)}</b>: days with it were ${x.diff < 0 ? 'calmer' : 'rougher'} (average ${f(x.withAvg)} compared with ${f(x.withoutAvg)}, over ${x.withN} and ${x.withoutN} days).</li>`).join('')}</ul><p class="hint">Days are scored 1 (calm and easy) to 4 (hard). Shown only when there are at least 4 days with and without each tap.</p>`;
}
function dayFeelCardHTML(all) {
  const ratings = dayRatings(dayfeelEntries());
  if (isHelper() || !ratings.size) return '';
  const nights = sleepNights(all);
  const st = dayFeelStats(ratings, nights, today());
  const chart = dayFeelChartSVG(ratings, nights);
  const legend = `<p class="feel-legend" aria-hidden="true">${DAYFEEL.map(([v, em, l]) => `<span><i class="sw fe${v}"></i>${l}</span>`).join('')}</p>`;
  let body = '';
  if (st.best && st.recent) {
    const b = st.best; const r = st.recent;
    const fmtRange = (a, c) => `${fmtDayShort(a)} to ${fmtDayShort(c)}`;
    body += `<div class="feel-compare"><div><span class="label">Easiest stretch</span><b>${esc(fmtRange(b.start, b.end))}</b><span>Days were ${esc(dayFeelWord(b.rating))}. Slept ${esc(fmtDur(b.sleep))} on average, asleep around ${esc(fmtTime(b.bed))}.</span></div>
      <div><span class="label">Last 14 days</span><b>${esc(fmtRange(recentStart14(), today()))}</b><span>Days were ${r.rating == null ? 'not rated' : esc(dayFeelWord(r.rating))}. Slept ${esc(fmtDur(r.sleep))} on average, asleep around ${esc(fmtTime(r.bed))}.</span></div></div>`;
    const dS = b.sleep - r.sleep; const dB = minsOfClock(r.bed) - minsOfClock(b.bed);
    const tips = [];
    if (dS >= 30) tips.push(`Sleep is about ${fmtDur(Math.round(dS))} a night shorter than during the easiest stretch.`);
    if (dB >= 20) tips.push(`Bedtime has drifted about ${dB} minutes later.`);
    if (tips.length) body += `<div class="lab-note">${esc(tips.join(' '))} One thing to try: an earlier wind-down and bedtime for a week, then see whether the days ease.</div>`;
  } else if (st.enough) {
    const e = st.easy; const h = st.hard;
    body += `<div class="feel-compare"><div><span class="label">Calm or mostly fine days</span><b>${e.n} days</b><span>Followed nights averaging ${esc(fmtDur(e.sleep))}, asleep around ${esc(fmtTime(e.bed))}.</span></div>
      <div><span class="label">Bumpy or hard days</span><b>${h.n} days</b><span>Followed nights averaging ${esc(fmtDur(h.sleep))}, asleep around ${esc(fmtTime(h.bed))}.</span></div></div>`;
  } else {
    body += `<p class="hint intro">${st.rated} day${st.rated === 1 ? '' : 's'} rated so far, ${st.paired} with a night of sleep logged. About 4 calm-or-fine and 4 bumpy-or-hard days (each with sleep logged) are needed before a comparison is shown. "Rate recent days" on the Log tab is the quickest way to fill in the past few weeks.</p>`;
  }
  return `<div class="card"><h3 class="card-title">Sleep and how days felt</h3>
    ${chart ? `${chart}${legend}<p class="lab-tip" data-tip="sleep" aria-live="polite"></p><p class="hint">Each bar is the sleep before that day, coloured by how the day felt. Tap one for details.</p>` : ''}
    ${body}
    ${tagSectionHTML(ratings)}
    <p class="hint">This shows what goes together, not what causes what. Illness, growth spurts and changes at home can affect both sleep and mood, and a few weeks of ratings is a small sample. If sleep stays low or things get worse, it's worth raising with your GP.</p></div>`;
}
const recentStart14 = () => addDays(today(), -13);

// Percentile details for one series, when the child's sex and birth month are set.
function growthPct(kind, p) {
  const { childSex: sex, childBirth: birth } = S.profile; if (!sex || !birth) return null;
  return growthPercentile(sex, birth, p.date, kind, p.num);
}
function growthChartRefSVG(s, kind, si) {
  const { childSex: sex, childBirth: birth } = S.profile; if (!sex || !birth) return '';
  const pts = s.points; if (pts.length < 2) return '';
  const t0 = parseYmd(pts[0].date).getTime(); const t1 = parseYmd(pts[pts.length - 1].date).getTime(); if (t1 === t0) return '';
  const N = 14; const refs = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N; const d = ymd(new Date(t)); const age = ageMonths(birth, d);
    const v = age == null ? null : [3, 50, 97].map((q) => valueAtPercentile(sex, age, kind, q));
    if (!v || v.some((x) => x == null)) return '';
    refs.push({ t, p3: v[0], p50: v[1], p97: v[2] });
  }
  const W = 320; const H = 150; const L = 6; const R = 38; const T = 16; const B = 24;
  const lo = Math.min(...pts.map((p) => p.num), ...refs.map((r) => r.p3)); const hi = Math.max(...pts.map((p) => p.num), ...refs.map((r) => r.p97));
  const pad = (hi - lo) * 0.06; const vmin = lo - pad; const vmax = hi + pad;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R); const y = (v) => T + (1 - (v - vmin) / (vmax - vmin)) * (H - T - B); const f1 = (n) => n.toFixed(1);
  const short = (d) => parseYmd(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
  let svg = `<svg class="lab-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.name)} over time with the 3rd to 97th percentile range">`;
  const band = refs.map((r, i) => `${i ? 'L' : 'M'}${f1(x(r.t))},${f1(y(r.p97))}`).join(' ') + ' ' + refs.slice().reverse().map((r) => `L${f1(x(r.t))},${f1(y(r.p3))}`).join(' ') + ' Z';
  svg += `<path class="lab-band" d="${band}"></path>`;
  svg += `<path class="ref-median" d="${refs.map((r, i) => `${i ? 'L' : 'M'}${f1(x(r.t))},${f1(y(r.p50))}`).join(' ')}"></path>`;
  svg += `<line class="lab-base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"></line>`;
  svg += `<path class="lab-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${f1(x(parseYmd(p.date).getTime()))},${f1(y(p.num))}`).join(' ')}"></path>`;
  pts.forEach((p, i) => {
    const q = growthPct(kind, p); const label = `${p.value} ${s.unit} on ${fmtDateFull(p.date)}${q ? `, ${pctText(q.pct)}` : ''}`;
    const cx = f1(x(parseYmd(p.date).getTime())); const cy = f1(y(p.num));
    svg += `<circle class="lab-pt" data-series="${si}" data-i="${i}" cx="${cx}" cy="${cy}" r="4.5"><title>${esc(label)}</title></circle><circle class="lab-hit" data-pt="${esc(label)}" data-series="${si}" data-i="${i}" cx="${cx}" cy="${cy}" r="16"></circle>`;
  });
  svg += `<text class="lab-axis" x="${L}" y="${H - 7}">${esc(short(pts[0].date))}</text><text class="lab-axis" x="${W - R}" y="${H - 7}" text-anchor="end">${esc(short(pts[pts.length - 1].date))}</text>`;
  svg += `<text class="lab-axis" x="${W - R + 5}" y="${f1(y(refs[N].p97) + 3.5)}">97th</text><text class="lab-axis" x="${W - R + 5}" y="${f1(y(refs[N].p50) + 3.5)}">50th</text><text class="lab-axis" x="${W - R + 5}" y="${f1(y(refs[N].p3) + 3.5)}">3rd</text>`;
  return svg + '</svg>';
}
function growthPctLines(s, kind) {
  const last = s.latest; const q = growthPct(kind, last); if (!q) return '';
  const chart = q.chart === 'WHO' ? 'WHO growth standards' : 'CDC growth chart';
  let t = `${esc(s.name)} ${esc(last.value)} ${esc(s.unit)} is ${esc(pctText(q.pct))} for a ${esc(S.profile.childSex)} aged ${esc(ageText(q.age))} (${chart}).`;
  let shift = '';
  if (s.points.length >= 2) {
    const prev = s.points[s.points.length - 2]; const pq = growthPct(kind, prev);
    if (pq) {
      t += ` On ${esc(fmtDateFull(prev.date))} it was ${esc(pctText(pq.pct))}.`;
      if (Math.abs(q.z - pq.z) >= 1.3) shift = ` It has moved quite a bit compared with children of the same age (${q.z > pq.z ? 'up' : 'down'} from ${esc(pctText(pq.pct))}). Worth mentioning at the next check-up, along with anything else you've noticed.`;
    }
  }
  return `<div class="lab-note">${t}${shift}</div>`;
}
function growthCardHTML(all) {
  const series = growthSeries(all); if (!series.length) return '';
  const hasRef = !!(S.profile.childSex && S.profile.childBirth);
  const dropped = series.find((s) => s.name === 'Weight' && s.points.length >= 2 && s.latest.num < s.points[s.points.length - 2].num);
  // BMI from entries that have both a height and a weight (needs age 2 or over)
  let bmiHTML = '';
  if (hasRef) {
    const both = all.filter((e) => e.cat === 'growth' && isFinite(growthNum(e.height, 'height')) && isFinite(growthNum(e.weight, 'weight'))).sort((a, b) => (a.date < b.date ? -1 : 1));
    const e = both[both.length - 1];
    if (e) {
      const bmi = growthNum(e.weight, 'weight') / Math.pow(growthNum(e.height, 'height') / 100, 2);
      const q = growthPercentile(S.profile.childSex, S.profile.childBirth, e.date, 'bmi', bmi);
      if (q) bmiHTML = `<div class="lab-note">BMI on ${esc(fmtDateFull(e.date))}: ${esc(trimNum(bmi))}, ${esc(pctText(q.pct))} for a ${esc(S.profile.childSex)} aged ${esc(ageText(q.age))} (CDC growth chart).</div>`;
    }
  }
  const kinds = { Height: 'height', Weight: 'weight' };
  return `<div class="card"><h3 class="card-title">Height and weight</h3><p class="hint intro">Every measurement logged. Tap a dot to see its value${hasRef ? '. The shaded band is the 3rd to 97th percentile for their age and sex, and the dashed line is the 50th' : ''}.</p>
    ${series.map((s, si) => { const kind = kinds[s.name]; return `<div class="lab-trend"><div class="lab-trend-head"><b>${esc(s.name)}</b></div><div class="lab-latest"><span class="lab-big">${esc(s.latest.value)}</span> ${esc(s.unit)}<span class="lab-when">${esc(fmtDateFull(s.latest.date))}</span></div>
      ${growthChange(s) ? `<div class="lab-change">${esc(growthChange(s))}</div>` : ''}
      ${(hasRef && growthChartRefSVG(s, kind, 'g' + si)) || labChartSVG(s, 'g' + si)}${s.points.length > 1 ? `<p class="lab-tip" data-tip="g${si}" aria-live="polite"></p>` : ''}
      ${hasRef ? growthPctLines(s, kind) : ''}</div>`; }).join('')}
    ${bmiHTML}
    ${hasRef ? '' : '<p class="hint">Add your child\'s sex and birth month and year in Settings to see percentiles: where each measurement sits among children of the same age and sex. It is worked out on this phone and nothing extra is sent anywhere.</p>'}
    ${dropped ? '<div class="lab-note">The latest weight is lower than the one before. Day-to-day weight varies with clothes and time of day, so one reading is not a concern. If weight stays down or stops rising over several measurements, mention it to your GP.</div>' : ''}
    <p class="hint">${hasRef ? "Percentiles compare with a reference group of children, and healthy children vary widely. A steady pattern over time matters more than any one number, and your GP or child health nurse can read it alongside your child's health record. They use the WHO growth standards to 2 years and the CDC charts from 2 years, which is the usual approach in Australia." : "Percentile charts are best read by your GP or child health nurse alongside your child's health record."}</p></div>`;
}

function labCardHTML(all) {
  const series = labSeries(all); if (!series.length) return '';
  return `<div class="card"><h3 class="card-title">Blood tests</h3><p class="hint intro">Every result logged, newest test first. The shaded band is the normal range from the latest report. Tap a dot to see its value.</p>
    ${series.map((s, si) => {
      const p = s.latest; const prev = s.points.length > 1 ? s.points[s.points.length - 2] : null;
      let change = '';
      if (prev && isFinite(p.num) && isFinite(prev.num)) change = p.num === prev.num ? `Same as on ${fmtDateFull(prev.date)}` : `${p.num > prev.num ? 'Up' : 'Down'} from ${prev.value} on ${fmtDateFull(prev.date)}`;
      let iron = '';
      if (/ferritin|iron|haemoglobin|hemoglobin|transferrin/i.test(s.name)) {
        const c = ironCounts(all, prev && prev.date, p.date);
        const bits = [];
        if (c.between) bits.push(`${c.between} time${c.between > 1 ? 's' : ''} between the last two tests`);
        if (c.since) bits.push(`${c.since} time${c.since > 1 ? 's' : ''} since the latest`);
        if (bits.length) iron = `<div class="lab-note">Iron logged ${bits.join(', and ')}.</div>`;
      }
      return `<div class="lab-trend">
        <div class="lab-trend-head"><b>${esc(s.name)}</b>${flagHTML(p.flag)}</div>
        <div class="lab-latest"><span class="lab-big">${esc(p.value)}</span> ${esc(p.unit || s.unit)}<span class="lab-when">${esc(fmtDateFull(p.date))}${labRange(p) ? ` · normal ${esc(labRange(p))}` : ' · no normal range entered'}</span></div>
        ${change ? `<div class="lab-change">${esc(change)}</div>` : ''}
        ${labChartSVG(s, si)}${s.points.length > 1 ? `<p class="lab-tip" data-tip="${si}" aria-live="polite"></p>` : ''}
        ${iron}
      </div>`;
    }).join('')}</div>`;
}

function renderInsights() {
  const ranges = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']];
  const rr = $('#insight-range');
  rr.innerHTML = ranges.map(([k, l]) => `<button type="button" class="chip solid" data-range="${k}" aria-pressed="${S.insightRange === k}">${l}</button>`).join('');
  rr.onclick = (ev) => { const b = ev.target.closest('[data-range]'); if (b) { S.insightRange = b.dataset.range; renderInsights(); } };
  const all = live();
  const list = S.insightRange === 'all' ? all : rangeFilter(all, addDays(today(), -(+S.insightRange - 1)), today());
  const box = $('#insights');
  const labs = suppCheckCardHTML(list) + sleepCardHTML(all) + activityInsightHTML() + screenInsightHTML() + momentsInsightHTML() + tallyInsightHTML() + routineInsightHTML() + medsInsightHTML() + dayFeelCardHTML(all) + growthCardHTML(all) + labCardHTML(all);
  box.onclick = (ev) => {
    const cd = ev.target.closest('[data-check-day]'); if (cd) { openDayCheck(cd.dataset.checkDay); return; }
    const sh = ev.target.closest('[data-night]');
    if (sh) {
      const card = sh.closest('.card'); const tip = $('[data-tip]', card); if (tip) tip.textContent = sh.dataset.night;
      $$('.sleep-bar', card).forEach((c) => c.classList.toggle('sel', c.dataset.i === sh.dataset.i));
      return;
    }
    const hit = ev.target.closest('[data-pt]'); if (!hit) return;
    const tip = $(`[data-tip="${hit.dataset.series}"]`, box);
    if (tip) tip.textContent = hit.dataset.pt;
    $$(`.lab-pt[data-series="${hit.dataset.series}"]`, box).forEach((c) => c.classList.toggle('sel', c.dataset.i === hit.dataset.i));
  };
  if (!list.length) {
    box.innerHTML = `<div class="card mt14"><div class="empty"><div class="big" aria-hidden="true">✨</div><p>${all.length ? 'No entries in this period.' : 'Log a few entries and patterns will appear here.'}</p></div></div>${labs}`;
    return;
  }
  const st = computeStats(list);
  const badge = concernBadge(st);
  const catRows = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => [`${(CAT[k] || CAT.other).em} ${(CAT[k] || CAT.other).label}`, n]);
  const todRows = TODS.filter((t) => st.byTod[t.k]).map((t) => [t.k, st.byTod[t.k]]);
  const srcRows = SOURCES.filter((s) => st.bySrc[s.k]).map((s) => [s.label, st.bySrc[s.k]]);
  box.innerHTML = `
    <div class="card mt14">
      <h3 class="card-title">Overview</h3>
      <div class="stat-row">
        <div class="stat"><b>${st.total}</b><span>Entries</span></div>
        <div class="stat"><b>${st.days}</b><span>Days logged</span></div>
        <div class="stat"><b>${st.high}</b><span>High concern</span></div>
      </div>
      <div class="badge ${badge.tone}">${esc(badge.text)}</div>
    </div>
    ${labs}
    <div class="card"><h3 class="card-title">Patterns noticed</h3>${st.patterns.map((p) => `<div class="pattern"><span class="ic" aria-hidden="true">${p.ic}</span><span>${strong(p.text)}</span></div>`).join('')}</div>
    <div class="card"><h3 class="card-title">Last 8 weeks</h3>${weeksHTML(all)}</div>
    <div class="card"><h3 class="card-title">By area</h3>${barsHTML(catRows, catRows[0] ? catRows[0][1] : 0)}</div>
    <div class="card"><h3 class="card-title">Time of day</h3>${barsHTML(todRows, Math.max(0, ...todRows.map((r) => r[1])), 'sky')}</div>
    <div class="card"><h3 class="card-title">Who saw it</h3>${barsHTML(srcRows, Math.max(0, ...srcRows.map((r) => r[1])), 'lav')}</div>
    <p class="small-note">These are simple counts worked out on this phone. They can help conversations with your GP, teacher or specialist, but they aren't a diagnosis.</p>`;
  applySizes(box);
}

// ---------------------------------------------------------------- export
function defaultExport() {
  return {
    range: '30', from: addDays(today(), -29), to: today(),
    cats: new Set(CATS.map((c) => c.k)), srcs: new Set(SOURCES.map((s) => s.k)), sevs: new Set([1, 2, 3]),
    summary: true, notes: true, by: true, labs: true, sleep: true, order: 'date',
  };
}
function exportPeriod() {
  const x = S.exp; const t = today();
  if (x.range === 'all') { const ds = live().map((e) => e.date).sort(); return { from: ds[0] || t, to: t, all: true }; }
  if (x.range === 'custom') { let from = x.from || t; let to = x.to || t; if (from > to) [from, to] = [to, from]; return { from, to }; }
  return { from: addDays(t, -(+x.range - 1)), to: t };
}
function exportList() {
  const x = S.exp; const p = exportPeriod();
  return rangeFilter(live(), p.from, p.to).filter((e) => x.cats.has(e.cat) && x.srcs.has(srcKey(e)) && (noConcern(e) || x.sevs.has(e.sev || 1)));
}

function renderExport() {
  if (!S.exp) S.exp = defaultExport();
  const x = S.exp; const p = exportPeriod();
  const inPeriod = rangeFilter(live(), p.from, p.to);
  const cc = {}; const sc = {}; const vc = {};
  inPeriod.forEach((e) => { cc[e.cat] = (cc[e.cat] || 0) + 1; sc[srcKey(e)] = (sc[srcKey(e)] || 0) + 1; if (!noConcern(e)) vc[e.sev || 1] = (vc[e.sev || 1] || 0) + 1; });
  const count = exportList().length;
  const ranges = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time'], ['custom', 'Choose dates']];
  const check = (group, k, label, em, n, on) => `<label class="check"><input type="checkbox" data-group="${group}" value="${k}" ${on ? 'checked' : ''}>${em ? `<span class="em" aria-hidden="true">${em}</span>` : ''}<span>${label}</span><span class="n">${n || 0}</span></label>`;
  const toggle = (k, label, sub) => `<label class="toggle"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="switch"><input type="checkbox" data-opt="${k}" ${x[k] ? 'checked' : ''}><span></span></span></label>`;
  const el = $('#export-form');
  el.innerHTML = `
    <div class="group">
      <div class="group-head"><span class="label">Period</span></div>
      <div class="chips">${ranges.map(([k, l]) => `<button type="button" class="chip solid" data-range="${k}" aria-pressed="${x.range === k}">${l}</button>`).join('')}</div>
      ${x.range === 'custom' ? `<div class="row2 mt10"><div><label class="label" for="ex-from">From</label><input class="input" type="date" id="ex-from" data-date="from" max="${today()}" value="${esc(x.from)}"></div><div><label class="label" for="ex-to">To</label><input class="input" type="date" id="ex-to" data-date="to" max="${today()}" value="${esc(x.to)}"></div></div>` : `<p class="hint">${esc(fmtDateFull(p.from))} to ${esc(fmtDateFull(p.to))}</p>`}
    </div>
    <div class="group">
      <div class="group-head"><span class="label">Areas</span><span class="mini-links"><button type="button" data-all="cats">All</button><button type="button" data-none="cats">None</button></span></div>
      <div class="check-list">${CATS.map((c) => check('cats', c.k, c.label, c.em, cc[c.k], x.cats.has(c.k))).join('')}</div>
    </div>
    <div class="group">
      <div class="group-head"><span class="label">Seen or reported by</span><span class="mini-links"><button type="button" data-all="srcs">All</button><button type="button" data-none="srcs">None</button></span></div>
      <div class="check-list">${SOURCES.map((s) => check('srcs', s.k, s.label, s.em, sc[s.k], x.srcs.has(s.k))).join('')}</div>
    </div>
    <div class="group">
      <div class="group-head"><span class="label">Concern level</span></div>
      <div class="check-list">${[1, 2, 3].map((n) => check('sevs', String(n), SEV[n], '', vc[n], x.sevs.has(n))).join('')}</div>
      <p class="hint">Entries without a concern level (including wins, supplements and blood tests) are included whenever their area is ticked.</p>
    </div>
    <div class="group">
      <div class="group-head"><span class="label">Include</span></div>
      <div class="card pad-card">
        ${toggle('summary', 'Summary and patterns', 'Counts by area, time of day and who saw it')}
        ${toggle('notes', 'Notes', 'The full notes written for each entry')}
        ${toggle('by', 'Who logged each entry')}
        ${toggle('sleep', 'Overnight sleep table', 'Bedtime, wake time and hours slept each night')}
        ${toggle('labs', 'Blood test table and charts', 'Each test over time, with its normal range')}
      </div>
    </div>
    <div class="group">
      <div class="group-head"><span class="label">Order entries</span></div>
      <div class="chips"><button type="button" class="chip solid" data-order="date" aria-pressed="${x.order === 'date'}">By date</button><button type="button" class="chip solid" data-order="area" aria-pressed="${x.order === 'area'}">Grouped by area</button></div>
    </div>
    <div class="export-bar">
      <p class="export-count">${count ? `${count} ${count === 1 ? 'entry' : 'entries'} will be included` : 'No entries match these choices'}</p>
      <button type="button" class="btn primary block" data-act="make-pdf" ${count ? '' : 'disabled'}>Create PDF</button>
      <div id="pdf-ready"></div>
      <div class="center"><button type="button" class="linkish" data-act="copy-text" ${count ? '' : 'disabled'}>Copy as text instead</button></div>
    </div>`;
  renderPdfReady();

  el.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.range) { x.range = b.dataset.range; S.lastPdf = null; renderExport(); }
    else if (b.dataset.order) { x.order = b.dataset.order; S.lastPdf = null; renderExport(); }
    else if (b.dataset.all) { const g = b.dataset.all; x[g] = new Set(g === 'cats' ? CATS.map((c) => c.k) : SOURCES.map((s) => s.k)); S.lastPdf = null; renderExport(); }
    else if (b.dataset.none) { x[b.dataset.none] = new Set(); S.lastPdf = null; renderExport(); }
    else if (b.dataset.act === 'make-pdf') await makePdf(b);
    else if (b.dataset.act === 'share-pdf') await shareFile(S.lastPdf.blob, S.lastPdf.name, 'application/pdf');
    else if (b.dataset.act === 'copy-text') await copyText();
  };
  el.onchange = (ev) => {
    const i = ev.target;
    if (i.dataset.group) {
      const set = x[i.dataset.group]; const v = i.dataset.group === 'sevs' ? +i.value : i.value;
      if (i.checked) set.add(v); else set.delete(v);
    } else if (i.dataset.opt) x[i.dataset.opt] = i.checked;
    else if (i.dataset.date) x[i.dataset.date] = i.value;
    S.lastPdf = null; renderExport();
  };
}

function renderPdfReady() {
  const box = $('#pdf-ready'); if (!box) return;
  if (!S.lastPdf) { box.innerHTML = ''; return; }
  if (S.pdfUrl) URL.revokeObjectURL(S.pdfUrl);
  S.pdfUrl = URL.createObjectURL(S.lastPdf.blob);
  box.innerHTML = `<div class="notice ok mt12 mb0"><b>Your PDF is ready</b> (${S.lastPdf.pages} page${S.lastPdf.pages > 1 ? 's' : ''}).</div>
    <div class="btn-row mt10"><button type="button" class="btn dark" data-act="share-pdf">Share or save</button><a class="btn ghost" href="${S.pdfUrl}" download="${esc(S.lastPdf.name)}" target="_blank" rel="noopener">Open</a></div>`;
}

function describeSet(set, all, labelOf, allText) {
  if (all.every((k) => set.has(k))) return allText;
  if (!set.size) return 'None';
  const out = all.filter((k) => !set.has(k));
  if (out.length <= 3 && out.length < all.length / 2) return `${allText} except ${out.map(labelOf).join(', ')}`;
  return all.filter((k) => set.has(k)).map(labelOf).join(', ');
}
function reportData() {
  const x = S.exp; const p = exportPeriod();
  const list = sortEntries(exportList()).reverse();
  const rangeLabel = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All entries', custom: 'Chosen dates' }[x.range];
  return {
    child: S.profile.childName || '', author: S.myName || '', created: today(),
    period: `${rangeLabel}: ${fmtDateFull(p.from)} to ${fmtDateFull(p.to)}`,
    areas: describeSet(x.cats, CATS.map((c) => c.k), (k) => CAT[k].label, 'All areas'),
    sources: describeSet(x.srcs, SOURCES.map((s) => s.k), (k) => SRC[k].label, 'Everyone'),
    levels: describeSet(x.sevs, [1, 2, 3], (k) => SEV[k], 'All levels'),
    opts: { summary: x.summary, notes: x.notes, by: x.by, labs: x.labs, sleep: x.sleep !== false, order: x.order },
    guide: sleepGuide(),
    entries: list, stats: computeStats(list), badge: null,
  };
}

async function makePdf(btn) {
  setBusy(btn, true, 'Creating PDF…');
  try {
    const { buildPdf } = await import('./pdf.js');
    const data = reportData(); data.badge = concernBadge(data.stats);
    const { blob, pages } = await buildPdf(data, { CAT, SEV, SRC, srcKey, srcLabel, fmtDayLong, fmtDayShort, fmtTime, fmtTemp, noConcern, ITEM_LABEL, headline, labSeries, labFlag, labRange, labNum, labDomain, FLAG_LABEL, sleepNights, sleepSummary, fmtDur, wokeText, contentsText, growthText, detailText });
    S.lastPdf = { blob, pages, name: `little-one-report-${today()}.pdf` };
    renderPdfReady();
    $('#pdf-ready').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    console.error(e);
    toast(e && e.message ? e.message : "Couldn't create the PDF");
  } finally { setBusy(btn, false); }
}

function reportText() {
  const d = reportData();
  const L = [];
  L.push('Little One: health and wellbeing report');
  if (d.child) L.push(`For ${d.child}`);
  L.push(d.period, `Areas: ${d.areas}`, `Seen or reported by: ${d.sources}`, `Concern level: ${d.levels}`, '');
  if (d.opts.summary) {
    L.push(`Summary: ${d.stats.total} entries over ${d.stats.days} days, ${d.stats.high} high concern.`);
    d.stats.patterns.forEach((p) => L.push(`- ${p.text.replace(/\*\*/g, '')}`));
    L.push('');
  }
  const nights = d.opts.sleep ? sleepNights(d.entries) : [];
  if (nights.length) {
    const sm = sleepSummary(nights);
    L.push(`Overnight sleep: ${fmtDur(sm.avg)} on average over ${sm.n} nights, asleep around ${fmtTime(sm.bed)}, awake around ${fmtTime(sm.wake)}.`);
    nights.forEach((n) => L.push(`- Night of ${fmtDayShort(n.date)}: ${fmtTime(n.bed)} to ${fmtTime(n.wake)}, ${fmtDur(n.mins)} asleep${n.wakings ? `, ${wokeText(n)}` : ''}`));
    L.push('');
  }
  d.entries.forEach((e) => {
    const c = CAT[e.cat] || CAT.other;
    const meta = [fmtDayShort(e.date), e.time ? fmtTime(e.time) : e.tod, c.label, noConcern(e) ? '' : `${SEV[e.sev] || 'Mild'} concern`, `seen by ${srcLabel(e)}`, d.opts.by && e.by && e.by !== srcLabel(e) ? `logged by ${e.by}` : ''].filter(Boolean).join(', ');
    const hl = headline(e, d.opts.notes);
    L.push(hl.text, `  ${meta}`);
    if (hl.from === 'sleep' && String(e.title || '').trim()) L.push(`  ${e.title}`);
    if (e.temp && hl.from !== 'temp') L.push(`  Temperature: ${fmtTemp(e.temp)}`);
    if (e.cat === 'growth' && hl.from !== 'growth' && growthText(e)) L.push(`  ${growthText(e)}`);
    if ((e.med || e.dose) && hl.from !== 'med') L.push(`  ${ITEM_LABEL[e.cat] || 'Medicine'}: ${[e.med, e.dose].filter(Boolean).join(', ')}`);
    if (contentsText(e)) L.push(`  Contains: ${contentsText(e)}`);
    if (DETAILS[e.cat] && detailText(e)) L.push(`  ${detailText(e)}`);
    (Array.isArray(e.results) ? e.results : []).forEach((r) => { const f = labFlag(r); L.push(`  ${r.name}: ${r.value} ${r.unit || ''}${labRange(r) ? ` (normal ${labRange(r)})` : ''}${f === 'low' || f === 'high' ? ` ${FLAG_LABEL[f].toUpperCase()}` : ''}`); });
    if (d.opts.notes && e.notes && hl.from !== 'notes-all') L.push(`  Notes: ${e.notes.replace(/\n/g, '\n  ')}`);
    L.push('');
  });
  return L.join('\n');
}
async function copyText() {
  const text = reportText();
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it wherever you need it.'); return; } catch (e) { /* fall through */ }
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  toast("Couldn't copy on this device");
}

async function shareFile(blob, name, type) {
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

// ---------------------------------------------------------------- sync
let syncTimer = null; let syncing = false; let syncAgain = false;
function scheduleSync(delay = 1200) {
  if (!syncOn()) return;
  clearTimeout(syncTimer);
  if (!syncing) setSyncStatus('pending');
  syncTimer = setTimeout(runSync, delay);
}
export async function runSync() {
  if (!syncOn()) { setSyncStatus('off'); return null; }
  if (syncing) { syncAgain = true; return null; }
  clearTimeout(syncTimer);
  syncing = true; setSyncStatus('busy');
  let result = null;
  try {
    if (isHelper()) {
      result = await Sync.syncHelper({ repo: S.fam.repo, token: S.fam.token, keyRaw: S.fam.keyRaw, helperId: S.fam.id, deviceId: S.deviceId }, {
        getState: () => kvGet('syncState'),
        setState: (s) => kvSet('syncState', s),
        merge: mergeOwn,
        plan: async (d) => { S.plan = d; await kvSet('plan', d); if ($('#app').dataset.screen === 'main') renderHomeCards(); },
        snapshot: () => ({ name: S.myName || '', entries: Array.from(S.entries.values()) }),
      });
    } else {
      await pullFamily(); // family members' entries first, so they go out to the partner's phone in this sync
      result = await Sync.syncOnce({ ...S.sync, deviceId: S.deviceId }, {
        getState: () => kvGet('syncState'),
        setState: (s) => kvSet('syncState', s),
        merge: mergeRemote,
        snapshot: () => ({ name: S.myName || '', profile: S.profile, entries: Array.from(S.entries.values()) }),
      });
    }
    S.lastSyncAt = Date.now(); S.syncError = null; setSyncStatus('ok');
  } catch (e) {
    console.warn('sync', e);
    S.syncError = e; setSyncStatus(e && e.code === 'offline' ? 'offline' : 'error');
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(300); }
  }
  return result;
}

const newerEntry = (a, b) => ((a.updatedAt || 0) !== (b.updatedAt || 0) ? (a.updatedAt || 0) > (b.updatedAt || 0) : JSON.stringify(a) > JSON.stringify(b));

// ---- family members (see sync.js "family helpers")
const ID_RE = /^[a-f0-9]{8,40}$/;
function cleanFamily(f) {
  if (!f || typeof f !== 'object') return null;
  const members = {};
  Object.keys(f.members && typeof f.members === 'object' ? f.members : {}).sort().forEach((id) => {
    const m = f.members[id];
    if (!ID_RE.test(id) || !m || typeof m !== 'object') return;
    members[id] = { name: String(m.name || '').slice(0, 40), plan: !!m.plan, key: m.removed ? '' : String(m.key || ''), createdAt: +m.createdAt || 0, updatedAt: +m.updatedAt || 0, removed: !!m.removed };
  });
  return { repo: Sync.normaliseRepo(f.repo) || '', token: String(f.token || ''), updatedAt: +f.updatedAt || 0, members };
}
function mergeFamilyConfig(a, b) {
  a = cleanFamily(a); b = cleanFamily(b);
  if (!a || !b) return a || b;
  const base = b.updatedAt > a.updatedAt ? b : a;
  const all = { ...a.members };
  Object.entries(b.members).forEach(([id, m]) => { if (!all[id] || m.updatedAt > all[id].updatedAt) all[id] = m; });
  return cleanFamily({ repo: base.repo, token: base.token, updatedAt: base.updatedAt, members: all });
}
const familyMembers = (all) => Object.entries((S.profile.family && S.profile.family.members) || {}).filter(([, m]) => all || !m.removed);
async function saveFamily(f) { S.profile = { ...S.profile, family: cleanFamily(f) }; await kvSet('profile', S.profile); scheduleSync(300); }

// Parents' phones: copy in what each current family member has logged. A member can only ever add, change or
// delete their own entries, and their name on each entry comes from the parents' list, not from their phone.
async function mergeHelper(id, p) {
  const m = (S.profile.family && S.profile.family.members || {})[id];
  if (!m || m.removed) return 0;
  const name = m.name || 'Family';
  let changed = 0; let n = 0; const put = [];
  for (const r of Array.isArray(p.entries) ? p.entries : []) {
    if (!r || typeof r.id !== 'string' || !ID_RE.test(r.id)) continue;
    if (!r.deleted && !((CAT[r.cat] || r.cat === 'tick' || r.cat === 'ask' || r.cat === 'with') && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')))) continue;
    if (!r.deleted) n++;
    const l = S.entries.get(r.id);
    if (l && l.member !== id) continue;
    const x = r.deleted ? { id: r.id, deleted: true, updatedAt: +r.updatedAt || 0, by: name, member: id } : { ...r, member: id, by: name };
    if (!r.deleted) {
      if (!SRC[x.src] || x.src === 'parent') x.src = 'family';
      x.srcName = x.src === 'family' ? name : '';
      if (x.editedBy) x.editedBy = name;
    }
    if (!l || newerEntry(x, l)) { S.entries.set(x.id, x); put.push(x); changed++; }
  }
  await putEntries(put);
  S.famSeen[id] = { at: +p.at || 0, n };
  return changed;
}
export async function pullFamily() {
  const f = S.profile.family;
  const helpers = f && f.repo && f.token ? familyMembers(false).filter(([, m]) => m.key).map(([id, m]) => ({ id, key: m.key, plan: !!m.plan })) : [];
  if (!helpers.length) { S.famErr = null; return; }
  try {
    const r = await Sync.pullHelpers({ repo: f.repo, token: f.token, helpers }, {
      getState: () => kvGet('famState'), setState: (s) => kvSet('famState', s), merge: mergeHelper,
    });
    S.famErr = r.problems.length ? { code: 'unreadable', ids: r.problems } : null;
    await kvSet('famSeen', S.famSeen);
    try { await Sync.pushPlans({ repo: f.repo, token: f.token, helpers }, { getState: () => kvGet('planState'), setState: (x) => kvSet('planState', x), build: buildCarerPayload }); } catch (e) { console.warn('plan share', e); }
    if (r.pulled && $('#app').dataset.screen === 'main') renderDependent();
  } catch (e) { console.warn('family', e); S.famErr = e; }
}
// A family member's own phones: merge their entries between their devices.
async function mergeOwn(payloads) {
  let changed = 0; const put = [];
  for (const p of payloads) {
    for (const r of Array.isArray(p.entries) ? p.entries : []) {
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      const l = S.entries.get(r.id);
      if (!l || newerEntry(r, l)) { S.entries.set(r.id, r); put.push(r); changed++; }
    }
  }
  await putEntries(put);
  if (changed && $('#app').dataset.screen === 'main') renderDependent();
  return changed;
}

async function mergeRemote(payloads) {
  let changed = 0; const put = [];
  const newer = newerEntry;
  for (const p of payloads) {
    if (!p || p.app !== 'littleone') continue;
    for (const r of Array.isArray(p.entries) ? p.entries : []) {
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      const l = S.entries.get(r.id);
      if (!l || newer(r, l)) { S.entries.set(r.id, r); put.push(r); changed++; }
    }
    if (p.profile && (p.profile.updatedAt || 0) > (S.profile.updatedAt || 0)) {
      const fam = S.profile.family; const ppl = S.profile.people; const mds = S.profile.meds; const hm = S.profile.home;
      S.profile = { childName: String(p.profile.childName || ''), updatedAt: p.profile.updatedAt };
      if (fam) S.profile.family = fam;
      if (ppl) S.profile.people = ppl;
      if (mds) S.profile.meds = mds;
      if (hm) S.profile.home = hm;
      if (['3-5', '5-13', 'off'].includes(p.profile.sleepGuide)) S.profile.sleepGuide = p.profile.sleepGuide;
      if (AGE_GROUPS[p.profile.nrvAge]) S.profile.nrvAge = p.profile.nrvAge;
      if (p.profile.childSex === 'girl' || p.profile.childSex === 'boy') S.profile.childSex = p.profile.childSex;
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p.profile.childBirth || '')) S.profile.childBirth = p.profile.childBirth;
      await kvSet('profile', S.profile); changed++;
    }
    if (p.profile && p.profile.meds && !isHelper()) {
      const mm = mergePlans(S.profile.meds, p.profile.meds);
      if (JSON.stringify(mm) !== JSON.stringify(cleanPlans(S.profile.meds))) { S.profile = { ...S.profile, meds: mm }; await kvSet('profile', S.profile); changed++; }
    }
    if (p.profile && p.profile.home && !isHelper()) {
      const mh = mergeHome(S.profile.home, p.profile.home);
      if (JSON.stringify(mh) !== JSON.stringify(cleanHome(S.profile.home))) { S.profile = { ...S.profile, home: mh }; await kvSet('profile', S.profile); changed++; }
    }
    if (p.profile && p.profile.people && !isHelper()) {
      const mp = mergePeople(S.profile.people, p.profile.people);
      if (JSON.stringify(mp) !== JSON.stringify(cleanPeople(S.profile.people))) { S.profile = { ...S.profile, people: mp }; await kvSet('profile', S.profile); changed++; }
    }
    if (p.profile && p.profile.family) {
      const merged = mergeFamilyConfig(S.profile.family, p.profile.family);
      if (JSON.stringify(merged) !== JSON.stringify(cleanFamily(S.profile.family))) { S.profile = { ...S.profile, family: merged }; await kvSet('profile', S.profile); changed++; }
    }
    if (p.dev && p.dev !== S.deviceId) S.members[p.dev] = { name: String(p.name || '').slice(0, 40), at: p.at || 0 };
  }
  await putEntries(put);
  await kvSet('members', S.members);
  if (changed && $('#app').dataset.screen === 'main') {
    renderDependent();
    refreshSourceChips($('#log-form'));
  }
  return changed;
}

function setSyncStatus(status) { S.syncStatus = status; updateSyncPill(); }
function updateSyncPill() {
  const pill = $('#sync-pill'); if (!pill) return;
  const map = { off: ['off', 'Not synced'], pending: ['pending', 'Syncing…'], busy: ['busy', 'Syncing…'], ok: ['ok', 'Synced'], offline: ['pending', 'Offline'], error: ['error', 'Sync problem'] };
  const [state, text] = syncOn() ? (map[S.syncStatus] || map.ok) : map.off;
  pill.dataset.state = state; $('#sync-text').textContent = text;
  pill.setAttribute('aria-label', `Sync status: ${text}`);
}

// ---------------------------------------------------------------- setup flows
function suggestedRepo() {
  const h = location.hostname;
  return h.endsWith('.github.io') ? `${h.split('.')[0]}/littleone-data` : '';
}
const keyHowTo = `
  <details class="howto">
    <summary>How to make the GitHub key</summary>
    <ol>
      <li>Open <b>github.com/settings/personal-access-tokens/new</b> in Safari, signed in to GitHub.</li>
      <li>Name it <b>Little One app</b> and set <b>Expiration</b> to <b>No expiration</b>.</li>
      <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick your private storage (for example <b>littleone-data</b>).</li>
      <li>Under <b>Permissions</b>, add <b>Contents</b> and set it to <b>Read and write</b>.</li>
      <li>Tap <b>Generate token</b>, copy it (it starts with github_pat_) and paste it below. You won't need to keep it anywhere else: the invite code carries it to your partner's phone.</li>
    </ol>
  </details>`;

function newLogHTML(withProfile) {
  return `
  ${withProfile ? `
  <div class="set-section">
    <h3>About you</h3>
    <div class="field"><label class="label" for="su-name">Your name</label><input class="input" id="su-name" autocomplete="given-name" maxlength="40" placeholder="Shown as who logged each entry" value="${esc(S.myName)}"></div>
    <div class="field"><label class="label" for="su-child">Your child's name or initials</label><input class="input" id="su-child" maxlength="40" autocomplete="off" placeholder="e.g. E.J." value="${esc(S.profile.childName)}"></div>
  </div>` : ''}
  <div class="set-section">
    <h3>Private sync</h3>
    <p class="hint intro">Entries are locked on this phone with your family passphrase, then stored in your private GitHub repository so your partner's phone can pick them up. GitHub only ever holds locked data.</p>
    <div class="field"><label class="label" for="su-repo">Private storage (owner/name)</label><input class="input" id="su-repo" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="yourname/littleone-data" value="${esc(suggestedRepo())}"></div>
    ${keyHowTo}
    <div class="field"><label class="label" for="su-token">GitHub key</label><input class="input" id="su-token" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="github_pat_…"></div>
    <div class="field"><label class="label" for="su-pass">Family passphrase</label><input class="input" id="su-pass" type="password" autocomplete="new-password" placeholder="At least 10 characters"><p class="hint">Choose something you and your partner will both remember, ideally four or more unrelated words. It can't be recovered if it's forgotten.</p></div>
    <div class="field"><label class="label" for="su-pass2">Type it again</label><input class="input" id="su-pass2" type="password" autocomplete="new-password"></div>
  </div>
  <div id="su-msg" hidden></div>
  <button type="button" class="btn primary block" data-act="su-create">${withProfile ? 'Create log and turn on sync' : 'Turn on sync'}</button>
  ${withProfile ? `<div class="center mt10"><button type="button" class="linkish" data-act="su-local">Skip sync for now (entries stay on this phone)</button></div>` : ''}`;
}

function joinHTML(withProfile, prefill = '') {
  return `
  ${withProfile ? `<div class="field"><label class="label" for="jn-name">Your name</label><input class="input" id="jn-name" autocomplete="given-name" maxlength="40" placeholder="Shown as who logged each entry" value="${esc(S.myName)}"></div>` : ''}
  <div class="field"><label class="label" for="jn-code">Invite code</label><textarea class="textarea" id="jn-code" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Paste the code from your partner's phone (Settings, then Invite your partner)">${esc(prefill)}</textarea></div>
  <div class="field"><label class="label" for="jn-pass">Family passphrase</label><input class="input" id="jn-pass" type="password" autocomplete="current-password"></div>
  <div id="jn-msg" hidden></div>
  <button type="button" class="btn primary block" data-act="jn-join">Join log</button>`;
}

function openNewLog(withProfile) {
  openSheet(withProfile ? 'Start a new log' : 'Turn on sync', newLogHTML(withProfile), {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.act === 'su-local') {
          const name = $('#su-name', b).value.trim();
          if (!name) { showMsg($('#su-msg', b), 'warn', 'Add your name first.'); return; }
          await saveProfileBits(name, $('#su-child', b).value.trim());
          await kvSet('setupDone', true); closeSheet(); showMain();
          toast('Entries will stay on this phone. Turn on sync any time in Settings.');
        } else if (btn.dataset.act === 'su-create') {
          await submitNewLog(b, btn, withProfile);
        } else if (btn.dataset.act === 'su-join-instead') {
          const repo = Sync.normaliseRepo($('#su-repo', b).value); const token = $('#su-token', b).value.trim();
          openJoin(withProfile, repo && token ? Sync.makeInvite(repo, token) : '');
        }
      };
    },
  });
}

async function saveProfileBits(name, child) {
  if (name !== undefined) { S.myName = name.slice(0, 40); await kvSet('myName', S.myName); }
  if (child !== undefined && child !== S.profile.childName) {
    S.profile = { ...S.profile, childName: child.slice(0, 40), updatedAt: Date.now() }; await kvSet('profile', S.profile);
  }
}

async function submitNewLog(b, btn, withProfile) {
  const msg = $('#su-msg', b);
  const name = withProfile ? $('#su-name', b).value.trim() : S.myName;
  const repo = Sync.normaliseRepo($('#su-repo', b).value);
  const token = $('#su-token', b).value.trim();
  const pass = $('#su-pass', b).value; const pass2 = $('#su-pass2', b).value;
  if (withProfile && !name) return showMsg(msg, 'warn', 'Add your name first.');
  if (!repo) return showMsg(msg, 'warn', 'Enter the private storage as owner/name, for example yourname/littleone-data.');
  if (!token) return showMsg(msg, 'warn', 'Paste the GitHub key. Open "How to make the GitHub key" for the steps.');
  if (pass.length < 10) return showMsg(msg, 'warn', 'Use a family passphrase of at least 10 characters.');
  if (pass !== pass2) return showMsg(msg, 'warn', "The two passphrases don't match.");
  setBusy(btn, true, 'Setting up…');
  showMsg(msg, '', 'Checking your storage and locking it with your passphrase. This takes a few seconds.');
  try {
    const keyRaw = await Sync.createFamily(repo, token, pass);
    if (withProfile) await saveProfileBits(name, $('#su-child', b).value.trim());
    S.sync = { repo, token, keyRaw }; await kvSet('sync', S.sync); await kvDel('syncState');
    await kvSet('setupDone', true);
    closeSheet(); showMain();
    openInvite(true);
  } catch (e) {
    console.warn(e);
    showMsg(msg, 'err', esc(e.message || String(e)) + (e.code === 'exists' ? '<div class="mt10"><button type="button" class="btn dark" data-act="su-join-instead">Join instead</button></div>' : ''));
  } finally { setBusy(btn, false); }
}

function openJoin(withProfile, prefill = '') {
  openSheet(withProfile ? "Join your partner's log" : 'Join a shared log', joinHTML(withProfile, prefill), {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="jn-join"]'); if (!btn) return;
        const msg = $('#jn-msg', b);
        const name = withProfile ? $('#jn-name', b).value.trim() : S.myName;
        if (Sync.inviteKind($('#jn-code', b).value) === 'helper') {
          if (!withProfile) return showMsg(msg, 'warn', "That's a family member's code. Family codes are used on a family member's own phone.");
          const code = $('#jn-code', b).value; closeSheet(); openHelperJoin(code); return;
        }
        const inv = Sync.readInvite($('#jn-code', b).value);
        const pass = $('#jn-pass', b).value;
        if (withProfile && !name) return showMsg(msg, 'warn', 'Add your name first.');
        if (!inv) return showMsg(msg, 'warn', "That invite code doesn't look right. Copy the whole code from your partner's phone: Settings, then Invite your partner.");
        if (!pass) return showMsg(msg, 'warn', 'Enter the family passphrase.');
        setBusy(btn, true, 'Joining…');
        showMsg(msg, '', 'Unlocking the shared log. This takes a few seconds.');
        try {
          const keyRaw = await Sync.joinFamily(inv.repo, inv.token, pass);
          if (withProfile) await saveProfileBits(name);
          S.sync = { repo: inv.repo, token: inv.token, keyRaw }; await kvSet('sync', S.sync); await kvDel('syncState');
          await kvSet('setupDone', true);
          closeSheet(); showMain({ sync: false });
          const r = await runSync();
          if (r) toast(r.pulled ? `Joined. ${live().length} entries are on this phone now.` : 'Joined. New entries will appear on both phones.');
        } catch (e) {
          console.warn(e); showMsg(msg, 'err', esc(e.message || String(e)));
        } finally { setBusy(btn, false); }
      };
    },
  });
}

function openInvite(justCreated) {
  const code = Sync.makeInvite(S.sync.repo, S.sync.token);
  openSheet('Invite your partner', `
    ${justCreated ? '<div class="notice ok"><b>Sync is on.</b> Your log is set up and locked with your family passphrase.</div>' : ''}
    <ol class="steps">
      <li>On your partner's phone, open <b>${esc(siteUrl())}</b> in Safari and add Little One to the Home Screen.</li>
      <li>Open it from the Home Screen and tap <b>Join my partner's log</b>.</li>
      <li>Send them the invite code below, and tell them the family passphrase in person.</li>
    </ol>
    <div class="code-box" id="inv-code">${esc(code)}</div>
    <div class="btn-row"><button type="button" class="btn dark" data-act="inv-copy">Copy code</button><button type="button" class="btn ghost" data-act="inv-share">Share code</button></div>
    <p class="hint mt14">The code lets a phone reach your private storage, but everything in it stays locked without the passphrase. Don't send the passphrase in the same message.</p>`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.act === 'inv-copy') {
          try { await navigator.clipboard.writeText(code); toast('Invite code copied'); } catch (e) { toast('Select the code and copy it'); }
        } else if (btn.dataset.act === 'inv-share') {
          if (navigator.share) { try { await navigator.share({ text: code }); } catch (e) { /* cancelled */ } } else { try { await navigator.clipboard.writeText(code); toast('Invite code copied'); } catch (e) { /* ignore */ } }
        }
      };
    },
  });
}

// ---------------------------------------------------------------- settings
function membersList() {
  const byName = {};
  Object.values(S.members).forEach((m) => { if (!byName[m.name] || byName[m.name] < m.at) byName[m.name] = m.at; });
  return Object.entries(byName).sort((a, b) => b[1] - a[1]);
}

async function openSettings() {
  if (isHelper()) { openHelperSettings(); return; }
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* ignore */ }
  const lastBackup = await kvGet('lastBackupAt');
  const err = S.sync && S.syncError && S.syncStatus !== 'ok' ? S.syncError : null;
  const others = membersList();
  openSheet('Settings', `
    <div class="set-section">
      <h3>Your child</h3>
      <div class="field"><label class="label" for="st-child">Name or initials</label><input class="input" id="st-child" maxlength="40" autocomplete="off" value="${esc(S.profile.childName)}"><p class="hint">Shared with your partner's phone.</p></div>
      <div class="field"><label class="label" for="st-sex">Sex, for growth percentiles</label><select class="select" id="st-sex">
        <option value=""${S.profile.childSex ? '' : ' selected'}>Not set</option>
        <option value="girl"${S.profile.childSex === 'girl' ? ' selected' : ''}>Girl</option>
        <option value="boy"${S.profile.childSex === 'boy' ? ' selected' : ''}>Boy</option>
      </select></div>
      <div class="field"><label class="label" for="st-birth">Birth month and year</label><input class="input" id="st-birth" type="month" max="${today().slice(0, 7)}" value="${esc(S.profile.childBirth || '')}"><p class="hint">Only used on this phone to work out growth percentiles (the day of birth isn't needed). Both are shared, locked, with your partner's phone.</p></div>
      <div class="field"><label class="label" for="st-guide">Sleep guideline</label><select class="select" id="st-guide">
        <option value="3-5"${(S.profile.sleepGuide || '3-5') === '3-5' ? ' selected' : ''}>Ages 3–5: 10–13 hours a day</option>
        <option value="5-13"${S.profile.sleepGuide === '5-13' ? ' selected' : ''}>Ages 5–13: 9–11 hours a night</option>
        <option value="off"${S.profile.sleepGuide === 'off' ? ' selected' : ''}>Don't show a guideline</option>
      </select><p class="hint">From Australia's 24-Hour Movement Guidelines. Shown as a band on the sleep chart. The 3–5 guideline includes naps.</p></div>
      <div class="field"><span class="label">What I track</span>
        <p class="hint">Only changes what this phone shows. Nothing is deleted and your partner's phone is unaffected.</p>
        <div class="track-list">${TRACK_CARDS.map(([k, l]) => `<label class="check"><input type="checkbox" data-trackcard="${k}"${cardHidden(k) ? '' : ' checked'}> ${esc(l)}</label>`).join('')}
        <label class="check"><input type="checkbox" data-trackopen="1"${S.track.openCards ? ' checked' : ''}> Keep the cards on the Log tab open</label></div>
        <span class="label mt10">Log form areas</span><div class="track-list">${CATS.map((c) => `<label class="check"><input type="checkbox" data-trackcat="${c.k}"${S.track.hideCats.includes(c.k) ? '' : ' checked'}> ${c.em} ${esc(c.label)}</label>`).join('')}</div></div>
      <div class="field"><span class="label">Routine, plan and appointments</span><div class="btn-stack"><button type="button" class="btn ghost" data-act="open-routines">Bedtime routines</button><button type="button" class="btn ghost" data-act="open-appts">Appointments</button></div></div>
      <div class="field"><label class="label" for="st-outlook">Today's outlook on the Log tab</label><select class="select" id="st-outlook">
        <option value="on"${S.outlook && S.outlook.off ? '' : ' selected'}>Show it when something stands out</option>
        <option value="off"${S.outlook && S.outlook.off ? ' selected' : ''}>Don't show it</option>
      </select><p class="hint">A short heads-up (like a short night's sleep) with its reasons. Only on this phone.</p></div>
      <div class="field"><label class="label" for="st-nrv">Age group for the supplement check</label><select class="select" id="st-nrv">
        ${Object.entries(AGE_GROUPS).map(([k, l]) => `<option value="${k}"${nrvAge() === k ? ' selected' : ''}>${l.charAt(0).toUpperCase() + l.slice(1)}</option>`).join('')}
      </select><p class="hint">Sets which of Australia's upper levels of intake the supplement check uses.</p></div>
    </div>
    <div class="set-section">
      <h3>You</h3>
      <div class="field"><label class="label" for="st-name">Your name on this phone</label><input class="input" id="st-name" maxlength="40" autocomplete="given-name" value="${esc(S.myName)}"><p class="hint">Shown as who logged each entry.</p></div>
    </div>
    <div class="set-section">
      <h3>Sync</h3>
      ${S.sync ? `
        ${err ? `<div class="notice ${err.code === 'offline' ? 'warn' : 'err'}">${esc(err.message)}</div>` : ''}
        <div class="card kv-card">
          <div class="kv"><span>Last synced</span><span>${esc(ago(S.lastSyncAt))}</span></div>
          <div class="kv"><span>Private storage</span><span>${esc(S.sync.repo)}</span></div>
          <div class="kv"><span>This phone</span><span>${esc(S.myName || 'Unnamed')}</span></div>
          ${others.map(([n, at]) => `<div class="kv"><span>${esc(n || 'Another phone')}</span><span>last synced ${esc(ago(at))}</span></div>`).join('')}
        </div>
        <div class="btn-stack"><button type="button" class="btn dark" data-act="st-sync">Sync now</button><button type="button" class="btn ghost" data-act="st-invite">Invite your partner</button><button type="button" class="btn ghost" data-act="st-key">Update GitHub key</button><button type="button" class="btn danger" data-act="st-off">Turn off sync on this phone</button></div>
      ` : `
        <div class="notice warn">Sync is off, so entries are only on this phone.</div>
        <div class="btn-stack"><button type="button" class="btn dark" data-act="st-new">Set up sync</button><button type="button" class="btn ghost" data-act="st-join">Join a shared log</button></div>
      `}
    </div>
    ${peopleSectionHTML()}
    <div class="set-section"><h3>Medicines and supplements</h3><p class="hint intro">A daily plan with one-tap Taken, Late and Missed, shared with everyone using this log.</p><div class="btn-stack"><button type="button" class="btn dark" data-act="med-manage">${Object.keys(medPlans()).length ? 'Manage medicines' : 'Add a medicine'}</button></div></div>
    <div class="set-section"><h3>Feedback</h3><p class="hint intro">Tell us what works and what doesn't. ${S.sync ? 'Feedback from your phones is kept together here.' : ''}</p><div class="btn-stack"><button type="button" class="btn dark" data-act="fb-open">Send feedback</button>${S.sync ? `<button type="button" class="btn ghost" data-act="fb-list">See feedback (${feedbackEntries().length})</button>` : ''}</div></div>
    ${S.sync ? familySectionHTML() : ''}
    <div class="set-section">
      <h3>Backup file</h3>
      <p class="hint intro">${S.sync ? 'Your synced storage already keeps a locked copy. A backup file is an extra copy you keep yourself.' : 'Without sync, a backup file is the only copy outside this phone.'} Last backup: ${lastBackup ? esc(ago(lastBackup)) : 'never'}.</p>
      <div class="btn-row"><button type="button" class="btn ghost" data-act="st-backup">Save a backup</button><button type="button" class="btn ghost" data-act="st-restore">Restore</button></div>
    </div>
    <div class="set-section">
      <h3>Privacy</h3>
      <ul class="steps">
        <li>Entries live on this phone${S.sync ? ', and a copy locked with your family passphrase is kept in your private GitHub storage' : ''}.</li>
        <li>The app can only talk to GitHub. No analytics, ads or tracking.</li>
        <li>Claude built the app but has no access to your storage or entries.</li>
        <li>PDFs and backup files are made on this phone and only go where you send them.</li>
      </ul>
      <div class="kv"><span>Storage on this phone</span><span>${persisted === true ? 'Kept permanently' : persisted === false ? 'May be cleared if space runs low' : 'Unknown'}</span></div>
      <div class="kv"><span>Entries</span><span>${live().length}</span></div>
      <div class="kv"><span>Version</span><span>${APP_VERSION}</span></div>
    </div>`, {
    full: true,
    onMount: (b) => {
      b.onchange = async (ev) => {
        if (ev.target.id === 'st-nrv') { S.profile = { ...S.profile, nrvAge: ev.target.value, updatedAt: Date.now() }; await kvSet('profile', S.profile); scheduleSync(); toast('Saved'); }
        const tgt = ev.target;
        if (tgt.dataset && tgt.dataset.famPlan) {
          const f0 = cleanFamily(S.profile.family); const m0 = f0 && f0.members[tgt.dataset.famPlan]; if (m0) { m0.plan = tgt.checked; m0.updatedAt = Date.now(); f0.updatedAt = Date.now(); await saveFamily(f0); toast(tgt.checked ? 'Sharing the routine and plan' : 'Stopped sharing'); }
          return;
        }
        if (tgt.dataset && (tgt.dataset.trackcard || tgt.dataset.trackcat || tgt.dataset.trackopen)) {
          const set = (arr, k, on) => (on ? arr.filter((x) => x !== k) : arr.includes(k) ? arr : [...arr, k]);
          if (tgt.dataset.trackcard) S.track.hide = set(S.track.hide, tgt.dataset.trackcard, tgt.checked);
          else if (tgt.dataset.trackcat) S.track.hideCats = set(S.track.hideCats, tgt.dataset.trackcat, tgt.checked);
          else S.track.openCards = tgt.checked;
          S.fold = {}; saveTrack(); renderDependent(); mountLogForm(); toast('Saved'); return;
        }
        if (ev.target.id === 'st-outlook') { S.outlook = { ...(S.outlook || {}), off: ev.target.value === 'off' }; await kvSet('outlook', S.outlook); renderOutlook(); toast('Saved'); }
        if (ev.target.id === 'st-sex' || ev.target.id === 'st-birth') {
          const next = { ...S.profile, updatedAt: Date.now() };
          if (ev.target.id === 'st-sex') { if (ev.target.value) next.childSex = ev.target.value; else delete next.childSex; }
          else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ev.target.value)) next.childBirth = ev.target.value; else delete next.childBirth;
          S.profile = next; await kvSet('profile', S.profile); scheduleSync(); toast('Saved');
        }
        if (ev.target.id === 'st-guide') { S.profile = { ...S.profile, sleepGuide: ev.target.value, updatedAt: Date.now() }; await kvSet('profile', S.profile); scheduleSync(); toast('Saved'); }
        if (ev.target.id === 'st-child') { await saveProfileBits(undefined, ev.target.value.trim()); renderHeader(); scheduleSync(); toast('Saved'); }
        if (ev.target.id === 'st-name') {
          const lf = $('#log-form'); const old = S.myName;
          await saveProfileBits(ev.target.value.trim());
          if (lf && lf._st && lf._st.src === 'parent' && lf._st.srcName === (old || 'Me')) lf._st.srcName = S.myName || 'Me';
          refreshSourceChips(lf); scheduleSync(); toast('Saved');
        }
      };
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        const a = btn.dataset.act;
        if (a === 'st-sync') { setBusy(btn, true, 'Syncing…'); const r = await runSync(); setBusy(btn, false); if (r) toast('Synced'); openSettings(); }
        else if (a === 'st-invite') openInvite(false);
        else if (a === 'st-key') openUpdateKey();
        else if (a === 'st-off') openTurnOff();
        else if (a === 'st-new') openNewLog(false);
        else if (a === 'st-join') openJoin(false);
        else if (a === 'st-backup') openBackup();
        else if (a === 'st-restore') openRestore();
        else if (a === 'med-manage') openMedManage();
        else if (a === 'open-routines') openRoutineEditor();
        else if (a === 'open-appts') openApptList();
        else if (a === 'fb-open') openFeedback();
        else if (a === 'fb-list') openFeedbackList();
        else if (a === 'ppl-add') openPersonSheet(null, btn.dataset.name || '');
        else if (btn.dataset.pplEdit) openPersonSheet(btn.dataset.pplEdit, '');
        else if (a === 'fam-setup') openFamilySetup(false);
        else if (a === 'fam-key') openFamilySetup(true);
        else if (a === 'fam-add') openAddHelper();
        else if (btn.dataset.famCode) openHelperCode(btn.dataset.famCode, false);
        else if (btn.dataset.famRemove) openRemoveHelper(btn.dataset.famRemove);
      };
    },
  });
}

function openUpdateKey() {
  openSheet('Update GitHub key', `
    <p class="hint intro">Use this if sync stopped because the key expired or was replaced. Paste either a new key, or a new invite code from your partner's phone.</p>
    ${keyHowTo}
    <div class="field"><label class="label" for="uk-val">New key or invite code</label><textarea class="textarea" id="uk-val" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div>
    <div id="uk-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="uk-save">Save and sync</button>
    <p class="hint">After changing the key on this phone, share the new invite code with your partner so their phone can sync too.</p>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="uk-save"]'); if (!btn) return;
        const v = $('#uk-val', b).value.trim(); const msg = $('#uk-msg', b);
        if (!v) return showMsg(msg, 'warn', 'Paste the new key or invite code.');
        const inv = Sync.readInvite(v);
        const repo = inv ? inv.repo : S.sync.repo; const token = inv ? inv.token : v;
        setBusy(btn, true, 'Checking…');
        try {
          const info = await new Sync.GitHubStore(repo, token).repoInfo();
          if (!info) throw new Error(`Can't find "${repo}" with this key. Check the key was given access to that repository.`);
          S.sync = { ...S.sync, repo, token }; await kvSet('sync', S.sync);
          const r = await runSync();
          if (r) { closeSheet(); toast('Key updated and synced'); } else showMsg(msg, 'err', esc(S.syncError ? S.syncError.message : 'Sync failed'));
        } catch (e) { showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
      };
    },
  });
}

function openTurnOff() {
  openSheet('Turn off sync on this phone?', `
    <p>Entries already on this phone stay here, and nothing is deleted from your private storage or your partner's phone. New entries on this phone won't reach your partner until you join again.</p>
    <div class="btn-row mt18"><button type="button" class="btn ghost" data-act="close-sheet">Keep sync on</button><button type="button" class="btn danger" data-act="off-confirm">Turn off</button></div>`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        if (!ev.target.closest('[data-act="off-confirm"]')) return;
        S.sync = null; S.syncError = null; await kvDel('sync'); await kvDel('syncState');
        setSyncStatus('off'); closeSheet(); toast('Sync is off on this phone');
      };
    },
  });
}

function openBackup() {
  openSheet('Save a backup', `
    <p class="hint intro">The backup file is locked with a password. You can use your family passphrase. Without the password the file can't be opened.</p>
    <div class="field"><label class="label" for="bk-pass">Password</label><input class="input" id="bk-pass" type="password" autocomplete="new-password"></div>
    <div class="field"><label class="label" for="bk-pass2">Type it again</label><input class="input" id="bk-pass2" type="password" autocomplete="new-password"></div>
    <div id="bk-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="bk-make">Create backup file</button>
    <div id="bk-ready"></div>`, {
    full: true,
    onMount: (b) => {
      let file = null;
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.act === 'bk-make') {
          const p1 = $('#bk-pass', b).value; const p2 = $('#bk-pass2', b).value; const msg = $('#bk-msg', b);
          if (p1.length < 8) return showMsg(msg, 'warn', 'Use a password of at least 8 characters.');
          if (p1 !== p2) return showMsg(msg, 'warn', "The two passwords don't match.");
          setBusy(btn, true, 'Locking…');
          try {
            const data = await Sync.makeBackup(p1, { app: 'littleone', v: 1, at: Date.now(), profile: S.profile, entries: Array.from(S.entries.values()), care: S.care, me: S.me });
            file = new Blob([JSON.stringify(data)], { type: 'application/json' });
            $('#bk-msg', b).hidden = true;
            $('#bk-ready', b).innerHTML = `<div class="notice ok mt14"><b>Backup ready</b> (${live().length} entries). Save it somewhere safe, such as Files on your phone.</div><button type="button" class="btn dark block" data-act="bk-share">Share or save backup</button>`;
          } catch (e) { showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
        } else if (btn.dataset.act === 'bk-share' && file) {
          const ok = await shareFile(file, `little-one-backup-${today()}.json`, 'application/json');
          if (ok) { await kvSet('lastBackupAt', Date.now()); toast('Backup saved'); }
        }
      };
    },
  });
}

function openRestore() {
  openSheet('Restore from a backup', `
    <p class="hint intro">Entries in the backup are merged with this phone's. Nothing here is deleted, and the most recently changed version of each entry is kept.</p>
    <div class="field"><label class="label" for="rs-file">Backup file</label><input class="input" id="rs-file" type="file" accept=".json,application/json"></div>
    <div class="field"><label class="label" for="rs-pass">Password</label><input class="input" id="rs-pass" type="password" autocomplete="current-password"></div>
    <div id="rs-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="rs-go">Restore</button>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="rs-go"]'); if (!btn) return;
        const msg = $('#rs-msg', b); const f = $('#rs-file', b).files[0];
        if (!f) return showMsg(msg, 'warn', 'Choose the backup file first.');
        setBusy(btn, true, 'Unlocking…');
        try {
          let json; try { json = JSON.parse(await f.text()); } catch (e) { throw new Error("This file isn't a Little One backup."); }
          const data = await Sync.openBackup($('#rs-pass', b).value, json);
          let n = await mergeRemote([{ app: 'littleone', dev: '', entries: data.entries, profile: data.profile }]);
          n += await mergeCare(data.care);
          n += await mergeMe(data.me);
          scheduleSync(); closeSheet(); renderDependent();
          toast(n ? `Restored ${n} change${n > 1 ? 's' : ''}` : 'Everything in the backup was already here');
        } catch (e) { showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
      };
    },
  });
}

// ---------------------------------------------------------------- Me/Time: parent check-in (private to this phone)
// Tough moments and a daily "my cup" tap, with tips and patterns. Stored only on this phone, never synced, and included in backup files you make.
function cleanMe(list) {
  const out = []; const seen = new Set(); const KEYS = (arr) => new Set(arr.map((x) => x[0]));
  const W = KEYS(WHAT); const Y = KEYS(WHY); const T = new Set(CUP_TAGS.map((x) => x[0]));
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) continue;
    seen.add(r.id);
    if (r.kind === 'cup') out.push({ id: r.id, kind: 'cup', date: r.date, level: [1, 2, 3].includes(+r.level) ? +r.level : 1, tags: (Array.isArray(r.tags) ? r.tags : []).filter((k) => T.has(k)), createdAt: +r.createdAt || 0, updatedAt: +r.updatedAt || 0 });
    else if (r.kind === 'moment' && +r.at > 0) out.push({ id: r.id, kind: 'moment', date: r.date, at: +r.at, what: (Array.isArray(r.what) ? r.what : []).filter((k) => W.has(k)), why: (Array.isArray(r.why) ? r.why : []).filter((k) => Y.has(k)), repair: ['yes', 'soon', 'unsure'].includes(r.repair) ? r.repair : '', copied: r.copied === 'yes' ? 'yes' : '', note: String(r.note || '').slice(0, 300), createdAt: +r.createdAt || 0, updatedAt: +r.updatedAt || 0 });
  }
  return out;
}
const saveMe = () => kvSet('me', S.me);
async function mergeMe(list) {
  let n = 0;
  for (const r of cleanMe(list)) {
    const cur = S.me.find((x) => x.id === r.id);
    if (!cur) { S.me.push(r); n++; } else if (r.updatedAt > cur.updatedAt) { Object.assign(cur, r); n++; }
  }
  if (n) await saveMe();
  return n;
}
const myMoments = () => S.me.filter((r) => r.kind === 'moment');
const myCups = () => S.me.filter((r) => r.kind === 'cup');
const labelOf = (arr, k) => { const x = arr.find((y) => y[0] === k); return x ? x[1] : k; };

function renderMeSwitch(box) {
  box.innerHTML = [['checkin', 'Check-in'], ['care', 'Care time']].map(([k, l]) => `<button type="button" class="chip solid" data-meview="${k}" aria-pressed="${S.meView === k}">${l}</button>`).join('');
  box.onclick = (ev) => { const b = ev.target.closest('[data-meview]'); if (b) { S.meView = b.dataset.meview; S.meChosen = true; renderTime(); } };
}
function tipsHTML(r) {
  return `${r.support ? `<div class="notice err"><b>If you're worried you might hurt them,</b> please reach out now. ${SUPPORT.map(esc).join(' ')} If anyone is in immediate danger, call 000.</div>` : ''}
    <ul class="me-tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
function renderCheckin(box) {
  const t = today(); const cup = myCups().find((c) => c.date === t);
  const moments = myMoments().sort((a, b) => b.at - a.at); const recent = moments.filter((m) => m.date >= addDays(t, -13));
  const sum = momentSummary(moments, t, 28); const ratings = dayRatings(dayfeelEntries());
  const link = childLink(moments.filter((m) => m.date >= addDays(t, -60)), ratings, t); const cl = cupLink(moments, myCups());
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const patterns = !sum ? '' : `<div class="card mt10"><h3 class="card-title">Patterns, last 4 weeks</h3><ul class="me-tips">
      <li>${sum.n} tough moment${sum.n === 1 ? '' : 's'} on ${sum.days} day${sum.days === 1 ? '' : 's'}. ${sum.when.length ? `Most often in the ${esc(sum.when[0][0].toLowerCase())}.` : ''}</li>
      ${sum.why.length ? `<li>Most common backdrop: ${sum.why.slice(0, 2).map(([k, c]) => `${esc(labelOf(WHY, k).toLowerCase())} (${c})`).join(', ')}.</li>` : ''}
      <li>You repaired after ${sum.repaired} of ${sum.n}. ${sum.repaired < sum.n ? 'Repairing, even later in the day, is the part that matters most.' : 'That is the part that matters most.'}</li>
      ${sum.copied ? `<li>You noticed them copying it ${sum.copied} time${sum.copied === 1 ? '' : 's'}.</li>` : ''}
      ${cl ? `<li>On days your cup was stretched or empty, there were ${f1(cl.low)} tough moments a day, against ${f1(cl.ok)} on steady days.</li>` : ''}
      ${link.map((x) => `<li>${x.kind === 'same' ? `Your child's day was rated ${f1(x.withAvg)} on days with a tough moment, against ${f1(x.withoutAvg)} on other days` : x.kind === 'next' ? `The day after a tough moment, their day was rated ${f1(x.withAvg)}, against ${f1(x.withoutAvg)} after other days` : `After a moment you repaired, the next day was rated ${f1(x.withAvg)}, against ${f1(x.withoutAvg)} when you hadn't repaired`} (1 is calm, 4 is hard).</li>`).join('')}
    </ul><p class="hint">These show what goes together, not what causes what. A harder day for them often means a harder day for you too, so it can run both ways.</p></div>`;
  box.innerHTML = `
    <div class="time-private"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Only on this phone. Your partner and family can't see this, and it never syncs. It's included in backup files you make.</span></div>
    <div class="card"><h3 class="card-title">How's your cup today?</h3>
      <div class="chips" role="group" aria-label="How is your cup today">${CUP.map(([v, l, em]) => `<button type="button" class="chip" data-cup="${v}" aria-pressed="${!!cup && cup.level === v}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div>
      ${cup && cup.level >= 2 ? `<div class="chips mt10" role="group" aria-label="What is making it harder">${CUP_TAGS.map(([k, l]) => `<button type="button" class="chip" data-cuptag="${k}" aria-pressed="${cup.tags.includes(k)}">${l}</button>`).join('')}</div>` : ''}
      ${cup && cup.level >= 2 ? `<ul class="me-tips">${cupTips(cup.level, cup.tags).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="hint">A quick tap. Over time it shows how you being low and tough moments go together.</p>'}</div>
    <div class="card mt10"><h3 class="card-title">A tough moment?</h3>
      <p class="hint">Everyone has them. Noting one takes a few taps, and the repair is what counts.</p>
      <button type="button" class="btn dark block" data-act="me-moment">Note a tough moment</button>
      ${recent.length ? `<div class="act-list">${recent.slice(0, 8).map((m) => `<button type="button" class="time-row" data-memoment="${esc(m.id)}"><span><b>${esc(m.what.map((k) => labelOf(WHAT, k)).join(', ') || 'Tough moment')}</b><small>${esc(fmtDayShort(m.date))} · ${esc(fmtTime(msHHMM(m.at)))} · ${m.repair === 'yes' ? 'repaired' : m.repair === 'soon' ? 'repair planned' : 'not repaired yet'}</small></span><span class="dur">${m.copied === 'yes' ? 'copied' : ''}</span></button>`).join('')}</div>` : ''}</div>
    ${patterns}
    <details class="card mt10 me-more"><summary>Tips to come back to</summary>
      <p class="hint">Repair: get down to their level, name what happened, say sorry, say it wasn't their fault, and offer a hug. Any time of day works.</p>
      <p class="hint">Reset: feet on the floor, breathe out longer than in, step away for a minute if they're safe.</p>
      <p class="hint">When they copy it: name it kindly, show the other way, and praise calm words.</p>
      <p class="hint">For you: food, sleep, five minutes alone, a handover with your partner, a friend.</p></details>
    <p class="hint mt14">If things feel like too much: ${SUPPORT.map(esc).join(' ')}</p>`;
  box.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.cup) {
      const lvl = +b.dataset.cup; const now = Date.now(); const cur = myCups().find((c) => c.date === t);
      if (cur && cur.level === lvl) S.me = S.me.filter((x) => x.id !== cur.id);
      else if (cur) Object.assign(cur, { level: lvl, tags: lvl >= 2 ? cur.tags : [], updatedAt: now });
      else S.me.push({ id: Sync.randomId(9), kind: 'cup', date: t, level: lvl, tags: [], createdAt: now, updatedAt: now });
      await saveMe(); renderTime();
    } else if (b.dataset.cuptag) {
      const cur = myCups().find((c) => c.date === t); if (!cur) return;
      cur.tags = cur.tags.includes(b.dataset.cuptag) ? cur.tags.filter((k) => k !== b.dataset.cuptag) : [...cur.tags, b.dataset.cuptag]; cur.updatedAt = Date.now(); await saveMe(); renderTime();
    } else if (b.dataset.act === 'me-moment') openMomentSheet(null);
    else if (b.dataset.memoment) openMomentSheet(S.me.find((x) => x.id === b.dataset.memoment));
  };
}
function openMomentSheet(item) {
  let what = item ? item.what.slice() : []; let why = item ? item.why.slice() : []; let repair = item ? item.repair : ''; let copied = item ? item.copied : '';
  const chips = (arr, sel, attr) => arr.map(([k, l, em]) => `<button type="button" class="chip" ${attr}="${k}" aria-pressed="${sel.includes(k)}"><span aria-hidden="true">${em || ''}</span>${esc(l)}</button>`).join('');
  openSheet(item ? 'Edit tough moment' : 'A tough moment', `
    <div class="field"><span class="label">What happened (tap any)</span><div class="chips" data-w>${chips(WHAT, what, 'data-mw')}</div></div>
    <div class="field"><span class="label">What was going on</span><div class="chips" data-y>${chips(WHY, why, 'data-my')}</div></div>
    <div class="field"><span class="label">Repair</span><div class="chips" data-r>${REPAIR.map(([k, l]) => `<button type="button" class="chip" data-mr="${k}" aria-pressed="${repair === k}">${l}</button>`).join('')}</div></div>
    <div class="field"><button type="button" class="chip" data-mc="1" aria-pressed="${copied === 'yes'}">👀 I saw them copy it</button></div>
    <div class="row2 field"><div><label class="label" for="mm-date">Date</label><input class="input" type="date" id="mm-date" max="${today()}" value="${esc(item ? item.date : today())}"></div>
      <div><label class="label" for="mm-time">Time</label><input class="input" type="time" id="mm-time" value="${esc(item ? msHHMM(item.at) : nowHHMM())}"></div></div>
    <div class="field"><label class="label" for="mm-note">Note (optional)</label><input class="input" id="mm-note" maxlength="300" autocomplete="off" value="${esc(item ? item.note : '')}"></div>
    <div id="mm-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="mm-save">${item ? 'Save changes' : 'Save'}</button>
    ${item ? '<button type="button" class="btn danger block mt10" data-act="mm-del">Delete</button>' : ''}`, {
    onMount: (b) => {
      const flip = (arr, k) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        const press = (attr, on) => btn.setAttribute('aria-pressed', String(on));
        if (btn.dataset.mw) { what = flip(what, btn.dataset.mw); press('', what.includes(btn.dataset.mw)); return; }
        if (btn.dataset.my) { why = flip(why, btn.dataset.my); press('', why.includes(btn.dataset.my)); return; }
        if (btn.dataset.mr) { repair = repair === btn.dataset.mr ? '' : btn.dataset.mr; $$('[data-mr]', b).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mr === repair))); return; }
        if (btn.dataset.mc) { copied = copied === 'yes' ? '' : 'yes'; press('', copied === 'yes'); return; }
        if (btn.dataset.act === 'mm-del' && item) { S.me = S.me.filter((x) => x.id !== item.id); await saveMe(); closeSheet(); renderTime(); toast('Deleted'); return; }
        if (btn.dataset.act !== 'mm-save') return;
        const msg = $('#mm-msg', b); const date = $('#mm-date', b).value; const at = toMs(date, $('#mm-time', b).value);
        if (!date || !isFinite(at)) return showMsg(msg, 'warn', 'Add the date and time.');
        if (at > Date.now() + 60000) return showMsg(msg, 'warn', "That's in the future.");
        if (!what.length) return showMsg(msg, 'warn', 'Tap at least one thing that happened.');
        const now = Date.now(); const note = $('#mm-note', b).value.trim().slice(0, 300);
        const rec = item ? Object.assign(item, { date, at, what, why, repair, copied, note, updatedAt: now }) : { id: Sync.randomId(9), kind: 'moment', date, at, what, why, repair, copied, note, createdAt: now, updatedAt: now };
        if (!item) S.me.push(rec);
        await saveMe(); closeSheet(); renderTime();
        openSheet('Thanks for noting it', `${tipsHTML(tipsFor(rec))}
          ${rec.repair !== 'yes' ? '<button type="button" class="btn dark block mt10" data-act="mm-repaired">I\'ve repaired</button>' : ''}
          <button type="button" class="btn ghost block mt10" data-act="close-sheet">Close</button>`, {
          onMount: (c) => { c.onclick = async (e2) => { const x = e2.target.closest('button'); if (!x) return; if (x.dataset.act === 'mm-repaired') { rec.repair = 'yes'; rec.updatedAt = Date.now(); await saveMe(); closeSheet(); renderTime(); toast('Repair noted. Well done.'); } else if (x.dataset.act === 'close-sheet') closeSheet(); }; },
        });
      };
    },
  });
}

// ---------------------------------------------------------------- care time (private to this phone)
// A private record of the time you spend looking after your child. It is stored only on this phone and is never
// part of the synced log, so your partner and family members can't see it. It is included in backup files you make.
const CARE_KINDS = [['hands', '🤲', 'Hands-on care'], ['settle', '🌙', 'Settling and night'], ['appt', '🩺', 'Appointments and travel'], ['admin', '📋', 'Admin and research'], ['bedtime', '🛁', 'Bath and bedtime routine'], ['meals', '🍽️', 'Meals and prep'], ['play', '🎲', 'Playing together'], ['travel', '🚗', 'Pick-ups and drop-offs'], ['meltdown', '🌋', 'Meltdown support'], ['other', '📝', 'Other']];
const CARE_KIND = Object.fromEntries(CARE_KINDS.map(([k, em, l]) => [k, { em, label: l }]));
let careTick = null;
function cleanCare(list) {
  const out = []; const seen = new Set();
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id)) continue;
    const start = +r.start; const end = +r.end;
    if (!(start > 0) || !(end > start) || end - start > 7 * 86400000) continue;
    seen.add(r.id);
    out.push({ id: r.id, start, end, who: /^[a-f0-9]{8,40}$/.test(r.who || '') ? r.who : '', kind: CARE_KIND[r.kind] ? r.kind : 'other', note: String(r.note || '').slice(0, 200), createdAt: +r.createdAt || start, updatedAt: +r.updatedAt || end });
  }
  return out;
}
function cleanRun(r) { return r && +r.start > 0 && +r.start <= Date.now() + 60000 ? { start: +r.start, kind: CARE_KIND[r.kind] ? r.kind : 'hands', who: /^[a-f0-9]{8,40}$/.test(r.who || '') ? r.who : '' } : null; }
// People who share this log (your partner, from the connected phones) are offered automatically, with an id worked out from their name
// so both phones agree on it. Anyone else comes from the People list in Settings.
const nameId = (n) => { const h = (str) => { let v = 2166136261; for (let i = 0; i < str.length; i++) { v ^= str.charCodeAt(i); v = Math.imul(v, 16777619) >>> 0; } return v.toString(16).padStart(8, '0'); }; const k = String(n).trim().toLowerCase(); return h(k) + h([...k].reverse().join('')); };
const memberPeople = () => {
  const out = {}; const mine = String(S.myName || '').trim().toLowerCase(); const listed = new Set(peopleList(false).map(([, x]) => x.name.toLowerCase()));
  Object.values(S.members || {}).forEach((m) => { const n = String((m && m.name) || '').trim(); const k = n.toLowerCase(); if (n && k !== mine && !listed.has(k)) out[nameId(n)] = n; });
  return out;
};
const whoName = (id) => { if (!id) return S.myName || 'Me'; const x = cleanPeople(S.profile.people)[id]; if (x) return x.name; return memberPeople()[id] || 'Someone'; };
const whoOptions = () => [['', S.myName || 'Me'], ...Object.entries(memberPeople()), ...peopleList(false).filter(([, x]) => x.name.toLowerCase() !== String(S.myName || '').trim().toLowerCase()).map(([id, x]) => [id, x.name])];
const whoChips = (cur, attr) => whoOptions().map(([id, n]) => `<button type="button" class="chip" ${attr}="${esc(id)}" aria-pressed="${(cur || '') === id}">${esc(n)}</button>`).join('');
export function careByPerson(list) {
  const m = new Map();
  for (const r of list) { const w = r.who || ''; const x = m.get(w) || { total: 0, kinds: {}, n: 0 }; const mins = (r.end - r.start) / 60000; x.total += mins; x.n++; x.kinds[r.kind] = (x.kinds[r.kind] || 0) + mins; m.set(w, x); }
  return m;
}
const saveCare = () => kvSet('care', S.care);
async function mergeCare(list) {
  let n = 0;
  for (const r of cleanCare(list)) {
    const cur = S.care.find((x) => x.id === r.id);
    if (!cur) { S.care.push(r); n++; } else if (r.updatedAt > cur.updatedAt) { Object.assign(cur, r); n++; }
  }
  if (n) await saveCare();
  return n;
}
const careMins = (r) => (r.end - r.start) / 60000;
const careDur = (m) => (m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : fmtDur(m));
const msDate = (ms) => ymd(new Date(ms));
const msHHMM = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toMs = (date, hhmm) => { const [y, m, d] = date.split('-').map(Number); const t = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return t ? new Date(y, m - 1, d, +t[1], +t[2]).getTime() : NaN; };
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 3600)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`; };

function personStatsHTML(list) {
  const m = careByPerson(list); if (m.size < 2 && whoOptions().length < 2) return '';
  if (!list.length) return '';
  const rows = Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  const all = rows.reduce((t, [, x]) => t + x.total, 0) || 1;
  const short = { hands: 'hands-on', settle: 'settling', appt: 'visits', admin: 'admin', bedtime: 'bedtime', meals: 'meals', play: 'play', travel: 'travel', meltdown: 'meltdowns', other: 'other' };
  return `<h4 class="feel-sub">Who looked after ${esc(S.profile.childName || 'your child')}</h4><div class="bars time-bars">${rows.map(([w, x]) => `<div class="bar"><span>${esc(whoName(w))}</span><div class="track"><div class="fill" data-w="${Math.max(2, Math.round((x.total / rows[0][1].total) * 100))}"></div></div><span class="n time-n">${careDur(x.total)}</span></div>
    <p class="hint person-kinds">${Math.round((x.total / all) * 100)}% of the time · ${x.n} session${x.n === 1 ? '' : 's'}${Object.entries(x.kinds).sort((a, b) => b[1] - a[1]).map(([k, mm]) => ` · ${short[k]} ${careDur(mm)}`).join('')}</p>`).join('')}</div>`;
}
function renderTime() {
  renderTimerCard();
  const root = $('#time-body'); if (!root) return;
  if (!$('#me-switch', root)) root.innerHTML = '<div class="chips" id="me-switch"></div><div id="me-main" class="mt10"></div>';
  if (!S.meChosen && S.careRun) S.meView = 'care';
  renderMeSwitch($('#me-switch', root));
  clearInterval(careTick);
  if (S.meView === 'care') renderCareTime($('#me-main', root)); else renderCheckin($('#me-main', root));
}
function renderCareTime(box) {
  const run = S.careRun;
  const n = +S.timeRange; const from = addDays(today(), -(n - 1));
  const list = S.care.filter((r) => msDate(r.start) >= from).sort((a, b) => b.start - a.start);
  const total = list.reduce((s, r) => s + careMins(r), 0);
  const byDay = new Map(); list.forEach((r) => { const d = msDate(r.start); byDay.set(d, [...(byDay.get(d) || []), r]); });
  const byKind = CARE_KINDS.map(([k]) => [k, list.filter((r) => r.kind === k).reduce((s, r) => s + careMins(r), 0)]).filter(([, m]) => m > 0);
  const maxK = Math.max(1, ...byKind.map(([, m]) => m));
  const kindChips = (cur) => CARE_KINDS.map(([k, em, l]) => `<button type="button" class="chip solid" data-ckind="${k}" aria-pressed="${cur === k}"><span aria-hidden="true">${em}</span>${l}</button>`).join('');
  const timer = run
    ? `<div class="card timer-card"><span class="label">Timing now</span><div class="timer-clock" data-elapsed>${clock(Date.now() - run.start)}</div>
        <div class="timer-kind">${CARE_KIND[run.kind].em} ${CARE_KIND[run.kind].label}${whoOptions().length > 1 ? ` · ${esc(whoName(run.who))}` : ''} · started ${esc(fmtTime(msHHMM(run.start)))}</div>
        <div class="field"><label class="label" for="cr-note">Note (optional)</label><input class="input" id="cr-note" maxlength="200" autocomplete="off" placeholder="e.g. Settled after a story"></div>
        <div class="btn-row"><button type="button" class="btn ghost" data-act="care-cancel">Discard</button><button type="button" class="btn primary" data-act="care-stop">Stop and save</button></div></div>`
    : `<div class="card timer-card"><span class="label">What are you doing?</span><div class="chips" role="group">${kindChips(S.careKind || 'hands')}</div>
        <span class="label mt10">Who is doing it?</span><div class="chips" role="group" data-whos>${whoChips(S.careWho, 'data-cwho')}<button type="button" class="chip" data-cwho-add="1">+ Add someone</button></div>
        <button type="button" class="btn primary block" data-act="care-start">Start timing</button></div>`;
  const days = Array.from(byDay.entries()).map(([d, rs]) => `<div class="time-day"><h3>${d === today() ? 'Today' : d === addDays(today(), -1) ? 'Yesterday' : esc(fmtDayLong(d))}</h3><span>${careDur(rs.reduce((s, r) => s + careMins(r), 0))}</span></div>`
    + rs.map((r) => `<button type="button" class="time-row" data-care="${esc(r.id)}"><span><b>${CARE_KIND[r.kind].em} ${CARE_KIND[r.kind].label}${whoOptions().length > 1 || r.who ? ` · ${esc(whoName(r.who))}` : ''}</b><small>${esc(fmtTime(msHHMM(r.start)))} to ${esc(fmtTime(msHHMM(r.end)))}${msDate(r.end) !== d ? ' (next day)' : ''}${r.note ? ` · ${esc(r.note)}` : ''}</small></span><span class="dur">${careDur(careMins(r))}</span></button>`).join('')).join('');
  box.innerHTML = `
    <div class="time-private"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Only on this phone. Your partner and family can't see this, and it never syncs. It's included in backup files you make.</span></div>
    ${timer}
    <div class="chips mt10" id="time-range">${[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']].map(([k, l]) => `<button type="button" class="chip solid" data-trange="${k}" aria-pressed="${S.timeRange === k}">${l}</button>`).join('')}</div>
    <div class="card mt10">
      <div class="time-total"><div class="stat"><b>${total ? careDur(total) : '0'}</b><span>Total</span></div><div class="stat"><b>${total ? careDur(total / n) : '0'}</b><span>A day on average</span></div><div class="stat"><b>${byDay.size}</b><span>Days with time</span></div></div>
      ${byKind.length ? `<div class="bars time-bars">${byKind.map(([k, m]) => `<div class="bar"><span>${CARE_KIND[k].em} ${({ hands: 'Hands-on', settle: 'Settling', appt: 'Visits', admin: 'Admin', bedtime: 'Bedtime', meals: 'Meals', play: 'Play', travel: 'Travel', meltdown: 'Meltdowns', other: 'Other' })[k]}</span><div class="track"><div class="fill" data-w="${Math.max(2, Math.round((m / maxK) * 100))}"></div></div><span class="n time-n">${careDur(m)}</span></div>`).join('')}</div>` : '<p class="hint">Start the timer, or add time you forgot to log. Totals appear here.</p>'}
      ${personStatsHTML(list)}
    </div>
    <button type="button" class="btn dark block" data-act="care-add">Add time I forgot to log</button>
    ${days}
    <div class="time-actions">${S.care.length ? '<button type="button" class="btn ghost" data-act="care-csv">Save a spreadsheet (CSV) of everything</button>' : ''}</div>
    <p class="hint mt14">Time that runs past midnight counts towards the day it started. Time is yours to define: add whatever counts as looking after your child.</p>`;
  applySizes(box);
  clearInterval(careTick);
  if (run) careTick = setInterval(() => { const el = $('[data-elapsed]'); if (el && S.careRun) el.textContent = clock(Date.now() - S.careRun.start); }, 1000);
  box.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.ckind) { S.careKind = b.dataset.ckind; renderTime(); }
    else if (b.dataset.trange) { S.timeRange = b.dataset.trange; renderTime(); }
    else if (b.dataset.cwho !== undefined) { S.careWho = b.dataset.cwho; renderTime(); }
    else if (b.dataset.cwhoAdd) openPersonSheet(null, '', () => renderTime());
    else if (b.dataset.act === 'care-start') { S.careRun = { start: Date.now(), kind: S.careKind || 'hands', who: S.careWho || '' }; await kvSet('careRun', S.careRun); renderTime(); }
    else if (b.dataset.act === 'care-cancel') { S.careRun = null; await kvDel('careRun'); renderTime(); toast('Discarded'); }
    else if (b.dataset.act === 'care-stop') {
      const r = S.careRun; if (!r) return; const end = Date.now();
      const item = { id: Sync.randomId(9), start: r.start, end: Math.max(end, r.start + 1000), who: r.who || '', kind: r.kind, note: ($('#cr-note', box).value || '').trim().slice(0, 200), createdAt: end, updatedAt: end };
      S.care.push(item); S.careRun = null; await saveCare(); await kvDel('careRun'); renderTime();
      toast(`Saved ${careDur(careMins(item))}`, { label: 'Undo', fn: async () => { S.care = S.care.filter((x) => x.id !== item.id); await saveCare(); renderTime(); } });
    }
    else if (b.dataset.act === 'care-add') openCareSheet(null);
    else if (b.dataset.care) openCareSheet(S.care.find((x) => x.id === b.dataset.care));
    else if (b.dataset.act === 'care-csv') {
      const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
      const rows = [['Date', 'Start', 'End', 'Minutes', 'Who', 'Type', 'Note'], ...S.care.slice().sort((a, c) => a.start - c.start).map((r) => [msDate(r.start), msHHMM(r.start), msHHMM(r.end), Math.round(careMins(r)), whoName(r.who), CARE_KIND[r.kind].label, r.note])];
      const ok = await shareFile(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }), `care-time-${today()}.csv`, 'text/csv');
      if (ok) toast('Saved. This file isn\'t locked, so keep it somewhere private.');
    }
  };
}

function openCareSheet(item) {
  const d0 = item ? msDate(item.start) : today();
  let kind = item ? item.kind : 'hands'; let who = item ? item.who || '' : S.careWho || '';
  openSheet(item ? 'Edit time' : 'Add time', `
    <div class="row2 field">
      <div><label class="label" for="ct-date">Date</label><input class="input" type="date" id="ct-date" max="${today()}" value="${esc(d0)}"></div>
      <div></div>
    </div>
    <div class="row2 field">
      <div><label class="label" for="ct-start">From</label><input class="input" type="time" id="ct-start" value="${item ? esc(msHHMM(item.start)) : ''}"></div>
      <div><label class="label" for="ct-end">To</label><input class="input" type="time" id="ct-end" value="${item ? esc(msHHMM(item.end)) : ''}"></div>
    </div>
    <p class="hint">If it ends after midnight, just enter the later time. It will be counted as ending the next day.</p>
    <div class="field"><span class="label">Type</span><div class="chips" data-kinds>${CARE_KINDS.map(([k, em, l]) => `<button type="button" class="chip solid" data-ckind="${k}" aria-pressed="${kind === k}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div></div>
    <div class="field"><span class="label">Who</span><div class="chips" data-whos>${whoChips(who, 'data-cwho')}</div><p class="hint">Not here? Add people under Settings, People who help.</p></div>
    <div class="field"><label class="label" for="ct-note">Note (optional)</label><input class="input" id="ct-note" maxlength="200" autocomplete="off" value="${esc(item ? item.note : '')}"></div>
    <div id="ct-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="ct-save">${item ? 'Save changes' : 'Add'}</button>
    ${item ? '<button type="button" class="btn danger block mt10" data-act="ct-del">Delete</button>' : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.cwho !== undefined) { who = btn.dataset.cwho; $$('[data-cwho]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        if (btn.dataset.ckind) { kind = btn.dataset.ckind; $$('[data-ckind]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        const msg = $('#ct-msg', b);
        if (btn.dataset.act === 'ct-del' && item) {
          S.care = S.care.filter((x) => x.id !== item.id); await saveCare(); closeSheet(); renderTime();
          toast('Deleted', { label: 'Undo', fn: async () => { S.care.push(item); await saveCare(); renderTime(); } });
        } else if (btn.dataset.act === 'ct-save') {
          const date = $('#ct-date', b).value; const s = toMs(date, $('#ct-start', b).value); let e = toMs(date, $('#ct-end', b).value);
          if (!date) return showMsg(msg, 'warn', 'Choose a date.');
          if (date > today()) return showMsg(msg, 'warn', "The date can't be in the future.");
          if (!isFinite(s) || !isFinite(e)) return showMsg(msg, 'warn', 'Add the start and end times.');
          if (e <= s) e += 86400000;
          if (e - s > 16 * 3600000) return showMsg(msg, 'warn', "That's over 16 hours. Check the times, or add it as separate blocks.");
          if (e > Date.now() + 60000) return showMsg(msg, 'warn', "That ends in the future. Use the timer for time that's still going.");
          const now = Date.now(); const note = $('#ct-note', b).value.trim().slice(0, 200);
          if (item) Object.assign(item, { start: s, end: e, who, kind, note, updatedAt: now });
          else S.care.push({ id: Sync.randomId(9), start: s, end: e, who, kind, note, createdAt: now, updatedAt: now });
          await saveCare(); closeSheet(); renderTime(); toast(item ? 'Saved' : `Added ${careDur((e - s) / 60000)}`);
        }
      };
    },
  });
}

// ---------------------------------------------------------------- feedback
// A button on every screen. Parents with sync on save feedback into the shared log, where every parent can read it (Settings, Feedback).
// Family helpers, and phones without sync, share it as a message instead.
const FB_KINDS = [['bug', '🐞', 'Something broke'], ['confusing', '❓', 'Confusing'], ['idea', '💡', 'Idea'], ['love', '💛', 'Love this']];
const FB_FACES = [[1, '😞'], [2, '😐'], [3, '🙂']];
const feedbackEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'feedback' && e.text).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const SCREEN_NAME = { log: 'Log', history: 'History', insights: 'Insights', time: 'Me/Time', export: 'Export' };
function feedbackText(e) { return `[${(FB_KINDS.find((k) => k[0] === e.fkind) || ['', '', 'Note'])[2]}${e.face ? ` · ${['', 'unhappy', 'okay', 'happy'][e.face]}` : ''}] ${e.text}\n(${e.screen || 'unknown screen'}, version ${e.version || '?'}${e.by ? `, from ${e.by}` : ''}, ${e.date || ''})`; }
function openFeedback() {
  let kind = 'idea'; let face = 0; const screen = SCREEN_NAME[S.tab] || 'Log'; const canSave = syncOn() && !isHelper();
  openSheet('Feedback', `
    <p class="hint intro">Anything is welcome: a bug, something confusing, an idea, or something you like.</p>
    <div class="field"><div class="chips" data-fk>${FB_KINDS.map(([k, em, l]) => `<button type="button" class="chip" data-fkind="${k}" aria-pressed="${kind === k}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div></div>
    <div class="field"><span class="label">How is it feeling?</span><div class="chips" data-ff>${FB_FACES.map(([v, em]) => `<button type="button" class="chip" data-fface="${v}" aria-pressed="false" aria-label="${['', 'Unhappy', 'Okay', 'Happy'][v]}"><span aria-hidden="true">${em}</span></button>`).join('')}</div></div>
    <div class="field"><label class="label" for="fb-text">What would you like to say?</label><textarea class="textarea" id="fb-text" maxlength="1000" placeholder="Tell us what happened or what you'd change"></textarea></div>
    <p class="hint">It includes the screen you were on (${esc(screen)}) and the app version. It never includes anything you've logged.${canSave ? ' It is saved in your shared log so your partner can read it too.' : ''}</p>
    <div id="fb-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="fb-send">${canSave ? 'Save feedback' : 'Share feedback'}</button>
    ${canSave ? '<button type="button" class="btn ghost block mt10" data-act="fb-share">Share it as a message instead</button>' : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.fkind) { kind = btn.dataset.fkind; $$('[data-fkind]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        if (btn.dataset.fface) { face = face === +btn.dataset.fface ? 0 : +btn.dataset.fface; $$('[data-fface]', b).forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.fface === face))); return; }
        const act = btn.dataset.act; if (act !== 'fb-send' && act !== 'fb-share') return;
        const text = $('#fb-text', b).value.trim().slice(0, 1000);
        if (!text && !face) return showMsg($('#fb-msg', b), 'warn', 'Add a few words, or tap a face.');
        const now = Date.now();
        const e = { id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'feedback', date: today(), tod: 'Midday', title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || '', fkind: kind, face, text: text || '(no message)', screen, version: APP_VERSION };
        if (act === 'fb-send' && canSave) { S.entries.set(e.id, e); await putEntries([e]); scheduleSync(); closeSheet(); toast('Thank you. Saved in your shared log.'); return; }
        const msg = feedbackText(e);
        try { if (navigator.share) { await navigator.share({ text: `Little One feedback\n${msg}` }); closeSheet(); toast('Thank you'); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
        try { await navigator.clipboard.writeText(`Little One feedback\n${msg}`); closeSheet(); toast('Copied. Paste it into a message to send.'); } catch (err) { showMsg($('#fb-msg', b), 'warn', 'Couldn\'t share from here. Select and copy this: ' + esc(msg)); }
      };
    },
  });
}
function openFeedbackList() {
  const list = feedbackEntries();
  openSheet('Feedback', list.length ? `<div class="card kv-card">${list.map((e) => `<div class="kv helper-row"><span><b>${esc((FB_KINDS.find((k) => k[0] === e.fkind) || ['', '', 'Note'])[2])}${e.face ? ` ${FB_FACES.find((f) => f[0] === e.face)[1]}` : ''}</b><small>${esc(e.by || 'Someone')} · ${esc(fmtDayShort(e.date))} · ${esc(e.screen || '')}</small><small class="fb-text">${esc(e.text)}</small></span><span class="mini-links"><button type="button" data-fbdel="${esc(e.id)}">Delete</button></span></div>`).join('')}</div>
      <button type="button" class="btn dark block mt10" data-act="fb-copy">Copy all</button>` : '<p class="hint">No feedback yet.</p>', {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.fbdel) { await deleteActivity({ id: btn.dataset.fbdel }); openFeedbackList(); }
        else if (btn.dataset.act === 'fb-copy') { try { await navigator.clipboard.writeText(`Little One feedback (${list.length})\n\n${list.map(feedbackText).join('\n\n')}`); toast('Copied'); } catch (e) { toast("Couldn't copy from here"); } }
      };
    },
  });
}

// ---------------------------------------------------------------- medicines (shared)
// The plan (names, doses, times) lives in the shared profile so every parent sees the same list. Each dose is a small synced entry
// (cat 'meddose') with a fixed id, so two phones marking the same dose end up with one record. Side-effect notes are 'sidefx' entries.
// These stay out of History and the PDF. The app records and shows patterns; it never advises on changing a medicine.
const medPlans = () => cleanPlans(S.profile.meds);
const medDoses = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'meddose' && e.planId && e.date && e.slot);
const sidefxEntries = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.cat === 'sidefx' && e.date && Array.isArray(e.effects));
async function savePlans(map) { S.profile = { ...S.profile, meds: cleanPlans(map), updatedAt: Date.now() }; await kvSet('profile', S.profile); scheduleSync(300); }
async function setDose(planId, date, slot, status) {
  const id = doseId(planId, date, slot); const cur = S.entries.get(id); const now = Date.now();
  if (cur && !cur.deleted && cur.status === status) { await saveActivity({ id, deleted: true, updatedAt: now, by: S.myName || '' }); return; }
  await saveActivity({ id, createdAt: cur && cur.createdAt ? cur.createdAt : now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'meddose', planId, date, slot, status, takenAt: status === 'missed' ? '' : nowHHMM(), tod: todForTime(slot) || 'Morning', title: '', notes: '', sev: 0, src: 'parent', srcName: S.myName || 'Me' });
}
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
export function renderMedsCard() {
  const box = $('#meds-card'); if (!box) return;
  setAttn('meds', false);
  if (isHelper() || cardHidden('meds')) { box.innerHTML = ''; return; }
  const t = today(); const plans = medPlans(); const active = Object.fromEntries(Object.entries(plans).filter(([, p]) => activeOn(p, t)));
  if (!Object.keys(active).length) { box.innerHTML = ''; return; }
  const doses = medDoses(); const rows = todayRows(active, doses.filter((d) => d.date === t), t, nowMin());
  const prn = Object.entries(active).filter(([, p]) => isPrn(p));
  const stat = [['taken', 'Taken'], ['late', 'Late'], ['missed', 'Missed']];
  const rowHTML = rows.map((r) => `<div class="med-row"><div class="med-name"><b>💊 ${esc(r.plan.name)}</b><small>${esc([r.plan.dose, fmtTime(r.slot)].filter(Boolean).join(' · '))}${r.overdue ? ` · due ${r.overdue >= 60 ? fmtDur(r.overdue) : `${r.overdue} min`} ago` : ''}</small>${r.dose ? `<small>${r.status === 'missed' ? 'Missed' : r.status === 'late' ? 'Given late' : 'Taken'}${r.dose.takenAt ? ` at ${esc(fmtTime(r.dose.takenAt))}` : ''} · ${esc(r.dose.srcName || r.dose.by || '')}</small>` : ''}</div>
    <div class="act-btns">${stat.map(([k, l]) => `<button type="button" class="chip" data-dose="${esc(r.id)}|${r.slot}|${k}" aria-pressed="${r.status === k}">${l}</button>`).join('')}</div></div>`).join('');
  const prnHTML = prn.map(([id, p]) => { const given = doses.filter((d) => d.planId === id && d.date === t).sort((a, b) => (a.takenAt || '').localeCompare(b.takenAt || '')); return `<div class="med-row"><div class="med-name"><b>💊 ${esc(p.name)}</b><small>${esc([p.dose, 'as needed'].filter(Boolean).join(' · '))}${given.length ? ` · given ${given.length} time${given.length === 1 ? '' : 's'} today, last at ${esc(fmtTime(given[given.length - 1].takenAt || given[given.length - 1].slot))}` : ''}</small></div><div class="act-btns"><button type="button" class="chip" data-prn="${esc(id)}">Give now</button></div></div>`; }).join('');
  const off = rows.filter((r) => r.status === 'missed').length; const late = rows.filter((r) => r.status === 'late').length;
  const goalHTML = Object.entries(active).map(([id, p]) => { const r = retestInfo(p, id, doses, t); return r ? `<p class="med-goal"><b>${esc(r.head)}</b> ${esc(r.line)}${r.tally ? ` <small>${esc(r.tally)}</small>` : ''}</p>` : ''; }).join('');
  const nextGoal = Object.entries(active).map(([id, p]) => retestInfo(p, id, doses, t)).filter((r) => r && r.days >= 0).sort((a, b) => a.days - b.days)[0];
  const given = rows.filter((r) => r.status === 'taken' || r.status === 'late').length;
  const msum = (rows.length ? `${given} of ${rows.length} given${off ? ` · ${off} missed` : ''}` : 'As needed only') + (nextGoal ? ` · ${nextGoal.short}` : '');
  box.innerHTML = foldCard('meds', 'Medicines and supplements', msum, `${rowHTML}${prnHTML}${goalHTML}
    ${off ? '<p class="hint">A dose was missed. Noting how the day goes helps show whether it made a difference.</p>' : late ? '<p class="hint">A dose was given late today.</p>' : ''}
    <div class="act-btns mt10"><button type="button" class="chip" data-act="med-effect">Note an effect</button><button type="button" class="chip" data-act="med-manage">Manage medicines</button></div>`, rows.some((r) => r.overdue && r.status !== 'taken' && r.status !== 'late'), 'act-card');
  setAttn('meds', rows.some((r) => r.overdue && !['taken', 'late', 'missed'].includes(r.status)));
  box.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const refresh = () => { renderMedsCard(); renderOutlook(); if (S.tab === 'insights') renderInsights(); };
    if (b.dataset.dose) { const [id, slot, st] = b.dataset.dose.split('|'); await setDose(id, today(), slot, st); refresh(); }
    else if (b.dataset.prn) { await setDose(b.dataset.prn, today(), nowHHMM(), 'taken'); refresh(); toast('Dose logged'); }
    else if (b.dataset.act === 'med-effect') openEffectSheet();
    else if (b.dataset.act === 'med-manage') openMedManage();
  };
}
function openMedManage() {
  const plans = Object.entries(medPlans()).filter(([, p]) => !p.removed).sort((a, b) => a[1].name.localeCompare(b[1].name)); const t = today();
  openSheet('Medicines and supplements', `${plans.length ? `<div class="card kv-card">${plans.map(([id, p]) => `<div class="kv helper-row"><span><b>${esc(p.name)}</b><small>${esc([p.kind === 'supplement' ? 'Supplement' : '', p.dose, p.times.length ? p.times.map(fmtTime).join(', ') : 'as needed', p.end && p.end < t ? `stopped ${fmtDayShort(p.end)}` : ''].filter(Boolean).join(' · '))}</small>${listedHTML(p.name)}</span><span class="mini-links"><button type="button" data-medit="${esc(id)}">Edit</button></span></div>`).join('')}</div>` : '<p class="hint">No medicines yet.</p>'}
    <button type="button" class="btn dark block mt10" data-act="med-add">Add a medicine or supplement</button>
    <p class="hint">Shared with everyone using this log. Little One records and shows patterns. It doesn't give advice about starting, stopping or changing a medicine. Talk to the prescriber about that.</p>`, {
    onMount: (b) => { b.onclick = (ev) => { const x = ev.target.closest('button'); if (!x) return; if (x.dataset.medit) openMedSheet(x.dataset.medit); else if (x.dataset.act === 'med-add') openMedSheet(null); }; },
  });
}
function listedHTML(name) {
  const m = listedFor(name); if (!m) return '';
  return `<details class="med-listed"><summary>Listed possible effects</summary><small>${esc(m.effects.join(', '))}. From ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.source)}</a>` : esc(m.source)}. This is what the source lists, not a sign it is happening.${m.timing ? ` ${esc(m.timing)}` : ''}</small></details>`;
}
function openMedSheet(id) {
  const plans = medPlans(); const cur = id ? plans[id] : null; let days = cur ? cur.days.slice() : [];
  const timeInputs = [0, 1, 2, 3].map((i) => `<input class="input" type="time" id="mp-t${i}" aria-label="Time ${i + 1}" value="${esc(cur && cur.times[i] ? cur.times[i] : '')}">`).join('');
  let kind = cur ? cur.kind : 'medicine';
  openSheet(cur ? `Edit ${cur.kind === 'supplement' ? 'supplement' : 'medicine'}` : 'Add a medicine or supplement', `
    <div class="field"><span class="label">Type</span><div class="chips">${[['medicine', 'Medicine'], ['supplement', 'Supplement']].map(([k, l]) => `<button type="button" class="chip" data-mkindp="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="mp-name">Name</label><input class="input" id="mp-name" maxlength="60" autocomplete="off" placeholder="e.g. Melatonin" value="${esc(cur ? cur.name : '')}"></div>
    <div class="field"><label class="label" for="mp-dose">Dose</label><input class="input" id="mp-dose" maxlength="60" autocomplete="off" placeholder="e.g. 2 mg" value="${esc(cur ? cur.dose : '')}"></div>
    ${cur ? `<div class="field" id="mp-changewrap"><label class="label" for="mp-changed">If the dose changed, from</label><input class="input" type="date" id="mp-changed" max="${today()}" value="${today()}"><p class="hint">Used only when you change the dose above. The change is marked on your charts.</p></div>` : ''}
    <div class="field"><span class="label">Times each day</span><div class="row2 time-grid">${timeInputs}</div><p class="hint">Leave all blank for "as needed".</p></div>
    <div class="field"><span class="label">Days</span><div class="chips" data-mdays>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip" data-mday="${d}" aria-pressed="${days.includes(d)}">${DAY_NAMES[d]}</button>`).join('')}</div><p class="hint">Leave all unselected for every day.</p></div>
    <div class="field"><label class="label" for="mp-start">Started on</label><input class="input" type="date" id="mp-start" max="${today()}" value="${esc(cur ? cur.start : today())}"></div>
    <label class="check"><input type="checkbox" id="mp-carers"${cur && cur.carers ? ' checked' : ''}> Show carers this medicine and its times (family members you share the plan with)</label>
    <div class="field"><label class="label" for="mp-retest">Check or retest on (optional)</label><div class="row2"><input class="input" type="date" id="mp-retest" min="${today()}" value="${esc(cur ? cur.retest : '')}" aria-label="Retest date"><input class="input" id="mp-retestl" maxlength="40" autocomplete="off" placeholder="e.g. Iron retest" value="${esc(cur ? cur.retestLabel : '')}" aria-label="What it is for"></div><p class="hint">Shows a gentle countdown and a daily encouragement on the Medicines card.</p>${cur && cur.retest && cur.times.length ? '<button type="button" class="btn ghost block" data-act="mp-ics">Add a daily reminder to my calendar</button>' : ''}</div>
    <div class="field"><label class="label" for="mp-notes">Notes (optional)</label><input class="input" id="mp-notes" maxlength="200" autocomplete="off" placeholder="e.g. with food" value="${esc(cur ? cur.notes : '')}"></div>
    <div id="mp-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="mp-save">${cur ? 'Save changes' : 'Add'}</button>
    ${cur ? `${!cur.end ? '<button type="button" class="btn ghost block mt10" data-act="mp-stop">Stopped taking it</button>' : '<button type="button" class="btn ghost block mt10" data-act="mp-resume">Started again</button>'}<button type="button" class="btn danger block mt10" data-act="mp-del">Remove from the list</button>` : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.mkindp) { kind = btn.dataset.mkindp; $$('[data-mkindp]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        if (btn.dataset.mday) { const d = +btn.dataset.mday; days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]; btn.setAttribute('aria-pressed', String(days.includes(d))); return; }
        const all = medPlans(); const done = () => { closeSheet(); renderMedsCard(); renderOutlook(); openMedManage(); if (S.tab === 'insights') renderInsights(); };
        if (btn.dataset.act === 'mp-stop' && id) { all[id] = { ...all[id], end: today(), updatedAt: Date.now() }; await savePlans(all); done(); return; }
        if (btn.dataset.act === 'mp-resume' && id) { all[id] = { ...all[id], end: '', updatedAt: Date.now() }; await savePlans(all); done(); return; }
        if (btn.dataset.act === 'mp-del' && id) { all[id] = { ...all[id], removed: true, updatedAt: Date.now() }; await savePlans(all); done(); toast('Removed'); return; }
        if (btn.dataset.act === 'mp-ics' && cur) {
          const ics = reminderIcs(cur, today(), Sync.randomId(12));
          if (!ics) { toast('Add a retest date and a time first, then save.'); return; }
          const ok = await shareFile(new Blob([ics], { type: 'text/calendar' }), `${cur.name.replace(/[^\w]+/g, '-').slice(0, 30)}-reminder.ics`, 'text/calendar');
          if (ok) toast('Open the file to add it to your calendar.'); return;
        }
        if (btn.dataset.act !== 'mp-save') return;
        const name = $('#mp-name', b).value.trim(); const dose = $('#mp-dose', b).value.trim();
        if (!name) return showMsg($('#mp-msg', b), 'warn', 'Add the name.');
        const times = [0, 1, 2, 3].map((i) => $(`#mp-t${i}`, b).value).filter(Boolean);
        const start = $('#mp-start', b).value || today();
        const next = { ...(cur || {}), kind, name, dose, times, days, notes: $('#mp-notes', b).value.trim(), start, carers: $('#mp-carers', b).checked, retest: $('#mp-retest', b).value || '', retestLabel: $('#mp-retestl', b).value.trim().slice(0, 40), end: cur ? cur.end : '', history: cur ? cur.history.slice() : [], removed: false, updatedAt: Date.now() };
        if (cur && dose && dose !== cur.dose) { const cd = $('#mp-changed', b).value || today(); next.history.push({ date: cd > today() ? today() : cd, dose }); }
        all[id || Sync.randomId(9)] = next; await savePlans(all); done(); toast(cur && dose !== cur.dose ? 'Saved. Dose change marked.' : 'Saved');
      };
    },
  });
}
function openEffectSheet() {
  const plans = Object.entries(medPlans()).filter(([, p]) => activeOn(p, today())); let pick = plans.length === 1 ? plans[0][0] : ''; let picked = [];
  openSheet('Note an effect', `
    <p class="hint intro">Anything you notice, so patterns can show up over time. It doesn't mean the medicine caused it.</p>
    <div class="field"><span class="label">What did you notice?</span><div class="chips" data-ef>${EFFECTS.map(([k, l]) => `<button type="button" class="chip" data-ef="${k}" aria-pressed="false">${l}</button>`).join('')}</div></div>
    ${plans.length > 1 ? `<div class="field"><span class="label">Which medicine, if you know</span><div class="chips">${plans.map(([id, p]) => `<button type="button" class="chip" data-ep="${esc(id)}" aria-pressed="false">${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label class="label" for="ef-note">Note (optional)</label><input class="input" id="ef-note" maxlength="200" autocomplete="off"></div>
    <div id="ef-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="ef-save">Save</button>`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.ef) { picked = picked.includes(btn.dataset.ef) ? picked.filter((x) => x !== btn.dataset.ef) : [...picked, btn.dataset.ef]; btn.setAttribute('aria-pressed', String(picked.includes(btn.dataset.ef))); return; }
        if (btn.dataset.ep) { pick = pick === btn.dataset.ep ? '' : btn.dataset.ep; $$('[data-ep]', b).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.ep === pick))); return; }
        if (btn.dataset.act !== 'ef-save') return;
        if (!picked.length) return showMsg($('#ef-msg', b), 'warn', 'Tap at least one.');
        const now = Date.now(); const plan = pick ? medPlans()[pick] : null;
        await saveActivity({ id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId, cat: 'sidefx', date: today(), time: nowHHMM(), tod: currentTod(), effects: picked, planId: pick, planName: plan ? plan.name : '', title: '', notes: $('#ef-note', b).value.trim().slice(0, 200), sev: 0, src: 'parent', srcName: S.myName || 'Me' });
        const m = plan ? listedFor(plan.name) : null; const hit = m ? picked.filter((k) => m.keys.includes(k)) : [];
        closeSheet(); renderMedsCard(); if (S.tab === 'insights') renderInsights();
        toast(hit.length ? `Saved. ${labelOfEffect(hit[0])} is listed as a possible effect of ${plan.name} in its consumer information. Worth mentioning to the prescriber.` : 'Saved');
      };
    },
  });
}
const labelOfEffect = (k) => (EFFECTS.find((e) => e[0] === k) || [k, k])[1];
function medsInsightHTML() {
  if (isHelper()) return '';
  const plans = medPlans(); const live = Object.fromEntries(Object.entries(plans).filter(([, p]) => !p.removed)); if (!Object.keys(live).length) return '';
  const doses = medDoses(); const t = today(); const ratings = dayRatings(dayfeelEntries()); const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const ad = Object.values(adherence(live, doses, t, 14));
  const adHTML = ad.length ? `<ul class="me-tips">${ad.map((a) => `<li>${esc(a.name)}: ${a.taken} of ${a.due} doses logged as taken over the last 14 days${a.late ? ` (${a.late} late)` : ''}${a.missed ? `, ${a.missed} missed` : ''}${a.unlogged ? `, ${a.unlogged} not logged` : ''}.</li>`).join('')}</ul>` : '';
  const nights = sleepNights(live_all());
  const ba = beforeAfter(changePoints(live), ratings, nights, t).slice(-3);
  const baHTML = ba.map((r) => `<li>After you ${esc(r.label)} (${esc(fmtDayShort(r.date))}): their days were rated ${f1(r.afterRating)}, against ${f1(r.beforeRating)} in the weeks before (${r.afterN} and ${r.beforeN} rated days)${r.beforeSleep != null && Math.abs(r.afterSleep - r.beforeSleep) >= 30 ? `; sleep averaged ${fmtDur(Math.round(r.afterSleep))} compared with ${fmtDur(Math.round(r.beforeSleep))}` : ''}.</li>`).join('');
  const ml = missedLink(live, doses, ratings, t);
  const mlHTML = ml ? `<li>Days with every dose taken were rated ${f1(ml.allTaken)} on average, against ${f1(ml.offDays)} on days a dose was missed or late (${ml.allTakenN} and ${ml.offN} days).</li>` : '';
  const ec = effectCounts(sidefxEntries(), t, 30).slice(0, 4);
  const ecHTML = ec.length ? `<li>Noticed in the last 30 days: ${ec.map(([k, c]) => `${esc(labelOfEffect(k).toLowerCase())} (${c})`).join(', ')}.</li>` : '';
  return `<div class="card"><h3 class="card-title">Medicines</h3>${adHTML}${baHTML || mlHTML || ecHTML ? `<ul class="me-tips">${baHTML}${mlHTML}${ecHTML}</ul>` : ''}
    <p class="hint">These show what goes together, not what causes what. Many things change a child's days. If a pattern worries you, show it to the prescriber, and don't change a medicine on your own.</p></div>`;
}
const live_all = () => live();

// ---------------------------------------------------------------- people
function peopleSectionHTML() {
  if (isHelper()) return '';
  const list = peopleList(false);
  const known = new Set(list.map(([, x]) => x.name.toLowerCase())); known.add((S.myName || '').toLowerCase());
  const suggest = Object.values(S.members).map((m) => String(m.name || '').trim()).filter((n) => n && !known.has(n.toLowerCase()));
  return `<div class="set-section"><h3>People who help</h3>
    <p class="hint intro">Add your partner, carers and family here. Everyone sharing this log sees the same list, and can pick them under "who" when logging.</p>
    ${list.length ? `<div class="card kv-card">${list.map(([id, x]) => `<div class="kv helper-row"><span><b>${esc(x.name)}</b><small>${esc(PEOPLE_ROLE[x.role].label)}</small></span><span class="mini-links"><button type="button" data-ppl-edit="${esc(id)}">Edit</button></span></div>`).join('')}</div>` : '<p class="hint">No one added yet.</p>'}
    <div class="btn-stack">${suggest.slice(0, 2).map((n) => `<button type="button" class="btn ghost" data-act="ppl-add" data-name="${esc(n)}">Add ${esc(n)}</button>`).join('')}<button type="button" class="btn dark" data-act="ppl-add">Add a person</button></div></div>`;
}
function openPersonSheet(id, presetName, onDone) {
  const cur = id ? cleanPeople(S.profile.people)[id] : null; let role = cur ? cur.role : (presetName ? 'parent' : 'carer');
  openSheet(cur ? 'Edit person' : 'Add a person', `
    <div class="field"><label class="label" for="pp-name">Name</label><input class="input" id="pp-name" maxlength="40" autocomplete="off" value="${esc(cur ? cur.name : presetName)}"></div>
    <div class="field"><span class="label">Who are they?</span><div class="chips" data-roles>${PEOPLE_ROLES.map(([k, em, l]) => `<button type="button" class="chip" data-prole="${k}" aria-pressed="${role === k}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div></div>
    <div id="pp-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="pp-save">${cur ? 'Save changes' : 'Add'}</button>
    ${cur ? '<button type="button" class="btn danger block mt10" data-act="pp-remove">Remove from lists</button><p class="hint">Their past entries and time keep their name.</p>' : ''}`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.prole) { role = btn.dataset.prole; $$('[data-prole]', b).forEach((x) => x.setAttribute('aria-pressed', String(x === btn))); return; }
        const all = cleanPeople(S.profile.people);
        if (btn.dataset.act === 'pp-remove' && id) { all[id] = { ...all[id], removed: true, updatedAt: Date.now() }; await savePeople(all); closeSheet(); if (onDone) onDone(); else openSettings(); toast('Removed'); }
        else if (btn.dataset.act === 'pp-save') {
          const name = $('#pp-name', b).value.trim().slice(0, 40);
          if (!name) return showMsg($('#pp-msg', b), 'warn', 'Add a name.');
          if (Object.entries(all).some(([k, x]) => k !== id && !x.removed && x.name.toLowerCase() === name.toLowerCase())) return showMsg($('#pp-msg', b), 'warn', 'Someone with that name is already on the list.');
          const pid = id || Sync.randomId(9); all[pid] = { name, role, removed: false, updatedAt: Date.now() };
          await savePeople(all); closeSheet(); if (onDone) onDone(); else openSettings(); refreshSourceChips($('#log-form')); toast('Saved');
        }
      };
    },
  });
}

// ---------------------------------------------------------------- family members
// Parents add family members (grandparents and so on) here. Each gets their own code for their own phone.
const childOr = (fallback) => S.profile.childName || fallback;
function familySectionHTML() {
  const f = S.profile.family;
  if (!f || !f.repo || !f.token) {
    return `<div class="set-section">
      <h3>Family members</h3>
      <p class="hint intro">Let grandparents and other family add entries from their own phones. They only ever see what they add. You and your partner see everything.</p>
      <div class="btn-stack"><button type="button" class="btn dark" data-act="fam-setup">Set up family members</button></div>
    </div>`;
  }
  const list = familyMembers(false).sort((a, b) => a[1].createdAt - b[1].createdAt);
  const err = S.famErr;
  const errText = !err ? '' : err.code === 'unreadable'
    ? `Some entries from ${familyMembers(true).filter(([id]) => err.ids.includes(id)).map(([, m]) => esc(m.name)).join(', ') || 'a family member'} couldn't be unlocked, so they were skipped. If this keeps happening, remove that person and add them again for a new code.`
    : esc(err.message || String(err));
  return `<div class="set-section">
    <h3>Family members</h3>
    ${err ? `<div class="notice ${err.code === 'offline' ? 'warn' : 'err'}">${errText}</div>` : ''}
    ${list.length ? `<div class="card kv-card">${list.map(([id, m]) => {
      const seen = S.famSeen[id];
      return `<div class="kv helper-row"><span><b>${esc(m.name)}</b><small>${seen && seen.at ? `Last synced ${esc(ago(seen.at))} · ${seen.n} entr${seen.n === 1 ? 'y' : 'ies'}` : 'Not joined yet'}</small><label class="check mini"><input type="checkbox" data-fam-plan="${esc(id)}"${m.plan ? ' checked' : ''}> Share the routine and plan with them</label></span>
        <span class="mini-links"><button type="button" data-fam-code="${esc(id)}">Code</button><button type="button" data-fam-remove="${esc(id)}">Remove</button></span></div>`;
    }).join('')}</div>` : '<p class="hint">No family members yet.</p>'}
    <div class="btn-stack"><button type="button" class="btn dark" data-act="fam-add">Add a family member</button><button type="button" class="btn ghost" data-act="fam-key">Update family storage key</button></div>
    <p class="hint">Their entries appear in your log with their name. Tick "Share the routine and plan" for someone you want to follow the routine, and they will see only the routines, days, appointments and medicines you have marked for carers. Family storage: ${esc(f.repo)}.</p>
  </div>`;
}

function suggestedFamilyRepo() {
  const owner = (S.sync && S.sync.repo ? S.sync.repo.split('/')[0] : '') || (location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '');
  return owner ? `${owner}/littleone-family` : '';
}

function openFamilySetup(update) {
  const f = S.profile.family;
  openSheet(update ? 'Update family storage key' : 'Set up family members', `
    <p class="hint intro">${update
      ? "Use this if the family storage key expired, or you made a new one to stop someone reaching the family storage. Afterwards, send each family member a new code: their old code carries the old key."
      : 'Family entries are kept in a second private storage, separate from your log. Family members get a key that can only reach that storage, so they can never reach your entries.'}</p>
    <ol class="steps">
      ${update ? '' : '<li>On GitHub, open <b>github.com/new</b>. Name it <b>littleone-family</b>, choose <b>Private</b>, and tap <b>Create repository</b>.</li>'}
      <li>Open <b>github.com/settings/personal-access-tokens/new</b>. Name it <b>Little One family</b> and set <b>Expiration</b> to <b>No expiration</b>.</li>
      <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>littleone-family</b> only. Leave your main storage out.</li>
      <li>Under <b>Permissions</b>, add <b>Contents</b> and set it to <b>Read and write</b>. Tap <b>Generate token</b> and copy it.</li>
    </ol>
    <div class="field"><label class="label" for="fs-repo">Family storage (owner/name)</label><input class="input" id="fs-repo" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="yourname/littleone-family" value="${esc((f && f.repo) || suggestedFamilyRepo())}"></div>
    <div class="field"><label class="label" for="fs-token">Family storage key</label><input class="input" id="fs-token" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="github_pat_…"><p class="hint">Kept inside your locked log, so your partner's phone gets it too.</p></div>
    <div id="fs-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="fs-save">Check and save</button>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="fs-save"]'); if (!btn) return;
        const msg = $('#fs-msg', b);
        const repo = Sync.normaliseRepo($('#fs-repo', b).value); const token = $('#fs-token', b).value.trim();
        if (!repo) return showMsg(msg, 'warn', 'Enter the family storage as owner/name, for example yourname/littleone-family.');
        if (!token) return showMsg(msg, 'warn', 'Paste the family storage key.');
        if (token === S.sync.token) return showMsg(msg, 'warn', "That's the key for your main storage. Make a separate key that can only reach the family storage.");
        setBusy(btn, true, 'Checking…');
        try {
          await Sync.setupFamilyStorage(repo, token, S.sync.repo);
          const cur = cleanFamily(S.profile.family) || { members: {} };
          await saveFamily({ ...cur, repo, token, updatedAt: Date.now() });
          await kvDel('famState');
          closeSheet();
          if (update) { toast('Saved. Send each family member a new code from Settings.'); openSettings(); } else openAddHelper();
        } catch (e) { showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
      };
    },
  });
}

function openAddHelper() {
  openSheet('Add a family member', `
    <p class="hint intro">Each family member gets their own code for their own phone. With it they can add entries and see only the ones they've added.</p>
    <div class="field"><label class="label" for="ah-name">Their name</label><input class="input" id="ah-name" maxlength="40" autocomplete="off" placeholder="e.g. Grandma, Nan or Uncle Tom"><p class="hint">Shown on everything they log.</p></div>
    <div id="ah-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="ah-make">Make their code</button>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="ah-make"]'); if (!btn) return;
        const name = $('#ah-name', b).value.trim();
        if (!name) return showMsg($('#ah-msg', b), 'warn', 'Add their name first.');
        const id = Sync.randomId(9); const now = Date.now();
        const cur = cleanFamily(S.profile.family);
        cur.members[id] = { name: name.slice(0, 40), key: Sync.newHelperKey(), createdAt: now, updatedAt: now, removed: false };
        await saveFamily(cur);
        openHelperCode(id, true);
      };
    },
  });
}

function openHelperCode(id, justMade) {
  const f = S.profile.family; const m = f && f.members[id]; if (!m || m.removed) return;
  const code = Sync.makeHelperInvite({ repo: f.repo, token: f.token, id, key: m.key, name: m.name, child: S.profile.childName, age: S.profile.nrvAge });
  const who = esc(m.name);
  openSheet(`${m.name}'s code`, `
    ${justMade ? `<div class="notice ok"><b>${who} is added.</b> Send them this code to finish.</div>` : ''}
    <ol class="steps">
      <li>On ${who}'s phone, open <b>${esc(siteUrl())}</b> in Safari and add Little One to the Home Screen.</li>
      <li>Open it from the Home Screen and tap <b>Join as family</b>.</li>
      <li>Paste the code below.</li>
    </ol>
    <div class="code-box" id="hc-code">${esc(code)}</div>
    <div class="btn-row"><button type="button" class="btn dark" data-act="hc-copy">Copy code</button><button type="button" class="btn ghost" data-act="hc-share">Share code</button></div>
    <p class="hint mt14">Send it privately. Anyone with this code can add entries as ${who} and see what ${who} has added, but nothing else. If it's shared by mistake, remove ${who} and add them again for a new code.</p>`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.act === 'hc-copy') {
          try { await navigator.clipboard.writeText(code); toast('Code copied'); } catch (e) { toast('Select the code and copy it'); }
        } else if (btn.dataset.act === 'hc-share') {
          if (navigator.share) { try { await navigator.share({ text: code }); } catch (e) { /* cancelled */ } } else { try { await navigator.clipboard.writeText(code); toast('Code copied'); } catch (e) { /* ignore */ } }
        }
      };
    },
  });
}

function openRemoveHelper(id) {
  const m = S.profile.family && S.profile.family.members[id]; if (!m) return;
  const who = esc(m.name);
  openSheet(`Remove ${m.name}?`, `
    <p>Entries ${who} has already added stay in your log. Anything new from ${who}'s phone won't be added.</p>
    <p class="hint">${who}'s phone can still reach the family storage until you make a new family storage key on GitHub, delete the old one, and update it here. You'd then send new codes to everyone you're keeping.</p>
    <div class="btn-row mt18"><button type="button" class="btn ghost" data-act="close-sheet">Keep ${who}</button><button type="button" class="btn danger" data-act="rm-confirm">Remove</button></div>`, {
    onMount: (b) => {
      b.onclick = async (ev) => {
        if (!ev.target.closest('[data-act="rm-confirm"]')) return;
        const cur = cleanFamily(S.profile.family);
        cur.members[id] = { ...cur.members[id], key: '', removed: true, updatedAt: Date.now() };
        await saveFamily(cur);
        toast(`${m.name} removed`); openSettings();
      };
    },
  });
}

// Family member phones.
function openHelperJoin(prefill = '') {
  openSheet('Join as family', `
    <p class="hint intro">Paste the code you were sent. You'll be able to add entries and look back at the ones you've added. What the parents log stays private to them.</p>
    <div class="field"><label class="label" for="hj-code">Family code</label><textarea class="textarea" id="hj-code" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Starts with LOF1-">${esc(prefill)}</textarea></div>
    <div id="hj-msg" hidden></div>
    <button type="button" class="btn primary block" data-act="hj-join">Join</button>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('[data-act="hj-join"]'); if (!btn) return;
        const msg = $('#hj-msg', b); const code = $('#hj-code', b).value;
        if (Sync.inviteKind(code) === 'partner') return showMsg(msg, 'warn', "That's a partner invite, which also needs the family passphrase. If you're a parent, go back and choose Join my partner's log.");
        const inv = Sync.readHelperInvite(code);
        if (!inv) return showMsg(msg, 'warn', "That code doesn't look right. Copy the whole code, starting with LOF1-.");
        setBusy(btn, true, 'Joining…');
        try {
          await Sync.checkFamilyStorage(inv.repo, inv.token);
          await becomeHelper(inv);
          closeSheet(); showMain({ sync: false });
          const r = await runSync();
          toast(r && r.pulled ? `Welcome back, ${S.myName}. Your earlier entries are here.` : `You're set up as ${S.myName}. What you add is shared with ${childOr('the')}${S.profile.childName ? "'s" : ''} parents.`);
        } catch (e) { console.warn(e); showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
      };
    },
  });
}
async function becomeHelper(inv) {
  const same = S.fam && S.fam.id === inv.id;
  S.role = 'helper'; await kvSet('role', 'helper');
  S.fam = { repo: inv.repo, token: inv.token, id: inv.id, keyRaw: inv.keyRaw }; await kvSet('fam', S.fam);
  if (!same) await kvDel('syncState');
  S.myName = inv.name || 'Family'; await kvSet('myName', S.myName);
  S.profile = { childName: inv.child, updatedAt: 0 };
  if (AGE_GROUPS[inv.age]) S.profile.nrvAge = inv.age;
  await kvSet('profile', S.profile);
  await kvSet('setupDone', true);
}

async function openHelperSettings() {
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* ignore */ }
  const err = S.syncError && S.syncStatus !== 'ok' ? S.syncError : null;
  const child = esc(childOr('the child'));
  openSheet('Settings', `
    <div class="set-section">
      <h3>You</h3>
      ${err ? `<div class="notice ${err.code === 'offline' ? 'warn' : 'err'}">${esc(err.message)}</div>` : ''}
      <div class="card kv-card">
        <div class="kv"><span>Logging as</span><span>${esc(S.myName || 'Family')}</span></div>
        <div class="kv"><span>For</span><span>${child}</span></div>
        <div class="kv"><span>Last synced</span><span>${esc(ago(S.lastSyncAt))}</span></div>
      </div>
      <div class="btn-stack"><button type="button" class="btn dark" data-act="hs-sync">Sync now</button><button type="button" class="btn ghost" data-act="hs-code">Use a new code</button></div>
    </div>
    <div class="set-section">
      <h3>Privacy</h3>
      <ul class="steps">
        <li>You can see the entries you add. ${child === 'the child' ? 'The parents' : `${child}'s parents`} can see them too.</li>
        <li>What the parents or other family log stays private to them. This phone can't unlock it.</li>
        <li>Your entries are locked on this phone before they're stored, with a key only your code carries.</li>
        <li>The app can only talk to GitHub. No analytics, ads or tracking.</li>
      </ul>
      <div class="kv"><span>Storage on this phone</span><span>${persisted === true ? 'Kept permanently' : persisted === false ? 'May be cleared if space runs low' : 'Unknown'}</span></div>
      <div class="kv"><span>Your entries</span><span>${live().length}</span></div>
      <div class="kv"><span>Version</span><span>${APP_VERSION}</span></div>
    </div>`, {
    full: true,
    onMount: (b) => {
      b.onclick = async (ev) => {
        const btn = ev.target.closest('button'); if (!btn) return;
        if (btn.dataset.act === 'hs-sync') { setBusy(btn, true, 'Syncing…'); const r = await runSync(); setBusy(btn, false); if (r) toast('Synced'); openHelperSettings(); }
        else if (btn.dataset.act === 'hs-code') openHelperJoin();
      };
    },
  });
}

// ---------------------------------------------------------------- update banner (service worker)
let updateRequested = false;
let swReg = null;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    const offer = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;
      const slot = $('#update-banner-slot');
      slot.innerHTML = '<div class="banner"><span>A new version of Little One is ready.</span><button type="button">Update</button></div>';
      $('button', slot).onclick = () => { updateRequested = true; w.postMessage('skipWaiting'); };
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('sw', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
}

// ---------------------------------------------------------------- refresh
// Check for a new version, sync with your partner, and bring the screen up to date (time, banner, cards).
let refreshing = false;
async function refreshApp() {
  if (refreshing) return; refreshing = true;
  const btn = $('#refresh-btn'); if (btn) btn.classList.add('spin');
  try {
    let update = false;
    if (swReg) { try { await swReg.update(); update = !!(swReg.waiting || swReg.installing); } catch (e) { /* offline */ } }
    let synced = false;
    if (syncOn()) synced = !!(await runSync());
    refreshFormClock(); renderDependent();
    if (update) toast('A new version is ready. Tap Update at the top of the Log tab.');
    else toast(syncOn() ? (synced ? 'Refreshed and synced' : 'Refreshed. Sync didn\'t finish, check your connection.') : 'Refreshed');
  } finally { refreshing = false; if (btn) btn.classList.remove('spin'); }
}
// Pull down from the top of the screen to refresh.
function setupPullToRefresh() {
  let y0 = null; let pulled = 0; const ptr = $('#ptr');
  const reset = () => { y0 = null; pulled = 0; if (ptr) { ptr.classList.remove('show', 'ready'); } };
  document.addEventListener('touchstart', (ev) => { y0 = window.scrollY <= 0 && ev.touches.length === 1 && !$('#sheet-wrap').classList.contains('open') ? ev.touches[0].clientY : null; pulled = 0; }, { passive: true });
  document.addEventListener('touchmove', (ev) => {
    if (y0 == null) return; pulled = ev.touches[0].clientY - y0;
    if (window.scrollY > 0 || pulled < 12) { if (ptr) ptr.classList.remove('show', 'ready'); return; }
    if (ptr) { ptr.classList.add('show'); ptr.classList.toggle('ready', pulled > 90); ptr.textContent = pulled > 90 ? 'Release to refresh' : 'Pull to refresh'; }
  }, { passive: true });
  document.addEventListener('touchend', () => { const go = y0 != null && pulled > 90; reset(); if (go) refreshApp(); }, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}

// ---------------------------------------------------------------- boot
async function init() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
  S.deviceId = await kvGet('deviceId');
  if (!S.deviceId) { S.deviceId = Sync.randomId(9); await kvSet('deviceId', S.deviceId); }
  S.myName = (await kvGet('myName')) || '';
  S.profile = (await kvGet('profile')) || { childName: '', updatedAt: 0 };
  S.sync = (await kvGet('sync')) || null;
  S.members = (await kvGet('members')) || {};
  S.hiddenItems = (await kvGet('hiddenItems')) || {};
  S.outlook = (await kvGet('outlook')) || {};
  S.role = (await kvGet('role')) === 'helper' ? 'helper' : 'parent';
  S.fam = (await kvGet('fam')) || null;
  S.plan = (await kvGet('plan')) || null;
  S.famSeen = (await kvGet('famSeen')) || {};
  S.care = cleanCare(await kvGet('care'));
  S.me = cleanMe(await kvGet('me'));
  S.careRun = cleanRun(await kvGet('careRun'));
  S.actRun = cleanActRun(await kvGet('actRun'));
  S.scrRun = cleanScrRun(await kvGet('scrRun'));
  const ss = await kvGet('syncState'); S.lastSyncAt = (ss && ss.lastSyncAt) || 0;
  (await getAllEntries()).forEach((e) => S.entries.set(e.id, e));

  registerSW();
  setupFolds();
  watchIcons(document.body);
  const lb = $('#log-back'); if (lb) lb.onclick = () => { S.fromTile = false; switchTab('today'); };
  setInterval(() => { try { if (document.visibilityState === 'visible' && $('#app').dataset.screen === 'main' && S.tab === 'today') { renderRoutineCard(); renderApptCard(); renderToday(); } } catch (e) { /* ignore */ } }, 60000);

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'close-sheet') closeSheet();
    else if (a === 'start-new') openNewLog(true);
    else if (a === 'start-join') openJoin(true);
    else if (a === 'start-helper') openHelperJoin();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('#sheet-wrap').classList.contains('open')) closeSheet(); });
  $$('.tabbar [data-tab]').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  const ex = $('#open-export'); if (ex) ex.onclick = () => switchTab('export');
  $('#open-settings').onclick = openSettings;
  $('#refresh-btn').onclick = refreshApp;
  $('#fb-fab').onclick = openFeedback;
  setupPullToRefresh();
  $('#sync-pill').onclick = async () => {
    if (!syncOn()) { openSettings(); return; }
    if (S.syncStatus === 'error') { openSettings(); return; }
    const r = await runSync();
    if (r) toast('Synced just now'); else if (S.syncError) toast(S.syncError.message);
  };
  let searchTimer = null;
  $('#search').oninput = (ev) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.hist.q = ev.target.value; S.hist.limit = 60; renderHistory(); }, 150); };
  $('#install-skip').onclick = () => show('welcome');

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFormClock(); });
  window.addEventListener('pageshow', refreshFormClock);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncOn() && Date.now() - S.lastSyncAt > 20000) runSync();
  });
  window.addEventListener('online', () => { if (syncOn()) runSync(); });
  setInterval(() => { if (document.visibilityState === 'visible' && syncOn() && !syncing && Date.now() - S.lastSyncAt > 60000) runSync(); }, 30000);

  if (await kvGet('setupDone')) { showMain(); return; }
  show(isIOS() && !isStandalone() ? 'install' : 'welcome');
}

init().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div class="hero"><h1>Little One couldn't open</h1><p>${esc(e && e.message ? e.message : e)}</p><p>Close the app completely and open it again. Your entries are still stored on this phone.</p></div>`;
});
