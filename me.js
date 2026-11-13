// Parent check-in: tough moments, a daily "my cup" tap, tips, and patterns. Everything here stays on the parent's phone.
export const WHAT = [
  ['temper', 'Lost my temper', '🌋'], ['short', 'Was short or snappy', '⚡'], ['voice', 'Raised my voice', '📢'],
  ['expect', 'Expected too much', '📏'], ['disconnect', 'Was distracted or not connecting', '📵'], ['ignored', 'Dismissed or ignored them', '🙈'],
  ['fear', 'Worried I might hurt them', '🆘'],
];
export const WHY = [
  ['tired', 'Tired', '😴'], ['hungry', 'Hungry', '🍽️'], ['rushed', 'Rushed', '⏰'], ['stressed', 'Stressed or overwhelmed', '🌪️'],
  ['conflict', 'Conflict with someone', '💬'], ['unwell', 'Not feeling well', '🤒'], ['none', 'No clear reason', '🤷'],
];
export const REPAIR = [['yes', 'Yes, I repaired'], ['soon', 'Not yet, I will'], ['unsure', 'Not sure how']];
export const CUP = [[1, 'Steady', '🟢'], [2, 'Stretched', '🟡'], [3, 'Running on empty', '🟠']];
export const CUP_TAGS = [['sleep', 'Slept badly'], ['food', 'Skipped meals'], ['nobreak', 'No break'], ['alone', 'Feeling alone in it'], ['stress', 'Lots on my mind']];

export const SUPPORT = [
  'Parentline Victoria 13 22 89 (8 am to midnight, every day).',
  'PANDA 1300 726 306 (weekdays), for feeling overwhelmed as a parent, not only in pregnancy or after birth.',
  'Lifeline 13 11 14 (24 hours).',
];

const has = (a, k) => Array.isArray(a) && a.includes(k);
// Tips for one tough moment. Returns { support: boolean, tips: string[] } with at most 4 tips, repair first.
export function tipsFor(m) {
  const tips = [];
  const support = has(m.what, 'fear');
  if (m.repair === 'yes') tips.push('Well done for repairing. That is the part children remember most. Even a short "I got cross, I\'m sorry" teaches them how to put things right.');
  else if (m.repair === 'soon') tips.push('A repair later still counts. Get down to their level, name what happened, say sorry, and say what you\'ll try next time: "I shouted. That wasn\'t your fault. I\'m sorry. Next time I\'ll take a breath first."');
  else tips.push('Repair is the key step. Try: get down to their level, name it ("I got cross and shouted"), say sorry, say it wasn\'t their fault, and give them a hug if they want one. It works at any time of day.');
  if (m.copied === 'yes' || m.copied === true) tips.push('Children copy what they see, so it helps to name it kindly and show the other way: "We don\'t shout. When I feel cross I take a big breath. Want to try it with me?" Praise them when they use calm words.');
  if (has(m.what, 'temper') || has(m.what, 'voice')) tips.push('Next time you feel it rising, try pressing your feet into the floor and breathing out for longer than you breathe in. If they\'re safe, stepping away for a minute is fine: "I need a minute to calm down, then I\'ll be back."');
  if (has(m.what, 'expect')) tips.push('Check what is realistic for their age right now. One small step at a time, said close and at their level ("first shoes"), works better than a list shouted from across the room.');
  if (has(m.what, 'disconnect')) tips.push('Two minutes of full attention (phone down, eye contact) before you switch them to the next task often makes the transition smoother.');
  if (has(m.what, 'short') || has(m.what, 'ignored')) tips.push('Try getting close, using their name, and asking in a calm, low voice. Children respond better to connection first, then the request.');
  const why = m.why || [];
  if (has(why, 'tired')) tips.push('You were tired. Tough moments cluster on short nights, so one early night or a handover tonight can protect tomorrow.');
  else if (has(why, 'hungry')) tips.push('Hunger makes everyone shorter. A snack for you and for them before the hard part of the day can make a real difference.');
  else if (has(why, 'rushed')) tips.push('Rushing is a common trigger. Starting the routine 10 minutes earlier, or cutting one thing, often takes the pressure off.');
  else if (has(why, 'stressed') || has(why, 'conflict')) tips.push('Stress and conflict spill over onto the people closest to us. A few minutes to yourself, or telling your partner you need a break, can help.');
  return { support, tips: tips.slice(0, 4) };
}
export function cupTips(level, tags) {
  if (level < 2) return [];
  const t = ['Pick one small thing for yourself today: something to eat, five minutes alone, a short walk, or asking your partner to take over for 20 minutes.'];
  if (has(tags, 'sleep')) t.push('A broken night makes everything harder. If you can, trade a lie-in or an early night with your partner this week.');
  if (has(tags, 'alone')) t.push('Feeling alone in it is common and worth saying out loud. A friend, your partner, or a call to Parentline (13 22 89) can help.');
  return t.slice(0, 3);
}

