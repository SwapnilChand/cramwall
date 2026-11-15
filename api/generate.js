// POST /api/generate
//   { mode: "sheet", topics, kind, context? }                  -> { sheet, profile }
//   { mode: "section", topics, kind, profile, title, headings, index } -> { section }
// User context is used for one small call that returns { level, languages } and is then dropped.
// Nothing about the request is logged or stored.
import { askJSON } from './_llm.js';
import { sheetSchema, sectionSchema, profileSchema, cleanSheet, cleanSection, cleanProfile, readRequest } from './_schema.js';
import { SHEET_SYSTEM, PROFILE_SYSTEM, sheetUser, sectionUser } from './_prompt.js';
import { clientKey, take } from './_limit.js';

const SHEETS_PER_DAY = num(process.env.SHEETS_PER_DAY, 5);
const SECTIONS_PER_DAY = num(process.env.SECTIONS_PER_DAY, 20);

function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 20000) break; }
  try { return JSON.parse(raw); } catch { return {}; }
}

function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

async function withRetry(fn) {
  try { return await fn(); } catch (e) {
    if (e.status && e.status !== 502) throw e;
    return fn();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const parsed = readRequest(await readBody(req));
  if (!parsed.ok) return send(res, 400, { error: parsed.error });
  const q = parsed.value;

  const isSheet = q.mode === 'sheet';
  let quota;
  try {
    quota = await take(isSheet ? 'sheet' : 'section', clientKey(req), isSheet ? SHEETS_PER_DAY : SECTIONS_PER_DAY);
  } catch {
    return send(res, 503, { error: 'Rate limiter unavailable. Try again shortly.' });
  }
  if (!quota.ok) {
    const what = isSheet ? `${SHEETS_PER_DAY} wallpapers` : `${SECTIONS_PER_DAY} section redos`;
    return send(res, 429, { error: `That's the free ${what} for today. Come back tomorrow, or self host with your own key.` });
  }
  const left = Number.isFinite(quota.remaining) ? { 'X-Remaining': String(quota.remaining) } : {};

  try {
    if (isSheet) {
      let profile = q.profile || { level: 'intermediate', languages: [] };
      if (q.context) {
        try {
          profile = cleanProfile(await askJSON({ system: PROFILE_SYSTEM, user: `"""${q.context}"""`, schema: profileSchema, name: 'profile', maxTokens: 600, timeoutMs: 15000 }));
        } catch { /* context is optional, carry on with defaults */ }
      }
      const sheet = await withRetry(async () => cleanSheet(await askJSON({
        system: SHEET_SYSTEM, user: sheetUser({ ...q, profile }), schema: sheetSchema, name: 'cheatsheet', maxTokens: q.kind === 'desktop' ? 3500 : 2500,
      })));
      return send(res, 200, { sheet, profile }, left);
    }
    const section = await withRetry(async () => {
      const s = cleanSection(await askJSON({ system: SHEET_SYSTEM, user: sectionUser(q), schema: sectionSchema, name: 'section', maxTokens: 1500 }));
      if (!s) throw Object.assign(new Error('bad section'), { status: 502 });
      return s;
    });
    return send(res, 200, { section }, left);
  } catch (e) {
    const status = e.status || 502;
    const error = status === 502 ? 'The model sent back something unusable. Try again.' : e.message;
    return send(res, status, { error }, left);
  }
}
