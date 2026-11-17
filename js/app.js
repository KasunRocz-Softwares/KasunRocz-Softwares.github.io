// KasunRocz Softwares — renders projects.json into 3D "worlds" and runs the page's motion.
// To add a project, edit projects.json only. Nothing here needs to change.
const ORG = 'KasunRocz-Softwares';
const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXZ';
const FALLBACK_ACCENTS = ['#ffb547', '#5cc8ff', '#b197fc', '#ff7eb6', '#7ef29d'];

/* ---------------- Small DOM helper (textContent only, so JSON/API text is never parsed as HTML) ---------------- */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid) n.append(kid);
  return n;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
}

/* ---------------- GitHub API (cached for an hour per visitor to stay under the rate limit) ---------------- */
async function gh(path) {
  const key = 'gh:' + path;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < 3600e3) return hit.d;
  } catch { /* storage unavailable */ }
  const r = await fetch('https://api.github.com/' + path, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch { /* storage full or blocked */ }
  return d;
}

async function liveStats(repo, versionEl, starsEl) {
  try {
    const rel = await gh(`repos/${repo}/releases/latest`);
    if (rel && rel.tag_name) {
      versionEl.textContent = rel.tag_name.startsWith('v') ? rel.tag_name : 'v' + rel.tag_name;
      versionEl.hidden = false;
    }
  } catch { /* no releases */ }
  try {
    const info = await gh(`repos/${repo}`);
    if (info && info.stargazers_count > 0) {
      starsEl.textContent = `★ ${info.stargazers_count}`;
      starsEl.hidden = false;
    }
  } catch { /* rate limited */ }
}

/* ---------------- World (project) rendering ---------------- */
function btn(href, label, primary, external) {
  if (!href) return null;
  return el('a', { class: `btn ${primary ? 'btn-primary magnetic' : 'btn-ghost'}`, href, rel: 'noopener', target: external ? '_blank' : null, text: label });
}

function listingsRow(p) {
  const list = (p.listings || []).filter((l) => l && l.url);
  if (!list.length) return null;
  const row = el('div', { class: 'listed' }, el('span', { class: 'mono', text: 'Listed on' }));
  list.forEach((l) => {
    const name = l.site || 'Listing';
    const a = el('a', { href: l.url, target: '_blank', rel: 'noopener', title: `${p.name} on ${name}` });
    if (l.badge) {
      const img = el('img', { src: l.badge, alt: `${p.name} on ${name}`, height: 34, loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => { img.remove(); a.classList.add('text'); a.textContent = name; });
      a.append(img);
    } else {
      a.classList.add('text');
      a.textContent = name;
    }
    row.append(a);
  });
  return row;
}

function world(p, i) {
  const accent = hexToRgb(p.accent) ? p.accent : FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length];
  const sector = String(i + 1).padStart(2, '0');

  const version = el('a', { class: 'chip', href: p.website || (p.repo ? `https://github.com/${p.repo}/releases` : null), hidden: true });
  const head = el('div', { class: 'world-head' },
    el('span', { class: 'mono', text: `Sector ${sector}${p.category ? ' · ' + p.category : ''}` }),
    version);

  let media = null;
  if (p.image) {
    const img = el('img', { src: p.image, alt: `${p.name} preview`, loading: 'lazy', decoding: 'async', width: 640, height: 300 });
    media = el('figure', { class: 'world-media' }, img);
    img.addEventListener('error', () => media.remove());
  }

  let icon;
  if (p.icon) {
    icon = el('img', { class: 'world-icon', src: p.icon, alt: '', width: 44, height: 44, loading: 'lazy' });
    icon.addEventListener('error', () => icon.replaceWith(el('span', { class: 'world-icon letter', 'aria-hidden': 'true', text: p.name[0] })));
  } else {
    icon = el('span', { class: 'world-icon letter', 'aria-hidden': 'true', text: p.name[0] });
  }

  const features = (p.features || []).length
    ? el('ul', { class: 'readouts', 'aria-label': 'Features' }, ...p.features.map((f) => el('li', { text: f })))
    : null;

  const stars = el('li', { class: 'tag-star', hidden: true });
  const platforms = el('ul', { class: 'platforms' },
    ...(p.platforms || []).map((t) => el('li', { text: t })),
    p.license ? el('li', { text: p.license }) : null,
    stars);

  const actions = el('div', { class: 'actions' },
    btn(p.download, p.downloadLabel || 'Download', true),
    btn(p.website, p.download ? 'Website' : 'Visit website', !p.download),
    btn(p.repo ? `https://github.com/${p.repo}` : null, 'Source', false, true));

  const panel = el('article', { class: 'world-panel tilt reveal' },
    head, media,
    el('div', { class: 'world-title' }, icon, el('h3', { text: p.name })),
    p.tagline ? el('p', { class: 'world-tagline', text: p.tagline }) : null,
    p.description ? el('p', { class: 'world-copy', text: p.description }) : null,
    features,
    listingsRow(p),
    el('div', { class: 'world-foot' }, platforms, actions));

  const section = el('section', {
    class: 'world' + (i % 2 ? ' right' : ''),
    id: p.id || null,
    'data-kf': '',
    'data-sector': p.name,
    'data-accent': accent,
  }, panel);
  section.style.setProperty('--accent', accent);
  section.style.setProperty('--accent-rgb', hexToRgb(accent));

  if (p.repo) liveStats(p.repo, version, stars);
  return { section, accent };
}

