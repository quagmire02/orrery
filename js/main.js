import { createSky, ringOf, RING_NAMES, LINK } from './sky.js';
import { resolveInput, paperFromPdf, readPdfText, keysOf } from './papers.js';
import { computeLocal, runAI, summarize, sentences, PROVIDERS, REL_TYPES } from './analyze.js';
import { DEMO } from './demo.js';
import { createTour } from './tour.js';

const CAPTURE = /[?&]capture/.test(location.search);
if (CAPTURE) document.documentElement.classList.add('capture');

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { if (CAPTURE) return d; try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { if (CAPTURE) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Browser storage is full — export your system to keep it safe.'); } },
};
const PALETTE = ['#e9a23b', '#5fa8a0', '#d9674a', '#9fb46a', '#b98bc4', '#6d9ccf', '#e7c87a', '#c9577a'];
const LABEL = { cites: 'cites', extends: 'extends', 'uses-method': 'uses method of', 'same-data': 'shares data with', contradicts: 'challenges', compares: 'compares with', related: 'related to', similar: 'similar wording' };
const REV = { cites: 'cited by', extends: 'extended by', 'uses-method': 'method used by', contradicts: 'challenged by' };
const blank = () => ({ question: '', workings: '', papers: [], relations: [], gaps: [], view: 'relevance' });

let S = (!CAPTURE && store.get('orrery.system', null)) || structuredClone(DEMO);
let cfg = { provider: 'anthropic', key: '', model: '', base: '', ...store.get('orrery.ai', {}) };
let D = { rel: {}, field: {}, links: [], color: {} };

const sky = createSky($('#sky'), {
  select: (kind, id) => (kind ? open(kind, id) : closePanel()),
  hover: showTip,
});

// ---------- state ----------
let saveT;
function commit(soon) {
  clearTimeout(saveT);
  const run = () => { store.set('orrery.system', S); refresh(); };
  soon ? (saveT = setTimeout(run, 500)) : run();
}
function refresh() {
  D = computeLocal(S);
  const names = [...new Set(S.papers.map(p => D.field[p.id]))];
  D.color = Object.fromEntries(names.map((f, i) => [f, PALETTE[i % PALETTE.length]]));
  sky.update({
    view: S.view,
    papers: S.papers.map(p => ({ id: p.id, label: shortLabel(p), rel: D.rel[p.id], field: D.field[p.id], color: D.color[D.field[p.id]], r: 6 + (p.cites ? Math.min(5, Math.log10(p.cites + 1) * 1.4) : 2 * D.rel[p.id]) })),
    fields: names.map(f => { const ps = S.papers.filter(p => D.field[p.id] === f); return { id: 'f:' + f, name: f, color: D.color[f], count: ps.length, rel: ps.reduce((s, p) => s + D.rel[p.id], 0) / ps.length }; }),
    links: D.links,
    gaps: S.gaps,
  });
  $('#q-text').textContent = S.question || 'Tap the sun to set your research question';
  $('#demo-note').hidden = !S.demo;
  $('#empty').hidden = S.papers.length > 0;
  $('#gap-count').textContent = S.gaps.length;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === S.view));
}
const paper = id => S.papers.find(p => p.id === id);
const lastName = n => String(n || '').trim().split(/\s+/).pop();
const shortLabel = p => p.authors?.[0] ? `${lastName(p.authors[0])}${p.year ? " '" + String(p.year).slice(2) : ''}` : p.title.split(/\s+/).slice(0, 3).join(' ');
const authorLine = p => (p.authors || []).slice(0, 3).join(', ') + ((p.authors || []).length > 3 || p.etal ? ' et al.' : '');
const closeness = c => c >= 0.66 ? 'Near your study' : c >= 0.33 ? 'Adjacent to your study' : 'Far from your study';

function startOwn(openSun = true) {
  S = blank(); commit();
  if (openSun) open('sun');
}

