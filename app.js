import { getAllEntries, putEntries, kvGet, kvSet, kvDel } from './db.js';
import * as Sync from './sync.js';

export const APP_VERSION = '1.3.0';

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
  { k: 'appointment', label: 'Appointment', em: '🩺', ph: 'e.g. GP check-up' },
  { k: 'social', label: 'Social', em: '🤝', ph: 'e.g. Played well with a new friend' },
  { k: 'development', label: 'Development', em: '🌱', ph: 'e.g. Wrote their name for the first time' },
  { k: 'win', label: 'Win', em: '⭐', ph: 'e.g. Used words to say they were upset' },
  { k: 'other', label: 'Other', em: '📝', ph: 'A short description' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.k, c]));
export const SOURCES = [
  { k: 'parent', label: 'Parents', em: '👤' },
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
const EXTRA_FIELDS = { sleep: ['time'], health: ['temp', 'time'], medication: ['med', 'dose', 'time'], supplement: ['med', 'dose', 'time'], appointment: ['time'], bloodtest: [] };
// Areas where a concern level doesn't apply (shown without one, and left out of concern counts).
export const NO_CONCERN = new Set(['win', 'supplement', 'bloodtest']);
export const noConcern = (e) => NO_CONCERN.has(e.cat) || !e.sev;
export const ITEM_LABEL = { medication: 'Medicine', supplement: 'Supplement' };

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
  return SRC[k].label;
}
// What to show as an entry's heading. The description is optional when something else describes
// the entry (a medicine or supplement, a temperature, or notes).
export function headline(e, allowNotes = true) {
  if (e.cat === 'sleep' && SLEEP_KIND_KEYS.includes(e.sleep)) return { text: `${{ bed: 'Went to sleep', wake: 'Woke up', waking: 'Woke in the night' }[e.sleep]}${e.time ? ` at ${fmtTime(e.time)}` : ''}`, from: 'sleep' };
  const t = String(e.title || '').trim();
  if (t) return { text: t, from: 'title' };
  const res = Array.isArray(e.results) ? e.results.filter((r) => r && String(r.name || '').trim()).map((r) => String(r.name).trim()) : [];
  if (res.length) return { text: res.length > 3 ? `${res.slice(0, 3).join(', ')} and ${res.length - 3} more` : res.length > 1 ? `${res.slice(0, -1).join(', ')} and ${res[res.length - 1]}` : res[0], from: 'results' };
  const med = String(e.med || '').trim();
  if (med) return { text: [med, String(e.dose || '').trim()].filter(Boolean).join(', '), from: 'med' };
  if (String(e.temp || '').trim()) return { text: `Temperature ${fmtTemp(e.temp)}`, from: 'temp' };
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
  tab: 'log',
  hist: { cat: 'all', q: '', limit: 60 },
  insightRange: '30',
  exp: null, lastPdf: null, pdfUrl: null,
  hiddenItems: {},
};
const live = () => Array.from(S.entries.values()).filter((e) => e && !e.deleted && e.date);
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
function openSheet(title, html, { full = false, onMount } = {}) {
  $('#sheet-title').textContent = title;
  const sheet = $('#sheet'); sheet.classList.toggle('full', full);
  const body = $('#sheet-body'); body.innerHTML = html; body.scrollTop = 0;
  body.onclick = null; body.oninput = null; body.onchange = null; body.onsubmit = null;
  $('#sheet-wrap').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(body);
}
function closeSheet() {
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
  renderHeader();
  mountLogForm();
  switchTab(S.tab);
  updateSyncPill();
  if (S.sync && opts.sync !== false) runSync();
}

function renderHeader() {
  const n = S.profile.childName;
  $('#child-line').textContent = n ? `${possessive(n)} journal` : 'Add your child\'s name in Settings';
}

