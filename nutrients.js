// Supplement check: daily totals against Australia's upper levels of intake, and pairs that are best given apart.
//
// Sources (checked 17 October 2026):
// - Upper Levels of Intake (UL): NHMRC Nutrient Reference Values for Australia and New Zealand
//   (eatforhealth.gov.au/nutrient-reference-values). ULs are for everyday intake from all sources; doses prescribed
//   to treat a deficiency can be higher on purpose (e.g. RCH guideline: iron 3–6 mg/kg/day for iron deficiency).
// - Iron with calcium or milk: give at least two hours apart (WA Health, North Metropolitan Health Service iron
//   information sheet); RCH: avoid giving iron medicine with milk, give with orange juice (vitamin C) where possible.
// - Calcium can interfere with iron and zinc absorption (NRV calcium); iron can reduce zinc absorption (NRV zinc).
//
// Only what is logged in the app is counted (not food), so totals are a floor, not a full intake.

export const AGE_GROUPS = { '1-3': 'ages 1–3', '4-8': 'ages 4–8', '9-13': 'ages 9–13' };

export const LIMITS = [
  { key: 'iron', label: 'Iron', unit: 'mg', ul: { '1-3': 20, '4-8': 40, '9-13': 40 }, re: /\biron\b|ferr(?:ous|ic|o)/i },
  { key: 'zinc', label: 'Zinc', unit: 'mg', ul: { '1-3': 7, '4-8': 12, '9-13': 25 }, re: /\bzinc\b/i },
  { key: 'calcium', label: 'Calcium', unit: 'mg', ul: { '1-3': 2500, '4-8': 2500, '9-13': 2500 }, re: /calcium/i },
  { key: 'vitd', label: 'Vitamin D', unit: 'µg', ul: { '1-3': 80, '4-8': 80, '9-13': 80 }, re: /vitamin\s*d3?\b|vit\.?\s*d3?\b|cholecalciferol|ergocalciferol/i, iu: 1 / 40 },
  { key: 'vita', label: 'Vitamin A', unit: 'µg', ul: { '1-3': 600, '4-8': 900, '9-13': 1700 }, re: /vitamin\s*a\b|vit\.?\s*a\b|retinol/i, iu: 0.3 },
  { key: 'vite', label: 'Vitamin E', unit: 'mg', ul: { '1-3': 70, '4-8': 100, '9-13': 180 }, re: /vitamin\s*e\b|vit\.?\s*e\b|tocopherol/i },
  { key: 'b6', label: 'Vitamin B6', unit: 'mg', ul: { '1-3': 15, '4-8': 20, '9-13': 30 }, re: /vitamin\s*b6\b|\bb6\b|pyridoxine/i },
  { key: 'folic', label: 'Folic acid', unit: 'µg', ul: { '1-3': 300, '4-8': 400, '9-13': 600 }, re: /folic|folate/i },
  { key: 'niacin', label: 'Niacin', unit: 'mg', ul: { '1-3': 10, '4-8': 15, '9-13': 20 }, re: /niacin(?!amide)|nicotinic/i },
  { key: 'iodine', label: 'Iodine', unit: 'µg', ul: { '1-3': 200, '4-8': 300, '9-13': 600 }, re: /iodine|iodide/i },
  { key: 'selenium', label: 'Selenium', unit: 'µg', ul: { '1-3': 90, '4-8': 150, '9-13': 280 }, re: /selenium/i },
  { key: 'copper', label: 'Copper', unit: 'mg', ul: { '1-3': 1, '4-8': 3, '9-13': 5 }, re: /copper/i },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', ul: { '1-3': 65, '4-8': 110, '9-13': 350 }, re: /magnesium/i },
  { key: 'choline', label: 'Choline', unit: 'mg', ul: { '1-3': 1000, '4-8': 1000, '9-13': 1000 }, re: /choline/i },
];
const LIMIT = Object.fromEntries(LIMITS.map((l) => [l.key, l]));
const VITC_RE = /vitamin\s*c\b|vit\.?\s*c\b|ascorbic/i;

const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(mg|µg|μg|ug|mcg|g|iu)(?![a-z])/i;
const COUNT_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(gumm(?:y|ies)|tablets?|tabs?|capsules?|caps?|chews?|chewables?|drops?|sachets?|pills?|lozenges?|sprays?|pumps?|squares?|scoops?)\b/i;

export function fmtNum(v) {
  if (!isFinite(v)) return '';
  const d = v >= 100 ? 0 : v >= 10 ? 1 : 2; const f = 10 ** d;
  return String(Math.round(v * f + 1e-7) / f);
}

// "10 µg", "400 IU", "3 mg" -> number in the nutrient's own unit, or null if it can't be read.
export function toUnit(lim, text) {
  const s = String(text || '').replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  const m = AMOUNT_RE.exec(s); if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.')); const u = m[2].toLowerCase();
  if (u === 'iu') { if (!lim.iu) return null; const ug = v * lim.iu; return lim.unit === 'µg' ? ug : ug / 1000; }
  const mg = u === 'g' ? v * 1000 : u === 'mg' ? v : v / 1000;
  return lim.unit === 'mg' ? mg : mg * 1000;
}

