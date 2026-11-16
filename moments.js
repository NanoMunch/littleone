// Moments: lessons and sport, kinder and school, social, self-care skills, tantrums, and the one-tap whining / tough-words counters.
// Pure functions so they can be tested without the page. Records patterns and offers gentle ideas; it never diagnoses.
const pad = (n) => String(n).padStart(2, '0');
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };

export const DETAILS = {
  lesson: { title: 'Lesson or sport', groups: [
    { f: 'engage', l: 'Engaged', opts: ['Not into it', 'Okay', 'Keen'] },
    { f: 'conf', l: 'Confidence', opts: ['Nervous', 'Warming up', 'Confident'] },
    { f: 'back', l: 'Wants to go back', opts: ['Yes', 'Not sure', 'No'] }], nums: [{ f: 'mins', l: 'Length (minutes)', ph: 'e.g. 30', unit: 'min' }] },
  school: { title: 'Time at kinder or school', groups: [
    { f: 'where', l: 'Where', opts: ['Kinder', 'Daycare', 'School', 'Before or after care'] },
    { f: 'how', l: 'How it went', opts: ['Hard', 'Mixed', 'Good'] },
    { f: 'pick', l: 'At pick-up', opts: ['Happy', 'Tired', 'Flat', 'Upset'] }], nums: [{ f: 'hrs', l: 'Time there (hours)', ph: 'e.g. 6', unit: 'h' }, { f: 'melt', l: 'Pick-up meltdown (minutes, if any)', ph: 'e.g. 10', unit: 'min meltdown' }] },
  social: { title: 'Social', groups: [{ f: 'how', l: 'How it went', opts: ['Played together', 'Played alongside', 'Conflict', 'Left out', 'Kind to others'] }], nums: [] },
  selfcare: { title: 'Self-care', groups: [
    { f: 'what', l: 'What', opts: ['Shower or bath', 'Teeth', 'Dressing', 'Toilet', 'Hair', 'Shoes'] },
    { f: 'help', l: 'How much help', opts: ['Did it alone', 'With reminders', 'With help', 'Resisted'] }], nums: [] },
  tantrum: { title: 'Tantrum', groups: [
    { f: 'before', l: 'What came before', opts: ['Said no', 'Transition', 'Tired', 'Hungry', 'Other child', 'Not sure'] },
    { f: 'end', l: 'How it settled', opts: ['Cuddle', 'Space', 'Distraction', 'Calm words', 'Ran its course'] },
    { f: 'linger', l: 'Afterwards', opts: ['Back to normal', 'A bit flat', 'Lingered a while'] }], nums: [{ f: 'mins', l: 'Length (minutes)', ph: 'e.g. 8', unit: 'min' }] },
};
export const DETAIL_NUMS = ['mins', 'hrs', 'melt'];

// Keeps only known groups and options.
export function cleanDetail(cat, dt) {
  const spec = DETAILS[cat]; const out = {}; if (!spec || !dt || typeof dt !== 'object') return out;
  for (const g of spec.groups) if (g.opts.includes(dt[g.f])) out[g.f] = dt[g.f];
  return out;
}
export const cleanNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 && n <= 1440 ? String(Math.round(n * 10) / 10) : ''; };
export const hasDetail = (cat, dt, nums) => !!DETAILS[cat] && (Object.keys(cleanDetail(cat, dt)).length > 0 || DETAILS[cat].nums.some((n) => cleanNum(nums && nums[n.f])));

// "Keen · Warming up · Wants to go back: Yes" style summary for a card.
export function detailText(e) {
  const spec = DETAILS[e.cat]; if (!spec) return '';
  const dt = cleanDetail(e.cat, e.dt); const parts = [];
  for (const g of spec.groups) if (dt[g.f]) parts.push(g.f === 'back' ? `Wants to go back: ${dt[g.f]}` : g.f === 'before' ? `After: ${dt[g.f].toLowerCase()}` : g.f === 'pick' ? `Pick-up: ${dt[g.f].toLowerCase()}` : g.f === 'help' ? dt[g.f] : g.f === 'end' ? `Settled with: ${dt[g.f].toLowerCase()}` : g.f === 'linger' ? dt[g.f] : g.f === 'how' ? dt[g.f] : dt[g.f]);
  for (const n of spec.nums) { const v = cleanNum(e[n.f]); if (v) parts.push(`${v} ${n.unit}`); }
  return parts.join(' · ');
}
// A headline when the person added chips but no title.
export function detailTitle(e) {
  const spec = DETAILS[e.cat]; if (!spec) return '';
  const dt = cleanDetail(e.cat, e.dt); const m = cleanNum(e.mins); const h = cleanNum(e.hrs);
  if (e.cat === 'tantrum') return `Tantrum${m ? `, ${m} min` : ''}`;
  if (e.cat === 'school') return `${dt.where || 'School'}${h ? `, ${h} h` : ''}`;
  if (e.cat === 'selfcare') return dt.what || 'Self-care';
  if (e.cat === 'lesson') return `Lesson or sport${m ? `, ${m} min` : ''}`;
  return dt.how ? `Social: ${dt.how.toLowerCase()}` : spec.title;
}

