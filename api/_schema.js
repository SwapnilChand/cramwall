// The only shape the model is allowed to return, plus the checks that run on every reply.
// Anything the renderer draws has passed through clean() first.

export const LIMITS = {
  title: 40, heading: 28, term: 28, line: 90, code: 56,
  sections: [4, 8], items: [3, 6],
};

const item = {
  type: 'object', additionalProperties: false, required: ['term', 'line', 'code'],
  properties: {
    term: { type: 'string', description: 'The thing to remember, 1 to 3 words' },
    line: { type: 'string', description: 'One plain sentence that explains it' },
    code: { type: 'string', description: 'A real command, flag or snippet, one line, or empty' },
  },
};

export const sectionSchema = {
  type: 'object', additionalProperties: false, required: ['heading', 'items'],
  properties: {
    heading: { type: 'string', description: '1 to 3 words' },
    items: { type: 'array', items: item },
  },
};

export const sheetSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'sections'],
  properties: {
    title: { type: 'string', description: '2 to 5 words' },
    sections: { type: 'array', items: sectionSchema },
  },
};

export const profileSchema = {
  type: 'object', additionalProperties: false, required: ['level', 'languages'],
  properties: {
    level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
    languages: { type: 'array', items: { type: 'string' } },
  },
};

// Models like to send typographic dashes, curly quotes, literal "\n" and trailing periods.
export function tidy(s, max) {
  let t = String(s ?? '')
    .replace(/\\n|\r?\n|\t/g, ' ')
    .replace(/\s*[→⟶]\s*/g, ' -> ')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[  ​]/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length > max) {
    t = t.slice(0, max);
    const cut = t.lastIndexOf(' ');
    if (cut > max * 0.6) t = t.slice(0, cut);
    t = t.replace(/[\s,;:(]+$/, '');
  }
  return t;
}

function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const term = tidy(x.term, LIMITS.term);
  const line = tidy(x.line, LIMITS.line).replace(/\.$/, '');
  const code = tidy(x.code, LIMITS.code);
  if (!term || !line) return null;
  return { term, line, code };
}

export function cleanSection(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
  const heading = tidy(s.heading, LIMITS.heading);
  const items = s.items.map(cleanItem).filter(Boolean).slice(0, LIMITS.items[1]);
  if (!heading || items.length < LIMITS.items[0]) return null;
  return { heading, items };
}

// Returns a clean sheet or throws with a reason. Too many sections or items get trimmed,
// too few is a failure (the caller retries once).
export function cleanSheet(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const title = tidy(raw.title, LIMITS.title);
  if (!title) throw new Error('no title');
  if (!Array.isArray(raw.sections)) throw new Error('no sections');
  const sections = raw.sections.map(cleanSection).filter(Boolean).slice(0, LIMITS.sections[1]);
  if (sections.length < LIMITS.sections[0]) throw new Error(`only ${sections.length} usable sections`);
  return { title, sections };
}

export function cleanProfile(raw) {
  const level = ['beginner', 'intermediate', 'advanced'].includes(raw?.level) ? raw.level : 'intermediate';
  const languages = (Array.isArray(raw?.languages) ? raw.languages : [])
    .map((l) => tidy(l, 20))
    .filter((l) => /^[A-Za-z][A-Za-z0-9+#. ]{0,19}$/.test(l))
    .slice(0, 2);
  return { level, languages };
}

export const DEVICE_KINDS = ['phone', 'desktop'];

// Request validation. Returns { ok, value } or { ok: false, error }.
export function readRequest(b) {
  const mode = b?.mode === 'section' ? 'section' : 'sheet';
  const topics = tidy(b?.topics, 200);
  if (topics.length < 2) return { ok: false, error: 'Add at least one topic.' };
  const kind = DEVICE_KINDS.includes(b?.kind) ? b.kind : 'phone';
  const context = tidy(b?.context, 2500);
  const profile = b?.profile ? cleanProfile(b.profile) : null;
  if (mode === 'sheet') return { ok: true, value: { mode, topics, kind, context, profile } };
  const title = tidy(b?.title, LIMITS.title);
  const headings = (Array.isArray(b?.headings) ? b.headings : []).slice(0, 8).map((h) => tidy(h, LIMITS.heading));
  const index = Number.isInteger(b?.index) && b.index >= 0 && b.index < headings.length ? b.index : -1;
  if (index < 0) return { ok: false, error: 'Pick a section to redo.' };
  return { ok: true, value: { mode, topics, kind, profile, title, headings, index } };
}
