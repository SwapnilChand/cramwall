// Per IP daily limits. Uses Upstash Redis over REST when its env vars exist (the Vercel
// integration sets KV_REST_API_URL/TOKEN), otherwise a small in memory counter, which is
// fine for one self hosted process. Raw IPs are never stored: the key is a salted daily hash.
import { createHash } from 'node:crypto';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = new Map();

const today = () => new Date().toISOString().slice(0, 10);

export function clientKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'unknown';
  return createHash('sha256').update(`${ip}|${today()}|${TOKEN || 'cramwall'}`).digest('hex').slice(0, 32);
}

// Returns { ok, remaining }. limit <= 0 means unlimited.
export async function take(bucket, key, limit) {
  if (!limit || limit <= 0) return { ok: true, remaining: Infinity };
  const k = `cramwall:${bucket}:${today()}:${key}`;
  let n;
  if (URL_ && TOKEN) {
    const r = await fetch(`${URL_}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', k], ['EXPIRE', k, 60 * 60 * 26]]),
    });
    if (!r.ok) throw new Error(`limit store ${r.status}`);
    n = (await r.json())[0].result;
  } else {
    if (mem.size > 50000) mem.clear();
    n = (mem.get(k) || 0) + 1;
    mem.set(k, n);
  }
  return { ok: n <= limit, remaining: Math.max(0, limit - n) };
}