const within = (list, cat, from, to) => list.filter((e) => e && !e.deleted && e.cat === cat && e.date >= from && e.date <= to);
const count = (arr, f) => { const m = {}; arr.forEach((x) => { const v = f(x); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
const SUPPORT = 'Parentline Victoria (13 22 89) is a friendly place to talk it through, and your GP or child health nurse can help too.';

// Gentle patterns and ideas from the last 30 days (14 for tantrums). Each item: { key, title, facts: [], tips: [] }.
export function momentCards(entries, today) {
  const out = []; const d30 = addDays(today, -29); const d14 = addDays(today, -13);
  const dt = (e) => cleanDetail(e.cat, e.dt);
  // Lessons
  const ls = within(entries, 'lesson', d30, today);
  if (ls.length >= 2) {
    const facts = []; const tips = [];
    const keen = ls.filter((e) => dt(e).engage === 'Keen').length; const nerv = ls.filter((e) => dt(e).conf === 'Nervous').length; const back = ls.filter((e) => dt(e).back === 'Yes').length; const noBack = ls.filter((e) => dt(e).back === 'No').length;
    facts.push(`${ls.length} sessions logged in the last 30 days.`);
    if (keen) facts.push(`Keen in ${keen} of them.`);
    if (back) facts.push(`Wanted to go back after ${back}.`);
    if (nerv >= 2 && nerv >= ls.length / 2) tips.push('Nervous starts are really common. Arriving a little early to watch first, keeping the routine the same each week and praising effort rather than skill can help confidence grow.');
    if (noBack >= 2) tips.push('When they say they don\'t want to go back, asking "what was the trickiest part?" can show what is really behind it. Sometimes a small change, like a different time or a friend alongside, makes the difference.');
    if (keen >= ls.length / 2 && !tips.length) tips.push('This looks like a good fit. Noticing out loud what they enjoyed ("you kept trying that one") builds on it.');
    if (!tips.length) tips.push('Confidence often builds in small steps. A little time to warm up before joining in is perfectly normal.');
    out.push({ key: 'lesson', title: 'Lessons and sport', facts, tips });
  }
  // School
  const sc = within(entries, 'school', d30, today);
  if (sc.length >= 3) {
    const facts = []; const tips = [];
    const melts = sc.filter((e) => cleanNum(e.melt)); const hard = sc.filter((e) => dt(e).how === 'Hard').length; const good = sc.filter((e) => dt(e).how === 'Good').length;
    const upset = sc.filter((e) => ['Upset', 'Flat'].includes(dt(e).pick)).length;
    facts.push(`${sc.length} days logged.${good ? ` ${good} went well.` : ''}`);
    if (melts.length) facts.push(`A pick-up meltdown on ${melts.length} of them, around ${Math.round(melts.reduce((a, e) => a + parseFloat(e.melt), 0) / melts.length)} min on average.`);
    if (melts.length >= 3 || upset >= 3) tips.push('After a long day many children hold it together until they are with you, then let it out. A snack, some quiet and a hug before any questions about the day often helps. Talking about it later in the evening tends to go better.');
    if (hard >= 3 && hard >= sc.length / 3) tips.push('A few harder days are worth mentioning to their teacher. They may see something you can\'t, and it helps to compare notes.');
    if (!tips.length) tips.push('Nothing stands out. Keeping the after-school routine predictable is a helpful anchor.');
    out.push({ key: 'school', title: 'Kinder and school', facts, tips });
  }
  // Social
  const so = within(entries, 'social', d30, today).filter((e) => dt(e).how);
  if (so.length >= 3) {
    const rough = so.filter((e) => ['Conflict', 'Left out'].includes(dt(e).how)).length; const warm = so.filter((e) => ['Played together', 'Kind to others'].includes(dt(e).how)).length;
    const facts = [`${so.length} observations logged. ${warm} warm moments and ${rough} tricky ones.`]; const tips = [];
    if (rough >= 2 && rough >= so.length / 3) tips.push('Practising simple words at home ("can I have a turn?", "I\'d like to play too") and arranging play with one child at a time can make group play easier.');
    else tips.push('Noticing the warm moments out loud ("I saw you share, that was kind") helps those habits stick.');
    out.push({ key: 'social', title: 'Playing with others', facts, tips });
  }
  // Self-care
  const sf = within(entries, 'selfcare', d30, today).filter((e) => dt(e).what && dt(e).help);
  if (sf.length >= 3) {
    const byWhat = count(sf.filter((e) => dt(e).help === 'Resisted'), (e) => dt(e).what);
    const alone = sf.filter((e) => dt(e).help === 'Did it alone').length;
    const facts = [`${sf.length} logged. They did it alone ${alone} time${alone === 1 ? '' : 's'}.`]; const tips = [];
    if (byWhat.length && byWhat[0][1] >= 2) tips.push(`${byWhat[0][0]} is where they push back most. Offering a choice (this toothbrush or that one), doing it together, or turning it into a short game often softens it.`);
    if (alone >= sf.length / 3) tips.push('Doing more by themselves is real progress. Letting them finish the last step themselves keeps the pride.');
    if (!tips.length) tips.push('Little by little, less help is needed. A simple picture chart can make the steps feel like theirs.');
    out.push({ key: 'selfcare', title: 'Self-care skills', facts, tips });
  }
  // Tantrums
  const tt = within(entries, 'tantrum', d14, today);
  if (tt.length >= 3) {
    const ms = tt.map((e) => parseFloat(cleanNum(e.mins))).filter((x) => x > 0); const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
    const before = count(tt, (e) => dt(e).before).filter(([k]) => k !== 'Not sure'); const linger = tt.filter((e) => dt(e).linger === 'Lingered a while').length;
    const facts = [`${tt.length} in the last 14 days${avg ? `, usually about ${avg} min` : ''}.`]; const tips = [];
    if (before.length && before[0][1] >= 2) facts.push(`Most often after: ${before[0][0].toLowerCase()}.`);
    const top = before.length && before[0][1] >= 2 ? before[0][0] : '';
    if (top === 'Tired' || top === 'Hungry') tips.push('A lot of these follow being tired or hungry. A snack and some quiet time a little earlier in the day can head some off.');
    else if (top === 'Transition') tips.push('Switching activities is often the trigger. A warning ("two more minutes, then shoes") and a job to do during the change can help.');
    else if (top === 'Said no') tips.push('Hearing no is hard at this age. Offering two acceptable choices gives a sense of control without changing the answer.');
    else if (top === 'Other child') tips.push('Playing with others can be big. Short play with one child, and an adult close by, tends to go more smoothly.');
    tips.push('During one, staying close and calm, naming the feeling and waiting for the peak to pass usually works better than talking. Reconnecting afterwards matters more than the lesson.');
    if (tt.length >= 10 || avg >= 20 || linger >= 3) tips.push(`If these are very frequent, long, or hard to recover from, it is worth a chat with someone. ${SUPPORT}`);
    out.push({ key: 'tantrum', title: 'Tantrums', facts, tips });
  }
  return out;
}

// One-tap counters: kind 'whine' or 'notlove'. Entries: { cat: 'tally', kind, date }.
export function tallyStats(entries, today) {
  const res = {};
  for (const kind of ['whine', 'notlove']) {
    const list = entries.filter((e) => e && !e.deleted && e.cat === 'tally' && e.kind === kind && e.date);
    const wk = list.filter((e) => e.date >= addDays(today, -6) && e.date <= today); const prev = list.filter((e) => e.date >= addDays(today, -13) && e.date < addDays(today, -6));
    const days = new Set(wk.map((e) => e.date)).size;
    res[kind] = { today: list.filter((e) => e.date === today).length, week: wk.length, prev: prev.length, days };
  }
  return res;
}
export function tallyNotes(st) {
  const notes = []; const tips = [];
  const w = st.whine; const n = st.notlove;
  if (w.week >= 8 && w.days >= 4) { notes.push(`Whining came up ${w.week} times this week, on ${w.days} days.`); tips.push('Whining is often a sign of being tired, hungry or wanting connection. A drink, a snack, or two minutes of full attention can change the mood. Asking for the "big voice" calmly, then praising it when it comes, helps over time.'); }
  if (w.week >= 8 && w.prev && w.week >= w.prev * 1.5) notes.push('That is a bit more than the week before.');
  if (n.week >= 2) { notes.push(`"I don't love you" or similar came up ${n.week} times this week.`); tips.push('At this age these words usually mean "I\'m upset and I don\'t have better ones". Staying calm, acknowledging the feeling ("you\'re really angry with me") and keeping the love steady is usually enough. It tends to pass.'); }
  if (n.week >= 5) tips.push(`If it is happening a lot, or they seem unhappy in other ways too, it is worth talking it over. ${SUPPORT}`);
  return { notes, tips };
}
