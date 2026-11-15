import './site.css';
import { fontsReady } from './fonts.js';
import { renderSheet, DEVICES, SAMPLE } from './render.js';
import { TEMPLATES, PRESETS } from './themes.js';
import { githubSummary, resumeText } from './context.js';

const $ = (s) => document.querySelector(s);
const STORE = 'cramwall:v1';

const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
const state = {
  topics: '', kind: 'phone', device: 'iphone-pro', custom: { phone: [1179, 2556], desktop: [2560, 1440] },
  template: 'minimal', color: '#8fb3ff', mode: 'dark', sheet: null, profile: null, ctxKind: 'words',
  ...saved,
};
state.sheet ||= structuredClone(SAMPLE);
let ctxText = '';
let busy = false;

const save = () => {
  const { topics, kind, device, custom, template, color, mode, sheet, profile } = state;
  try { localStorage.setItem(STORE, JSON.stringify({ topics, kind, device, custom, template, color, mode, sheet, profile })); } catch {}
};

function size() {
  if (state.device === 'custom') {
    const [w, h] = state.custom[state.kind];
    return { w: clamp(w), h: clamp(h) };
  }
  const d = DEVICES[state.kind].find((x) => x.id === state.device) || DEVICES[state.kind][0];
  return { w: d.w, h: d.h };
}
const clamp = (v) => Math.min(7680, Math.max(480, Math.round(+v || 0)));

// ---------- rendering ----------
const canvas = $('#canvas');
let raf = 0;
function draw() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(async () => {
    await fontsReady();
    const { w, h } = size();
    const info = renderSheet(canvas, state.sheet, { width: w, height: h, kind: state.kind, template: state.template, color: state.color, mode: state.mode });
    const frame = $('#frame');
    const px = canvas.getContext('2d').getImageData(Math.round(w / 2), Math.round(h * 0.12), 1, 1).data;
    const lightBg = 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2] > 150;
    frame.className = `frame ${state.kind}${lightBg ? ' light-bg' : ''}`;
    frame.style.aspectRatio = `${w} / ${h}`;
    $('#lock').hidden = !(state.kind === 'phone' && $('#show-lock').checked);
    $('#show-lock').closest('label').hidden = state.kind !== 'phone';
    $('#download').textContent = `Download PNG, ${w} x ${h}`;
    $('#meta').textContent = info.overflow
      ? 'Too much text for this screen. Shorten a few lines or remove an item.'
      : `${info.columns} column${info.columns > 1 ? 's' : ''}, body text ${info.fontPx}px`;
    $('#meta').classList.toggle('warn', info.overflow);
  });
}

// ---------- controls ----------
function fillDevices() {
  const sel = $('#device');
  sel.innerHTML = '';
  for (const d of DEVICES[state.kind]) sel.add(new Option(`${d.label}`, d.id));
  sel.add(new Option('Custom size', 'custom'));
  if (![...sel.options].some((o) => o.value === state.device)) state.device = DEVICES[state.kind][0].id;
  sel.value = state.device;
  const custom = state.device === 'custom';
  $('#custom-size').hidden = !custom;
  [$('#cw').value, $('#ch').value] = state.custom[state.kind];
}

function pressed(group, attr, value) {
  for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
}

function syncControls() {
  $('#topics').value = state.topics;
  pressed($('#kind'), 'kind', state.kind);
  fillDevices();
  pressed($('#looks'), 'template', state.template);
  pressed($('#mode'), 'mode', state.mode);
  $('#mode').hidden = !TEMPLATES[state.template].modes;
  $('#color').value = state.color;
  for (const b of $('#swatches').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.color === state.color && b.dataset.mode === state.mode));
}

function buildStatic() {
  const looks = $('#looks');
  for (const t of Object.values(TEMPLATES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.template = t.id; b.textContent = t.label;
    b.className = `look look-${t.id}`;
    looks.append(b);
  }
  const sw = $('#swatches');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.color = p.color; b.dataset.mode = p.mode; b.title = p.label;
    b.setAttribute('aria-label', `${p.label} preset`);
    b.style.setProperty('--c', p.color);
    b.className = `swatch ${p.mode}`;
    sw.append(b);
  }
}

function update(patch) {
  Object.assign(state, patch);
  save(); syncControls(); draw();
}

// ---------- editor ----------
function buildEditor() {
  const ed = $('#editor');
  const s = state.sheet;
  ed.innerHTML = '';
  ed.append(input('Title', s.title, 40, (v) => { s.title = v; }, 'ed-title'));
  s.sections.forEach((sec, i) => {
    const box = document.createElement('fieldset');
    box.className = 'ed-section';
    const head = document.createElement('div');
    head.className = 'ed-head';
    head.append(input(`Section ${i + 1}`, sec.heading, 28, (v) => { sec.heading = v; }));
    const redo = document.createElement('button');
    redo.type = 'button'; redo.className = 'ghost'; redo.textContent = 'Redo section';
    redo.addEventListener('click', () => redoSection(i, redo));
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ghost'; del.textContent = 'Remove';
    del.disabled = s.sections.length <= 1;
    del.addEventListener('click', () => { s.sections.splice(i, 1); save(); buildEditor(); draw(); });
    head.append(redo, del);
    box.append(head);
    sec.items.forEach((it, k) => {
      const row = document.createElement('div');
      row.className = 'ed-item';
      row.append(
        input('Term', it.term, 28, (v) => { it.term = v; }),
        input('Line', it.line, 90, (v) => { it.line = v; }),
        input('Code', it.code, 56, (v) => { it.code = v; }, 'mono'),
      );
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'ghost x'; x.textContent = 'Remove item';
      x.disabled = sec.items.length <= 1;
      x.addEventListener('click', () => { sec.items.splice(k, 1); save(); buildEditor(); draw(); });
      row.append(x);
      box.append(row);
    });
    ed.append(box);
  });
}