// ---------- tooltip & toast ----------
function showTip(h, x, y) {
  const tip = $('#tip');
  if (!h) { tip.hidden = true; return; }
  let html = '';
  if (h.kind === 'paper') { const p = paper(h.id); html = `<b>${esc(p.title)}</b><span>${p.year || ''} · ${esc(D.field[p.id])} · ${Math.round(D.rel[p.id] * 100)}% relevant</span>`; }
  else if (h.kind === 'gap') { const g = S.gaps.find(g => g.id === h.id); html = `<b>${esc(g.title)}</b><span>Uncharted · ${closeness(g.closeness).toLowerCase()}</span>`; }
  else if (h.kind === 'field') html = `<b>${esc(h.id.slice(2))}</b><span>${S.papers.filter(p => 'f:' + D.field[p.id] === h.id).length} papers</span>`;
  else html = `<b>${esc(S.question || 'Your research question')}</b><span>Click to edit your question and workings</span>`;
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(x + 14, innerWidth - r.width - 12) + 'px';
  tip.style.top = Math.min(y + 14, innerHeight - r.height - 12) + 'px';
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4200); }

// ---------- panel ----------
function panel(html) { $('#panel-body').innerHTML = html; $('#panel').hidden = false; $('#panel').scrollTop = 0; }
function closePanel() { $('#panel').hidden = true; sky.select(null); }
function open(kind, id) {
  $('#tip').hidden = true;
  if (kind === 'paper') return showPaper(id);
  if (kind === 'gap') return showGap(id);
  if (kind === 'field') return showField(id);
  if (kind === 'sun') { sky.select('sun'); return showSun(); }
}

function linkItem(id, other, type, out, note) {
  const o = other.startsWith('g') ? null : paper(other); if (!o) return '';
  const lbl = out ? LABEL[type] : REV[type] || LABEL[type];
  return `<li><button type="button" data-open="${o.id}"><span class="lt" style="color:rgb(${LINK[type]})">${esc(lbl)}</span>${esc(o.title)}${note ? `<small>${esc(note)}</small>` : ''}</button></li>`;
}

