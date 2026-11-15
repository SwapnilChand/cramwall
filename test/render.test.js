import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeArea, desktopChrome, splitSheet, findDevice, guessUi, DEVICES } from '../src/render.js';

const inside = (a, w, h) => a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h;

test('desktop presets cover 1080p to super ultrawide', () => {
  const sizes = DEVICES.desktop.map((d) => `${d.w}x${d.h}`);
  for (const s of ['1920x1080', '2560x1440', '2880x1800', '3024x1964', '3840x2160', '3440x1440', '5120x1440']) assert.ok(sizes.includes(s), s);
  assert.equal(findDevice('mbp14').ui, 2);
  assert.equal(guessUi(1920, 1080), 1);
  assert.equal(guessUi(3840, 2160), 1.5);
});

test('text stays clear of the taskbar, menu bar, dock and icons', () => {
  for (const d of DEVICES.desktop) for (const os of ['windows', 'mac', 'linux-top', 'linux-bottom']) {
    const a = safeArea(d.w, d.h, 'desktop', { os, ui: d.ui, notch: d.notch });
    const c = desktopChrome(d.w, d.h, os, d.ui, d.notch);
    assert.ok(inside(a, d.w, d.h), `${d.id} ${os}`);
    assert.ok(a.y >= c.top + 10 && a.y + a.h <= d.h - c.bottom - 10, `${d.id} ${os} vertical`);
    assert.ok(a.x >= c.left + 10 && a.x + a.w <= d.w - c.right - 10, `${d.id} ${os} horizontal`);
    for (const p of c.parts) {
      const hit = p.x < a.x + a.w && p.x + p.w > a.x && p.y < a.y + a.h && p.y + p.h > a.y;
      assert.ok(!hit, `${d.id} ${os} ${p.kind} overlaps text`);
    }
  }
});

test('OS bars scale with the display scale', () => {
  assert.equal(desktopChrome(1920, 1080, 'windows', 1).bottom, 48);
  assert.equal(desktopChrome(3840, 2160, 'windows', 1.5).bottom, 72);
  assert.equal(desktopChrome(2880, 1800, 'mac', 2).top, 50);
  assert.equal(desktopChrome(3024, 1964, 'mac', 2, true).top, 74);
  assert.equal(desktopChrome(2560, 1440, 'linux-top', 1).top, 32);
  assert.equal(desktopChrome(2560, 1440, 'linux-bottom', 1).bottom, 48);
});

test('ultrawide text sits in a centred block', () => {
  const a = safeArea(5120, 1440, 'desktop', { os: 'windows', ui: 1 });
  assert.ok(a.w / a.h <= 3.01);
  assert.ok(Math.abs(a.x + a.w / 2 - 2560) < 1);
});

test('dual monitor split keeps order, the title and numbering', () => {
  const sec = (n, k) => ({ heading: `S${n}`, items: Array.from({ length: k }, () => ({ term: 't', line: 'l', code: 'c' })) });
  const [l, r] = splitSheet({ title: 'T', sections: [sec(1, 3), sec(2, 3), sec(3, 3), sec(4, 3), sec(5, 3)] });
  assert.equal(l.title, 'T'); assert.equal(r.title, 'T');
  assert.deepEqual([...l.sections, ...r.sections].map((s) => s.heading), ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.ok(l.sections.length >= 2 && r.sections.length >= 2);
  assert.equal(r.offset, l.sections.length);
});
