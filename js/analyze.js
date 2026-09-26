// Local (no-AI) relevance, grouping and links, plus the bring-your-own-key AI analysis.
const STOP = new Set(('a an the and or of to in on for with by from as at is are was were be been being this that these those it its we our they their ' +
  'can could may might will would should which what when where how than then also into over under between within via using use used based new ' +
  'approach approaches method methods paper study studies results result show shows shown propose proposed however such both each more most other ' +
  'some any not only very large small high low two one three first second model models data task tasks work works well while without across ' +
  'present presents introduce existing further significant significantly performance improve improves improved achieve achieves').split(' '));

const stem = w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const tokens = s => (String(s).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).map(stem).filter(w => !STOP.has(w));

export function tfidf(docs) {
  const tfs = docs.map(d => { const m = new Map(); tokens(d).forEach(w => m.set(w, (m.get(w) || 0) + 1)); return m; });
  const df = new Map(); tfs.forEach(m => m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length;
  return tfs.map(m => {
    const v = new Map(); let n = 0;
    m.forEach((c, w) => { const x = (1 + Math.log(c)) * (Math.log((N + 1) / (df.get(w) + 1)) + 1); v.set(w, x); n += x * x; });
    n = Math.sqrt(n) || 1; v.forEach((x, w) => v.set(w, x / n)); return v;
  });
}
export function cos(a, b) { if (a.size > b.size) [a, b] = [b, a]; let s = 0; a.forEach((x, w) => { const y = b.get(w); if (y) s += x * y; }); return s; }

function kmeans(vecs, k) {
  const n = vecs.length; if (!n) return { assign: [], cents: [] };
  const idx = [0];
  while (idx.length < k) { // farthest-first seeding
    let best = -1, bi = 0;
    vecs.forEach((v, i) => { const d = 1 - Math.max(...idx.map(j => cos(v, vecs[j]))); if (d > best) { best = d; bi = i; } });
    idx.push(bi);
  }
  let cents = idx.map(i => new Map(vecs[i])), assign = [];
  for (let it = 0; it < 8; it++) {
    assign = vecs.map(v => { let b = 0, bs = -1; cents.forEach((c, j) => { const s = cos(v, c); if (s > bs) { bs = s; b = j; } }); return b; });
    cents = cents.map((_, j) => { const c = new Map(); vecs.forEach((v, i) => assign[i] === j && v.forEach((x, w) => c.set(w, (c.get(w) || 0) + x))); return c; });
  }
  return { assign, cents };
}
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);

export function computeLocal(S) {
  const P = S.papers, rel = {}, field = {}, links = [];
  const docs = P.map(p => `${p.title} ${p.title} ${p.abstract || ''} ${(p.text || '').slice(0, 3000)} ${p.notes || ''}`);
  const vecs = tfidf([...docs, `${S.question} ${S.question} ${S.workings || ''}`]);
  const q = vecs.pop();
  const raw = vecs.map(v => cos(v, q)), max = Math.max(1e-6, ...raw);
  P.forEach((p, i) => { rel[p.id] = p.ai?.relevance ?? (S.question.trim() ? Math.pow(raw[i] / max, 0.8) : 0.5); });

  const k = P.length < 4 ? 1 : Math.min(6, Math.round(Math.sqrt(P.length / 1.5)));
  const { assign, cents } = kmeans(vecs, k);
  const labels = cents.map((c, j) => {
    const members = assign.filter(a => a === j).length;
    const top = [...c].filter(([w]) => members < 2 || vecs.filter((v, i) => assign[i] === j && v.has(w)).length >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => cap(w));
    return top.join(' · ') || 'Unsorted';
  });
  P.forEach((p, i) => { field[p.id] = p.ai?.field || labels[assign[i]] || 'Unsorted'; });

  const seen = new Set(), add = (a, b, type, note) => { const key = [a, b].sort().join('|'); if (a === b || seen.has(key)) return; seen.add(key); links.push({ a, b, type, note }); };
  const byKey = new Map(); P.forEach(p => keys(p).forEach(k => byKey.set(k, p.id)));
  P.forEach(p => (p.refs || []).forEach(r => byKey.has(r) && add(p.id, byKey.get(r), 'cites')));
  const ids = new Set(P.map(p => p.id));
  (S.relations || []).forEach(r => ids.has(r.a) && ids.has(r.b) && add(r.a, r.b, r.type, r.note));
  vecs.forEach((v, i) => vecs.map((w, j) => [j, i === j ? 0 : cos(v, w)]).filter(([, s]) => s > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .forEach(([j]) => add(P[i].id, P[j].id, 'similar')));
  return { rel, field, links };
}
const keys = p => [p.s2id && 's2:' + p.s2id, p.doi && 'doi:' + p.doi, p.oaid && 'oa:' + p.oaid, p.arxiv && 'arxiv:' + p.arxiv].filter(Boolean);

// ---------- Extractive summary (no AI) ----------
// Picks the most central, result-bearing sentences from the abstract and conclusion.
const ABBR = /\b(e\.g|i\.e|et al|etc|Fig|Figs|Eq|Sec|vs|cf|approx|resp)\./gi;
export const sentences = text => String(text || '').replace(/\s+/g, ' ').replace(ABBR, m => m.replace('.', '§'))
  .split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/).map(s => s.replace(/§/g, '.').trim()).filter(s => s.length > 25);
