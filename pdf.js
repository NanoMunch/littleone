// Builds the PDF report entirely on this phone, using the bundled jsPDF library (vendor/) and the
// app's own fonts. Nothing is uploaded.
import { toB64 } from './sync.js';

const PT = 0.352778; // millimetres per point
const W = 210; const H = 297; const ML = 18; const MR = 18; const MT = 18; const MB = 20;
const CW = W - ML - MR;
const C = {
  deep: [61, 43, 31], muted: [125, 98, 82], terra: [196, 113, 79], terraInk: [168, 90, 59],
  line: [234, 214, 194], warm: [245, 230, 211], sage: [95, 138, 100], gold: [181, 134, 31],
  alert: [191, 74, 73], sky: [93, 154, 182], lav: [127, 113, 176],
};
const TONE = { green: [[234, 243, 235], C.sage], yellow: [[251, 241, 220], C.gold], red: [[251, 232, 231], C.alert] };

let libPromise = null;
function loadLib() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("The PDF tool didn't load. Try again.")));
      s.onerror = () => { libPromise = null; reject(new Error("Couldn't load the PDF tool. Open the app once while online, then try again.")); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

async function fetchB64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('font');
  return toB64(new Uint8Array(await r.arrayBuffer()));
}

// Keep to characters the bundled fonts can draw (Latin, punctuation, °, €). Emoji are dropped.
function clean(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    .replace(/[^\n -~ -ſ‐-‧‰-›€™←-↓−°]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function longDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function parse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function shortDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
}

export async function buildPdf(data, h) {
  const JsPDF = await loadLib();
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const F = { sans: 'helvetica', serif: 'times', bold: 'bold', italic: 'italic' };
  try {
    const [r, b, f, fi] = await Promise.all(['fonts/dmsans-400.ttf', 'fonts/dmsans-600.ttf', 'fonts/fraunces-400.ttf', 'fonts/fraunces-italic.ttf'].map(fetchB64));
    doc.addFileToVFS('dms-r.ttf', r); doc.addFont('dms-r.ttf', 'DMSans', 'normal');
    doc.addFileToVFS('dms-b.ttf', b); doc.addFont('dms-b.ttf', 'DMSans', 'bold');
    doc.addFileToVFS('fr-r.ttf', f); doc.addFont('fr-r.ttf', 'Fraunces', 'normal');
    doc.addFileToVFS('fr-i.ttf', fi); doc.addFont('fr-i.ttf', 'Fraunces', 'italic');
    F.sans = 'DMSans'; F.serif = 'Fraunces';
  } catch (e) { /* fall back to built-in PDF fonts */ }
  doc.setProperties({ title: 'Little One report', subject: 'Health and wellbeing log', creator: 'Little One' });

  let y = MT;
  const font = (fam, style, size, color) => { doc.setFont(F[fam] || fam, style); doc.setFontSize(size); doc.setTextColor(...color); };
  const lh = (size, f = 1.4) => size * PT * f;
  const newPage = () => { doc.addPage(); y = MT; };
  const ensure = (need) => { if (y + need > H - MB) { newPage(); return true; } return false; };
  const lines = (text, w) => doc.splitTextToSize(clean(text), w);
  const write = (text, x, w, fam, style, size, color, f = 1.4) => {
    font(fam, style, size, color);
    const L = lines(text, w); const step = lh(size, f);
    for (const ln of L) { if (ensure(step)) font(fam, style, size, color); doc.text(ln, x, y, { baseline: 'top' }); y += step; }
  };
  const h2 = (text) => {
    ensure(22);
    font('serif', 'normal', 16, C.deep); doc.text(clean(text), ML, y, { baseline: 'top' }); y += 9;
  };
  const h3 = (text, keep = 14) => {
    ensure(keep);
    font('sans', 'bold', 10, C.deep); doc.text(clean(text), ML, y, { baseline: 'top' }); y += 6;
  };

  // ---------- header ----------
  font('serif', 'italic', 10, C.terra); doc.text('little one · daily log', ML, y, { baseline: 'top' }); y += 7;
  font('serif', 'normal', 24, C.deep); doc.text('Health and wellbeing report', ML, y, { baseline: 'top' }); y += 11.5;
  if (clean(data.child)) { font('serif', 'italic', 13, C.muted); doc.text(clean(`For ${data.child}`), ML, y, { baseline: 'top' }); y += 8; }
  y += 1;
  const metaRows = [
    ['Period', data.period],
    ['Areas', data.areas],
    ['Seen or reported by', data.sources],
    ['Concern level', data.levels],
    ['Prepared', `${shortDate(data.created)}${data.author ? ` by ${data.author}` : ''}`],
  ];
  for (const [k, v] of metaRows) {
    font('sans', 'normal', 9, C.deep);
    const L = lines(v, CW - 40); const step = lh(9, 1.45);
    ensure(L.length * step);
    font('sans', 'bold', 9, C.muted); doc.text(k, ML, y, { baseline: 'top' });
    font('sans', 'normal', 9, C.deep); L.forEach((ln, i) => doc.text(ln, ML + 40, y + i * step, { baseline: 'top' }));
    y += L.length * step + 0.8;
  }
  y += 3; doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 8;

  // ---------- summary ----------
  const st = data.stats;
  if (data.opts.summary) {
    h2('Summary');
    const bw = (CW - 8) / 3; const bh = 19;
    [[st.total, 'Entries'], [st.days, 'Days with entries'], [st.high, 'High concern']].forEach(([n, label], i) => {
      const x = ML + i * (bw + 4);
      doc.setFillColor(...C.warm); doc.roundedRect(x, y, bw, bh, 2.5, 2.5, 'F');
      font('serif', 'normal', 19, C.terraInk); doc.text(String(n), x + 5, y + 3, { baseline: 'top' });
      font('sans', 'normal', 8, C.muted); doc.text(label, x + 5, y + 12.5, { baseline: 'top' });
    });
    y += bh + 4;
    if (data.badge) {
      const [bg, fg] = TONE[data.badge.tone] || TONE.green;
      font('sans', 'bold', 9, fg);
      const L = lines(data.badge.text, CW - 8); const bhh = L.length * lh(9) + 5;
      doc.setFillColor(...bg); doc.roundedRect(ML, y, CW, bhh, 2.5, 2.5, 'F');
      L.forEach((ln, i) => doc.text(ln, ML + 4, y + 2.6 + i * lh(9), { baseline: 'top' }));
      y += bhh + 7;
    }

    h3('Patterns noticed');
    for (const p of st.patterns) {
      const text = p.text.replace(/\*\*/g, '');
      font('sans', 'normal', 9.5, C.deep);
      const L = lines(text, CW - 5); const step = lh(9.5, 1.45);
      ensure(L.length * step + 1.5);
      doc.setFillColor(...C.terra); doc.circle(ML + 1.2, y + 1.9, 0.75, 'F');
      L.forEach((ln, i) => doc.text(ln, ML + 5, y + i * step, { baseline: 'top' }));
      y += L.length * step + 1.6;
    }
    y += 5;

    const bars = (title, rows, color) => {
      if (!rows.length) return;
      const max = Math.max(...rows.map((r) => r[1]));
      ensure(8 + rows.length * 6.2);
      h3(title, 8 + rows.length * 6.2);
      for (const [label, n] of rows) {
        font('sans', 'normal', 9, C.muted); doc.text(clean(label), ML, y, { baseline: 'top' });
        const tx = ML + 42; const tw = CW - 42 - 12;
        doc.setFillColor(...C.warm); doc.roundedRect(tx, y + 0.8, tw, 2.8, 1.4, 1.4, 'F');
        doc.setFillColor(...color); doc.roundedRect(tx, y + 0.8, Math.max(2.8, (n / max) * tw), 2.8, 1.4, 1.4, 'F');
        font('sans', 'normal', 9, C.deep); doc.text(String(n), W - MR, y, { baseline: 'top', align: 'right' });
        y += 6.2;
      }
      y += 5;
    };
    const catOrder = Object.keys(h.CAT);
    bars('By area', Object.entries(st.byCat).sort((a, b) => b[1] - a[1] || catOrder.indexOf(a[0]) - catOrder.indexOf(b[0])).map(([k, n]) => [(h.CAT[k] || h.CAT.other).label, n]), C.terra);
    bars('Time of day', ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night', 'Overnight'].filter((t) => st.byTod[t]).map((t) => [t, st.byTod[t]]), C.sky);
    bars('Who saw it', Object.keys(h.SRC).filter((k) => st.bySrc[k]).map((k) => [h.SRC[k].label, st.bySrc[k]]), C.lav);
    write("These are simple counts worked out from the log. They can help conversations with a GP, teacher or specialist, but they aren't a diagnosis.", ML, CW, 'serif', 'italic', 9, C.muted, 1.45);
    y += 8;
  }

  // ---------- overnight sleep ----------
  const nights = data.opts.sleep ? h.sleepNights(data.entries) : [];
  if (nights.length) {
    ensure(70);
    h2('Overnight sleep');
    const sm = h.sleepSummary(nights);
    write(`Average ${h.fmtDur(sm.avg)} over ${sm.n} night${sm.n > 1 ? 's' : ''}. Usually asleep around ${h.fmtTime(sm.bed)} and awake around ${h.fmtTime(sm.wake)}. Woke during the night on ${sm.woke} of ${sm.n} nights${sm.awake ? `, about ${Math.round(sm.awake / Math.max(1, sm.woke))} min awake on those nights` : ''}. Time asleep excludes time awake in the night.`, ML, CW, 'sans', 'normal', 9.5, C.deep, 1.45);
    if (data.guide) write(`Guideline: ${data.guide.text} (Australia's 24-Hour Movement Guidelines).`, ML, CW, 'serif', 'italic', 9, C.muted, 1.45);
    y += 3;
    const shown = nights.slice(-31);
    if (shown.length >= 3) {
      const ch = 38; ensure(ch + 6);
      const cx0 = ML; const cw = CW - 12; const top = y + 2; const bot = y + ch - 7;
      const maxM = Math.max(780, ...shown.map((n) => n.mins + 30));
      const py = (m) => top + (1 - m / maxM) * (bot - top);
      if (data.guide) {
        doc.setFillColor(234, 243, 235); doc.rect(cx0, py(data.guide.hi), cw, py(data.guide.lo) - py(data.guide.hi), 'F');
        font('sans', 'normal', 7.5, C.muted);
        doc.text(`${data.guide.hi / 60} h`, cx0 + cw + 2, py(data.guide.hi), { baseline: 'middle' });
        doc.text(`${data.guide.lo / 60} h`, cx0 + cw + 2, py(data.guide.lo), { baseline: 'middle' });
      }
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(cx0, bot, cx0 + cw, bot);
      const sw = cw / shown.length; const bw = Math.min(5, sw * 0.64);
      doc.setFillColor(...C.lav);
      shown.forEach((n, i) => { const x = cx0 + i * sw + (sw - bw) / 2; doc.rect(x, py(n.mins), bw, bot - py(n.mins), 'F'); });
      const avgY = py(sm.avg); doc.setDrawColor(...C.terra); doc.setLineWidth(0.4); doc.line(cx0, avgY, cx0 + cw, avgY);
      font('sans', 'normal', 7.5, C.muted);
      doc.text(shortDate(shown[0].date), cx0, bot + 2, { baseline: 'top' });
      doc.text(shortDate(shown[shown.length - 1].date), cx0 + cw, bot + 2, { baseline: 'top', align: 'right' });
      y += ch + 1;
      write(`Bars: hours asleep each night. Orange line: average${data.guide ? '. Shaded: guideline' : ''}.`, ML, CW, 'serif', 'italic', 8.5, C.muted, 1.4);
      y += 3;
    }
    if (data.guide) { write(`Nights shorter than ${h.fmtDur(data.guide.lo)} are shown in red.`, ML, CW, 'serif', 'italic', 8.5, C.muted, 1.4); y += 2; }
    const cols = [ML, ML + 46, ML + 76, ML + 106, ML + 140];
    ensure(12);
    font('sans', 'bold', 8, C.muted);
    ['Night of', 'Asleep', 'Woke', 'Time asleep', 'Night wakings'].forEach((t, i) => doc.text(t, cols[i], y, { baseline: 'top' }));
    y += 4.6; doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(ML, y - 0.8, W - MR, y - 0.8);
    for (const n of nights) {
      ensure(5.4);
      font('sans', 'normal', 9, C.deep);
      doc.text(shortDate(n.date), cols[0], y, { baseline: 'top' });
      doc.text(h.fmtTime(n.bed), cols[1], y, { baseline: 'top' });
      doc.text(h.fmtTime(n.wake), cols[2], y, { baseline: 'top' });
      font('sans', 'bold', 9, data.guide && n.mins < data.guide.lo ? C.alert : C.deep);
      doc.text(h.fmtDur(n.mins), cols[3], y, { baseline: 'top' });
      font('sans', 'normal', 9, C.deep);
      doc.text(n.wakings ? `${n.wakings}${n.awake ? ` (${Math.round(n.awake)} min)` : ''}` : '-', cols[4], y, { baseline: 'top' });
      y += 5.4;
    }
    y += 8;
  }

  // ---------- blood tests ----------
  const series = h.labSeries(data.entries);
  if (data.opts.labs && series.length) {
    ensure(60);
    h2('Blood test results');
    write('Normal ranges are the ones entered from each report. Results outside them are marked.', ML, CW, 'serif', 'italic', 9, C.muted, 1.45);
    y += 4;
    const cols = [ML, ML + 42, ML + 86, ML + 136];
    for (const s of series) {
      const pts = s.points; const numeric = pts.filter((p) => isFinite(p.num));
      const chartH = numeric.length >= 2 ? 36 : 0;
      const need = 8 + 6 + pts.length * 5.4 + chartH + 8;
      ensure(need <= H - MB - MT ? need : 30);
      font('sans', 'bold', 10.5, C.deep); doc.text(clean(`${s.name}${s.unit ? ` (${s.unit})` : ''}`), ML, y, { baseline: 'top' }); y += 6.5;
      font('sans', 'bold', 8, C.muted);
      ['Date', 'Result', 'Normal range', ''].forEach((t, i) => doc.text(t, cols[i], y, { baseline: 'top' }));
      y += 4.6; doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(ML, y - 0.8, W - MR, y - 0.8);
      for (const p of pts) {
        if (ensure(5.4)) { font('sans', 'bold', 8, C.muted); }
        font('sans', 'normal', 9, C.deep);
        doc.text(shortDate(p.date), cols[0], y, { baseline: 'top' });
        doc.text(clean(`${p.value} ${p.unit || ''}`), cols[1], y, { baseline: 'top' });
        doc.text(clean(h.labRange(p) || '-'), cols[2], y, { baseline: 'top' });
        if (p.flag) { font('sans', 'bold', 9, p.flag === 'ok' ? C.sage : C.alert); doc.text(p.flag === 'low' ? '↓ Low' : p.flag === 'high' ? '↑ High' : 'In range', cols[3], y, { baseline: 'top' }); }
        y += 5.4;
      }
      if (chartH) {
        y += 2; ensure(chartH);
        const cx0 = ML; const cw = CW - 16; const top = y + 4; const bot = y + chartH - 8;
        const lo = h.labNum(s.latest.low); const hi = h.labNum(s.latest.high);
        const { vmin, vmax, showLo, showHi } = h.labDomain(numeric.map((p) => p.num), lo, hi);
        const t0 = parse(numeric[0].date); const t1 = parse(numeric[numeric.length - 1].date);
        const px = (d) => (t1 === t0 ? cx0 + cw / 2 : cx0 + ((parse(d) - t0) / (t1 - t0)) * cw);
        const py = (v) => top + (1 - (v - vmin) / (vmax - vmin)) * (bot - top);
        const bandShown = (isFinite(lo) && (showLo || lo < vmin)) || (isFinite(hi) && (showHi || hi > vmax));
        if (bandShown && !(isFinite(lo) && lo > vmax) && !(isFinite(hi) && hi < vmin)) {
          const yt = isFinite(hi) && showHi ? py(hi) : top - 3; const yb = isFinite(lo) && showLo ? py(lo) : bot;
          doc.setFillColor(234, 243, 235); doc.rect(cx0, yt, cw, Math.max(0.5, yb - yt), 'F');
        }
        font('sans', 'normal', 7.5, C.muted);
        if (isFinite(hi)) { if (showHi) doc.text(clean(s.latest.high), cx0 + cw + 2, py(hi), { baseline: 'middle' }); else if (hi > vmax) doc.text(clean(`↑ ${s.latest.high}`), cx0 + cw + 2, top - 1, { baseline: 'middle' }); }
        if (isFinite(lo)) { if (showLo) doc.text(clean(s.latest.low), cx0 + cw + 2, py(lo), { baseline: 'middle' }); else if (lo < vmin) doc.text(clean(`↓ ${s.latest.low}`), cx0 + cw + 2, bot - 1, { baseline: 'middle' }); }
        doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(cx0, bot, cx0 + cw, bot);
        doc.setDrawColor(...C.terra); doc.setLineWidth(0.6);
        for (let i = 1; i < numeric.length; i++) doc.line(px(numeric[i - 1].date), py(numeric[i - 1].num), px(numeric[i].date), py(numeric[i].num));
        numeric.forEach((p) => {
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5);
          doc.setFillColor(...(p.flag === 'low' || p.flag === 'high' ? C.alert : C.terra));
          doc.circle(px(p.date), py(p.num), 1.2, 'FD');
        });
        const last = numeric[numeric.length - 1];
        font('sans', 'bold', 8, C.deep); doc.text(clean(last.value), px(last.date) - 1.5, py(last.num) - 2.2, { align: 'right' });
        font('sans', 'normal', 7.5, C.muted);
        doc.text(shortDate(numeric[0].date), cx0, bot + 2, { baseline: 'top' });
        doc.text(shortDate(last.date), cx0 + cw, bot + 2, { baseline: 'top', align: 'right' });
        y += chartH;
      }
      y += 6;
    }
    y += 2;
  }

  // ---------- entries ----------
  h2(`Entries (${data.entries.length})`);
  const flaggedLab = (e) => Array.isArray(e.results) && e.results.some((r) => /low|high/.test(h.labFlag(r)));
  const sevColor = (e) => (e.cat === 'win' ? C.terra : e.cat === 'sleep' && !e.sev ? C.lav : e.cat === 'bloodtest' ? (flaggedLab(e) ? C.alert : C.sage) : e.cat === 'supplement' ? C.sky : e.sev === 3 ? C.alert : e.sev === 2 ? C.gold : C.sage);
  const block = (e, showDate, showArea) => {
    const x0 = ML + 4.5; const w = CW - 4.5;
    const cat = h.CAT[e.cat] || h.CAT.other;
    const metaBits = [
      showDate ? shortDate(e.date) : '',
      [e.tod, e.time ? h.fmtTime(e.time) : ''].filter(Boolean).join(', '),
      showArea ? cat.label : '',
      h.noConcern(e) ? '' : `${h.SEV[e.sev] || 'Mild'} concern`,
      `Seen by ${h.srcLabel(e)}`,
      data.opts.by && e.by && e.by !== h.srcLabel(e) ? `Logged by ${e.by}` : '',
    ].filter(Boolean);
    const hl = h.headline(e, data.opts.notes);
    const extra = [];
    if (e.temp && hl.from !== 'temp') extra.push(`Temperature: ${h.fmtTemp(e.temp)}`);
    if ((e.med || e.dose) && hl.from !== 'med') extra.push(`${h.ITEM_LABEL[e.cat] || 'Medicine'}: ${[e.med, e.dose].filter(Boolean).join(', ')}`);
    const parts = [];
    font('sans', 'bold', 10.5, C.deep); parts.push({ L: lines(hl.text, w), fam: 'sans', style: 'bold', size: 10.5, color: C.deep, step: lh(10.5, 1.35), gap: 0.6 });
    font('sans', 'normal', 8.5, C.muted); parts.push({ L: lines(metaBits.join('  ·  '), w), fam: 'sans', style: 'normal', size: 8.5, color: C.muted, step: lh(8.5, 1.45), gap: 0.8 });
    if (hl.from === 'sleep' && clean(e.title)) extra.unshift(e.title);
    if (e.cat === 'sleep' && e.sleep === 'waking' && e.awake) extra.push(`Awake ${e.awake} min`);
    if (extra.length) { font('sans', 'normal', 9, C.deep); parts.push({ L: lines(extra.join('     '), w), fam: 'sans', style: 'normal', size: 9, color: C.deep, step: lh(9, 1.45), gap: 0.6 }); }
    if (Array.isArray(e.results) && e.results.length) {
      font('sans', 'normal', 9, C.deep);
      const L = [];
      e.results.forEach((r) => { const f = h.labFlag(r); L.push(...lines(`${r.name}: ${r.value} ${r.unit || ''}${h.labRange(r) ? `   (normal ${h.labRange(r)})` : ''}${f === 'low' ? '   ↓ LOW' : f === 'high' ? '   ↑ HIGH' : ''}`, w)); });
      parts.push({ L, fam: 'sans', style: 'normal', size: 9, color: C.deep, step: lh(9, 1.45), gap: 0.6 });
    }
    if (data.opts.notes && clean(e.notes) && hl.from !== 'notes-all') {
      font('sans', 'normal', 9.5, C.deep);
      const L = []; clean(e.notes).split('\n').forEach((para) => { if (para.trim()) L.push(...lines(para, w)); else L.push(''); });
      parts.push({ L, fam: 'sans', style: 'normal', size: 9.5, color: C.deep, step: lh(9.5, 1.5), gap: 0, top: 0.8 });
    }
    const total = parts.reduce((s, p) => s + (p.top || 0) + p.L.length * p.step + p.gap, 0);
    if (total <= H - MB - MT) ensure(total); else ensure(parts[0].step * 3);
    let segTop = y;
    const stripe = (top, bottom) => { doc.setFillColor(...sevColor(e)); doc.rect(ML, top, 1.3, Math.max(1, bottom - top - 0.8), 'F'); };
    for (const p of parts) {
      y += p.top || 0;
      font(p.fam, p.style, p.size, p.color);
      for (const ln of p.L) {
        if (y + p.step > H - MB) { stripe(segTop, y); newPage(); segTop = y; font(p.fam, p.style, p.size, p.color); }
        if (ln) doc.text(ln, x0, y, { baseline: 'top' });
        y += p.step;
      }
      y += p.gap;
    }
    stripe(segTop, y);
    y += 5;
  };

  if (!data.entries.length) {
    write('No entries match the choices for this report.', ML, CW, 'serif', 'italic', 11, C.muted);
  } else if (data.opts.order === 'area') {
    for (const k of Object.keys(h.CAT)) {
      const group = data.entries.filter((e) => (h.CAT[e.cat] ? e.cat : 'other') === k);
      if (!group.length) continue;
      ensure(24);
      font('serif', 'normal', 13, C.terraInk); doc.text(`${h.CAT[k].label} (${group.length})`, ML, y, { baseline: 'top' }); y += 8;
      group.forEach((e) => block(e, true, false));
      y += 3;
    }
  } else {
    let last = '';
    for (const e of data.entries) {
      if (e.date !== last) {
        last = e.date;
        ensure(22);
        font('serif', 'italic', 11.5, C.muted); doc.text(longDate(e.date), ML, y, { baseline: 'top' }); y += 7;
      }
      block(e, false, true);
    }
  }

  // ---------- footer on every page ----------
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(ML, H - 13, W - MR, H - 13);
    font('sans', 'normal', 7.5, C.muted);
    doc.text('Private: contains health information about your child', ML, H - 11, { baseline: 'top' });
    doc.text(`Page ${i} of ${n}`, W - MR, H - 11, { baseline: 'top', align: 'right' });
  }
  return { blob: doc.output('blob'), pages: n };
}
