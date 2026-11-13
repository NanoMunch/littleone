// Percentiles for height, weight and BMI, worked out on the phone from the child's sex and birth month.
// Nothing is sent anywhere. Reference data is in growthdata.js (WHO standards to 24 months, CDC charts from
// 24 months), which is the usual approach in Australia. A percentile says where a measurement sits among
// children of the same age and sex; steady growth along a similar line matters more than any one number.
import { CDC, WHO } from './growthdata.js';

// Standard normal cumulative distribution (Abramowitz and Stegun 26.2.17, error under 1e-7).
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
export function normInv(p) { // Acklam's approximation (relative error about 1e-9)
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5; const r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  return x;
}

const SEX = { girl: 2, boy: 1 };
// Interpolate L, M, S between table rows [age, L, M, S].
function lmsAt(rows, age) {
  if (!rows || !rows.length || age < rows[0][0] - 1e-9 || age > rows[rows.length - 1][0] + 1e-9) return null;
  let i = 0; while (i < rows.length - 2 && rows[i + 1][0] <= age) i++;
  const [a0, L0, M0, S0] = rows[i]; const [a1, L1, M1, S1] = rows[i + 1];
  const f = a1 === a0 ? 0 : Math.min(1, Math.max(0, (age - a0) / (a1 - a0)));
  return { L: L0 + (L1 - L0) * f, M: M0 + (M1 - M0) * f, S: S0 + (S1 - S0) * f };
}
// Age in months from a birth month ("2022-03") to a date ("2026-11-13"), taking the birth as mid-month,
// so the age is within about half a month.
export function ageMonths(birth, date) {
  const b = /^(\d{4})-(\d{2})$/.exec(birth || ''); const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!b || !d) return null;
  const m = (+d[1] - +b[1]) * 12 + (+d[2] - +b[2]) + (+d[3] - 15) / 30.4375;
  return m < 0 ? null : m;
}
// Which reference applies: { rows, chart } or null. kind is 'height', 'weight' or 'bmi'.
export function referenceFor(sex, age, kind) {
  const sx = SEX[sex]; if (!sx || age == null || age < 0) return null;
  if (age < 24) { const rows = kind === 'height' ? WHO.len[sx] : kind === 'weight' ? WHO.wt[sx] : null; return rows ? { rows, chart: 'WHO' } : null; }
  if (age > 240.5) return null;
  return { rows: CDC[{ height: 'stat', weight: 'wt', bmi: 'bmi' }[kind]][sx], chart: 'CDC' };
}
export function growthPercentile(sex, birth, date, kind, value) {
  const age = ageMonths(birth, date); if (age == null || !(value > 0)) return null;
  const ref = referenceFor(sex, age, kind); if (!ref) return null;
  const p = lmsAt(ref.rows, age); if (!p) return null;
  const z = Math.abs(p.L) < 1e-9 ? Math.log(value / p.M) / p.S : (Math.pow(value / p.M, p.L) - 1) / (p.L * p.S);
  return { pct: normCdf(z) * 100, z, chart: ref.chart, age };
}
// The value at a given percentile (0-100) for a child of this age and sex, for drawing reference lines.
export function valueAtPercentile(sex, age, kind, pct) {
  const ref = referenceFor(sex, age, kind); const p = ref && lmsAt(ref.rows, age); if (!p) return null;
  const z = normInv(pct / 100);
  return Math.abs(p.L) < 1e-9 ? p.M * Math.exp(p.S * z) : p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L);
}
export function ordinal(n) {
  const v = n % 100; const s = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${s}`;
}
export function pctText(pct) {
  if (pct < 1) return 'below the 1st percentile';
  if (pct > 99) return 'above the 99th percentile';
  return `about the ${ordinal(Math.round(pct))} percentile`;
}
export function ageText(age) {
  const y = Math.floor(age / 12); const m = Math.floor(age - y * 12);
  return y < 1 ? `${m} month${m === 1 ? '' : 's'}` : `${y} year${y === 1 ? '' : 's'}${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`;
}