/* Constellation tags come from the projects themselves, plus the studio's promises. */
function buildSphereTags(projects) {
  const seen = new Set();
  const tags = [];
  const add = (t) => { const k = String(t).trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); tags.push(k); } };
  projects.forEach((p) => (p.platforms || []).forEach(add));
  projects.forEach((p) => (p.features || []).forEach(add));
  projects.forEach((p) => p.license && add(p.license));
  ['Local-first', 'Zero tracking', 'No accounts', 'Open source', 'GitHub'].forEach(add);
  return tags.slice(0, 32);
}

/* Other public org repos with GitHub Pages that aren't in projects.json show up automatically. */
async function discover(known) {
  try {
    const repos = await gh(`orgs/${ORG}/repos?per_page=100&type=public`);
    const self = `${ORG}.github.io`.toLowerCase();
    const extra = repos.filter((r) => r.has_pages && !r.fork && !r.archived && r.name.toLowerCase() !== self && !known.has(r.name.toLowerCase()));
    if (!extra.length) return;
    const list = document.getElementById('workshop-list');
    extra.forEach((r) => list.append(
      el('a', { class: 'mini', href: r.homepage || `https://${ORG.toLowerCase()}.github.io/${r.name}/`, rel: 'noopener' },
        el('b', { text: r.name }),
        el('span', { text: r.description || 'Project site' }))));
    document.getElementById('workshop').hidden = false;
    measure();
  } catch { /* offline or rate limited */ }
}

/* ---------------- Word splitting ---------------- */
function splitWords(node, cls, counter = { i: 0 }) {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(' '); return; }
        const outer = document.createElement('span');
        outer.className = cls;
        if (cls === 'w') {
          const inner = document.createElement('span');
          inner.textContent = part;
          inner.style.setProperty('--i', counter.i++);
          outer.append(inner);
        } else {
          outer.textContent = part;
        }
        frag.append(outer);
      });
      child.replaceWith(frag);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      splitWords(child, cls, counter);
    }
  });
}
document.querySelectorAll('[data-split]').forEach((n) => splitWords(n, 'w'));
const scrubEl = document.querySelector('[data-scrub]');
if (scrubEl) splitWords(scrubEl, 'sw');
const scrubWords = scrubEl ? [...scrubEl.querySelectorAll('.sw')] : [];