const CUE = /\b(we (show|find|demonstrate|propose|introduce|present|conclude)|results? (show|indicate|suggest)|outperform|improv|achiev|state[- ]of[- ]the[- ]art|significant|conclude|in summary|overall)/i;

export function summarize(p, n = 3) {
  const src = [...sentences(p.abstract).map(s => ({ s, c: false })), ...sentences(p.conclusion).map(s => ({ s, c: true }))];
  if (!src.length) return null;
  const from = p.conclusion ? 'abstract and conclusion' : 'abstract';
  if (src.length <= n) return { points: src.map(x => x.s), from, whole: !p.conclusion };
  const vecs = tfidf(src.map(x => x.s));
  const centroid = new Map(); vecs.forEach(v => v.forEach((x, w) => centroid.set(w, (centroid.get(w) || 0) + x)));
  const scored = src.map((x, i) => ({ ...x, i, v: vecs[i],
    score: cos(vecs[i], centroid) + (CUE.test(x.s) ? 0.15 : 0) + (x.c ? 0.08 : 0) - (x.s.length > 380 ? 0.15 : 0) + (i === 0 ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const x of scored) { if (picked.length >= n) break; if (picked.every(y => cos(x.v, y.v) < 0.6)) picked.push(x); }
  return { points: picked.sort((a, b) => a.i - b.i).map(x => x.s), from, whole: false };
}

// ---------- AI (bring your own key) ----------
export const PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', model: 'claude-sonnet-5', needsKey: true },
  openai: { name: 'OpenAI', model: 'gpt-5', base: 'https://api.openai.com/v1', needsKey: true },
  openrouter: { name: 'OpenRouter (Kimi, Gemini, Llama…)', model: 'moonshotai/kimi-k2', base: 'https://openrouter.ai/api/v1', needsKey: true },
  custom: { name: 'Local or custom (Ollama, LM Studio…)', model: 'llama3.1', base: 'http://localhost:11434/v1', needsKey: false },
};
export const REL_TYPES = ['extends', 'uses-method', 'same-data', 'contradicts', 'compares', 'related'];

const SYSTEM = 'You are a meticulous research analyst helping a student map the literature around their research question. You read paper metadata and the student\'s own notes, then reply with a single JSON object and nothing else.';

function prompt(S) {
  const papers = S.papers.map(p => ({ id: p.id, title: p.title, year: p.year, authors: (p.authors || []).slice(0, 3).join(', '), abstract: (p.abstract || p.text || '').slice(0, 1400), student_notes: p.notes || undefined }));
  return `RESEARCH QUESTION:\n${S.question || '(not given — infer the common theme)'}\n\nSTUDENT'S WORKINGS:\n${(S.workings || '(none)').slice(0, 6000)}\n\nPAPERS:\n${JSON.stringify(papers)}\n\n` +
`Return JSON with exactly this shape:
{"papers":[{"id":"<paper id>","relevance":0.0,"field":"<1-3 word sub-area>","why":"<one sentence: how this paper bears on the question>"}],
 "relations":[{"a":"<id>","b":"<id>","type":"${REL_TYPES.join('|')}","note":"<max 12 words>"}],
 "gaps":[{"title":"<max 8 words>","detail":"<2-3 sentences: what none of these papers has done and why it matters for the question>","closeness":0.0,"papers":["<ids bordering this gap>"]}]}
Rules:
- relevance 0-1: 1 = directly addresses the question, 0 = barely related. Use the full range.
- field: group papers into 2-6 shared sub-areas and reuse identical labels.
- relations: only concrete links you can justify; "a" is the later or dependent paper. At most ${Math.max(6, S.papers.length * 2)}.
- gaps: 3-6 open problems sitting between these papers. closeness 0-1 = how near the gap is to the student's own study, judged from their workings.
- Every paper id appears exactly once in "papers".`;
}

async function callModel(cfg, system, user) {
  const P = PROVIDERS[cfg.provider], model = cfg.model || P.model;
  let res;
  try {
    if (cfg.provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
      });
    } else {
      const headers = { 'content-type': 'application/json' };
      if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
      if (cfg.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Orrery'; }
      res = await fetch((cfg.base || P.base).replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
    }
  } catch { throw new Error("Couldn't reach the provider. Check your connection or the base URL in Settings."); }
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error?.message || ''; } catch { }
    throw new Error(res.status === 401 || res.status === 403 ? `The provider rejected your key (${res.status}). Check it in Settings.` : `The model call failed (${res.status})${msg ? ': ' + msg : '.'}`);
  }
  const d = await res.json();
  return cfg.provider === 'anthropic' ? d.content.filter(b => b.type === 'text').map(b => b.text).join('') : d.choices?.[0]?.message?.content || '';
}

export async function runAI(S, cfg) {
  const text = await callModel(cfg, SYSTEM, prompt(S));
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  try { return JSON.parse(text.slice(i, j + 1)); } catch { throw new Error('The model replied, but not with readable JSON. Try again or pick a stronger model.'); }
}
