// Ready-made products with published nutrition information.
// Values are copied from the manufacturer's nutrition panel. They are public label facts and hold no
// information about anyone using the app.

export const PRODUCTS = {
  'pediasure-vanilla-au': {
    name: 'PediaSure Vanilla',
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
};

export function productFor(name) {
  const n = String(name || '');
  return Object.keys(PRODUCTS).find((k) => PRODUCTS[k].match.test(n)) || '';
}

export function fmtAmount(v) {
  if (!isFinite(v)) return '';
  const d = v >= 100 ? 0 : v >= 10 ? 1 : 2; const f = 10 ** d;
  return String(Math.round(v * f + 1e-7) / f);
}

// Nutrients in `units` scoops (or other unit), scaled from the per-100 mL panel.
export function scaledNutrients(key, units, keyOnly) {
  const p = PRODUCTS[key]; if (!p) return [];
  const factor = (units * p.mlPerUnit) / p.basisMl;
  const rows = p.nutrients.filter((r) => !keyOnly || r[3]);
  if (keyOnly) rows.sort((a, b) => a[3] - b[3]);
  return rows.map(([name, unit, per]) => ({ name, amount: `${fmtAmount(per * factor)} ${unit}` }));
}

export function productDose(key, units) {
  const p = PRODUCTS[key]; if (!p) return '';
  return `${fmtAmount(units)} ${units === 1 ? p.unit : p.units} (${fmtAmount(units * p.mlPerUnit)} mL)`;
}
