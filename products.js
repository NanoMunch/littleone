// Ready-made products with published nutrition information.
// Values are copied from the manufacturer's nutrition panel. They are public label facts and hold no
// information about anyone using the app.

export const PRODUCTS = {
  'pediasure-vanilla-au': {
    name: 'PediaSure Vanilla', em: '🥛',
    check: 'Recipes can change, so check it against the panel on your tin.',
    unit: 'scoop', units: 'scoops', standard: 5,
    mlPerUnit: 45, // 5 levelled scoops (48.6 g) + 190 mL water = 225 mL
    basisMl: 100, // panel values are average per 100 mL of made-up drink
    serveText: '5 levelled scoops (48.6 g) in 190 mL of water makes one 225 mL serve',
    source: "Abbott Australia's published nutrition information for PediaSure Powder Vanilla (average per 100 mL), checked 17 October 2026",
    match: /pedia\s*sure/i,
    // [name, unit, per 100 mL, key nutrient order (0 = full panel only)]
    nutrients: [
      ['Energy', 'kJ', 419, 0], ['Energy', 'kcal', 100, 1], ['Protein', 'g', 3, 2], ['Fat, total', 'g', 3.9, 10],
      ['Saturated fat', 'g', 0.9, 0], ['Linoleic acid', 'g', 0.9, 0], ['Alpha-linolenic acid', 'mg', 100, 0], ['DHA', 'mg', 5, 0],
      ['Carbohydrate', 'g', 13.1, 8], ['Sugars', 'g', 3.73, 9], ['Dietary fibre', 'g', 0.44, 7], ['FOS', 'g', 0.44, 0],
      ['Casein phosphopeptides', 'mg', 35, 0], ['Taurine', 'mg', 7.2, 0], ['Carnitine', 'mg', 1.7, 0], ['Inositol', 'mg', 8, 0],
      ['Arginine', 'mg', 222, 0], ['Free arginine', 'mg', 65, 0],
      ['Vitamin A', 'µg RE', 60, 11], ['Vitamin D3', 'µg', 2, 4], ['Vitamin E', 'mg alpha-TE', 1.6, 0], ['Vitamin K1', 'µg', 7.7, 0],
      ['Vitamin C', 'mg', 10, 12], ['Folic acid', 'µg', 24, 13], ['Vitamin B1', 'mg', 0.2, 0], ['Vitamin B2', 'mg', 0.2, 0],
      ['Vitamin B6', 'mg', 0.3, 0], ['Vitamin B12', 'µg', 0.3, 14], ['Niacin', 'mg NE', 1.5, 0], ['Pantothenic acid', 'mg', 0.7, 0],
      ['Biotin', 'µg', 2, 0], ['Choline', 'mg', 30, 0],
      ['Sodium', 'mg', 38, 0], ['Potassium', 'mg', 131, 0], ['Chloride', 'mg', 101, 0], ['Calcium', 'mg', 100, 5],
      ['Phosphorus', 'mg', 84, 0], ['Magnesium', 'mg', 20, 0], ['Iron', 'mg', 1.4, 3], ['Zinc', 'mg', 0.7, 6],
      ['Manganese', 'mg', 0.2, 0], ['Copper', 'µg', 65, 0], ['Iodine', 'µg', 9.7, 15], ['Selenium', 'µg', 3.2, 0],
      ['Chromium', 'µg', 3, 0], ['Molybdenum', 'µg', 5.2, 0],
    ],
  },
  'naturesway-smartvita-fussy-au': {
    name: 'Kids Smart Vita Fussy Eaters', em: '🍬',
    unit: 'gummy', units: 'gummies', standard: 2, standardByAge: { '1-3': 1 }, minUnits: 1,
    // no mlPerUnit: the label lists amounts per gummy (pastille)
    serveText: 'Label directions: 1 gummy a day for ages 2–3, 2 gummies a day for ages 4 and up. Not for children under 2',
    source: "Nature's Way Australia's ingredient list for Kids Smart Vita Gummies Multi-Vitamin for Fussy Eaters (each pastille), checked 21 October 2026",
    check: 'Formulas can change, so check it against the label on your bottle.',
    match: /smart\s*vita.*(fussy|multi)|fussy\s*eaters?\b/i,
    // [name, unit, per gummy, key order (0 = full list only)]
    nutrients: [
      ['Vitamin C', 'mg', 20, 1], ['Vitamin D3', 'µg', 2.5, 2], ['Zinc', 'mg', 1, 3], ['Iodine', 'µg', 22.5, 4],
      ['Vitamin B6', 'mg', 0.5, 5], ['Vitamin E', 'mg', 3.5, 6], ['Vitamin B3 (nicotinamide)', 'mg', 6, 7],
      ['Vitamin B1', 'mg', 0.35, 8], ['Vitamin B2', 'mg', 0.125, 9], ['Vitamin B12', 'µg', 0.75, 10], ['Biotin', 'µg', 8.7, 11],
      ['Calcium', 'mg', 5, 12], ['Magnesium', 'mg', 5, 13],
      ['Beetroot powder', 'mg', 5, 0], ['Artichoke powder', 'mg', 5, 0], ['Carrot powder', 'mg', 5, 0], ['Spinach powder', 'mg', 5, 0],
    ],
  },
};

export function productFor(name) {
  const n = String(name || '');
  return Object.keys(PRODUCTS).find((k) => PRODUCTS[k].match.test(n)) || '';
}

// The label's dose for the age group (e.g. 1 gummy for ages 1–3), or the standard serve.
export function standardUnits(key, age) {
  const p = PRODUCTS[key]; if (!p) return 0;
  return (p.standardByAge && p.standardByAge[age]) || p.standard;
}

export function fmtAmount(v) {
  if (!isFinite(v)) return '';
  const d = v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3; const f = 10 ** d;
  return String(Math.round(v * f + 1e-7) / f);
}

// Nutrients in `units` scoops, gummies or other unit: scaled from a per-100 mL panel, or per unit when the
// label lists amounts per gummy.
export function scaledNutrients(key, units, keyOnly) {
  const p = PRODUCTS[key]; if (!p) return [];
  const factor = p.mlPerUnit ? (units * p.mlPerUnit) / p.basisMl : units;
  const rows = p.nutrients.filter((r) => !keyOnly || r[3]);
  if (keyOnly) rows.sort((a, b) => a[3] - b[3]);
  return rows.map(([name, unit, per]) => ({ name, amount: `${fmtAmount(per * factor)} ${unit}` }));
}

export function productDose(key, units) {
  const p = PRODUCTS[key]; if (!p) return '';
  return `${fmtAmount(units)} ${units === 1 ? p.unit : p.units}${p.mlPerUnit ? ` (${fmtAmount(units * p.mlPerUnit)} mL)` : ''}`;
}
