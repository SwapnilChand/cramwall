// Headless render: node scripts/render.mjs <sheet.json|sample> <outdir> [template,..] [device,..] [color] [mode]
// Uses the real app code in a headless Chromium, so the files match what users download.
import puppeteer from 'puppeteer-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const [src = 'sample', out = 'samples/tmp', tpls = 'minimal,terminal,blueprint,notebook', devs = 'iphone-pro,qhd', color = '#8fb3ff', mode = 'dark'] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5199';
const DEV = { 'iphone-pro': [1179, 2556, 'phone'], iphone: [1170, 2532, 'phone'], android: [1080, 2400, 'phone'], qhd: [2560, 1440, 'desktop'], fhd: [1920, 1080, 'desktop'], mbp14: [3024, 1964, 'desktop'] };

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error', e.message));
await page.goto(`${base}/make`, { waitUntil: 'networkidle0' });
const sheet = src === 'sample' ? null : JSON.parse(await readFile(src, 'utf8'));
for (const t of tpls.split(',')) for (const d of devs.split(',')) {
  const [width, height, kind] = DEV[d];
  const r = await page.evaluate(async (sheet, opts) => {
    const s = sheet || (await import('/src/render.js')).SAMPLE;
    return window.__cramwall.render(s, opts);
  }, sheet, { width, height, kind, template: t, color, mode });
  const file = `${out}/${t}-${d}.png`;
  await writeFile(file, Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(file, JSON.stringify(r.info));
}
await browser.close();
