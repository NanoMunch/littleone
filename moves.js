// Daily movement targets by age, from the Australian 24-hour movement guidelines (Department of Health).
// Birth to 5 years: https://www.health.gov.au/ (24 hour movement guidelines birth to 5 years fact sheet).
// Ages 5 to 13: 60 minutes or more of moderate to vigorous activity, at most 2 hours of recreational screen time.
// Outdoor time has no official number, so it is a gentle suggestion and labelled that way.

// ageMo: age in months (may be fractional). Returns null when no targets apply (under 1, or 13 and over).
export function moveTargets(ageMo) {
  if (ageMo == null || !isFinite(ageMo) || ageMo < 12 || ageMo >= 156) return null;
  if (ageMo < 36) return { band: 'toddler', moving: 180, energetic: 0, outdoors: 60, screenMax: ageMo < 24 ? 0 : 60, sleep: [11, 14], label: ageMo < 24 ? 'age 1' : 'age 2' };
  if (ageMo < 60) return { band: 'preschool', moving: 180, energetic: 60, outdoors: 60, screenMax: 60, sleep: [10, 13], label: 'ages 3 to 4' };
  return { band: 'school', moving: 60, energetic: 60, outdoors: 60, screenMax: 120, sleep: [9, 11], label: 'ages 5 to 12' };
}

// entries: activity entries { kind: 'outdoors' | 'play', mins }. Returns minutes per kind for one date.
export function moveTotals(entries, date) {
  const t = { outdoors: 0, play: 0 };
  for (const e of entries) if (e.date === date && (e.kind === 'outdoors' || e.kind === 'play')) t[e.kind] += Math.max(0, +e.mins || 0);
  t.moving = t.outdoors + t.play;
  return t;
}

// One short nudge, or ''. nowHour is 0 to 23. Only gentle wording.
export function moveNudge(tg, totals, nowHour) {
  if (!tg || nowHour < 14) return '';
  const left = (n) => Math.max(0, n);
  if (totals.outdoors === 0 && nowHour >= 15) return 'No outdoor time yet today. A short walk or a play outside before dinner would help.';
  const need = left(tg.moving - totals.moving);
  if (nowHour >= 16 && need >= 30) return `About ${Math.round(need / 5) * 5} more minutes of active play would reach today's aim.`;
  return '';
}

const limitText = (m) => (m === 60 ? '1 hour' : m === 120 ? '2 hours' : `${m} minutes`);
// Minutes that count toward the limit: everything except video calls.
export function screenCounted(entries, date) {
  let t = 0;
  for (const e of entries) if (e.date === date && e.kind !== 'call') t += Math.max(0, +e.mins || 0);
  return t;
}
// A gentle line about screen time so far, or ''. mins counts toward the limit (include a running timer).
export function screenNote(tg, mins) {
  if (!tg || !(mins > 0)) return '';
  const max = tg.screenMax;
  if (max === 0) return 'Guidelines suggest no screen time before age 2, apart from video calls with family. A book or some play could be a good swap.';
  const r = mins / max;
  if (r >= 2) return `Screen time is well over today's guideline of ${limitText(max)}. A break with something active, or a story, can help reset the day.`;
  if (r > 1) return `Past today's guideline of ${limitText(max)}. Something screen-free next could help.`;
  if (r >= 0.75) return `Close to today's guideline of ${limitText(max)}. It might be a good time to plan something screen-free.`;
  return '';
}