function showPaper(id) {
  const p = paper(id); if (!p) return closePanel();
  sky.select(id);
  const rel = D.rel[id], f = D.field[id];
  const links = D.links.filter(l => l.a === id || l.b === id);
  const sum = summarize(p);
  const moreAbstract = p.abstract && (!sum || !sum.whole || sentences(p.abstract).length > sum.points.length);
  const summary = p.tldr || sum ? `<h3>Summary</h3>
    ${p.tldr ? `<p class="tldr"><b>TL;DR</b> ${esc(p.tldr)}</p>` : ''}
    ${sum ? `<ul class="points">${sum.points.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <p class="src">${sum ? `Key sentences from the ${sum.from}` : ''}${sum && p.tldr ? ' · ' : ''}${p.tldr ? 'TL;DR by Semantic Scholar' : ''}</p>` : '';
  panel(`
    <p class="eyebrow">${RING_NAMES[ringOf(rel)]} orbit · <span class="chip" style="--c:${D.color[f]}">${esc(f)}</span></p>
    <h2>${esc(p.title)}</h2>
    <p class="meta">${esc(authorLine(p))}${p.year ? ' · ' + p.year : ''}${p.venue ? ' · ' + esc(p.venue) : ''}${p.file ? ' · ' + esc(p.file) : ''}</p>
    ${p.url ? `<a class="ext" href="${esc(p.url)}" target="_blank" rel="noopener">Open paper ↗</a>` : ''}
    <div class="meter" title="${p.ai ? 'From AI analysis' : 'From word overlap with your question'}"><span>Relevance</span><b style="--v:${rel.toFixed(2)}"></b><em>${Math.round(rel * 100)}</em></div>
    ${p.ai?.why ? `<p class="why">${esc(p.ai.why)}</p>` : ''}
    ${summary}
    ${links.length ? `<h3>Connections</h3><ul class="list">${links.map(l => linkItem(id, l.a === id ? l.b : l.a, l.type, l.a === id, l.note)).join('')}</ul>` : ''}
    ${moreAbstract ? `<details><summary>Full abstract</summary><p>${esc(p.abstract)}</p></details>` : ''}
    <label for="notes">Your notes</label>
    <textarea id="notes" rows="4" placeholder="How does this paper bear on your work?">${esc(p.notes || '')}</textarea>
    <button type="button" class="danger" id="remove">Remove from system</button>`);
  $('#notes').oninput = e => { p.notes = e.target.value; commit(true); };
  $('#remove').onclick = e => {
    if (!e.target.classList.contains('armed')) { e.target.classList.add('armed'); e.target.textContent = 'Click again to remove'; return; }
    S.papers = S.papers.filter(x => x.id !== id);
    S.relations = S.relations.filter(r => r.a !== id && r.b !== id);
    S.gaps.forEach(g => (g.papers = g.papers.filter(x => x !== id)));
    commit(); closePanel(); toast('Removed from your system.');
  };
}

function showGap(id) {
  const g = S.gaps.find(g => g.id === id); if (!g) return closePanel();
  sky.focus({ ids: new Set([g.id, ...g.papers]), keys: new Set([g.id]), gap: g });
  panel(`
    <p class="eyebrow">Uncharted · ${closeness(g.closeness)}</p>
    <h2>${esc(g.title)}</h2>
    <p>${esc(g.detail)}</p>
    <h3>Bordering papers</h3>
    <ul class="list">${g.papers.map(pid => paper(pid)).filter(Boolean).map(p => `<li><button type="button" data-open="${p.id}">${esc(p.title)}<small>${esc(shortLabel(p))} · ${esc(D.field[p.id])}</small></button></li>`).join('')}</ul>
    <button type="button" class="plain" data-gaps>All gaps</button>`);
}

function showField(fid) {
  const name = fid.slice(2), ps = S.papers.filter(p => D.field[p.id] === name).sort((a, b) => D.rel[b.id] - D.rel[a.id]);
  sky.focus({ ids: new Set([fid, ...ps.map(p => p.id)]), keys: new Set([fid, ...ps.map(p => p.id)]) });
  panel(`
    <p class="eyebrow"><span class="chip" style="--c:${D.color[name]}">Field</span></p>
    <h2>${esc(name)}</h2>
    <p class="hint">${ps.length} paper${ps.length === 1 ? '' : 's'}, closest to your question first.</p>
    <ul class="list">${ps.map(p => `<li><button type="button" data-open="${p.id}">${esc(p.title)}<small>${esc(shortLabel(p))} · ${Math.round(D.rel[p.id] * 100)}% relevant</small></button></li>`).join('')}</ul>`);
}

function showSun() {
  panel(`
    <p class="eyebrow">The sun</p>
    <h2>Your research</h2>
    <label for="q-in">Research question or area</label>
    <textarea id="q-in" rows="3" placeholder="e.g. Does sleep deprivation change risk-taking in adolescents?">${esc(S.question)}</textarea>
    <label for="w-in">Your workings</label>
    <p class="hint">Hypotheses, methods, draft notes. Orrery uses these to judge how close each paper and gap sits to your own study.</p>
    <textarea id="w-in" rows="9" placeholder="What you're testing, how, and what you've found so far.">${esc(S.workings)}</textarea>
    <label class="btn" for="w-file">Import notes from a PDF or text file</label>
    <input type="file" id="w-file" accept=".pdf,.txt,.md" hidden>`);
  $('#q-in').oninput = e => { S.question = e.target.value; commit(true); };
  $('#w-in').oninput = e => { S.workings = e.target.value; commit(true); };
  $('#w-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const txt = /\.pdf$/i.test(f.name) ? (await readPdfText(f, 12)).text : await f.text();
      S.workings = (S.workings ? S.workings + '\n\n' : '') + txt.replace(/[ \t]+/g, ' ').trim().slice(0, 8000);
      $('#w-in').value = S.workings; commit(); toast(`Imported ${f.name}.`);
    } catch { toast(`Couldn't read ${f.name}.`); }
  };
}

function showGaps() {
  sky.select(null);
  const gs = [...S.gaps].sort((a, b) => b.closeness - a.closeness);
  panel(`
    <p class="eyebrow">Uncharted territory</p>
    <h2>Research gaps</h2>
    ${gs.length ? `<p class="hint">Open problems between your papers, nearest to your own study first. They drift on the orbits as dashed rings.</p>
      <ul class="list">${gs.map(g => `<li><button type="button" class="gap-item" data-gap="${g.id}"><b>${esc(g.title)}</b><small>${closeness(g.closeness)} · ${g.papers.length} bordering papers</small></button></li>`).join('')}</ul>`
      : `<p class="hint">Gaps appear after an AI analysis. Orrery sends paper titles, abstracts and your workings to the model you choose in Settings — using your own key.</p>`}
    <button type="button" class="primary wide" data-analyze>${gs.length ? 'Re-analyze with AI' : 'Analyze with AI'}</button>`);
}

