// Draws a cheatsheet onto a canvas at the device's exact pixel size.
// Layout: pick the column count and font size that fill the safe area best, then draw.
import { TEMPLATES } from './themes.js';
import { rgba } from './color.js';

export const DEVICES = {
  phone: [
    { id: 'iphone-pro', label: 'iPhone 15 / 16 Pro', w: 1179, h: 2556 },
    { id: 'iphone', label: 'iPhone 13 / 14', w: 1170, h: 2532 },
    { id: 'iphone-max', label: 'iPhone Pro Max', w: 1290, h: 2796 },
    { id: 'android', label: 'Android 1080 x 2400', w: 1080, h: 2400 },
    { id: 'pixel', label: 'Pixel 8 Pro', w: 1344, h: 2992 },
  ],
  desktop: [
    { id: 'qhd', label: '2560 x 1440', w: 2560, h: 1440 },
    { id: 'fhd', label: '1920 x 1080', w: 1920, h: 1080 },
    { id: 'uhd', label: '3840 x 2160 (4K)', w: 3840, h: 2160 },
    { id: 'mbp14', label: 'MacBook Pro 14', w: 3024, h: 1964 },
    { id: 'mba13', label: 'MacBook Air 13', w: 2560, h: 1664 },
  ],
};

export function findDevice(id) {
  for (const kind of Object.keys(DEVICES)) {
    const d = DEVICES[kind].find((x) => x.id === id);
    if (d) return { ...d, kind };
  }
  return null;
}

// Where text may go. Phones keep clear of the lock screen clock and widgets (top ~30%)
// and the flashlight, camera and notification stack (bottom ~13%). Desktops keep clear of
// the menu bar, desktop icons and the dock or taskbar.
export function safeArea(w, h, kind) {
  if (kind === 'phone') return { x: w * 0.075, y: h * 0.305, w: w * 0.85, h: h * 0.565 };
  return { x: w * 0.075, y: h * 0.08, w: w * 0.85, h: h * 0.79 };
}

// ---------- text measuring and wrapping ----------

function measurer(ctx) {
  const cache = new Map();
  return (text, f) => {
    const k = f + '\u0000' + text;
    let v = cache.get(k);
    if (v === undefined) { ctx.font = f; v = ctx.measureText(text).width; cache.set(k, v); }
    return v;
  };
}

// runs: [{ text, font, color, mark }] -> lines of positioned pieces
function wrap(measure, runs, maxW) {
  const lines = [[]];
  let x = 0;
  const push = (text, r) => {
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    const w = measure(text, r.font);
    if (last && last.font === r.font && last.color === r.color && last.mark === r.mark) {
      last.text += text; last.w += w;
    } else line.push({ text, font: r.font, color: r.color, mark: r.mark, x, w });
    x += w;
  };
  for (const r of runs) {
    // Text may break after a hyphen, code also after . ( , = / | : so long calls wrap at a sensible place.
    const words = r.text.split(/(\s+)/).filter(Boolean)
      .flatMap((wd) => (/^\s+$/.test(wd) ? [wd] : wd.split(r.code ? /(?<=[(,=|:])(?=[^)\]}]{4,})|(?<=[/-])(?=\w{3,})|(?<=\.)(?=\w{5,}|\w*\()/ : /(?<=[a-z]-)(?=[a-z])/i).map((x, i) => (i ? '\u0001' + x : x))));
    for (let word of words) {
      const glued = word.startsWith('\u0001');
      if (glued) word = word.slice(1);
      const space = /^\s+$/.test(word);
      const w = measure(word, r.font);
      if (space) { if (x > 0) push(' ', r); continue; }
      if (glued && x + w > maxW && x > 0) { lines.push([]); x = 0; }
      if (x + w <= maxW || x === 0) {
        if (w <= maxW) { push(word, r); continue; }
        // A word wider than the column: break it by characters.
        let chunk = '';
        for (const ch of word) {
          if (x + measure(chunk + ch, r.font) > maxW && chunk) { push(chunk, r); lines.push([]); x = 0; chunk = ''; }
          chunk += ch;
        }
        if (chunk) push(chunk, r);
        continue;
      }
      // New line. Drop the trailing space on the line we leave.
      const line = lines[lines.length - 1];
      const tail = line[line.length - 1];
      if (tail && tail.text.endsWith(' ')) { tail.text = tail.text.slice(0, -1); tail.w -= measure(' ', tail.font); }
      lines.push([]); x = 0;
      if (w <= maxW) push(word, r);
      else {
        let chunk = '';
        for (const ch of word) {
          if (x + measure(chunk + ch, r.font) > maxW && chunk) { push(chunk, r); lines.push([]); x = 0; chunk = ''; }
          chunk += ch;
        }
        if (chunk) push(chunk, r);
      }
    }
  }
  return lines.filter((l) => l.length);
}

