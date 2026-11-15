import { provider } from './_llm.js';
export default function handler(req, res) {
  const p = provider();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, model: p ? p.model : null }));
}