/* ---------------- Text scramble ---------------- */
function scramble(node) {
  const final = node.dataset.text || (node.dataset.text = node.textContent);
  if (reduce) { node.textContent = final; return; }
  cancelAnimationFrame(node._scr);
  let frame = 0;
  const total = 20;
  const step = () => {
    const done = (frame / total) * final.length;
    node.textContent = [...final].map((c, i) => (i < done || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    if (frame++ < total) node._scr = requestAnimationFrame(step);
    else node.textContent = final;
  };
  step();
}

/* ---------------- Scroll reveal ---------------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting && !e.target.closest('.hero')) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: .08 });
const observeReveals = (scope) => scope.querySelectorAll('.reveal:not(.in)').forEach((n) => io.observe(n));

/* ---------------- Pointer interactions ---------------- */
function bindPointerFX(scope) {
  if (!fine || reduce) return;
  scope.querySelectorAll('.magnetic:not([data-fx])').forEach((n) => {
    n.dataset.fx = '';
    n.addEventListener('pointermove', (e) => {
      const r = n.getBoundingClientRect();
      n.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * .22}px, ${(e.clientY - (r.top + r.height / 2)) * .32}px)`;
    });
    n.addEventListener('pointerleave', () => { n.style.transform = ''; });
  });
  scope.querySelectorAll('.tilt:not([data-fx])').forEach((n) => {
    n.dataset.fx = '';
    n.addEventListener('pointermove', (e) => {
      const r = n.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      n.style.setProperty('--mx', `${px * 100}%`);
      n.style.setProperty('--my', `${py * 100}%`);
      n.style.transform = `perspective(1100px) rotateX(${(.5 - py) * 5}deg) rotateY(${(px - .5) * 6}deg)`;
    });
    n.addEventListener('pointerleave', () => { n.style.transform = ''; });
  });
}

/* ---------------- Constellation tag sphere ---------------- */
function initSphere(sphere, labels) {
  sphere.replaceChildren(...labels.map((t) => el('span', { class: 'tag', role: 'listitem', text: t })));
  const tags = [...sphere.children];
  const N = tags.length;
  if (!N) return;
  const pts = tags.map((_, i) => {
    const phi = Math.acos(1 - (2 * (i + .5)) / N);
    const th = Math.PI * (1 + Math.sqrt(5)) * (i + .5);
    return [Math.cos(th) * Math.sin(phi), Math.sin(th) * Math.sin(phi), Math.cos(phi)];
  });
  const baseVy = reduce ? 0 : .0035;
  let rx = .3, ry = 0, vx = 0, vy = baseVy;
  let visible = false, dragging = false, lastX = 0, lastY = 0, raf = 0;

  const render = () => {
    const R = sphere.clientWidth * .4;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    for (let i = 0; i < N; i++) {
      const [x, y, z] = pts[i];
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y1 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const depth = (z2 + 1) / 2;
      const t = tags[i];
      t.style.transform = `translate(-50%, -50%) translate3d(${(x1 * R).toFixed(1)}px, ${(y1 * R).toFixed(1)}px, 0) scale(${(.62 + depth * .48).toFixed(3)})`;
      t.style.opacity = (.22 + depth * .78).toFixed(2);
      t.style.zIndex = String(Math.round(depth * 100));
      t.style.filter = depth < .35 ? `blur(${((.35 - depth) * 4).toFixed(1)}px)` : '';
    }
  };
  const loop = () => {
    if (!dragging) { vx += (0 - vx) * .03; vy += (baseVy - vy) * .03; }
    rx += vx; ry += vy;
    render();
    if (visible || dragging) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(loop);
  }).observe(sphere);
  render();

  sphere.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    sphere.classList.add('dragging');
    sphere.setPointerCapture(e.pointerId);
  });
  sphere.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    vy = (e.clientX - lastX) * .006;
    vx = -(e.clientY - lastY) * .006;
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { dragging = false; sphere.classList.remove('dragging'); };
  sphere.addEventListener('pointerup', end);
  sphere.addEventListener('pointercancel', end);
}

/* ---------------- Scroll → scene keyframes, HUD, readout ---------------- */
let universe = null;
let kfEls = [];
let sectors = [];
let accents = [];
let centers = [];
let maxScroll = 1;
let activeIdx = -1;
const hud = document.getElementById('hud');
const sectorEl = document.querySelector('[data-readout-sector]');
const coordsEl = document.querySelector('[data-readout-coords]');
const visionEl = document.getElementById('vision');

function collectKeyframes() {
  kfEls = [...document.querySelectorAll('[data-kf]')];
  sectors = kfEls.map((n) => n.dataset.sector || 'Section');
  accents = kfEls.map((n) => n.dataset.accent || '#3cf2c8');
  hud.replaceChildren(...kfEls.map((n, i) => el('a', { href: '#' + n.id, 'data-hud': i }, el('span', { text: sectors[i] }), el('i'))));
  activeIdx = -1;
}

function measure() {
  if (!kfEls.length) return;
  maxScroll = Math.max(1, root.scrollHeight - innerHeight);
  centers = kfEls.map((n) => { const r = n.getBoundingClientRect(); return r.top + scrollY + r.height / 2; });
  const last = centers.length - 1;
  centers[last] = Math.min(centers[last], maxScroll + innerHeight / 2);
}

function computeT() {
  const y = scrollY + innerHeight / 2;
  if (!centers.length || y <= centers[0]) return 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
  }
  return centers.length - 1;
}

function onScroll() {
  const t = computeT();
  universe?.setProgress(t);
  root.style.setProperty('--p', (scrollY / maxScroll).toFixed(4));

  const idx = clamp(Math.round(t), 0, Math.max(0, sectors.length - 1));
  if (idx !== activeIdx && sectors.length) {
    activeIdx = idx;
    [...hud.children].forEach((a, i) => a.classList.toggle('active', i === idx));
    root.style.setProperty('--live', accents[idx]);
    if (sectorEl) {
      sectorEl.dataset.text = `SECTOR ${String(idx).padStart(2, '0')} · ${sectors[idx].toUpperCase()}`;
      scramble(sectorEl);
    }
  }

  if (visionEl && scrubWords.length) {
    const r = visionEl.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
    const lit = reduce ? scrubWords.length : Math.floor(p * 1.25 * scrubWords.length);
    scrubWords.forEach((w, i) => w.classList.toggle('lit', i < lit));
  }
}

let scrollQueued = false;
addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => { scrollQueued = false; onScroll(); });
}, { passive: true });
addEventListener('resize', () => { measure(); onScroll(); });
addEventListener('load', () => { measure(); onScroll(); });

/* ---------------- Boot: projects → worlds → universe ---------------- */
const worldsList = document.getElementById('worlds-list');
const projectsReady = fetch('projects.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(({ projects = [] }) => projects.filter((p) => p && p.name))
  .catch(() => null);

const booted = projectsReady.then((projects) => {
  const list = projects || [];
  if (projects === null || !list.length) {
    worldsList.append(el('section', { class: 'world' },
      el('article', { class: 'world-panel world-error reveal' },
        el('p', { class: 'world-tagline', text: projects === null ? "Couldn't load the project list." : 'Projects are on the way.' }),
        el('p', { class: 'world-copy' }, document.createTextNode('See every project on '),
          el('a', { href: `https://github.com/${ORG}`, text: 'GitHub' }), document.createTextNode('.')))));
  }
  const built = list.map(world);
  worldsList.append(...built.map((b) => b.section));

  const count = document.getElementById('stat-count');
  if (count) count.dataset.count = String(list.length);

  initSphere(document.getElementById('sphere'), buildSphereTags(list));
  observeReveals(document);
  bindPointerFX(document);
  collectKeyframes();
  measure();
  onScroll();

  const known = new Set(list.flatMap((p) => [p.id, p.repo && p.repo.split('/')[1]]).filter(Boolean).map((s) => s.toLowerCase()));
  discover(known);

  const worlds = list.map((p, i) => ({ accent: built[i].accent, planet: p.planet }));
  return import('./scene.js')
    .then(({ createUniverse }) => {
      universe = createUniverse(document.getElementById('universe'), { mobile: innerWidth < 760, reduce, worlds });
      requestAnimationFrame(() => root.classList.add('scene-ready'));
      measure();
      onScroll();
    })
    .catch((err) => {
      console.warn('3D scene unavailable, using static background.', err);
      root.classList.add('no-webgl');
    });
});

/* ---------------- Loader ---------------- */
const pctEl = document.querySelector('[data-pct]');
let pct = 0;
let ready = false;
const start = performance.now();
Promise.all([booted, document.fonts ? document.fonts.ready : Promise.resolve()]).then(() => { ready = true; });
setTimeout(() => { ready = true; }, 3500);

function loaderTick(now) {
  const goal = ready ? 100 : Math.min(88, (now - start) / 14);
  pct += (goal - pct) * (ready ? .18 : .08);
  if (pctEl) pctEl.textContent = String(Math.round(pct)).padStart(3, '0');
  if (ready && pct > 99.3) { onLoaded(); return; }
  requestAnimationFrame(loaderTick);
}
requestAnimationFrame(loaderTick);

let loadedOnce = false;
function onLoaded() {
  if (loadedOnce) return;
  loadedOnce = true;
  if (pctEl) pctEl.textContent = '100';
  root.classList.add('loaded');
  document.querySelectorAll('.hero .reveal').forEach((n) => n.classList.add('in'));
  booted.then(countUp);
}

function countUp() {
  document.querySelectorAll('[data-count]').forEach((n) => {
    const to = Number(n.dataset.count);
    if (reduce) { n.textContent = to; return; }
    const t0 = performance.now() + 400;
    const step = (now) => {
      const p = clamp((now - t0) / 1400, 0, 1);
      n.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* ---------------- Static page wiring ---------------- */
document.querySelectorAll('[data-scramble]').forEach((n) => {
  n.dataset.text = n.textContent;
  n.addEventListener('mouseenter', () => scramble(n));
  n.addEventListener('focus', () => scramble(n));
});
observeReveals(document);
bindPointerFX(document);

const glowEl = document.querySelector('.cursor-glow');
const ptr = { x: innerWidth / 2, y: innerHeight / 2, gx: innerWidth / 2, gy: innerHeight / 2 };
addEventListener('pointermove', (e) => {
  ptr.x = e.clientX; ptr.y = e.clientY;
  universe?.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
}, { passive: true });
if (fine && !reduce && glowEl) {
  const follow = () => {
    ptr.gx += (ptr.x - ptr.gx) * .12;
    ptr.gy += (ptr.y - ptr.gy) * .12;
    glowEl.style.setProperty('--cx', `${ptr.gx}px`);
    glowEl.style.setProperty('--cy', `${ptr.gy}px`);
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

addEventListener('pointerdown', (e) => {
  universe?.pulse(.8);
  if (reduce) return;
  const n = e.pointerType === 'touch' ? 8 : 12;
  for (let i = 0; i < n; i++) {
    const s = el('span', { class: 'spark' });
    s.style.left = `${e.clientX}px`;
    s.style.top = `${e.clientY}px`;
    document.body.append(s);
    const a = (i / n) * Math.PI * 2 + Math.random() * .5;
    const d = 28 + Math.random() * 54;
    s.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => s.remove();
  }
}, { passive: true });

const nav = document.getElementById('nav');
const menuBtn = nav.querySelector('.menu-btn');
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
}));

if (coordsEl) {
  setInterval(() => {
    if (!universe || document.hidden) return;
    const p = universe.camera.position;
    coordsEl.textContent = `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}`;
  }, 120);
}

const yearEl = document.querySelector('[data-year]');
if (yearEl) yearEl.textContent = new Date().getFullYear();