// ---------- layout ----------

function sizes(t, B) {
  const m = t.m;
  const L = B * m.lineH;
  return {
    B, L,
    body: t.fonts.body(B), bold: t.fonts.bold(B),
    mono: t.fonts.mono(B * m.code), codeSize: B * m.code,
    heading: t.fonts.heading(B * m.heading), headingSize: B * m.heading,
    title: t.fonts.title(B * m.title), titleSize: B * m.title,
  };
}

// Lays out one section in a column `w` wide. Returns { h, ops } with ops relative to (0, 0).
function layoutSection(t, c, s, section, index, w, measure) {
  const ops = [];
  const { B, L } = s;
  const snap = t.snap ? (v) => Math.ceil(v / L - 0.001) * L : (v) => v;
  let y = 0;

  // Heading
  let htext = (t.headingPrefix ? t.headingPrefix(index) : '') + (t.m.upper ? section.heading.toUpperCase() : section.heading);
  const hLines = wrap(measure, [{ text: htext, font: s.heading, color: c.accent }], w);
  const hLH = t.snap ? L * 1.0 : s.headingSize * 1.25;
  const hBlock = t.snap ? Math.max(2, Math.ceil((hLines.length * s.headingSize * 1.1) / L)) * L : hLines.length * hLH;
  hLines.forEach((line, i) => {
    const baseline = t.snap ? hBlock - L * 0.28 - (hLines.length - 1 - i) * s.headingSize * 1.05 : (i + 0.82) * hLH;
    ops.push({ type: 'line', y: baseline, pieces: line, track: t.m.track * s.headingSize });
  });
  y += hBlock;
  if (t.headingRule) {
    ops.push({ type: 'rule', y: y + B * 0.35, w, color: c.rule });
    y += B * 0.95;
  } else y += t.snap ? 0 : B * 0.5;

  // Items
  section.items.forEach((item, k) => {
    const runs = [
      { text: item.term, font: s.bold, color: c.fg, mark: t.term === 'highlight' ? c.highlight : null },
      { text: '  ' + item.line, font: s.body, color: c.muted },
    ];
    const lines = wrap(measure, runs, w);
    lines.forEach((line, i) => ops.push({ type: 'line', y: y + i * L + (t.snap ? L - B * 0.32 : B * 1.0), pieces: line }));
    y += lines.length * L;

    if (item.code) {
      const cs = s.codeSize;
      if (t.code === 'chip' || t.code === 'outline') {
        const padX = cs * 0.55, padY = cs * 0.34, cl = cs * 1.32;
        const cLines = wrap(measure, [{ text: item.code, font: s.mono, color: c.codeFg, code: true }], w - padX * 2);
        const chipW = Math.min(w, Math.max(...cLines.map((l) => l.reduce((a, p) => a + p.w, 0))) + padX * 2);
        const chipH = cLines.length * cl + padY * 2;
        y += B * 0.28;
        ops.push({ type: t.code, y, w: chipW, h: chipH, r: cs * 0.32, fill: c.codeBg, stroke: c.rule });
        cLines.forEach((line, i) => ops.push({ type: 'line', y: y + padY + i * cl + cs * 0.98, dx: padX, pieces: line }));
        y += chipH;
      } else {
        const prefix = t.code === 'prompt' ? [{ text: '$ ', font: s.mono, color: c.prompt }] : [];
        const cLines = wrap(measure, [...prefix, { text: item.code, font: s.mono, color: c.codeFg, code: true }], w);
        const cl = t.snap ? L : cs * 1.45;
        if (!t.snap) y += B * 0.12;
        cLines.forEach((line, i) => ops.push({ type: 'line', y: y + i * cl + (t.snap ? L - B * 0.36 : cs * 1.05), pieces: line }));
        y += cLines.length * cl;
      }
    }
    if (k < section.items.length - 1) y += B * t.m.itemGap;
    y = snap(y);
  });
  return { h: y, ops };
}