function input(label, value, max, onChange, cls = '') {
  const l = document.createElement('label');
  l.className = `ed-field ${cls}`;
  const span = document.createElement('span');
  span.textContent = label;
  const i = document.createElement('input');
  i.type = 'text'; i.value = value || ''; i.maxLength = max; i.spellcheck = cls !== 'mono';
  i.addEventListener('input', () => { onChange(i.value); save(); draw(); });
  l.append(span, i);
  return l;
}

// ---------- API ----------
async function api(body) {
  const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`);
  return data;
}

function setStatus(msg, kind = '') {
  const s = $('#status');
  s.textContent = msg; s.className = `status ${kind}`;
}

async function generate(e) {
  e?.preventDefault();
  if (busy) return;
  const topics = $('#topics').value.trim();
  if (topics.length < 2) { setStatus('Type at least one topic first.', 'warn'); $('#topics').focus(); return; }
  busy = true;
  const btn = $('#go');
  btn.disabled = true; btn.textContent = 'Writing your cheatsheet';
  setStatus('Usually takes 5 to 15 seconds.');
  try {
    const context = await currentContext();
    const { sheet, profile } = await api({ mode: 'sheet', topics, kind: state.kind, context });
    update({ topics, sheet, profile });
    buildEditor();
    setStatus(`Done. Level: ${profile.level}${profile.languages.length ? `, examples in ${profile.languages.join(' and ')}` : ''}. Edit any line under Edit text.`, 'ok');
  } catch (err) {
    setStatus(err.message, 'warn');
  } finally {
    busy = false; btn.disabled = false; btn.textContent = 'Make my wallpaper';
  }
}

async function redoSection(index, btn) {
  const topics = state.topics || $('#topics').value.trim() || state.sheet.title;
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Rewriting';
  try {
    const { section } = await api({
      mode: 'section', topics, kind: state.kind, profile: state.profile,
      title: state.sheet.title, headings: state.sheet.sections.map((s) => s.heading), index,
    });
    state.sheet.sections[index] = section;
    save(); buildEditor(); draw();
  } catch (err) {
    btn.textContent = old; btn.disabled = false;
    alert(err.message);
  }
}

async function currentContext() {
  if (!$('#about').open) return '';
  if (state.ctxKind === 'words') return $('#ctx-words').value.trim();
  if (state.ctxKind === 'github' && !ctxText && $('#ctx-gh').value.trim()) await readGithub();
  return ctxText;
}

async function readGithub() {
  const st = $('#ctx-status');
  st.textContent = 'Reading public repos';
  try {
    const { text, label } = await githubSummary($('#ctx-gh').value);
    ctxText = text; st.textContent = `Got it: ${label}.`;
  } catch (err) { ctxText = ''; st.textContent = err.message; }
}

// ---------- download ----------
function download() {
  const { w, h } = size();
  const name = (state.sheet.title || 'cheatsheet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

// ---------- wire up ----------
buildStatic();
syncControls();
buildEditor();
draw();

const now = new Date();
$('.lock-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

$('#controls').addEventListener('submit', generate);
$('#topics').addEventListener('input', (e) => { state.topics = e.target.value; save(); });
$('#topics').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(e); });
$('#kind').addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.kind;
  if (k && k !== state.kind) update({ kind: k, device: DEVICES[k][0].id });
});
$('#device').addEventListener('change', (e) => update({ device: e.target.value }));
for (const id of ['#cw', '#ch']) $(id).addEventListener('change', () => {
  state.custom[state.kind] = [clamp($('#cw').value), clamp($('#ch').value)];
  update({});
});
$('#looks').addEventListener('click', (e) => { const t = e.target.closest('button')?.dataset.template; if (t) update({ template: t }); });
$('#swatches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) update({ color: b.dataset.color, mode: b.dataset.mode }); });
$('#color').addEventListener('input', (e) => update({ color: e.target.value }));
$('#mode').addEventListener('click', (e) => { const m = e.target.closest('button')?.dataset.mode; if (m) update({ mode: m }); });
$('#show-lock').addEventListener('change', draw);
$('#download').addEventListener('click', download);

document.querySelectorAll('[role=tab]').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
}));

$('#ctx-kind').addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.ctx;
  if (!k) return;
  state.ctxKind = k; ctxText = '';
  pressed($('#ctx-kind'), 'ctx', k);
  document.querySelectorAll('[data-ctx-panel]').forEach((p) => { p.hidden = p.dataset.ctxPanel !== k; });
  $('#ctx-status').textContent = 'Used once to pick beginner or advanced and your language. Never stored.';
});
$('#ctx-gh-read').addEventListener('click', readGithub);
$('#ctx-gh').addEventListener('input', () => { ctxText = ''; });
$('#ctx-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const st = $('#ctx-status');
  st.textContent = 'Reading the file in your browser';
  try { const { text, label } = await resumeText(f); ctxText = text; st.textContent = `Got it: ${label}. Contact details are removed first.`; }
  catch (err) { ctxText = ''; st.textContent = err.message; }
});

// Test hook used by scripts/samples.mjs to render exact files headlessly.
window.__cramwall = {
  async render(sheet, opts) {
    await fontsReady();
    const c = document.createElement('canvas');
    const info = renderSheet(c, sheet, opts);
    return { info, png: c.toDataURL('image/png') };
  },
};
