// The four looks. Each one turns a single picked colour into a full palette with readable
// text, and sets the type and a few drawing switches the renderer understands.
import { oklch, lch, readable, contrast } from './color.js';

export const PRESETS = [
  { id: 'ink', label: 'Ink', color: '#8fb3ff', mode: 'dark' },
  { id: 'ember', label: 'Ember', color: '#ff8a4c', mode: 'dark' },
  { id: 'mint', label: 'Mint', color: '#41d6a0', mode: 'dark' },
  { id: 'rose', label: 'Rose', color: '#ff6f91', mode: 'dark' },
  { id: 'sun', label: 'Sun', color: '#f2b632', mode: 'dark' },
  { id: 'paper', label: 'Paper', color: '#c2410c', mode: 'light' },
  { id: 'sea', label: 'Sea', color: '#0f766e', mode: 'light' },
  { id: 'cobalt', label: 'Cobalt', color: '#1d4ed8', mode: 'light' },
];

const F = {
  bric: 'Bricolage Grotesque',
  atk: 'Atkinson Hyperlegible',
  jet: 'JetBrains Mono',
  plex: 'IBM Plex Sans Condensed',
  plexMono: 'IBM Plex Mono',
  caveat: 'Caveat',
  lit: 'Literata',
};

// Every face the renderer may ask for, so callers can wait for them before drawing.
export const FONT_FACES = [
  `600 40px "${F.bric}"`, `400 40px "${F.bric}"`,
  `400 40px "${F.atk}"`, `700 40px "${F.atk}"`,
  `400 40px "${F.jet}"`, `700 40px "${F.jet}"`,
  `400 40px "${F.plex}"`, `600 40px "${F.plex}"`,
  `400 40px "${F.plexMono}"`, `500 40px "${F.plexMono}"`,
  `600 40px "${F.caveat}"`, `700 40px "${F.caveat}"`,
  `400 40px "${F.lit}"`, `600 40px "${F.lit}"`,
];

const font = (weight, family) => (px) => `${weight} ${px.toFixed(1)}px "${family}"`;

export const TEMPLATES = {
  minimal: {
    id: 'minimal', label: 'Minimal', modes: true,
    fonts: { title: font(600, F.bric), heading: font(600, F.bric), body: font(400, F.atk), bold: font(700, F.atk), mono: font(400, F.jet) },
    m: { title: 2.3, heading: 1.12, upper: false, track: 0, lineH: 1.36, code: 0.84, itemGap: 0.62, sectionGap: 1.5, colGap: 2.0, titleGap: 1.5 },
    code: 'chip', term: 'bold', headingRule: false,
    palette(color, mode) {
      const [, C, H] = lch(color);
      const tint = Math.min(C, 0.16);
      if (mode === 'light') {
        const bg = oklch(0.972, tint * 0.08, H);
        return { bg, fg: oklch(0.2, tint * 0.15, H), muted: oklch(0.38, tint * 0.15, H), accent: readable(color, bg, 4.8),
          codeBg: oklch(0.925, tint * 0.18, H), codeFg: readable(oklch(0.4, tint * 0.9, H), oklch(0.925, tint * 0.18, H), 6), rule: oklch(0.86, tint * 0.15, H) };
      }
      const bg = oklch(0.165, tint * 0.14, H);
      return { bg, fg: oklch(0.965, tint * 0.05, H), muted: oklch(0.8, tint * 0.1, H), accent: readable(color, bg, 6.5),
        codeBg: oklch(0.235, tint * 0.2, H), codeFg: readable(oklch(0.86, tint * 0.6, H), oklch(0.235, tint * 0.2, H), 8), rule: oklch(0.3, tint * 0.15, H) };
    },
  },

  terminal: {
    id: 'terminal', label: 'Terminal', modes: false,
    fonts: { title: font(700, F.jet), heading: font(700, F.jet), body: font(400, F.jet), bold: font(700, F.jet), mono: font(400, F.jet) },
    m: { title: 1.5, heading: 1.0, upper: false, track: 0, lineH: 1.4, code: 0.92, itemGap: 0.7, sectionGap: 1.5, colGap: 2.4, titleGap: 1.4, scale: 0.9 },
    code: 'prompt', term: 'bold', frame: true,
    headingPrefix: () => '## ', titlePrefix: '# ',
    palette(color) {
      const [, C, H] = lch(color);
      const tint = Math.min(C, 0.12);
      const bg = oklch(0.13, tint * 0.1, H);
      const win = oklch(0.175, tint * 0.12, H);
      return { bg, win, bar: oklch(0.225, tint * 0.12, H), border: oklch(0.3, tint * 0.15, H),
        fg: oklch(0.95, tint * 0.05, H), muted: oklch(0.76, tint * 0.08, H), accent: readable(color, win, 6.5),
        codeFg: readable(oklch(0.85, Math.max(C, 0.1) * 0.8, H), win, 8), prompt: oklch(0.62, tint * 0.4, H), rule: oklch(0.3, tint * 0.1, H) };
    },
  },

  blueprint: {
    id: 'blueprint', label: 'Blueprint', modes: false,
    fonts: { title: font(600, F.plex), heading: font(500, F.plexMono), body: font(400, F.plex), bold: font(600, F.plex), mono: font(400, F.plexMono) },
    m: { title: 2.4, heading: 0.92, upper: true, track: 0.12, lineH: 1.34, code: 0.86, itemGap: 0.6, sectionGap: 1.6, colGap: 2.2, titleGap: 1.7, scale: 1.04 },
    code: 'outline', term: 'bold', grid: true, headingRule: true,
    headingPrefix: (i) => String(i + 1).padStart(2, '0') + '  ',
    palette(color) {
      const [, C, H] = lch(color);
      const c = Math.max(0.09, Math.min(C, 0.15));
      let bg = oklch(0.34, c, H);
      const fg = oklch(0.975, 0.012, H);
      // Bright picks still need white text to read, so darken the paper until it does.
      for (let L = 0.34; L > 0.15 && contrast(fg, bg) < 8; L -= 0.02) bg = oklch(L, c, H);
      return { bg, fg, muted: oklch(0.9, 0.03, H), accent: readable(oklch(0.93, 0.08, H + 40), bg, 6),
        codeFg: oklch(0.96, 0.04, H), line: 'rgba(255,255,255,0.07)', lineMajor: 'rgba(255,255,255,0.14)', rule: 'rgba(255,255,255,0.45)' };
    },
  },

  notebook: {
    id: 'notebook', label: 'Notebook', modes: false,
    fonts: { title: font(700, F.caveat), heading: font(700, F.caveat), body: font(400, F.lit), bold: font(600, F.lit), mono: font(400, F.jet) },
    m: { title: 2.9, heading: 1.75, upper: false, track: 0, lineH: 1.5, code: 0.82, itemGap: 0, sectionGap: 1, colGap: 2.2, titleGap: 0, scale: 0.96 },
    code: 'plain', term: 'highlight', rules: true, snap: true,
    palette(color) {
      const [, C, H] = lch(color);
      const bg = oklch(0.975, 0.012, 85);
      return { bg, fg: oklch(0.24, 0.02, 265), muted: oklch(0.36, 0.02, 265), accent: readable(color, bg, 5.5),
        codeFg: readable(oklch(0.42, Math.max(C, 0.08), H), bg, 6), highlight: oklch(0.9, Math.min(Math.max(C, 0.1), 0.14), H),
        line: oklch(0.86, 0.035, 240), margin: oklch(0.7, 0.13, 22) };
    },
  },
};