function showAdd() {
  sky.select(null);
  panel(`
    <p class="eyebrow">Add to the system</p>
    <h2>Add papers</h2>
    ${S.demo ? '<p class="hint">You\'re looking at the sample. Adding papers starts your own system.</p>' : ''}
    <label for="add-in">Links, DOIs, arXiv IDs or titles — one per line</label>
    <textarea id="add-in" rows="6" placeholder="https://arxiv.org/abs/2005.11401&#10;10.18653/v1/2020.emnlp-main.550&#10;Lost in the Middle: How Language Models Use Long Contexts"></textarea>
    <button type="button" class="primary wide" id="add-go">Add to system</button>
    <label class="drop" id="drop"><input type="file" id="pdf-in" accept="application/pdf" multiple><b>Drop PDFs here</b><span>or tap to choose — as many as you like</span></label>
    <ul id="add-log" class="log"></ul>
    <p class="hint">Details come from Semantic Scholar and OpenAlex. Papers that cite each other are linked automatically.</p>`);
  $('#add-go').onclick = () => {
    const lines = $('#add-in').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast('Paste at least one link, DOI or title.');
    $('#add-in').value = '';
    run(lines, resolveInput);
  };
  const files = list => { const pdfs = [...list].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)); if (pdfs.length) run(pdfs, paperFromPdf, f => f.name); };
  $('#pdf-in').onchange = e => files(e.target.files);
  const drop = $('#drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); files(e.dataTransfer.files); };
}

async function run(items, resolve, name = x => x) {
  if (S.demo) { startOwn(false); toast('Started your own system — tap the sun to set your question.'); }
  const log = $('#add-log');
  const q = items.map(it => { const li = document.createElement('li'); li.innerHTML = `<span class="st">…</span><span>${esc(name(it))}</span>`; log?.prepend(li); return { it, li }; });
  const mark = (li, cls, txt) => { li.className = cls; li.innerHTML = `<span class="st">${cls === 'ok' ? '✓' : cls === 'dup' ? '=' : '✕'}</span><span>${esc(txt)}</span>`; };
  const worker = async () => {
    while (q.length) {
      const { it, li } = q.shift();
      try {
        const p = await resolve(it);
        const have = new Set(S.papers.flatMap(keysOf)), t = p.title.toLowerCase();
        if (keysOf(p).some(k => have.has(k)) || S.papers.some(x => x.title.toLowerCase() === t)) mark(li, 'dup', `Already in your system: ${p.title}`);
        else { S.papers.push(p); commit(); mark(li, 'ok', p.title); }
      } catch (e) { mark(li, 'fail', `${name(it)} — ${e.message}`); }
    }
  };
  await Promise.all([worker(), worker()]);
}

