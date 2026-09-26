// 3D renderer: a warm-toned deep-space orrery with fly-to camera (three.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const TAU = Math.PI * 2, RINGS = 5, R0 = 14, STEP = 9, SUN_R = 4.2;
const TILT = [0, 0.035, -0.03, 0.05, -0.04];
const ringR = i => R0 + i * STEP;
export const RING_NAMES = ['Core', 'Close', 'Adjacent', 'Outer', 'Fringe'];
export const ringOf = v => Math.max(0, Math.min(RINGS - 1, Math.floor((1 - (v ?? 0.5)) * RINGS)));
export const LINK = {
  cites: '255,214,150', extends: '240,161,74', 'uses-method': '111,178,168', 'same-data': '159,180,106',
  contradicts: '226,96,86', compares: '185,139,196', related: '232,208,186', similar: '232,208,186', gap: '255,231,200',
};
const DASHED = new Set(['contradicts', 'similar', 'gap']);
const V = THREE.Vector3;
const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function tex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = () => tex(256, (g, r) => [[1, 'rgba(232,110,64,.06)'], [0.82, 'rgba(236,128,70,.14)'], [0.66, 'rgba(244,160,88,.3)'], [0.53, 'rgba(252,196,120,.55)']]
  .forEach(([k, c]) => { g.beginPath(); g.arc(r, r, r * k, 0, TAU); g.fillStyle = c; g.fill(); }));
// Sun surface: flat warm latitude bands, Firewatch-style
const sunTex = () => tex(256, (g, r) => {
  const bands = ['#ffe2a8', '#ffd490', '#ffc778', '#ffd490', '#ffe6b0', '#ffcf84', '#ffbd6c', '#ffcf84', '#ffe2a8'];
  const h = (r * 2) / bands.length; bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h, r * 2, h + 1); });
});
const softTex = c => tex(128, (g, r) => { const gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, c); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); });
const circleTex = c => tex(128, (g, r) => { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.arc(r, r, r - 6, 0, TAU); g.stroke(); });
const gapTex = () => tex(128, (g, r) => {
  g.strokeStyle = 'rgba(255,231,200,.9)'; g.lineWidth = 5; g.setLineDash([12, 10]);
  g.beginPath(); g.arc(r, r, r - 8, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,231,200,.95)'; g.font = '700 52px "Sora", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', r, r + 3);
});
function label(text, cls = '') {
  const d = document.createElement('div'); d.className = 'lbl3d ' + cls; d.textContent = text;
  return new CSS2DObject(d);
}