function switchTab(tab) {
  S.tab = tab;
  $$('.tabbar [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  renderTab();
  window.scrollTo({ top: 0 });
}
function renderTab() {
  if (S.tab === 'history') renderHistory();
  else if (S.tab === 'insights') renderInsights();
  else if (S.tab === 'export') renderExport();
}
function renderDependent() { renderHeader(); renderTab(); }

// ---------------------------------------------------------------- entry form
function parentNames(extra) {
  const names = [];
  const add = (n) => { n = String(n || '').trim(); if (n && !names.includes(n)) names.push(n); };
  add(S.myName || 'Me');
  Object.values(S.members).sort((a, b) => (b.at || 0) - (a.at || 0)).forEach((m) => add(m.name));
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
    <div><label class="label" for="${uid}-tod">Time of day</label><select class="select" id="${uid}-tod" data-f="tod">${TODS.map((t) => `<option value="${t.k}">${t.em} ${t.k}</option>`).join('')}</select></div>
  </div>
  <div class="field">
    <span class="label" id="${uid}-catl">Area</span>
    <div class="cat-grid" role="group" aria-labelledby="${uid}-catl">${CATS.map((c) => `<button type="button" class="cat-btn" data-cat="${c.k}" aria-pressed="${st.cat === c.k}"><span class="em" aria-hidden="true">${c.em}</span>${c.label}</button>`).join('')}</div>
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
  const parentChips = parentNames(st.src === 'parent' ? st.srcName : '').map((n) =>
    `<button type="button" class="chip" data-src="parent" data-name="${esc(n)}" aria-pressed="${st.src === 'parent' && st.srcName === n}"><span aria-hidden="true">👤</span>${esc(n)}</button>`).join('');
  const otherChips = SOURCES.filter((s) => s.k !== 'parent').map((s) =>
    `<button type="button" class="chip" data-src="${s.k}" aria-pressed="${st.src === s.k}"><span aria-hidden="true">${s.em}</span>${s.label}</button>`).join('');
  return parentChips + otherChips;
}
function refreshSourceChips(el) {
  if (!el || !el._st) return;
  const box = $('[data-srcs]', el); if (box) box.innerHTML = sourceChipsHTML(el._st);
}

function renderExtra(el) {
  const st = el._st; const x = st.extra; const box = $('[data-extra]', el);
  const uid = st.mode === 'edit' ? 'ed' : 'lg';
  const inp = (f, label, attrs = '') => `<div class="field"><label class="label" for="${uid}-x-${f}">${label}</label><input class="input" id="${uid}-x-${f}" data-x="${f}" value="${esc(x[f] || '')}" autocomplete="off" ${attrs}></div>`;
  let html = '';
  if (st.cat === 'health') html = `<div class="row2">${inp('temp', 'Temperature (°C)', 'inputmode="decimal" placeholder="e.g. 38.2"')}${inp('time', 'Time (optional)', 'type="time"')}</div>`;
  else if (st.cat === 'medication') html = `${savedHTML(st)}${inp('med', 'Medicine', 'placeholder="e.g. Paracetamol"')}<div class="row2">${inp('dose', 'Dose', 'placeholder="e.g. 7.5 mL"')}${inp('time', 'Time given', 'type="time"')}</div>${contentsHTML(st, uid)}`;
  else if (st.cat === 'supplement') html = `${savedHTML(st)}${inp('med', 'Supplement', 'placeholder="e.g. Kids multivitamin gummy"')}<div class="row2">${inp('dose', 'Amount given', 'placeholder="e.g. 2 gummies"')}${inp('time', 'Time given', 'type="time"')}</div>${contentsHTML(st, uid)}`;
  else if (st.cat === 'appointment') html = inp('time', 'Appointment time (optional)', 'type="time"');
  else if (st.cat === 'bloodtest') html = labFormHTML(st, uid);
  else if (st.cat === 'sleep') {
    const k = st.sleepKind;
    const quick = st.mode === 'new' ? `<button type="button" class="btn dark block quick-wake" data-act="quick-wake"><span aria-hidden="true">🌙</span> Log a night wake-up now</button>
      <p class="hint quick-hint">One tap saves a ${QUICK_AWAKE} minute wake-up at the current time. Tap it in History to change the details.</p>` : '';
    const timeLabel = { bed: 'Asleep at', wake: 'Woke up at', waking: 'Woke at' }[k] || 'Time (optional)';
    const hint = { bed: "Pairs with the next wake-up to work out the night's sleep.", wake: "Pairs with last night's sleep time to work out how long they slept.", waking: "Time awake is taken off the night's total." }[k];
    html = `${quick}<span class="label">${quick ? 'Or choose what this entry is' : 'This entry is'}</span>
      <div class="chips">${SLEEP_KINDS.map(([v, em, l]) => `<button type="button" class="chip solid" data-kind="${v}" aria-pressed="${k === v}"><span aria-hidden="true">${em}</span>${l}</button>`).join('')}</div>
      <div class="${k === 'waking' ? 'row2 ' : ''}mt14">${inp('time', timeLabel, 'type="time"')}${k === 'waking' ? inp('awake', 'Awake for (minutes)', `inputmode="numeric" maxlength="9" placeholder="${QUICK_AWAKE}"`) : ''}</div>
      ${hint ? `<p class="hint sleep-hint">${hint}</p>` : ''}`;
  }
  box.innerHTML = html; box.hidden = !html;
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
    ${rows ? `<div class="content-head" aria-hidden="true"><span>Ingredient</span><span>Strength</span><span></span></div>${rows}<p class="hint content-hint">Strength as printed on the label, per gummy, drop or dose.</p>` : `<p class="hint content-hint">For products with more than one ingredient, like a multivitamin gummy. It's saved with the ${what}, so next time it fills in for you.</p>`}
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
    if (!cur || at > cur.at) map.set(key, { key, med: e.med.trim(), dose: String(e.dose || '').trim(), title: e.title, contents: Array.isArray(e.contents) ? e.contents : [], at, count: (cur ? cur.count : 0) + 1 });
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
  return `<div class="saved${st.editSaved ? ' editing' : ''}">
    <div class="saved-head"><span class="label">Used before</span><button type="button" class="mini" data-act="saved-edit">${st.editSaved ? 'Done' : 'Edit list'}</button></div>
    <div class="chips">${items.map((i, n) => `<span class="saved-chip"><button type="button" class="chip solid" data-use="${n}" aria-pressed="${cur === i.key}">${esc(i.med)}${i.dose ? ` <span class="n">${esc(i.dose)}</span>` : ''}</button><button type="button" class="forget" data-forget="${n}" aria-label="Remove ${esc(i.med)} from this list">×</button></span>`).join('')}</div>
    ${st.editSaved ? '<p class="hint">Removing an item only hides it from this list. Past entries stay as they are.</p>' : ''}
  </div>`;
}
function useSavedItem(el, item) {
  const st = el._st;
  st.extra.med = item.med; st.extra.dose = item.dose;
  st.contents = (item.contents || []).map((c) => ({ name: c.name || '', amount: c.amount || '' }));
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

function sleepKindOn(st) { return st.cat === 'sleep' && SLEEP_KIND_KEYS.includes(st.sleepKind); }
function syncFormBits(el) {
  const st = el._st;
  const wrap = $('[data-sevwrap]', el); wrap.hidden = NO_CONCERN.has(st.cat);
  const sk = sleepKindOn(st);
  $('[data-sevlabel]', el).textContent = 'Concern level (optional)';
  $('[data-f="title"]', el).placeholder = sk ? ({ bed: 'e.g. Settled quickly after a story', wake: 'e.g. Woke up happy', waking: 'e.g. Needed a drink of water' }[st.sleepKind]) : (CAT[st.cat] || CAT.other).ph;
  $('[data-titlelabel]', el).textContent = ITEM_LABEL[st.cat] || sk ? 'Description (optional)' : 'What happened?';
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
  const isParent = !e.src || e.src === 'parent';
  const st = {
    mode, id: mode === 'edit' ? e.id : null,
    cat: e.cat || '', src: isParent ? 'parent' : e.src,
    srcName: isParent ? (e.srcName || (mode === 'edit' ? e.by : '') || S.myName || 'Me') : '',
    sev: e.sev || 0,
    extra: { temp: e.temp || '', med: e.med || '', dose: e.dose || '', time: e.time || '', awake: e.awake || '' },
    results: Array.isArray(e.results) ? e.results.map((r) => ({ name: r.name || '', value: r.value || '', unit: r.unit || '', low: r.low || '', high: r.high || '' })) : [],
    contents: Array.isArray(e.contents) ? e.contents.map((c) => ({ name: c.name || '', amount: c.amount || '' })) : [],
    srcTouched: mode === 'edit', srcAuto: false,
    sleepKind: e.sleep || '', kindTouched: mode === 'edit' || !!e.kindTouched,
  };
  el._st = st;
  el.innerHTML = formHTML(st, e, mode);
  $('[data-f="tod"]', el).value = e.tod || currentTod();
  renderExtra(el); syncFormBits(el);

  el.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b || !el.contains(b)) return;
    if (b.dataset.cat) {
      st.cat = b.dataset.cat;
      $$('.cat-btn', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (st.cat === 'bloodtest' && !st.srcTouched && st.src === 'parent') { st.src = 'doctor'; st.srcName = ''; st.srcAuto = true; refreshSourceChips(el); }
      else if (st.cat !== 'bloodtest' && st.srcAuto) { st.src = 'parent'; st.srcName = S.myName || 'Me'; st.srcAuto = false; refreshSourceChips(el); }
      autoSleepKind(el);
      renderExtra(el); syncFormBits(el); saveDraft(el);
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
      const item = st.savedList && st.savedList[+b.dataset.use]; if (item) useSavedItem(el, item);
    } else if (b.dataset.forget) {
      const item = st.savedList && st.savedList[+b.dataset.forget];
      if (item) { S.hiddenItems[item.key] = Date.now(); renderExtra(el); toast(`${item.med} removed from the list`); kvSet('hiddenItems', S.hiddenItems).catch(() => {}); }
    } else if (b.hasAttribute('data-radd')) {
      const name = b.dataset.radd;
      const preset = LAB_PRESETS.find((p) => labKey(p.name) === labKey(name));
      const prev = name ? lastRangeFor(name) : null;
      st.results.push({ name, value: '', unit: (prev && prev.unit) || (preset && preset.unit) || '', low: prev ? prev.low : '', high: prev ? prev.high : '' });
      renderExtra(el); saveDraft(el);
      const f = $(`[data-r="${st.results.length - 1}"][data-rf="${name ? 'value' : 'name'}"]`, el); if (f) f.focus();
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
    if (t.dataset.cf && t.dataset.c !== undefined) { const c = st.contents[+t.dataset.c]; if (c) c[t.dataset.cf] = t.value; }
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
      cat: st.cat, src: st.src, srcName: st.srcName, sev: st.sev, ...st.extra, results: st.results, contents: st.contents, sleep: st.sleepKind, kindTouched: st.kindTouched, savedAt: Date.now(),
    };
    if (d.title || d.notes || d.cat) kvSet('draft', d).catch(() => {}); else kvDel('draft').catch(() => {});
  }, 400);
}