// Split sections into `k` columns in order, keeping the tallest column as short as possible.
function partition(heights, k, gap) {
  const n = heights.length;
  if (k >= n) return heights.map((_, i) => [i]);
  let best = null;
  const cuts = [];
  const colH = (a, b) => { let h = 0; for (let i = a; i < b; i++) h += heights[i] + (i > a ? gap : 0); return h; };
  (function rec(start, left) {
    if (left === 1) {
      const groups = [...cuts, [start, n]];
      const max = Math.max(...groups.map(([a, b]) => colH(a, b)));
      if (!best || max < best.max) best = { max, groups };
      return;
    }
    for (let e = start + 1; e <= n - left + 1; e++) { cuts.push([start, e]); rec(e, left - 1); cuts.pop(); }
  })(0, k);
  return best.groups.map(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i));
}

function frameInsets(t, B) {
  if (!t.frame) return { top: 0, right: 0, bottom: 0, left: 0, bar: 0 };
  const pad = B * 1.7, bar = B * 2.3;
  return { top: pad + bar, right: pad, bottom: pad, left: pad, bar, pad };
}

function tryLayout(t, c, sheet, area, kind, k, B, measure) {
  const s = sizes(t, B);
  const ins = frameInsets(t, B);
  const inner = { x: area.x + ins.left, y: area.y + ins.top, w: area.w - ins.left - ins.right, h: area.h - ins.top - ins.bottom };
  const gap = B * t.m.colGap;
  const colW = (inner.w - gap * (k - 1)) / k;
  if (colW < B * 12) return null;

  // Header
  const header = [];
  let hy = 0;
  if (t.id === 'terminal') {
    header.push({ type: 'line', y: s.B * 1.0, pieces: [{ text: '~/learn $ ', font: s.mono, color: c.prompt, x: 0, w: measure('~/learn $ ', s.mono) }, { text: 'cat notes.md', font: s.mono, color: c.muted, x: measure('~/learn $ ', s.mono), w: 0 }] });
    hy += s.L * 1.2;
  }
  const tLines = wrap(measure, [{ text: (t.titlePrefix || '') + sheet.title, font: s.title, color: c.fg }], inner.w);
  const tLH = t.snap ? Math.ceil((s.titleSize * 1.05) / s.L) * s.L : s.titleSize * 1.12;
  tLines.forEach((line, i) => header.push({ type: 'line', y: hy + i * tLH + (t.snap ? tLH - s.L * 0.3 : s.titleSize * 0.92), pieces: line }));
  hy += tLines.length * tLH + (t.snap ? s.L : s.B * t.m.titleGap);
  if (t.id === 'blueprint') { header.push({ type: 'rule', y: hy - s.B * 0.9, w: inner.w, color: c.rule, double: true }); hy += s.B * 0.2; }

  const secs = sheet.sections.map((sec, i) => layoutSection(t, c, s, sec, i, colW, measure));
  const sGap = t.snap ? s.L * t.m.sectionGap : B * t.m.sectionGap;
  const groups = partition(secs.map((x) => x.h), k, sGap);
  const colHeights = groups.map((g) => g.reduce((a, i, j) => a + secs[i].h + (j ? sGap : 0), 0));
  const bodyH = Math.max(...colHeights);
  const total = hy + bodyH;
  return { s, ins, inner, colW, gap, header, hy, secs, groups, total, fits: total <= inner.h, colHeights, sGap, k, B };
}

