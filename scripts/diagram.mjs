// Builds the landing page's safe area diagram and the About you crop from real renders.
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const b64 = async (f) => 'data:image/png;base64,' + (await readFile(f)).toString('base64');
const phone = await b64('samples/sql-joins-minimal-phone-1179x2556.png');
const desk = await b64('samples/piano-chords-notebook-desktop-2560x1440.png');
const html = `<!doctype html><html><head><style>
@import url('/node_modules/@fontsource/public-sans/latin-600.css');
body{margin:0;background:#f4f3ef;font:600 15px 'Public Sans',sans-serif;color:#16171b}
.wrap{position:relative;width:900px;height:560px}
.d,.p{position:absolute;overflow:hidden;background:#000}
.d{left:0;top:70px;width:620px;height:349px;border:9px solid #101114;border-radius:10px}
.p{left:654px;top:0;width:236px;height:511px;border:7px solid #101114;border-radius:30px}
img{display:block;width:100%;height:100%}
.z{position:absolute;background:repeating-linear-gradient(135deg,rgba(35,80,216,.30) 0 6px,rgba(35,80,216,.14) 6px 12px);border:1.5px dashed #2350d8;display:flex;align-items:center;justify-content:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);font-size:13px}
</style></head><body><div class="wrap">
<div class="d"><img src="${desk}"><div class="z" style="left:0;top:0;right:0;height:7%">menu bar</div><div class="z" style="left:0;top:7%;width:7%;bottom:12%;writing-mode:vertical-rl">icons</div><div class="z" style="left:20%;right:20%;bottom:0;height:12%">dock</div></div>
<div class="p"><img src="${phone}"><div class="z" style="left:0;right:0;top:0;height:30%">clock</div><div class="z" style="left:0;right:0;bottom:0;height:13%">torch, camera</div></div>
</div></body></html>`;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5199/make');
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.screenshot({ path: '/tmp/cw/safe.png' });

// About you panel, opened on the GitHub tab, cropped from the real maker UI.
await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5199/make', { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle0' });
await page.type('#topics', 'kubernetes networking, linux namespaces');
await page.evaluate(() => { document.querySelector('#about').open = true; document.querySelector('[data-ctx=github]').click(); });
await page.type('#ctx-gh', 'torvalds');
await page.click('#ctx-gh-read');
await new Promise((r) => setTimeout(r, 2500));
const el = await page.$('#about');
const box = await el.boundingBox();
await page.screenshot({ path: '/tmp/cw/about.png', clip: { x: box.x - 24, y: box.y - 20, width: box.width + 48, height: box.height + 36 } });
await page.screenshot({ path: '/tmp/cw/make-full.png' });
await browser.close();