const dayOf = (m) => m.date;
const hourOf = (m) => new Date(m.at).getHours();
const bucket = (h) => (h < 12 ? 'Morning' : h < 16 ? 'Afternoon' : h < 19 ? 'Late afternoon' : 'Evening');
const addDays = (s, n) => { const [y, mo, d] = s.split('-').map(Number); const dt = new Date(y, mo - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };

// moments: records with kind 'moment'. Returns a summary over the last `days` days, or null when nothing is logged.
export function momentSummary(moments, todayStr, days = 28) {
  const from = addDays(todayStr, -(days - 1));
  const list = moments.filter((m) => m.date >= from && m.date <= todayStr);
  if (!list.length) return null;
  const when = {}; const why = {}; let repaired = 0; let copied = 0;
  for (const m of list) {
    const b = bucket(hourOf(m)); when[b] = (when[b] || 0) + 1;
    (m.why || []).forEach((k) => { if (k !== 'none') why[k] = (why[k] || 0) + 1; });
    if (m.repair === 'yes') repaired++;
    if (m.copied === 'yes' || m.copied === true) copied++;
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { n: list.length, days: new Set(list.map(dayOf)).size, when: top(when), why: top(why).filter(([, c]) => c >= 2), repaired, repairRate: repaired / list.length, copied };
}

// Child's day ratings (Map date -> 1..4, lower is calmer) on days with and without a tough moment, same day and next day.
// Needs at least 4 days in each group and a difference of 0.4 or more. It describes what goes together, not what causes what.
export function childLink(moments, ratings, todayStr) {
  const mDays = new Set(moments.map(dayOf));
  const withSame = []; const withoutSame = []; const withNext = []; const withoutNext = [];
  for (const [d, r] of ratings) {
    (mDays.has(d) ? withSame : withoutSame).push(r);
    const prev = addDays(d, -1);
    (mDays.has(prev) ? withNext : withoutNext).push(r);
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const out = [];
  if (withSame.length >= 4 && withoutSame.length >= 4 && Math.abs(avg(withSame) - avg(withoutSame)) >= 0.4) out.push({ kind: 'same', withAvg: avg(withSame), withoutAvg: avg(withoutSame), withN: withSame.length, withoutN: withoutSame.length });
  if (withNext.length >= 4 && withoutNext.length >= 4 && Math.abs(avg(withNext) - avg(withoutNext)) >= 0.4) out.push({ kind: 'next', withAvg: avg(withNext), withoutAvg: avg(withoutNext), withN: withNext.length, withoutN: withoutNext.length });
  // Repaired or not, how the next day was rated.
  const rep = []; const norep = [];
  for (const m of moments) { const r = ratings.get(addDays(m.date, 1)); if (r == null) continue; (m.repair === 'yes' ? rep : norep).push(r); }
  if (rep.length >= 4 && norep.length >= 4 && Math.abs(avg(rep) - avg(norep)) >= 0.4) out.push({ kind: 'repair', withAvg: avg(rep), withoutAvg: avg(norep), withN: rep.length, withoutN: norep.length });
  return out;
}

// Tough moments per day on low-cup days compared with other days (cups: records with kind 'cup').
export function cupLink(moments, cups) {
  const lowDays = cups.filter((c) => c.level >= 2).map((c) => c.date); const okDays = cups.filter((c) => c.level === 1).map((c) => c.date);
  if (lowDays.length < 4 || okDays.length < 4) return null;
  const per = (days) => days.reduce((s, d) => s + moments.filter((m) => m.date === d).length, 0) / days.length;
  const lo = per(lowDays); const ok = per(okDays);
  return Math.abs(lo - ok) >= 0.3 ? { low: lo, ok, lowN: lowDays.length, okN: okDays.length } : null;
}