// Find the biggest font that fits, for each sensible column count, and keep the best.
function fit(t, c, sheet, area, kind, w, h, measure) {
  const unit = kind === 'phone' ? w * 0.0235 : h * 0.0175;
  const base = unit * (t.m.scale || 1);
  const ks = kind === 'phone' ? [1, 2] : area.w / area.h > 1.9 ? [3, 4, 5] : [3, 4];
  const minS = 0.72, maxS = kind === 'phone' ? 1.45 : 1.5;
  let best = null;
  for (const k of ks) {
    if (k > sheet.sections.length) continue;
    let lo = minS, hi = maxS, found = null;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const r = tryLayout(t, c, sheet, area, kind, k, base * mid, measure);
      if (r && r.fits) { found = r; lo = mid; } else hi = mid;
    }
    // Two columns on a phone only wins when it buys clearly bigger text.
    // Balanced columns beat a slightly bigger font with one ragged column.
    if (!found) continue;
    const fill = found.colHeights.reduce((a, b) => a + b, 0) / (found.k * Math.max(...found.colHeights));
    const score = found.B * (0.7 + 0.3 * fill) * (kind === 'phone' && k === 1 ? 1.12 : 1);
    if (!best || score > best.score) best = Object.assign(found, { score });
  }
  if (best) return best;
  const k = kind === 'phone' ? 2 : ks[ks.length - 1];
  const r = tryLayout(t, c, sheet, area, kind, k, base * minS, measure) || tryLayout(t, c, sheet, area, kind, ks[0], base * minS, measure);
  return Object.assign(r, { overflow: true });
}

// ---------- drawing ----------

function drawLine(ctx, op, ox, oy) {
  for (const p of op.pieces) {
    ctx.font = p.font;
    const x = ox + (op.dx || 0) + p.x;
    const y = oy + op.y;
    if (p.mark) {
      const size = parseFloat(p.font.split(' ')[1]);
      ctx.fillStyle = p.mark;
      ctx.beginPath();
      ctx.roundRect(x - size * 0.14, y - size * 0.8, p.w + size * 0.28, size * 0.98, size * 0.16);
      ctx.fill();
    }
    ctx.fillStyle = p.color;
    if (op.track) { ctx.letterSpacing = `${op.track}px`; }
    ctx.fillText(p.text, x, y);
    if (op.track) ctx.letterSpacing = '0px';
  }
}

function drawOps(ctx, ops, ox, oy) {
  for (const op of ops) {
    if (op.type === 'line') drawLine(ctx, op, ox, oy);
    else if (op.type === 'chip') {
      ctx.fillStyle = op.fill;
      ctx.beginPath(); ctx.roundRect(ox, oy + op.y, op.w, op.h, op.r); ctx.fill();
    } else if (op.type === 'outline') {
      ctx.save();
      ctx.strokeStyle = op.stroke; ctx.lineWidth = Math.max(1, op.r * 0.18);
      ctx.setLineDash([op.r * 0.9, op.r * 0.6]);
      ctx.strokeRect(ox + 0.5, oy + op.y + 0.5, op.w - 1, op.h - 1);
      ctx.restore();
    } else if (op.type === 'rule') {
      ctx.fillStyle = op.color;
      const t = Math.max(1, Math.round(ctx.canvas.height / 1400));
      ctx.fillRect(ox, oy + op.y, op.w, t);
      if (op.double) ctx.fillRect(ox, oy + op.y + t * 4, op.w, t);
    }
  }
}

function background(ctx, t, c, w, h, L, inner, area) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
  if (t.grid) {
    const g = Math.round(L);
    const ox = inner.x % g, oy = inner.y % g;
    for (let i = 0, x = ox; x < w; x += g, i++) {
      ctx.fillStyle = (i - Math.round((inner.x - ox) / g)) % 5 === 0 ? c.lineMajor : c.line;
      ctx.fillRect(Math.round(x), 0, 1, h);
    }
    for (let i = 0, y = oy; y < h; y += g, i++) {
      ctx.fillStyle = (i - Math.round((inner.y - oy) / g)) % 5 === 0 ? c.lineMajor : c.line;
      ctx.fillRect(0, Math.round(y), w, 1);
    }
  }
  if (t.rules) {
    const lw = Math.max(1, Math.round(h / 1500));
    ctx.fillStyle = c.line;
    for (let y = inner.y % L; y < h; y += L) ctx.fillRect(0, Math.round(y), w, lw);
    ctx.fillStyle = c.margin;
    const mx = Math.round(area.x - L * 0.8);
    ctx.fillRect(mx, 0, lw * 2, h);
  }
}