async function mountLogForm() {
  const el = $('#log-form');
  let draft = null;
  try { draft = await kvGet('draft'); } catch (e) { /* ignore */ }
  if (draft && Date.now() - (draft.savedAt || 0) > 3 * 86400000) draft = null;
  mountForm(el, draft, 'new');
}

async function saveForm(el) {
  const st = el._st;
  const val = (f) => $(`[data-f="${f}"]`, el).value;
  const title = val('title').trim(); const notes = val('notes').trim();
  const date = val('date'); const tod = val('tod');
  if (!st.cat) { toast('Choose an area first'); return; }
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
  if (!title && !notes && !hasDetail('med') && !hasDetail('temp') && !results.length && !sk) { toast('Add a short description or a note'); $('[data-f="title"]', el).focus(); return; }
  if (!date) { toast('Choose a date'); return; }
  if (date > today()) { toast("The date can't be in the future"); return; }
  const now = Date.now();
  const prev = st.id ? S.entries.get(st.id) : null;
  const e = prev && !prev.deleted ? { ...prev } : { id: Sync.randomId(12), createdAt: now, by: S.myName || '', byDev: S.deviceId };
  Object.assign(e, {
    date, tod, cat: st.cat, src: st.src, srcName: st.src === 'parent' ? st.srcName : '',
    title: title.slice(0, 160), notes: notes.slice(0, 8000), sev: NO_CONCERN.has(st.cat) ? 1 : st.sev || 0, updatedAt: now,
  });
  const keep = EXTRA_FIELDS[st.cat] || [];
  if (sk && st.sleepKind === 'waking') keep.push('awake');
  for (const f of ['temp', 'med', 'dose', 'time', 'awake']) {
    const v = String(st.extra[f] || '').trim();
    if (keep.includes(f) && v) e[f] = v.slice(0, 60); else delete e[f];
  }
  if (results.length) e.results = results; else delete e.results;
  const contents = ITEM_LABEL[st.cat] ? st.contents.map((c) => ({ name: String(c.name || '').trim().slice(0, 40), amount: String(c.amount || '').trim().slice(0, 20) })).filter((c) => c.name) : [];
  if (contents.length) e.contents = contents; else delete e.contents;
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Entry saved', { label: 'View', fn: () => switchTab('history') });
  }
}

