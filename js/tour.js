// First-run tutorial: a short, game-style walkthrough with camera moves and spotlights.
import { LINK } from './sky.js';

const legend = [
  ['cites', 'cites', ''], ['extends', 'extends / builds on', ''], ['uses-method', 'uses the method of', ''],
  ['contradicts', 'challenges', '6 4'], ['similar', 'similar wording (on select)', '2 4'],
].map(([k, text, dash]) => `<li><svg width="46" height="10" aria-hidden="true"><path d="M2 5 Q23 -2 44 5" fill="none" stroke="rgb(${LINK[k]})" stroke-width="2.5" stroke-dasharray="${dash}" stroke-linecap="round"/></svg>${text}</li>`).join('');

const STEPS = [
  { title: 'Your research is the sun', cam: 'sun',
    text: 'Everything orbits your research question. Click the sun any time to edit it and add your own workings: hypotheses, methods, drafts.' },
  { title: 'Closer orbit, closer paper', cam: 'home',
    text: 'Every planet is a paper. The five rings, <b>Core → Close → Adjacent → Outer → Fringe</b>, show how directly it bears on your question.' },
  { title: 'Lines are connections', cam: 'paper',
    text: 'Click or hover a planet to light up its links:', art: `<ul class="legend">${legend}</ul>` },
  { title: '<span class="q">?</span> marks a gap', cam: 'gap',
    text: 'Dashed <b>?</b> rings are open problems none of your papers has solved. The closer they orbit, the nearer they sit to your own study. Tap one to read it.' },
  { title: 'Relevance or Fields', cam: 'home', target: '.seg',
    text: '<b>Relevance</b> spreads papers across the rings. <b>Fields</b> groups them into sub-area planets with papers as moons, so you can see which areas you’ve covered and which you’ve skipped.' },
  { title: 'Add anything', target: '#btn-add',
    text: 'Paste arXiv links, DOIs or titles, or drop in a whole folder of PDFs. Details and citations are fetched for you, free.' },
  { title: 'Bring your own AI key', target: '#btn-settings',
    text: 'Gap-finding uses a model you pick in <b>Settings</b>: Claude, OpenAI, Kimi via OpenRouter, or a local Ollama. Your key is stored only in this browser and sent straight to that provider.',
    art: '<p class="promise">There is no Orrery server. I never see, store or pay for your key.</p>' },
  { title: 'You’re ready', cam: 'home',
    text: 'Drag to orbit, scroll to zoom, click anything to fly to it. Your work saves in this browser. Export a backup or replay this tour from Settings.' },
];

export function createTour({ sky, getState, getLinks, onEnd }) {
  const el = document.getElementById('tour');
  const $ = id => document.getElementById(id);
  let i = 0, spot = null;

  function camera(step) {
    const S = getState();
    if (step.cam === 'sun') sky.select('sun');
    else if (step.cam === 'home') sky.select(null);
    else if (step.cam === 'paper') {
      const deg = {}; getLinks().forEach(l => { if (l.type !== 'similar') { deg[l.a] = (deg[l.a] || 0) + 1; deg[l.b] = (deg[l.b] || 0) + 1; } });
      const id = Object.keys(deg).sort((a, b) => deg[b] - deg[a])[0] || S.papers[0]?.id;
      id ? sky.select(id) : sky.select(null);
    } else if (step.cam === 'gap') {
      const g = S.gaps[0];
      g ? sky.focus({ ids: new Set([g.id, ...g.papers]), keys: new Set([g.id]), gap: g }) : sky.select(null);
    }
  }
  function show() {
    const s = STEPS[i];
    spot?.classList.remove('spot');
    spot = s.target ? document.querySelector(s.target) : null;
    spot?.classList.add('spot');
    $('tour-step').textContent = `Tutorial · ${i + 1} of ${STEPS.length}`;
    $('tour-title').innerHTML = s.title;
    $('tour-text').innerHTML = s.text;
    $('tour-art').innerHTML = s.art || '';
    $('tour-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('');
    $('tour-back').hidden = i === 0;
    $('tour-next').textContent = i === STEPS.length - 1 ? 'Start exploring' : 'Next';
    el.querySelector('.tour-card').classList.remove('pop'); void el.offsetWidth; el.querySelector('.tour-card').classList.add('pop');
    camera(s);
  }
  function end() {
    el.hidden = true; spot?.classList.remove('spot'); spot = null;
    sky.select(null); onEnd();
  }
  $('tour-next').onclick = () => (i < STEPS.length - 1 ? (i++, show()) : end());
  $('tour-back').onclick = () => { if (i > 0) { i--; show(); } };
  $('tour-skip').onclick = end;

  return {
    get open() { return !el.hidden; },
    start() { i = 0; el.hidden = false; show(); $('tour-next').focus(); },
    key(e) {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') $('tour-next').click();
      else if (e.key === 'ArrowLeft') $('tour-back').click();
      else return false;
      return true;
    },
  };
}