export function createSky(canvas, on) {
  const capture = /[?&]capture/.test(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a0f24, 0.0032);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  const HOME = { p: new V(0, 40, 80), t: new V() };
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.14, minDistance: 3, maxDistance: 280, rotateSpeed: 0.55, zoomSpeed: 0.9, panSpeed: 0.8 });
  const css = new CSS2DRenderer(); css.domElement.className = 'labels';
  canvas.after(css.domElement);

  scene.add(new THREE.AmbientLight(0x9a6a8a, 0.75));
  scene.add(new THREE.PointLight(0xffe2b8, 2.6, 0, 0));
  const ramp = new THREE.DataTexture(new Uint8Array([100, 175, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const SPHERE = new THREE.SphereGeometry(1, 40, 20);
  const gapMap = gapTex();

  // Sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 24), new THREE.MeshBasicMaterial({ map: sunTex() }));
  sun.userData = { kind: 'sun', id: 'sun' }; scene.add(sun);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, depthWrite: false, fog: false }));
  scene.add(glow);

  // Stars and warm nebulae far out
  {
    const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(), v = new V();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(500 + Math.random() * 700); pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(0.06 + Math.random() * 0.08, 0.5, 0.7 + Math.random() * 0.28); col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, fog: false, depthWrite: false })));
    [['#7a2e5a', -0.6, 0.15, -1], ['#b5483e', 0.8, -0.35, -0.6], ['#4a2a70', -0.2, 0.5, 0.9], ['#8a3a4a', 0.9, 0.25, 0.4], ['#3a1e5a', -0.9, -0.3, 0.2], ['#c0603e', 0.1, -0.6, -0.9]]
      .forEach(([hex, x, y, z], i) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(hex), transparent: true, opacity: 0.45, depthWrite: false, fog: false }));
        s.position.set(x, y, z).normalize().multiplyScalar(750); s.scale.setScalar(650 + i * 90); scene.add(s);
      });
  }

  // Orbit rings
  for (let i = 0; i < RINGS; i++) {
    const R = ringR(i), pts = [];
    for (let k = 0; k <= 128; k++) { const a = k / 128 * TAU; pts.push(new V(Math.cos(a) * R, 0, Math.sin(a) * R)); }
    const grp = new THREE.Group(); grp.rotation.x = TILT[i];
    grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffdebe, transparent: true, opacity: 0.26 - i * 0.03, depthWrite: false })));
    const l = label(RING_NAMES[i].toUpperCase(), 'ring'); l.position.set(0, 0, -R); grp.add(l);
    scene.add(grp);
  }

  const mark = c => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: circleTex(c), transparent: true, depthWrite: false, depthTest: false })); s.visible = false; scene.add(s); return s; };
  const selMark = mark('#ffd79a'), hovMark = mark('rgba(255,215,154,.5)');

  const world = new THREE.Group(); scene.add(world);
  let M = { view: 'relevance', papers: [], fields: [], links: [], gaps: [] };
  const L = new Map(), bodies = new Map();
  let links = [], extra = [], picks = [sun];
  let t = 0, paused = reduce, selected = null, ext = null, hoverId = null, follow = null, flight = null;
  const lastF = new V();

  // ---------- building ----------
  const toon = color => { const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp }); m.userData = { base: 1, solid: true }; return m; };
  const outlineMat = () => { const m = new THREE.MeshBasicMaterial({ color: 0x140a1c, side: THREE.BackSide }); m.userData = { base: 1, solid: true }; return m; };
  function addBody(kind, id, r, color, text, big) {
    const group = new THREE.Group(), mats = [], geos = [];
    let hit;
    if (kind === 'gap') {
      const m = new THREE.SpriteMaterial({ map: gapMap, transparent: true, depthWrite: false }); m.userData.base = 1; mats.push(m);
      hit = new THREE.Sprite(m); hit.scale.setScalar(r * 2.6); group.add(hit);
    } else {
      const m = toon(color); mats.push(m);
      const mesh = new THREE.Mesh(SPHERE, m); mesh.scale.setScalar(r); group.add(mesh);
      const om = outlineMat(); mats.push(om);
      const outline = new THREE.Mesh(SPHERE, om); outline.scale.setScalar(r * 1.09 + 0.05); group.add(outline);
      if (kind === 'field') {
        const rm = toon(color); rm.side = THREE.DoubleSide; rm.userData.solid = true; mats.push(rm);
        const g = new THREE.RingGeometry(r * 1.35, r * 1.75, 64); geos.push(g);
        const ring = new THREE.Mesh(g, rm); ring.rotation.x = -Math.PI / 2 + 0.45; group.add(ring);
      }
      const hm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }); hm.userData.base = 0; mats.push(hm);
      hit = new THREE.Mesh(SPHERE, hm); hit.scale.setScalar(Math.max(r * 1.6, r + 0.9)); group.add(hit);
    }
    hit.userData = { kind, id };
    let lbl = null;
    if (text) { lbl = label(text, big ? 'big' : ''); lbl.position.set(0, -(r + (big ? 1.7 : 1.1)), 0); group.add(lbl); }
    world.add(group);
    const b = { kind, id, r, group, mats, geos, hit, lbl }; bodies.set(id, b); return b;
  }
  function makeLink(l) {
    const N = 24, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    const color = new THREE.Color(`rgb(${LINK[l.type] || LINK.related})`), dashed = DASHED.has(l.type);
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.45, transparent: true, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false });
    const line = new THREE.Line(g, mat); line.frustumCulled = false; world.add(line);
    return { ...l, line, mat, dashed, N };
  }
  const dropLinks = arr => arr.forEach(l => { world.remove(l.line); l.line.geometry.dispose(); l.mat.dispose(); });
  function clear() {
    for (const b of bodies.values()) { b.lbl?.element.remove(); world.remove(b.group); b.mats.forEach(m => m.dispose()); b.geos.forEach(g => g.dispose()); }
    bodies.clear(); dropLinks(links); links = [];
  }
  function setExtra() {
    dropLinks(extra);
    extra = ext?.gap ? ext.gap.papers.map(b => makeLink({ a: ext.gap.id, b, type: 'gap' })) : [];
    extra.forEach(l => (l.mat.opacity = 0.85));
  }
  const fieldR = count => 1.1 + Math.sqrt(count) * 0.45;

  function layout() {
    L.clear();
    const rings = Array.from({ length: RINGS }, () => []);
    if (M.view === 'fields') {
      M.fields.forEach(f => rings[ringOf(f.rel)].push(f));
      for (const f of M.fields) {
        const arr = M.papers.filter(p => 'f:' + p.field === f.id).sort((a, b) => b.rel - a.rel), pr = fieldR(f.count);
        arr.forEach((p, k) => L.set(p.id, { parent: f.id, mr: pr * 2.1 + (k % 3) * 1.1 + Math.floor(k / 3) * 0.3, phase: k * TAU / arr.length + (k % 3) * 0.6, speed: 0.3 / (1 + (k % 3) * 0.4) }));
      }
    } else M.papers.forEach(p => rings[ringOf(p.rel)].push(p));
    M.gaps.forEach(g => rings[ringOf(g.closeness)].push(g));
    rings.forEach((arr, i) => arr.forEach((b, k) => L.set(b.id, { ring: i, phase: i * 1.7 + k * TAU / arr.length, speed: 0.05 / Math.sqrt(i + 1) })));
  }

  function place() {
    for (const [id, l] of L) {
      if (l.parent) continue;
      const b = bodies.get(id); if (!b) continue;
      const a = l.phase + t * l.speed, R = ringR(l.ring), z = Math.sin(a) * R, th = TILT[l.ring];
      b.group.position.set(Math.cos(a) * R, -z * Math.sin(th), z * Math.cos(th));
    }
    for (const [id, l] of L) {
      if (!l.parent) continue;
      const b = bodies.get(id), p = bodies.get(l.parent); if (!b || !p) continue;
      const a = l.phase + t * l.speed, q = p.group.position;
      b.group.position.set(q.x + Math.cos(a) * l.mr, q.y + Math.sin(a) * l.mr * 0.3, q.z + Math.sin(a) * l.mr);
    }
  }

  const A = new V(), B = new V(), C = new V();
  function drawLinks() {
    for (const l of [...links, ...extra]) {
      if (!l.line.visible) continue;
      const ba = bodies.get(l.a), bb = bodies.get(l.b);
      if (!ba || !bb) { l.line.visible = false; continue; }
      A.copy(ba.group.position); B.copy(bb.group.position);
      C.addVectors(A, B).multiplyScalar(0.5); C.y += A.distanceTo(B) * 0.18;
      const arr = l.line.geometry.attributes.position.array;
      for (let k = 0; k <= l.N; k++) {
        const s = k / l.N, u = 1 - s;
        arr[k * 3] = u * u * A.x + 2 * u * s * C.x + s * s * B.x;
        arr[k * 3 + 1] = u * u * A.y + 2 * u * s * C.y + s * s * B.y;
        arr[k * 3 + 2] = u * u * A.z + 2 * u * s * C.z + s * s * B.z;
      }
      l.line.geometry.attributes.position.needsUpdate = true;
      if (l.dashed) l.line.computeLineDistances();
    }
  }

  function focusSet() {
    if (ext) return ext.ids;
    if (!selected) return null;
    const f = new Set([selected]);
    M.links.forEach(l => { if (l.a === selected) f.add(l.b); if (l.b === selected) f.add(l.a); });
    return f;
  }
  function applyFocus() {
    const f = focusSet(), isKey = id => id === selected || (ext && ext.keys.has(id));
    const showAll = M.view === 'relevance' && M.papers.length <= 24;
    for (const b of bodies.values()) {
      const dim = f && !f.has(b.id);
      b.mats.forEach(m => {
        m.opacity = m.userData.base * (dim ? 0.38 : 1);
        if (m.userData.solid && m.transparent !== dim) { m.transparent = dim; m.depthWrite = !dim; m.needsUpdate = true; }
      });
      if (b.lbl) b.lbl.visible = b.kind === 'field' ? !dim : b.id === hoverId || (f ? f.has(b.id) : showAll);
    }
    for (const l of links) {
      const lit = f && f.has(l.a) && f.has(l.b) && (isKey(l.a) || isKey(l.b));
      const op = f ? (lit ? 1 : 0.08) : l.type === 'similar' ? 0 : l.type === 'cites' ? 0.45 : 0.6;
      l.mat.opacity = op; l.line.visible = op > 0.02;
    }
  }

  // ---------- camera ----------
  const posOf = id => (id === 'sun' ? new V() : bodies.get(id)?.group.position.clone());
  function fly(id) {
    if (!id) { follow = null; flight = { id: null, fromP: camera.position.clone(), fromT: controls.target.clone(), off: HOME.p.clone(), k: 0 }; return; }
    const p = posOf(id); if (!p) return;
    const r = id === 'sun' ? SUN_R : bodies.get(id).r;
    const dist = (id === 'sun' ? 30 : Math.max(14, r * (bodies.get(id).kind === 'field' ? 11 : 12))) * (camera.aspect < 0.9 ? 1.5 : 1);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.3) { dir.y = 0.3; dir.normalize(); }
    flight = { id, fromP: camera.position.clone(), fromT: controls.target.clone(), off: dir.multiplyScalar(dist), k: 0 };
    follow = id; lastF.copy(p);
  }
  controls.addEventListener('start', () => { flight = null; });

  function markers() {
    const sid = selected || (ext && [...ext.keys][0]);
    for (const [m, id] of [[selMark, sid], [hovMark, hoverId !== sid ? hoverId : null]]) {
      const b = id && bodies.get(id);
      m.visible = !!b;
      if (b) { m.position.copy(b.group.position); m.scale.setScalar(b.r * (b.kind === 'gap' ? 3.6 : 3.2) + 0.6); }
    }
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }
  function tick(dt) {
    if (!paused) t += dt;
    place();
    if (flight) {
      flight.k = Math.min(1, flight.k + dt / (reduce ? 0.01 : 0.7));
      const e = ease(flight.k), T = flight.id ? posOf(flight.id) || new V() : HOME.t;
      camera.position.lerpVectors(flight.fromP, T.clone().add(flight.off), e);
      controls.target.lerpVectors(flight.fromT, T, e);
      lastF.copy(T);
      if (flight.k >= 1) flight = null;
    } else if (follow) {
      const p = posOf(follow);
      if (p) { const d = p.clone().sub(lastF); camera.position.add(d); controls.target.add(d); lastF.copy(p); } else follow = null;
    }
    controls.update();
    drawLinks(); markers();
    glow.scale.setScalar(19 * (1 + 0.02 * Math.sin(t * 0.9)));
    sun.rotation.y = t * 0.08;
    renderer.render(scene, camera); css.render(scene, camera);
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (x, y) => { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(picks, false)[0]?.object.userData || null; };
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; on.hover(null); });
  canvas.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) { const h = pick(e.clientX, e.clientY); on.select(h?.kind || null, h?.id); }
    down = null;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const h = pick(e.clientX, e.clientY), id = h && h.kind !== 'sun' ? h.id : null;
    if (id !== hoverId) { hoverId = id; applyFocus(); }
    canvas.classList.toggle('pointing', !!h);
    on.hover(h, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerleave', () => { hoverId = null; applyFocus(); on.hover(null); });
  canvas.addEventListener('dblclick', () => on.select(null));

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); css.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    HOME.p.set(0, 30, 64).multiplyScalar(w / h < 0.9 ? (capture ? 1.55 : 1.8) : w < 900 ? 1.15 : 1);
  }
  addEventListener('resize', resize); resize();
  camera.position.copy(HOME.p).multiplyScalar(2.4);
  fly(null); // opening glide in from deep space
  if (!capture) requestAnimationFrame(frame);

  return {
    update(m) {
      M = m; clear(); layout();
      if (M.view === 'fields') M.fields.forEach(f => addBody('field', f.id, fieldR(f.count), f.color, f.name, true));
      M.papers.forEach(p => addBody('paper', p.id, p.r * 0.16 * (M.view === 'fields' ? 0.6 : 1), p.color, p.label));
      M.gaps.forEach(g => addBody('gap', g.id, 0.9));
      links = M.links.map(makeLink);
      picks = [sun, ...[...bodies.values()].map(b => b.hit)];
      setExtra(); place(); applyFocus();
    },
    select(id) {
      const was = follow;
      selected = id === 'sun' ? null : id; ext = null; setExtra(); applyFocus();
      if (id) fly(id); else if (was) fly(null);
    },
    focus(f) { ext = f; selected = null; setExtra(); applyFocus(); fly([...f.keys][0]); },
    togglePause() { paused = !paused; return paused; },
    step: tick, // capture mode: advance time deterministically
  };
}