async function quickWake(el) {
  const now = Date.now();
  const e = {
    id: Sync.randomId(12), createdAt: now, updatedAt: now, by: S.myName || '', byDev: S.deviceId,
    date: today(), tod: currentTod(), time: nowHHMM(), cat: 'sleep', sleep: 'waking', awake: QUICK_AWAKE,
    src: 'parent', srcName: S.myName || 'Me', title: '', notes: '', sev: 0,
  };
  S.entries.set(e.id, e);
  try { await putEntries([e]); } catch (err) { toast("Couldn't save on this phone: " + (err.message || err)); return; }
  scheduleSync();
  clearTimeout(draftTimer); await kvDel('draft').catch(() => {});
  mountForm(el, null, 'new');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDependent();
  toast(`Night wake-up logged at ${fmtTime(e.time)}`, {
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
  const k = srcKey(e);
  const hasTime = (EXTRA_FIELDS[e.cat] || []).includes('time');
  const draft = {
    date: today(), tod: currentTod(), cat: e.cat, title: e.title, notes: '',
    src: k, srcName: k === 'parent' ? (S.myName || 'Me') : '', sev: e.sev,
    med: e.med || '', dose: e.dose || '', temp: '', time: hasTime ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '',
    results: Array.isArray(e.results) ? e.results.map((r) => ({ name: r.name, unit: r.unit || '', low: r.low || '', high: r.high || '', value: '' })) : [],
    sleep: e.sleep || '', kindTouched: !!e.sleep,
    contents: Array.isArray(e.contents) ? e.contents.map((c) => ({ name: c.name, amount: c.amount || '' })) : [],
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
function entryCardHTML(e, nightByWake) {
  const c = CAT[e.cat] || CAT.other;
  const k = srcKey(e);
  const when = [e.tod, e.time ? fmtTime(e.time) : ''].filter(Boolean).join(', ');
  const hl = headline(e);
  const extra = [];
  if (hl.from === 'sleep' && String(e.title || '').trim()) extra.push(esc(e.title));
  if (e.temp && hl.from !== 'temp') extra.push(`Temperature ${esc(fmtTemp(e.temp))}`);
  if ((e.med || e.dose) && hl.from !== 'med') extra.push(`${esc(e.med || ITEM_LABEL[e.cat] || 'Medicine')}${e.dose ? ', ' + esc(e.dose) : ''}`);
  if (contentsText(e)) extra.push(`Contains ${esc(contentsText(e))}`);
  const flagged = Array.isArray(e.results) && e.results.some((r) => /low|high/.test(labFlag(r)));
  const night = nightByWake && e.sleep === 'wake' ? nightByWake.get(e.id) : null;
  if (night) extra.push(`Slept ${fmtDur(night.mins)} from ${fmtTime(night.bed)}${night.wakings ? `, ${wokeText(night)}` : ''}`);
  if (e.cat === 'sleep' && e.sleep === 'waking' && e.awake) extra.push(`Awake ${esc(e.awake)} min`);
  return `<button type="button" class="entry-card" data-id="${esc(e.id)}" data-sev="${e.sev || 0}" data-cat="${esc(e.cat)}"${flagged ? ' data-flagged="1"' : ''}>
    <div class="entry-top"><span class="entry-cat"><span aria-hidden="true">${c.em}</span> ${c.label}</span><span class="entry-when">${esc(when)}</span></div>
    <div class="entry-title">${esc(hl.text)}</div>
    ${extra.length ? `<div class="entry-extra">${extra.join(' · ')}</div>` : ''}
    ${Array.isArray(e.results) && e.results.length ? `<div class="lab-results">${e.results.map((r) => `<div class="lab-res"><span class="lab-res-name">${esc(r.name)}</span><span class="lab-res-val">${esc(r.value)} ${esc(r.unit || '')}</span>${flagHTML(labFlag(r))}</div>`).join('')}</div>` : ''}
    ${e.notes && hl.from !== 'notes-all' ? `<div class="entry-notes">${esc(e.notes)}</div>` : ''}
    <div class="tags">
      ${noConcern(e) ? '' : `<span class="tag">${SEV[e.sev] || 'Mild'} concern</span>`}
      <span class="tag ${k === 'parent' ? 'src-parent' : 'src-other'}"><span aria-hidden="true">${SRC[k].em}</span> ${esc(srcLabel(e))}</span>
      ${e.by && !(k === 'parent' && (e.srcName || e.by) === e.by) ? `<span class="tag">Logged by ${esc(e.by)}</span>` : ''}
    </div>
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
  const list = all.filter((e) => (S.hist.cat === 'all' || e.cat === S.hist.cat)
    && (!q || [e.title, e.notes, e.med, e.dose, srcLabel(e), e.by, (CAT[e.cat] || {}).label, ...(Array.isArray(e.results) ? e.results.map((r) => r.name) : []), contentsText(e)].join(' ').toLowerCase().includes(q)));
  const box = $('#entry-list');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big" aria-hidden="true">📋</div><p>${all.length ? 'Nothing matches that search or filter.' : 'No entries yet. Add the first one from the Log tab.'}</p></div>`;
    return;
  }
  const t = today(); const y = addDays(t, -1);
  const nightByWake = new Map(sleepNights(all).map((n) => [n.wakeId, n]));
  let html = ''; let last = '';
  list.slice(0, S.hist.limit).forEach((e) => {
    if (e.date !== last) { last = e.date; html += `<h3 class="day-head">${e.date === t ? 'Today' : e.date === y ? 'Yesterday' : esc(fmtDayLong(e.date))}</h3>`; }
    html += entryCardHTML(e, nightByWake);
  });
  if (list.length > S.hist.limit) html += `<button type="button" class="btn ghost more-btn" data-more>Show ${Math.min(60, list.length - S.hist.limit)} more</button>`;
  box.innerHTML = html;
  box.onclick = (ev) => {
    if (ev.target.closest('[data-more]')) { S.hist.limit += 60; renderHistory(); return; }
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
  const labs = sleepCardHTML(all) + labCardHTML(all);
  box.onclick = (ev) => {
    const sh = ev.target.closest('[data-night]');
    if (sh) {
      $('[data-tip="sleep"]', box).textContent = sh.dataset.night;
      $$('.sleep-bar', box).forEach((c) => c.classList.toggle('sel', c.dataset.i === sh.dataset.i));
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
    const { blob, pages } = await buildPdf(data, { CAT, SEV, SRC, srcKey, srcLabel, fmtDayLong, fmtDayShort, fmtTime, fmtTemp, noConcern, ITEM_LABEL, headline, labSeries, labFlag, labRange, labNum, labDomain, FLAG_LABEL, sleepNights, sleepSummary, fmtDur, wokeText, contentsText });
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
    const meta = [fmtDayShort(e.date), e.tod, e.time ? fmtTime(e.time) : '', c.label, noConcern(e) ? '' : `${SEV[e.sev] || 'Mild'} concern`, `seen by ${srcLabel(e)}`, d.opts.by && e.by && e.by !== srcLabel(e) ? `logged by ${e.by}` : ''].filter(Boolean).join(', ');
    const hl = headline(e, d.opts.notes);
    L.push(hl.text, `  ${meta}`);
    if (hl.from === 'sleep' && String(e.title || '').trim()) L.push(`  ${e.title}`);
    if (e.temp && hl.from !== 'temp') L.push(`  Temperature: ${fmtTemp(e.temp)}`);
    if ((e.med || e.dose) && hl.from !== 'med') L.push(`  ${ITEM_LABEL[e.cat] || 'Medicine'}: ${[e.med, e.dose].filter(Boolean).join(', ')}`);
    if (contentsText(e)) L.push(`  Contains: ${contentsText(e)}`);
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
  if (!S.sync) return;
  clearTimeout(syncTimer);
  if (!syncing) setSyncStatus('pending');
  syncTimer = setTimeout(runSync, delay);
}
async function runSync() {
  if (!S.sync) { setSyncStatus('off'); return null; }
  if (syncing) { syncAgain = true; return null; }
  clearTimeout(syncTimer);
  syncing = true; setSyncStatus('busy');
  let result = null;
  try {
    result = await Sync.syncOnce({ ...S.sync, deviceId: S.deviceId }, {
      getState: () => kvGet('syncState'),
      setState: (s) => kvSet('syncState', s),
      merge: mergeRemote,
      snapshot: () => ({ name: S.myName || '', profile: S.profile, entries: Array.from(S.entries.values()) }),
    });
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

async function mergeRemote(payloads) {
  let changed = 0; const put = [];
  const newer = (a, b) => ((a.updatedAt || 0) !== (b.updatedAt || 0) ? (a.updatedAt || 0) > (b.updatedAt || 0) : JSON.stringify(a) > JSON.stringify(b));
  for (const p of payloads) {
    if (!p || p.app !== 'littleone') continue;
    for (const r of Array.isArray(p.entries) ? p.entries : []) {
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      const l = S.entries.get(r.id);
      if (!l || newer(r, l)) { S.entries.set(r.id, r); put.push(r); changed++; }
    }
    if (p.profile && (p.profile.updatedAt || 0) > (S.profile.updatedAt || 0)) {
      S.profile = { childName: String(p.profile.childName || ''), updatedAt: p.profile.updatedAt };
      if (['3-5', '5-13', 'off'].includes(p.profile.sleepGuide)) S.profile.sleepGuide = p.profile.sleepGuide;
      await kvSet('profile', S.profile); changed++;
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
  const [state, text] = S.sync ? (map[S.syncStatus] || map.ok) : map.off;
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
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { /* ignore */ }
  const lastBackup = await kvGet('lastBackupAt');
  const err = S.sync && S.syncError && S.syncStatus !== 'ok' ? S.syncError : null;
  const others = membersList();
  openSheet('Settings', `
    <div class="set-section">
      <h3>Your child</h3>
      <div class="field"><label class="label" for="st-child">Name or initials</label><input class="input" id="st-child" maxlength="40" autocomplete="off" value="${esc(S.profile.childName)}"><p class="hint">Shared with your partner's phone.</p></div>
      <div class="field"><label class="label" for="st-guide">Sleep guideline</label><select class="select" id="st-guide">
        <option value="3-5"${(S.profile.sleepGuide || '3-5') === '3-5' ? ' selected' : ''}>Ages 3–5: 10–13 hours a day</option>
        <option value="5-13"${S.profile.sleepGuide === '5-13' ? ' selected' : ''}>Ages 5–13: 9–11 hours a night</option>
        <option value="off"${S.profile.sleepGuide === 'off' ? ' selected' : ''}>Don't show a guideline</option>
      </select><p class="hint">From Australia's 24-Hour Movement Guidelines. Shown as a band on the sleep chart. The 3–5 guideline includes naps.</p></div>
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
            const data = await Sync.makeBackup(p1, { app: 'littleone', v: 1, at: Date.now(), profile: S.profile, entries: Array.from(S.entries.values()) });
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
          const n = await mergeRemote([{ app: 'littleone', dev: '', entries: data.entries, profile: data.profile }]);
          scheduleSync(); closeSheet(); renderDependent();
          toast(n ? `Restored ${n} change${n > 1 ? 's' : ''}` : 'Everything in the backup was already here');
        } catch (e) { showMsg(msg, 'err', esc(e.message || String(e))); } finally { setBusy(btn, false); }
      };
    },
  });
}

// ---------------------------------------------------------------- update banner (service worker)
let updateRequested = false;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
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
  const ss = await kvGet('syncState'); S.lastSyncAt = (ss && ss.lastSyncAt) || 0;
  (await getAllEntries()).forEach((e) => S.entries.set(e.id, e));

  registerSW();

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'close-sheet') closeSheet();
    else if (a === 'start-new') openNewLog(true);
    else if (a === 'start-join') openJoin(true);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && $('#sheet-wrap').classList.contains('open')) closeSheet(); });
  $$('.tabbar [data-tab]').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  $('#open-settings').onclick = openSettings;
  $('#sync-pill').onclick = async () => {
    if (!S.sync) { openSettings(); return; }
    if (S.syncStatus === 'error') { openSettings(); return; }
    const r = await runSync();
    if (r) toast('Synced just now'); else if (S.syncError) toast(S.syncError.message);
  };
  let searchTimer = null;
  $('#search').oninput = (ev) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.hist.q = ev.target.value; S.hist.limit = 60; renderHistory(); }, 150); };
  $('#install-skip').onclick = () => show('welcome');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.sync && Date.now() - S.lastSyncAt > 20000) runSync();
  });
  window.addEventListener('online', () => { if (S.sync) runSync(); });
  setInterval(() => { if (document.visibilityState === 'visible' && S.sync && !syncing && Date.now() - S.lastSyncAt > 60000) runSync(); }, 30000);

  if (await kvGet('setupDone')) { showMain(); return; }
  show(isIOS() && !isStandalone() ? 'install' : 'welcome');
}

init().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div class="hero"><h1>Little One couldn't open</h1><p>${esc(e && e.message ? e.message : e)}</p><p>Close the app completely and open it again. Your entries are still stored on this phone.</p></div>`;
});
