// One function, three kinds of provider. Picks whichever key is set:
//   GROQ_API_KEY        Groq (default model openai/gpt-oss-120b)
//   OPENAI_API_KEY      OpenAI (default gpt-4.1-mini)
//   ANTHROPIC_API_KEY   Anthropic (default claude-opus-5-5, low effort)
//   LLM_BASE_URL + LLM_API_KEY   any OpenAI compatible server (Ollama, OpenRouter, Together, vLLM)
// LLM_MODEL overrides the model for any of them.

export function provider(env = process.env) {
  const model = env.LLM_MODEL;
  if (env.LLM_BASE_URL) return { kind: 'openai', base: env.LLM_BASE_URL.replace(/\/$/, ''), key: env.LLM_API_KEY || '', model: model || 'llama3.1' };
  if (env.GROQ_API_KEY) return { kind: 'openai', base: 'https://api.groq.com/openai/v1', key: env.GROQ_API_KEY, model: model || 'openai/gpt-oss-120b' };
  if (env.OPENAI_API_KEY) return { kind: 'openai', base: 'https://api.openai.com/v1', key: env.OPENAI_API_KEY, model: model || 'gpt-4.1-mini' };
  if (env.ANTHROPIC_API_KEY) return { kind: 'anthropic', key: env.ANTHROPIC_API_KEY, model: model || 'claude-opus-5-5' };
  return null;
}

// Ask for JSON matching `schema`. Returns the parsed object (not yet validated).
export async function askJSON({ system, user, schema, name, maxTokens = 3000, timeoutMs = 45000 }) {
  const p = provider();
  if (!p) throw Object.assign(new Error('No model key set. Add GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY or LLM_BASE_URL.'), { status: 500 });
  const signal = AbortSignal.timeout(timeoutMs);
  if (p.kind === 'anthropic') return askAnthropic(p, { system, user, schema, maxTokens, signal });
  return askOpenAI(p, { system, user, schema, name, maxTokens, signal });
}

async function askOpenAI(p, { system, user, schema, name, maxTokens, signal }) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const call = (response_format) => fetch(`${p.base}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}) },
    body: JSON.stringify({
      model: p.model, messages, response_format, max_tokens: maxTokens, temperature: 0.4,
      // gpt-oss models think before answering; more thinking means fewer wrong facts.
      ...(/gpt-oss/.test(p.model) ? { reasoning_effort: process.env.LLM_REASONING || 'medium' } : {}),
    }),
  });
  let r = await call({ type: 'json_schema', json_schema: { name, strict: true, schema } });
  // Some compatible servers don't know json_schema yet. Fall back to plain JSON mode and rely on validation.
  if (r.status === 400 || r.status === 422) {
    messages[0].content += `\n\nReturn only JSON matching this JSON Schema:\n${JSON.stringify(schema)}`;
    r = await call({ type: 'json_object' });
  }
  if (r.status === 429) {
    const wait = Math.min(6, Number(r.headers.get('retry-after')) || 2);
    await new Promise((ok) => setTimeout(ok, wait * 1000));
    r = await call({ type: 'json_schema', json_schema: { name, strict: true, schema } });
  }
  if (r.status === 429) throw Object.assign(new Error('The model provider is busy. Try again in a minute.'), { status: 503 });
  if (!r.ok) throw Object.assign(new Error(`model error ${r.status}`), { status: 502 });
  const data = await r.json();
  return parseLoose(data?.choices?.[0]?.message?.content);
}

async function askAnthropic(p, { system, user, schema, maxTokens, signal }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: p.key, maxRetries: 1 });
  const res = await client.messages.create({
    model: p.model,
    max_tokens: Math.max(maxTokens, 8000),
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  }, { signal });
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('The model declined these topics.'), { status: 422 });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseLoose(text);
}

function parseLoose(text) {
  if (typeof text !== 'string') throw new Error('empty reply');
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('reply was not JSON');
}