// "2 gummies" -> 2 (label strengths are per gummy, drop or tablet). Anything else counts as one dose.
export function doseCount(dose) {
  const m = COUNT_RE.exec(String(dose || ''));
  return m ? { n: parseFloat(m[1].replace(',', '.')), text: `${m[1]} ${m[2]}` } : { n: 1, text: '' };
}

// Nutrients in one entry. `contents` should already be totals for ready-made products (multiplier 1).
export function entryNutrients(e) {
  const out = [];
  const contents = Array.isArray(e.contents) ? e.contents : [];
  const mult = e.product ? { n: 1, text: '' } : doseCount(e.dose);
  for (const c of contents) {
    const lim = LIMITS.find((l) => l.re.test(c.name || '')); if (!lim) continue;
    const v = toUnit(lim, c.amount);
    if (v == null) { out.push({ key: lim.key, unknown: true }); continue; }
    out.push({ key: lim.key, amount: v * mult.n, detail: mult.n !== 1 ? `${c.amount} × ${mult.text}` : '' });
  }
  if (!contents.length) {
    // A product named after a nutrient (e.g. "Vitamin D drops") without a strength can't be counted.
    const lim = LIMITS.find((l) => l.re.test(e.med || ''));
    if (lim) out.push({ key: lim.key, unknown: true });
  }
  return out;
}

const TOD_MID = { Overnight: 120, Morning: 480, Midday: 720, Afternoon: 900, Evening: 1110, Night: 1290 };
function minutes(e) {
  const m = /^(\d{1,2}):(\d{2})/.exec(e.time || '');
  return m ? +m[1] * 60 + +m[2] : null;
}
function close(a, b) {
  const ma = minutes(a); const mb = minutes(b);
  if (ma != null && mb != null) return Math.abs(ma - mb) < 120;
  return !!a.tod && a.tod === b.tod;
}
const amt = (ns, key) => ns.filter((n) => n.key === key && !n.unknown).reduce((s, n) => s + n.amount, 0);

// Check one day's supplements and medicines. Entries flagged `_pending` are the ones being logged now.
export function dayCheck(entries, age) {
  const items = entries.map((e) => ({ e, ns: entryNutrients(e) }));
  const totals = [];
  for (const lim of LIMITS) {
    const parts = [];
    for (const { e, ns } of items) {
      const a = amt(ns, lim.key); if (!(a > 0)) continue;
      const src = e.med || 'Unnamed';
      const same = parts.find((p) => p.src === src);
      if (same) { same.amount += a; same.n += 1; same.detail = `${same.n} times`; }
      else parts.push({ src, amount: a, n: 1, detail: ns.filter((n) => n.key === lim.key && n.detail).map((n) => n.detail).join(', ') });
    }
    if (!parts.length) continue;
    const total = parts.reduce((s, p) => s + p.amount, 0);
    const ul = lim.ul[age] || lim.ul['4-8'];
    const pct = (total / ul) * 100;
    totals.push({ key: lim.key, label: lim.label, unit: lim.unit, total, ul, pct, level: pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok', parts });
  }
  const unknown = [];
  for (const { e, ns } of items) {
    if (ns.some((n) => n.unknown)) unknown.push(e.med || 'Unnamed');
  }

  const ironSupp = (x) => /\biron\b|ferr(?:ous|ic|o)/i.test(x.e.med || '') || amt(x.ns, 'iron') >= 10;
  const calcium = (x) => amt(x.ns, 'calcium') >= 100 || /calcium|milk|dairy|pediasure/i.test(x.e.med || '');
  const zinc = (x) => amt(x.ns, 'zinc') >= 5 || /\bzinc\b/i.test(x.e.med || '');
  const vitC = (x) => /vitamin\s*c\b|orange|juice/i.test(x.e.med || '') || (Array.isArray(x.e.contents) && x.e.contents.some((c) => VITC_RE.test(c.name || '')));
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i]; const b = items[j];
      if (!ironSupp(a) || !close(a.e, b.e)) continue;
      const pending = !!(a.e._pending || b.e._pending);
      if (calcium(b) && !(ironSupp(b) && j < i)) pairs.push({ type: 'iron-calcium', a: a.e.med, b: b.e.med, pending });
      else if (zinc(b) && !ironSupp(b)) pairs.push({ type: 'iron-zinc', a: a.e.med, b: b.e.med, pending });
    }
  }
  const pendingIron = items.some((x) => x.e._pending && ironSupp(x));
  const ironWithC = items.some((x) => ironSupp(x) && items.some((y) => y !== x && vitC(y) && close(x.e, y.e)));
  return { totals, unknown: Array.from(new Set(unknown)), pairs, tipIron: pendingIron && !ironWithC, label: (k) => LIMIT[k].label };
}
