// Turning links, IDs, titles and PDFs into paper records via free scholarly APIs.
const S2 = 'https://api.semanticscholar.org/graph/v1/paper/';
const S2F = 'title,abstract,tldr,year,authors,venue,citationCount,externalIds,url,references.paperId,references.externalIds';
const OA = 'https://api.openalex.org/';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/';

export const uid = () => 'p' + Math.random().toString(36).slice(2, 9);
const enc = id => encodeURIComponent(id).replace(/%2F/g, '/').replace(/%3A/g, ':');
const words = s => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
export function titleMatch(a, b) {
  const A = words(a), B = words(b); let n = 0;
  A.forEach(w => B.has(w) && n++);
  return n / Math.max(1, Math.min(A.size, B.size));
}

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 404 || r.status === 400) return null;
    if (r.status === 429 && i < tries - 1) { await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
    throw new Error('HTTP ' + r.status);
  }
}

function fromS2(d) {
  if (!d?.title) return null;
  const x = d.externalIds || {};
  return {
    title: d.title, authors: (d.authors || []).map(a => a.name), year: d.year, venue: d.venue || '',
    abstract: d.abstract || '', tldr: d.tldr?.text || '', cites: d.citationCount, doi: x.DOI?.toLowerCase(), arxiv: x.ArXiv, s2id: d.paperId,
    url: x.ArXiv ? `https://arxiv.org/abs/${x.ArXiv}` : x.DOI ? `https://doi.org/${x.DOI}` : d.url,
    refs: (d.references || []).flatMap(r => [r.paperId && 's2:' + r.paperId, r.externalIds?.DOI && 'doi:' + r.externalIds.DOI.toLowerCase(), r.externalIds?.ArXiv && 'arxiv:' + r.externalIds.ArXiv]).filter(Boolean),
  };
}

function fromOA(w) {
  if (!w?.title) return null;
  let abstract = '';
  if (w.abstract_inverted_index) {
    const arr = [];
    for (const [word, pos] of Object.entries(w.abstract_inverted_index)) for (const i of pos) arr[i] = word;
    abstract = arr.join(' ');
  }
  return {
    title: w.title, authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean), year: w.publication_year,
    venue: w.primary_location?.source?.display_name || '', abstract, cites: w.cited_by_count,
    doi: w.doi?.replace(/^https?:\/\/doi\.org\//, '').toLowerCase(), oaid: w.id?.split('/').pop(),
    url: w.doi || w.primary_location?.landing_page_url, refs: (w.referenced_works || []).map(u => 'oa:' + u.split('/').pop()),
  };
}

export const keysOf = p => [p.s2id && 's2:' + p.s2id, p.doi && 'doi:' + p.doi, p.oaid && 'oa:' + p.oaid, p.arxiv && 'arxiv:' + p.arxiv].filter(Boolean);

export async function resolveInput(line) {
  line = line.trim();
  const arx = line.match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i) || line.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  const doiM = line.match(/10\.\d{4,9}\/[^\s"<>?#]+/);
  const doi = doiM && doiM[0].replace(/(\.pdf|[.,;)])+$/i, '');
  let s2ids = [], oaPath = null, search = null;
  if (arx) { s2ids = ['arXiv:' + arx[1]]; oaPath = 'works/doi:10.48550/arxiv.' + arx[1]; }
  else if (doi) { s2ids = ['DOI:' + doi]; oaPath = 'works/doi:' + doi; }
  else if (/^https?:\/\//i.test(line)) s2ids = ['URL:' + line];
  else search = line;

  let p = null;
  for (const id of s2ids) { try { p = fromS2(await getJSON(S2 + enc(id) + '?fields=' + S2F)); } catch { } if (p) break; }
  if (!p && oaPath) try { p = fromOA(await getJSON(OA + oaPath)); } catch { }
  if (!p && search) try { p = fromOA((await getJSON(OA + 'works?per-page=1&search=' + encodeURIComponent(search)))?.results?.[0]); } catch { }
  if (!p) throw new Error(search ? 'No match for this title — try its DOI or arXiv link.' : "Couldn't fetch this link — paste the DOI/title or upload the PDF.");
  if (arx && !p.arxiv) p.arxiv = arx[1];
  return { id: uid(), notes: '', ...p };
}

let lib;
// Reads the first pages (title, abstract) and optionally the last pages (conclusion).
export async function readPdfText(file, maxPages = 6, tailPages = 0) {
  if (!lib) { lib = await import(PDFJS + 'pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; }
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const read = async i => (await (await doc.getPage(i)).getTextContent()).items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('');
  const pages = [], tail = [], head = Math.min(maxPages, doc.numPages);
  for (let i = 1; i <= head; i++) pages.push(await read(i));
  for (let i = Math.max(head + 1, doc.numPages - tailPages + 1); i <= doc.numPages; i++) tail.push(await read(i));
  let title = '';
  try { title = (await doc.getMetadata()).info?.Title || ''; } catch { }
  return { pages, text: pages.join('\n'), tail: tail.join('\n'), title };
}

// The conclusion section: from its heading up to references / acknowledgements / appendix.
function findConclusion(txt) {
  const m = txt.match(/(?:^|\n)\s*(?:\d{1,2}\.?\s*|[IVX]{1,4}\.\s*)?(?:conclusions?|concluding remarks|discussion and conclusions?|summary and (?:conclusions?|outlook))\s*\n([\s\S]{150,5000}?)(?=\n\s*(?:references|bibliography|acknowledge?ments?|appendix)\b|$)/i);
  return m ? m[1].replace(/-\n(?=[a-z])/g, '').replace(/\s+/g, ' ').trim().slice(0, 2500) : '';
}

export async function paperFromPdf(file) {
  const { pages, text, tail, title: metaTitle } = await readPdfText(file, 4, 5);
  const first = pages[0] || '';
  const arx = first.match(/arXiv:\s?(\d{4}\.\d{4,5})/i)?.[1];
  const doi = first.match(/10\.\d{4,9}\/[^\s"<>]+/)?.[0]?.replace(/[.,;)]+$/, '');
  const lines = first.split('\n').map(s => s.trim()).filter(s => s.length > 12 && s.length < 200 && !/^(arxiv|preprint|proceedings|journal|vol\.|doi|http|published|accepted)/i.test(s));
  const guess = metaTitle && metaTitle.length > 10 && !/^(microsoft word|untitled)/i.test(metaTitle) ? metaTitle : lines[0] || file.name.replace(/\.pdf$/i, '');

  let p = null;
  for (const q of [arx, doi]) if (!p && q) try { p = await resolveInput(q); } catch { }
  if (!p) try { const c = await resolveInput(guess); if (titleMatch(c.title, guess) > 0.7) p = c; } catch { }
  if (!p) {
    const abs = text.match(/abstract[\s.:—–-]*([\s\S]{150,2000}?)(?:\n\s*\n|\b(?:1\.?\s*)?introduction\b|keywords|index terms)/i)?.[1];
    p = { id: uid(), notes: '', title: guess, authors: [], abstract: (abs || text.slice(0, 1500)).replace(/\s+/g, ' ').trim() };
  }
  p.text = text.replace(/\s+/g, ' ').slice(0, 8000);
  p.conclusion = findConclusion(tail + '\n' + text);
  p.file = file.name;
  return p;
}
