// Replaces emoji with one consistent set of rounded line icons, drawn inline (no downloads, works offline).
// Meaningful colour dots and arrows are left alone. Unknown emoji stay as they are.
const P = {
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="m9.7 8.4 5.8 6.6"/>',
  note: '<path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7"/>',
  chat: '<path d="M4 5h16v11H9l-4 4v-4H4z"/>',
  thermo: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/>',
  steth: '<path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="11" r="2"/>',
  wave: '<path d="M3 10c3-4 5-4 8 0s5 4 8 0M3 16c3-4 5-4 8 0s5 4 8 0"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 3-5 6-5s6 1.500 6 5M16 15c3 0 5 1.500 5 4.500"/>',
  school: '<path d="M3 10l9-6 9 6v10H3zM9 20v-6h6v6"/>',
  plate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.500"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.500c1 1.400 2.500 2 4 2s3-.6 4-2M9 9.500h.01M15 9.500h.01"/>',
  flat: '<circle cx="12" cy="12" r="9"/><path d="M8.500 15.500h7M9 9.500h.01M15 9.500h.01"/>',
  frown: '<circle cx="12" cy="12" r="9"/><path d="M8 16.500c1-1.400 2.500-2 4-2s3 .6 4 2M9 9.500h.01M15 9.500h.01"/>',
  sad: '<circle cx="12" cy="12" r="9"/><path d="M8 16.500c1-1.400 2.500-2 4-2s3 .6 4 2M8 9l2 1M16 9l-2 1"/>',
  leaf: '<path d="M12 21v-8M12 13c-4 0-6-3-6-7 4 0 6 2.500 6 7ZM12 15c3 0 5-2.500 5-6-3.500 0-5 2-5 6Z"/>',
  run: '<circle cx="14" cy="5" r="2"/><path d="m9 21 3-6 3 2v4M7 12l4-3 4 2 3 3"/>',
  bath: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.500"/>',
  bolt: '<path d="m13 3-8 11h6l-1 7 8-11h-6z"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.500"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  heart: '<path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.600A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z"/>',
  star: '<path d="m12 3 2.700 5.600 6.100.8-4.500 4.200 1.100 6.100L12 16.800 6.600 19.700l1.100-6.100L3.200 9.400l6.100-.8Z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/>',
  car: '<path d="M5 16v-4l2-5h10l2 5v4zM7 19v-3M17 19v-3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10Z"/>',
  ask: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 1-1 1.700M12 17h.01"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  bug: '<ellipse cx="12" cy="13" rx="4" ry="6"/><path d="M12 7V4M8 11 4 9M16 11l4-2M8 16l-4 2M16 16l4 2"/>',
};
const MAP = {
  '🌙': 'moon', '🌑': 'moon', '😴': 'moon', '💊': 'pill', '📝': 'note', '📋': 'note', '💬': 'chat', '📢': 'chat', '🤒': 'thermo', '🌡': 'thermo', '🩺': 'steth',
  '🌋': 'wave', '🌊': 'wave', '🌪': 'wave', '👤': 'person', '👪': 'people', '👥': 'people', '🤝': 'people', '🏫': 'school', '🎒': 'school',
  '🤲': 'heart', '💛': 'heart', '💞': 'heart', '🍽': 'plate', '🍎': 'plate', '🥛': 'plate', '🫙': 'plate', '☀': 'sun', '🌅': 'sun', '🌤': 'sun', '🌆': 'sun',
  '🙂': 'flat', '😌': 'smile', '😣': 'frown', '😖': 'sad', '😞': 'sad', '😐': 'flat', '😩': 'sad', '💔': 'sad',
  '🌳': 'leaf', '🌱': 'leaf', '🏃': 'run', '🏊': 'run', '🛁': 'bath', '🪥': 'bath', '📵': 'phone', '📺': 'phone', '🎮': 'phone', '📞': 'phone',
  '📍': 'pin', '⚡': 'bolt', '📏': 'ruler', '📚': 'book', '📅': 'cal', '🗓': 'cal', '📊': 'chart', '📈': 'chart', '📉': 'chart',
  '⭐': 'star', '✨': 'star', '🎲': 'dice', '🚗': 'car', '💡': 'bulb', '❓': 'ask', '🤷': 'ask', '🧪': 'flask', '🔀': 'swap', '👀': 'eye', '🙈': 'eye', '🐞': 'bug',
};
const RE = new RegExp(`(${Object.keys(MAP).join('|')})️?`, 'g');
export function injectSprite() {
  if (document.getElementById('ico-sprite')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ico-sprite'; svg.setAttribute('class', 'sprite'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = Object.entries(P).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  document.body.appendChild(svg);
}
const TEST = new RegExp(RE.source);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'svg', 'OPTION', 'TITLE']);
export function iconify(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentNode && !SKIP.has(n.parentNode.nodeName) && TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((n) => {
    RE.lastIndex = 0; const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue; let m;
    while ((m = RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ic.setAttribute('class', 'ico'); ic.setAttribute('aria-hidden', 'true');
      const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `#i-${MAP[m[1]]}`); ic.appendChild(u); frag.appendChild(ic);
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    n.parentNode.replaceChild(frag, n);
  });
}
export function watchIcons(root) {
  let queued = false;
  const run = () => { queued = false; try { obs.disconnect(); iconify(root); } finally { obs.observe(root, { childList: true, subtree: true, characterData: true }); } };
  const obs = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } });
  injectSprite(); iconify(root); obs.observe(root, { childList: true, subtree: true, characterData: true });
}