function drawFrame(ctx, t, c, r) {
  const { inner, ins, s } = r;
  const x = inner.x - ins.left, y = inner.y - ins.top;
  const fw = inner.w + ins.left + ins.right;
  const fh = r.hy + Math.max(...r.colHeights) + ins.top + ins.bottom;
  const rad = s.B * 0.7;
  ctx.fillStyle = c.win;
  ctx.beginPath(); ctx.roundRect(x, y, fw, fh, rad); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, fw, fh, rad); ctx.clip();
  ctx.fillStyle = c.bar; ctx.fillRect(x, y, fw, ins.bar);
  ctx.restore();
  ctx.strokeStyle = c.border; ctx.lineWidth = Math.max(1, s.B * 0.06);
  ctx.beginPath(); ctx.roundRect(x, y, fw, fh, rad); ctx.stroke();
  const dot = s.B * 0.36;
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x + ins.pad * 0.7 + i * dot * 3.2, y + ins.bar / 2, dot, 0, Math.PI * 2); ctx.fill();
  });
  ctx.font = t.fonts.body(s.B * 0.78);
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'center';
  ctx.fillText('notes.md', x + fw / 2, y + ins.bar / 2 + s.B * 0.27);
  ctx.textAlign = 'left';
}

// opts: { width, height, kind, template, color, mode }
// Returns { overflow, fontPx, columns } so the UI can warn when text had to shrink too far.
export function renderSheet(canvas, sheet, opts) {
  const { width: w, height: h, kind } = opts;
  const t = TEMPLATES[opts.template] || TEMPLATES.minimal;
  const c = t.palette(opts.color || '#8fb3ff', t.modes ? opts.mode : 'dark');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  ctx.textRendering = 'optimizeLegibility';
  const measure = measurer(ctx);
  const area = safeArea(w, h, kind);
  const r = fit(t, c, sheet, area, kind, w, h, measure);

  // Centre the block vertically in the safe area when there is room left over.
  const spare = r.inner.h - r.total;
  let oy = r.inner.y + (spare > 0 ? (t.snap ? Math.floor(spare / 2 / r.s.L) * r.s.L : spare * (kind === 'phone' ? 0.35 : 0.45)) : 0);
  const shift = oy - r.inner.y;
  const inner = { ...r.inner, y: oy };

  background(ctx, t, c, w, h, r.s.L, inner, area);
  if (t.frame) drawFrame(ctx, t, c, { ...r, inner });

  drawOps(ctx, r.header, inner.x, inner.y);
  r.groups.forEach((g, col) => {
    let y = inner.y + r.hy;
    const x = inner.x + col * (r.colW + r.gap);
    g.forEach((i, j) => {
      if (j) y += r.sGap;
      drawOps(ctx, r.secs[i].ops, x, y);
      y += r.secs[i].h;
    });
  });
  return { overflow: !!r.overflow, fontPx: Math.round(r.B), columns: r.k, shift };
}

// A sheet to show before anything is generated.
export const SAMPLE = {
  title: 'Git, the parts you forget',
  sections: [
    { heading: 'Undo', items: [
      { term: 'Unstage', line: 'Take a file out of the next commit, keep the edits', code: 'git restore --staged app.js' },
      { term: 'Amend', line: 'Fix the last commit message or add a missed file', code: 'git commit --amend' },
      { term: 'Soft reset', line: 'Drop the last commit but keep its changes staged', code: 'git reset --soft HEAD~1' },
    ] },
    { heading: 'Branches', items: [
      { term: 'Switch', line: 'Move to a branch, or create it with -c', code: 'git switch -c feature' },
      { term: 'Rebase', line: 'Replay your commits on top of the latest main', code: 'git rebase origin/main' },
      { term: 'Cleanup', line: 'Delete local branches already merged', code: 'git branch --merged | xargs git branch -d' },
    ] },
    { heading: 'Find things', items: [
      { term: 'Blame', line: 'See who last changed each line and when', code: 'git blame -L 10,30 app.js' },
      { term: 'Pickaxe', line: 'Find the commit that added or removed a string', code: 'git log -S "apiKey"' },
      { term: 'Bisect', line: 'Binary search history for the commit that broke it', code: 'git bisect start' },
    ] },
    { heading: 'Rescue', items: [
      { term: 'Reflog', line: 'Every place HEAD has been, even after a bad reset', code: 'git reflog' },
      { term: 'Stash', line: 'Park unfinished work, bring it back later', code: 'git stash push -m wip' },
      { term: 'Cherry pick', line: 'Copy one commit from another branch onto this one', code: 'git cherry-pick 3f2a91c' },
    ] },
  ],
};
