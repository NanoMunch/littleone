// Food (simple or detailed) and the school lunch box. Pure functions only.
// Simple mode gives a rough picture by food group, with a few nutrients as "good source / some". These tiers are general
// food-group knowledge for a typical child serve, not measured values, and there are no calories or targets.
export const GROUPS = { grains: 'Grains', veg: 'Vegetables', fruit: 'Fruit', dairy: 'Dairy', protein: 'Protein', other: 'Other' };
export const NUTS = { iron: 'Iron', calcium: 'Calcium', protein: 'Protein', fibre: 'Fibre' };
// tiers: 2 good source, 1 some
export const FOODS = {
  eggs: { name: 'Eggs', group: 'protein', t: { protein: 2, iron: 1 } },
  bread: { name: 'Bread or toast', group: 'grains', t: { fibre: 1, protein: 1 } },
  cereal: { name: 'Cereal or porridge', group: 'grains', t: { iron: 2, fibre: 2 } },
  yoghurt: { name: 'Yoghurt', group: 'dairy', t: { calcium: 2, protein: 1 } },
  milk: { name: 'Milk', group: 'dairy', t: { calcium: 2, protein: 1 } },
  cheese: { name: 'Cheese', group: 'dairy', t: { calcium: 2, protein: 2 } },
  fruit: { name: 'Fruit', group: 'fruit', t: { fibre: 1 } },
  veg: { name: 'Vegetables', group: 'veg', t: { fibre: 1, iron: 1 } },
  redmeat: { name: 'Red meat', group: 'protein', t: { iron: 2, protein: 2 } },
  chicken: { name: 'Chicken', group: 'protein', t: { protein: 2, iron: 1 } },
  fish: { name: 'Fish', group: 'protein', t: { protein: 2, iron: 1 } },
  pasta: { name: 'Pasta or rice', group: 'grains', t: { protein: 1 } },
  legumes: { name: 'Beans or lentils', group: 'protein', t: { iron: 1, fibre: 2, protein: 1 } },
  nuts: { name: 'Nuts, seeds or spreads', group: 'protein', t: { iron: 1, protein: 1, fibre: 1 } },
  snack: { name: 'Snack food', group: 'other', t: {} },
};
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const ymd = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
export function cleanFoodCfg(c) {
  c = c && typeof c === 'object' ? c : {};
  const mode = ['off', 'simple', 'detailed'].includes(c.mode) ? c.mode : 'simple';
  const foods = {};
  for (const [id, f] of Object.entries(c.foods && typeof c.foods === 'object' ? c.foods : {})) {
    if (!/^[a-z0-9]{3,20}$/.test(id) || !f) continue; const name = txt(f.name, 40); if (!name) continue;
    const t = {}; Object.keys(NUTS).forEach((k) => { const v = +((f.t || {})[k]); if (v === 1 || v === 2) t[k] = v; });
    const per = (Array.isArray(f.per) ? f.per : []).map((x) => ({ name: txt(x && x.name, 30), amount: txt(x && x.amount, 20) })).filter((x) => x.name).slice(0, 12);
    foods[id] = { name, group: GROUPS[f.group] ? f.group : 'other', t, per, removed: !!f.removed };
  }
  return { mode, foods, updatedAt: +c.updatedAt || 0 };
}
export const allFoods = (cfg) => ({ ...FOODS, ...Object.fromEntries(Object.entries(cfg.foods).filter(([, f]) => !f.removed)) });
const PORT = { little: 0.25, half: 0.5, most: 0.8, all: 1 };
// meals: [{ foods:[ids], portion, serves? }]. Returns groups seen and nutrient tiers (best per nutrient, scaled down for small portions).
export function daySummary(meals, cfg) {
  const F = allFoods(cfg); const groups = new Set(); const tiers = {}; const from = {};
  for (const m of meals) for (const id of m.foods || []) {
    const f = F[id]; if (!f) continue; const p = PORT[m.portion] == null ? 1 : PORT[m.portion];
    if (p >= 0.25) groups.add(f.group);
    for (const [k, v] of Object.entries(f.t || {})) { const eff = p < 0.5 ? Math.min(v, 1) : v; if (eff > (tiers[k] || 0)) { tiers[k] = eff; from[k] = f.name; } }
  }
  return { groups, tiers, from };
}
const num = (s) => { const m = String(s || '').match(/([\d.]+)\s*([a-zµμ]+)?/i); return m ? { v: parseFloat(m[1]), u: (m[2] || '').toLowerCase().replace('μ', 'µ') } : null; };
// Detailed: totals from foods' per-serve nutrients (times serves times portion) plus supplement contents. Same name and unit add up.
export function dayTotals(meals, cfg, supplementContents = []) {
  const F = allFoods(cfg); const tot = new Map();
  const add = (name, amt, mult, src) => { const n = num(amt); if (!n || !(n.v > 0)) return; const key = `${name.toLowerCase()}|${n.u}`; const cur = tot.get(key) || { name, unit: n.u, food: 0, supp: 0 }; cur[src] += n.v * mult; tot.set(key, cur); };
  for (const m of meals) for (const id of m.foods || []) { const f = F[id]; if (!f || !f.per) continue; const mult = (PORT[m.portion] == null ? 1 : PORT[m.portion]) * (m.serves > 0 ? m.serves : 1); f.per.forEach((x) => add(x.name, x.amount, mult, 'food')); }
  supplementContents.forEach((x) => add(x.name, x.amount, 1, 'supp'));
  return Array.from(tot.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ---- school and lunch box
export const EATEN = { '0': 'Untouched', '25': 'A quarter', '33': 'A third', '50': 'Half', '75': 'Three quarters', '100': 'All' };
export function cleanSchool(c) {
  c = c && typeof c === 'object' ? c : {};
  const days = Array.from(new Set((Array.isArray(c.days) ? c.days : [1, 2, 3, 4, 5]).map(Number).filter((d) => d >= 0 && d <= 6))).sort();
  const breaks = (Array.isArray(c.breaks) ? c.breaks : [{ id: 'mt', name: 'Morning tea' }, { id: 'lu', name: 'Lunch' }]).map((b) => ({ id: /^[a-z0-9]{1,12}$/.test(b && b.id) ? b.id : '', name: txt(b && b.name, 30) })).filter((b) => b.id && b.name).slice(0, 4);
  const off = (Array.isArray(c.off) ? c.off : []).map((o) => ({ from: ymd(o && o.from) ? o.from : '', to: ymd(o && o.to) ? o.to : '', label: txt(o && o.label, 30) })).filter((o) => o.from).map((o) => ({ ...o, to: o.to && o.to >= o.from ? o.to : o.from })).slice(-40);
  return { on: !!c.on, days, breaks, off, updatedAt: +c.updatedAt || 0 };
}
const dow = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };
export const isSchoolDay = (sc, d) => !!sc.on && sc.breaks.length > 0 && sc.days.includes(dow(d)) && !sc.off.some((o) => d >= o.from && d <= o.to);
export function nextSchoolDay(sc, from, addDays) { for (let i = 1; i <= 14; i++) { const d = addDays(from, i); if (isSchoolDay(sc, d)) return d; } return ''; }
export const lunchId = (date, breakId) => `lb${date.replace(/-/g, '')}${breakId}`;
export function cleanLunchItems(items) {
  return (Array.isArray(items) ? items : []).map((i) => ({ name: txt(i && i.name, 50), where: txt(i && i.where, 80), eaten: EATEN[i && i.eaten] ? String(i.eaten) : '', part: txt(i && i.part, 80), done: !!(i && i.done) })).filter((i) => i.name).slice(0, 15);
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Per item: how often packed, average eaten, and parts left.
export function itemStats(lunches) {
  const m = new Map();
  for (const l of lunches) for (const i of cleanLunchItems(l.items)) {
    if (i.eaten === '') continue; const k = norm(i.name); if (!k) continue;
    const s = m.get(k) || { name: i.name, n: 0, sum: 0, parts: new Map(), last: '' }; s.n++; s.sum += +i.eaten; if (i.part) s.parts.set(i.part, (s.parts.get(i.part) || 0) + 1); if (l.date > s.last) s.last = l.date; m.set(k, s);
  }
  return Array.from(m.values()).map((s) => ({ name: s.name, n: s.n, avg: Math.round(s.sum / s.n), parts: Array.from(s.parts.entries()).sort((a, b) => b[1] - a[1]).map(([p]) => p), last: s.last }));
}
// Ideas from the family's own records only: an often-left item and a better-eaten item that shares a word.
export function lunchIdeas(stats) {
  const out = []; const left = stats.filter((s) => s.n >= 2 && s.avg <= 40); const good = stats.filter((s) => s.n >= 2 && s.avg >= 75);
  const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !['with', 'and', 'the'].includes(w));
  for (const l of left) {
    const lw = words(l.name); const alt = good.find((g) => g.name !== l.name && words(g.name).some((w) => lw.includes(w)));
    if (alt) out.push(`${l.name} mostly comes back, but ${alt.name} is usually eaten. Worth trying that instead.`);
    else if (l.parts.length) out.push(`${l.name}: usually "${l.parts[0]}". A different filling or flavour might help.`);
    else out.push(`${l.name} mostly comes back. Maybe swap it for a favourite for a while.`);
  }
  return out.slice(0, 6);
}
export function shoppingList(stats) {
  return { favourites: stats.filter((s) => s.n >= 2 && s.avg >= 75).sort((a, b) => b.avg - a.avg).map((s) => s.name), tryMore: stats.filter((s) => s.n === 1 && s.avg >= 75).map((s) => s.name), skip: stats.filter((s) => s.n >= 2 && s.avg <= 40).map((s) => s.name) };
}
export function lunchLevel(items) { const r = cleanLunchItems(items).filter((i) => i.eaten !== ''); if (!r.length) return ''; const a = r.reduce((s, i) => s + +i.eaten, 0) / r.length; return a < 40 ? 'low' : a < 80 ? 'usual' : 'big'; }