function showSettings(note) {
  sky.select(null);
  const opts = Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}"${k === cfg.provider ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  panel(`
    <p class="eyebrow">Settings</p>
    <h2>AI &amp; your data</h2>
    ${note ? `<p class="why">${esc(note)}</p>` : ''}
    <p class="hint">Orrery runs entirely in your browser. For gap-finding, bring a key from any provider — it's stored only on this device and sent only to that provider.</p>
    <label for="prov">Provider</label><select id="prov">${opts}</select>
    <label for="key">API key</label><input id="key" type="password" autocomplete="off" spellcheck="false" value="${esc(cfg.key)}" placeholder="Paste your key">
    <label for="model">Model</label><input id="model" type="text" value="${esc(cfg.model)}">
    <label for="base" id="base-l">Base URL</label><input id="base" type="text" value="${esc(cfg.base)}">
    <h3>Your data</h3>
    <p class="hint">Saved in this browser. Export a file to back it up or move it to another device.</p>
    <div class="row"><button type="button" class="plain" id="exp">Export system</button><label class="btn" for="imp">Import</label><input type="file" id="imp" accept=".json,application/json" hidden></div>
    <div class="row"><button type="button" class="plain" id="replay">Replay the tour</button><button type="button" class="plain" id="sample">Load the sample</button><button type="button" class="danger" id="wipe">Start fresh</button></div>`);
  const sync = () => {
    const P = PROVIDERS[$('#prov').value];
    $('#model').placeholder = P.model;
    $('#base').placeholder = P.base || '';
    $('#base').hidden = $('#base-l').hidden = cfg.provider !== 'custom';
  };
  const saveCfg = () => { cfg = { provider: $('#prov').value, key: $('#key').value.trim(), model: $('#model').value.trim(), base: $('#base').value.trim() }; store.set('orrery.ai', cfg); sync(); };
  $('#prov').onchange = saveCfg; ['#key', '#model', '#base'].forEach(s => ($(s).oninput = saveCfg)); sync();
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = `orrery-${(S.question || 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.json`; a.click();
  };
  $('#imp').onchange = async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(d.papers)) throw 0; S = { ...blank(), ...d }; commit(); closePanel(); toast(`Imported ${S.papers.length} papers.`); }
    catch { toast("That file isn't an Orrery export."); }
  };
  $('#replay').onclick = () => { closePanel(); tour.start(); };
  $('#sample').onclick = () => { S = structuredClone(DEMO); commit(); closePanel(); };
  $('#wipe').onclick = e => {
    if (!e.target.classList.contains('armed')) { e.target.classList.add('armed'); e.target.textContent = 'Click again — this clears everything'; return; }
    startOwn();
  };
}

// ---------- AI ----------
async function analyze() {
  if (S.papers.length < 2) return toast('Add at least two papers first.');
  const P = PROVIDERS[cfg.provider];
  if (P.needsKey && !cfg.key) return showSettings('Add an API key to let a model read your papers and find the gaps.');
  const btn = $('#btn-analyze'), lbl = $('#analyze-lbl');
  btn.disabled = true; lbl.textContent = `Reading ${S.papers.length}…`;
  toast(`Reading ${S.papers.length} papers — this can take a minute.`);
  try {
    const r = await runAI(S, cfg), ids = new Set(S.papers.map(p => p.id)), clamp = v => Math.max(0, Math.min(1, +v || 0));
    (r.papers || []).forEach(a => { const p = paper(a.id); if (p) p.ai = { relevance: clamp(a.relevance), field: String(a.field || '').trim() || undefined, why: a.why }; });
    S.relations = (r.relations || []).filter(x => ids.has(x.a) && ids.has(x.b) && x.a !== x.b).map(x => ({ a: x.a, b: x.b, type: REL_TYPES.includes(x.type) ? x.type : 'related', note: x.note }));
    S.gaps = (r.gaps || []).map((g, i) => ({ id: 'g' + i, title: g.title, detail: g.detail, closeness: clamp(g.closeness), papers: (g.papers || []).filter(x => ids.has(x)) }));
    commit(); showGaps();
    toast(`Mapped ${S.relations.length} connections and ${S.gaps.length} gaps.`);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; lbl.textContent = 'Analyze'; }
}

// ---------- wiring ----------
$('#btn-add').onclick = showAdd;
$('#btn-gaps').onclick = showGaps;
$('#btn-settings').onclick = () => showSettings();
$('#btn-analyze').onclick = analyze;
$('#question').onclick = () => open('sun');
$('#start-own').onclick = () => startOwn();
$('#panel-close').onclick = closePanel;
document.querySelectorAll('[data-view]').forEach(b => (b.onclick = () => { S.view = b.dataset.view; commit(); }));
$('#panel-body').addEventListener('click', e => {
  const t = e.target.closest('[data-open],[data-gap],[data-gaps],[data-analyze]'); if (!t) return;
  if (t.dataset.open) showPaper(t.dataset.open);
  else if (t.dataset.gap) showGap(t.dataset.gap);
  else if ('gaps' in t.dataset) showGaps();
  else analyze();
});
addEventListener('keydown', e => {
  if (tour.open && tour.key(e)) { e.preventDefault(); return; }
  if (e.target.closest('input,textarea,select')) return;
  if (e.key === 'Escape') closePanel();
  if (e.key === ' ') { e.preventDefault(); toast(sky.togglePause() ? 'Orbits paused — press Space to resume.' : 'Orbits resumed.'); }
});
const tour = createTour({ sky, getState: () => S, getLinks: () => D.links, onEnd: () => store.set('orrery.toured', true) });
refresh();
if (CAPTURE) window.__app = { sky, open, closePanel, showAdd, showSettings, state: () => S };
else if (!store.get('orrery.toured', false)) setTimeout(() => { closePanel(); tour.start(); }, 1100);
