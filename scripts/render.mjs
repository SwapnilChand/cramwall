// Headless render: node scripts/render.mjs <sheet.json|sample> <outdir> [template,..] [device,..] [color] [mode] [os] [dual]
// Uses the real app code in a headless Chromium, so the files match what users download.
// Devices are the ids in src/render.js (iphone-pro, fhd, qhd, uhd, uw, suw, mbp14 ...) or WxH.
// os is windows, mac, linux-top or linux-bottom. Pass dual as the last argument for two PNGs.
import puppeteer from 'puppeteer-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { findDevice } from '../src/render.js';

const [src = 'sample', out = 'samples/tmp', tpls = 'minimal,terminal,blueprint,notebook', devs = 'iphone-pro,qhd', color = '#8fb3ff', mode = 'dark', os = 'windows', dual = ''] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5199';
const device = (d) => {
  const m = /^(\d+)x(\d+)$/.exec(d);
  if (m) return { id: d, w: +m[1], h: +m[2], kind: +m[1] > +m[2] ? 'desktop' : 'phone' };
  const x = findDevice(d);
  if (!x) throw new Error(`unknown device ${d}`);
  return x;
};

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error', e.message));
await page.goto(`${base}/make`, { waitUntil: 'networkidle0' });
const sheet = src === 'sample' ? null : JSON.parse(await readFile(src, 'utf8'));
for (const t of tpls.split(',')) for (const d of devs.split(',')) {
  const dev = device(d);
  const opts = { width: dev.w, height: dev.h, kind: dev.kind, template: t, color, mode, os, ui: dev.ui, notch: dev.notch };
  const r = await page.evaluate(async (sheet, opts, dual) => {
    const s = sheet || (await import('/src/render.js')).SAMPLE;
    return dual ? window.__cramwall.renderDual(s, opts) : window.__cramwall.render(s, opts);
  }, sheet, opts, !!dual);
  const pngs = r.pngs || [r.png];
  for (let i = 0; i < pngs.length; i++) {
    const file = `${out}/${t}-${dev.id}${dual ? (i ? '-right' : '-left') : ''}.png`;
    await writeFile(file, Buffer.from(pngs[i].split(',')[1], 'base64'));
    console.log(file, JSON.stringify(Array.isArray(r.info) ? r.info[i] : r.info));
  }
}
await browser.close();
