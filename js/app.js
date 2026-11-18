// KasunRocz Softwares — renders projects.json into 3D "worlds" and runs the page's motion.
// To add a project, edit projects.json only. Nothing here needs to change.
const ORG = 'KasunRocz-Softwares';
const root = document.documentElement;
const fine = matchMedia('(pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXZ';
const FALLBACK_ACCENTS = ['#ffb547', '#5cc8ff', '#b197fc', '#ff7eb6', '#7ef29d'];

/* ---------------- Motion preference (OS setting, overridable with the Motion toggle) ---------------- */
let reduce = root.classList.contains('rm');
const motionBtn = document.querySelector('.motion-btn');
function applyMotion() {
  root.classList.toggle('rm', reduce);
  motionBtn?.setAttribute('aria-pressed', String(!reduce));
  motionBtn?.setAttribute('aria-label', reduce ? 'Animations off. Turn on' : 'Animations on. Turn off');
}
applyMotion();
motionBtn?.addEventListener('click', () => {
  reduce = !reduce;
  try { localStorage.setItem('kr-motion', reduce ? 'reduced' : 'full'); } catch { /* storage blocked */ }
  applyMotion();
  universe?.setReduced(reduce);
  onScroll();
});

/* ---------------- Device quality tier ---------------- */
function pickTier() {
  const conn = navigator.connection || {};
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const small = innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
  if (conn.saveData || mem <= 2 || (small && (mem <= 4 || cores <= 4))) return 'low';
  if (small || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}
const tier = pickTier();

/* ---------------- Small DOM helper (textContent only, so JSON/API text is never parsed as HTML) ---------------- */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
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

  const panel = el('article', { class: 'world-panel tilt' },
    head, media,
    el('div', { class: 'world-title' }, icon, el('h3', { text: p.name })),
    p.tagline ? el('p', { class: 'world-tagline', text: p.tagline }) : null,
    p.description ? el('p', { class: 'world-copy', text: p.description }) : null,
    features,
    listingsRow(p),
    el('div', { class: 'world-foot' }, platforms, actions));

  const section = el('section', {
    class: 'world' + (i % 2 ? ' right' : ''),
    id: p.id || `world-${i + 1}`,
    'data-kf': '',
    'data-sector': p.name,
    'data-accent': accent,
  }, panel);
  section.style.setProperty('--accent', accent);
  section.style.setProperty('--accent-rgb', hexToRgb(accent));

  if (p.repo) liveStats(p.repo, version, stars);
  return { section, panel, accent };
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
  if (!fine) return;
  scope.querySelectorAll('.magnetic:not([data-fx])').forEach((n) => {
    n.dataset.fx = '';
    n.addEventListener('pointermove', (e) => {
      if (reduce) return;
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
      if (!reduce) n.style.transform = `perspective(1100px) rotateX(${(.5 - py) * 5}deg) rotateY(${(px - .5) * 6}deg)`;
    });
    n.addEventListener('pointerleave', () => { n.style.transform = ''; });
  });
}

/* ---------------- Constellation: clickable nodes with project connections ---------------- */
function buildGraph(projects, accents) {
  const tags = new Map();
  const add = (label, pi) => {
    const t = String(label || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (!tags.has(k)) tags.set(k, { label: t, projects: new Set() });
    tags.get(k).projects.add(pi);
  };
  // Most general first, so small screens (which show fewer nodes) keep the platforms and promises.
  projects.forEach((p, pi) => (p.platforms || []).forEach((t) => add(t, pi)));
  projects.forEach((p, pi) => { if (p.license) add(p.license, pi); });
  // Promises come from each project's own data, so they're only linked where they're true.
  projects.forEach((p, pi) => { (p.promises || []).forEach((t) => add(t, pi)); if (p.license) add('Open source', pi); });
  projects.forEach((p, pi) => (p.features || []).forEach((t) => add(t, pi)));
  return {
    hubs: projects.map((p, i) => ({ name: p.name, tagline: p.tagline, accent: accents[i], rgb: hexToRgb(accents[i]) })),
    tags: [...tags.values()].slice(0, innerWidth < 760 ? 18 : 34),
  };
}

function fibonacci(n, i) {
  const phi = Math.acos(1 - (2 * (i + .5)) / n);
  const th = Math.PI * (1 + Math.sqrt(5)) * (i + .5);
  return [Math.cos(th) * Math.sin(phi), Math.sin(th) * Math.sin(phi), Math.cos(phi)];
}

function initConstellation(sphere, graph, worldSections) {
  const nodesEl = sphere.querySelector('.sphere-nodes');
  const svg = sphere.querySelector('.sphere-links');
  const info = document.getElementById('node-info');
  const SVGNS = 'http://www.w3.org/2000/svg';

  // Projects sit on an inner shell, capabilities on the outer shell.
  const nodes = [
    ...graph.hubs.map((h, i) => ({ kind: 'hub', i, label: h.name, hub: h, p: fibonacci(graph.hubs.length, i), r: .48 })),
    ...graph.tags.map((t, i) => ({ kind: 'tag', i, label: t.label, tag: t, p: fibonacci(graph.tags.length, i), r: 1 })),
  ];
  nodes.forEach((n) => {
    n.el = el('button', { class: 'node' + (n.kind === 'hub' ? ' hub' : ''), type: 'button', text: n.label });
    if (n.kind === 'hub') n.el.style.setProperty('--hub-rgb', n.hub.rgb);
    n.el.setAttribute('aria-label', n.kind === 'hub' ? `Project: ${n.label}` : `Capability: ${n.label}`);
    nodesEl.append(n.el);
  });
  const hubs = nodes.filter((n) => n.kind === 'hub');
  const links = [];
  nodes.filter((n) => n.kind === 'tag').forEach((t) => {
    t.tag.projects.forEach((pi) => {
      const h = hubs[pi];
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('stroke', h.hub.accent);
      svg.append(line);
      links.push({ t, h, line });
    });
  });

  let active = null; // the selected node
  let hover = null;
  const related = (n) => {
    const set = new Set([n]);
    links.forEach((l) => { if (l.t === n) set.add(l.h); if (l.h === n) set.add(l.t); });
    return set;
  };

  function showInfo(n) {
    info.replaceChildren();
    if (!n) {
      info.append(el('p', { class: 'mono', text: 'Drag to spin · Select a node' }), el('p', { class: 'node-info-title', text: 'Pick any node to see its connections.' }));
      info.style.removeProperty('--hub-rgb');
      return;
    }
    const fly = (h) => {
      const b = el('button', { type: 'button' }, el('i'), document.createTextNode(`Fly to ${h.label} →`));
      b.style.setProperty('--hub-rgb', h.hub.rgb);
      b.addEventListener('click', () => worldSections[h.i]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }));
      return b;
    };
    if (n.kind === 'hub') {
      const count = links.filter((l) => l.h === n).length;
      info.style.setProperty('--hub-rgb', n.hub.rgb);
      info.append(
        el('p', { class: 'mono', text: 'Project world' }),
        el('p', { class: 'node-info-title', text: n.label }),
        el('p', { class: 'node-info-sub', text: `${n.hub.tagline ? n.hub.tagline + ' ' : ''}Linked to ${count} capabilities.` }),
        el('div', { class: 'node-links' }, fly(n)));
    } else {
      const ps = hubs.filter((h) => n.tag.projects.has(h.i));
      info.style.removeProperty('--hub-rgb');
      info.append(
        el('p', { class: 'mono', text: 'Capability' }),
        el('p', { class: 'node-info-title', text: n.label }),
        el('p', { class: 'node-info-sub', text: ps.length === hubs.length ? 'Shared by every project.' : `Found in ${ps.map((h) => h.label).join(' and ')}.` }),
        el('div', { class: 'node-links' }, ...ps.map(fly)));
    }
  }

  // rotation state
  const baseVy = () => (reduce ? 0 : .0032);
  let rx = .3, ry = 0, vx = 0, vy = baseVy();
  let target = null;
  let visible = false, dragging = false, pressed = false, moved = 0, lastX = 0, lastY = 0, raf = 0;

  function select(n) {
    active = n === active ? null : n;
    showInfo(active);
    if (active) {
      // turn the sphere so the chosen node faces the viewer
      const [x, y, z] = active.p;
      const tRy = -Math.atan2(x, z);
      const z1 = Math.hypot(x, z);
      const tRx = Math.atan2(y, z1);
      const wrap = (a, b) => b + ((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      target = { rx: wrap(tRx, rx), ry: wrap(tRy, ry) };
    } else {
      target = null;
    }
    kick();
  }

  nodes.forEach((n) => {
    n.el.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); return; } select(n); });
    n.el.addEventListener('pointerenter', () => { hover = n; kick(); });
    n.el.addEventListener('pointerleave', () => { if (hover === n) hover = null; kick(); });
    n.el.addEventListener('focus', () => { hover = n; kick(); });
    n.el.addEventListener('blur', () => { if (hover === n) hover = null; kick(); });
  });

  function render() {
    const W = sphere.clientWidth;
    const R = W * .4;
    const c = W / 2;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    const focus = active || hover;
    const rel = focus ? related(focus) : null;
    nodes.forEach((n) => {
      const [x, y, z] = n.p;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y1 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const depth = (z2 + 1) / 2;
      n.sx = x1 * R * n.r; n.sy = y1 * R * n.r; n.depth = depth;
      const dim = rel && !rel.has(n) ? .18 : 1;
      const scale = (n.kind === 'hub' ? .85 : .62) + depth * (n.kind === 'hub' ? .3 : .48);
      n.el.style.transform = `translate(-50%, -50%) translate3d(${n.sx.toFixed(1)}px, ${n.sy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      n.el.style.opacity = ((n.kind === 'hub' ? .55 + depth * .45 : .22 + depth * .78) * dim).toFixed(2);
      n.el.style.zIndex = String(Math.round(depth * 100) + (n.kind === 'hub' ? 50 : 0) + (rel && rel.has(n) ? 200 : 0));
      n.el.style.filter = depth < .35 && !(rel && rel.has(n)) ? `blur(${((.35 - depth) * 4).toFixed(1)}px)` : '';
      n.el.classList.toggle('is-active', n === active);
      n.el.classList.toggle('is-related', !!(rel && rel.has(n) && n !== focus));
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    links.forEach((l) => {
      const hot = rel && rel.has(l.t) && rel.has(l.h) && (l.t === focus || l.h === focus);
      l.line.setAttribute('x1', (c + l.t.sx).toFixed(1));
      l.line.setAttribute('y1', (c + l.t.sy).toFixed(1));
      l.line.setAttribute('x2', (c + l.h.sx).toFixed(1));
      l.line.setAttribute('y2', (c + l.h.sy).toFixed(1));
      const d = (l.t.depth + l.h.depth) / 2;
      l.line.style.strokeOpacity = (hot ? .55 + d * .4 : (rel ? .02 : .05 + d * .1)).toFixed(3);
      l.line.classList.toggle('hot', !!hot);
    });
  }

  function loop() {
    if (target && !dragging) {
      const k = reduce ? 1 : .08;
      rx += (target.rx - rx) * k;
      ry += (target.ry - ry) * k;
      vx = 0; vy = 0;
    } else if (!dragging) {
      vx += (0 - vx) * .03;
      vy += ((hover ? 0 : baseVy()) - vy) * .03;
      rx += vx; ry += vy;
    }
    render();
    const settling = target && (Math.abs(target.rx - rx) > .001 || Math.abs(target.ry - ry) > .001);
    const spinning = Math.abs(vx) > .0001 || Math.abs(vy) > .0001;
    if (visible && (dragging || settling || spinning || hover)) raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  function kick() { if (!raf && visible) raf = requestAnimationFrame(loop); else if (!visible) render(); }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(sphere);
  render();

  sphere.addEventListener('pointerdown', (e) => {
    pressed = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  sphere.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (!dragging && moved > 6) {
      dragging = true; target = null;
      sphere.classList.add('dragging');
      sphere.setPointerCapture(e.pointerId);
      kick();
    }
    if (dragging) {
      vy = dx * .006; vx = -dy * .006;
      rx += vx; ry += vy;
    }
    lastX = e.clientX; lastY = e.clientY;
  });
  const end = () => { pressed = false; dragging = false; sphere.classList.remove('dragging'); kick(); };
  sphere.addEventListener('pointerup', end);
  sphere.addEventListener('pointercancel', end);
  // clicking empty space clears the selection
  sphere.addEventListener('click', (e) => { if (moved <= 6 && !e.target.closest('.node')) select(null); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) select(null); });
}

/* ---------------- Scroll → scene keyframes, panels, HUD, readout ---------------- */
let universe = null;
let kfEls = [];
let sectors = [];
let accents = [];
let centers = [];
let panels = [];
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

// Project panels materialise as the camera arrives at their planet and dissolve as it leaves.
function updatePanels() {
  const vh = innerHeight;
  panels.forEach((p) => {
    const r = p.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - vh / 2) / vh;
    const vis = 1 - smooth(.28, .62, d);
    const below = r.top + r.height / 2 > vh / 2 ? 1 : -1;
    p.style.opacity = vis.toFixed(3);
    p.style.pointerEvents = vis < .15 ? 'none' : '';
    if (reduce) { p.style.translate = ''; p.style.filter = ''; return; }
    p.style.translate = `0 ${((1 - vis) * 60 * below).toFixed(1)}px`;
    p.style.filter = vis < .98 ? `blur(${((1 - vis) * 12).toFixed(1)}px)` : '';
  });
}

function onScroll() {
  const t = computeT();
  universe?.setProgress(t);
  root.style.setProperty('--p', (scrollY / maxScroll).toFixed(4));
  updatePanels();

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

/* ---------------- Loader: real stages ---------------- */
const STAGES = [
  { key: 'data', label: 'Fetching projects', w: .15 },
  { key: 'fonts', label: 'Loading typefaces', w: .15 },
  { key: 'engine', label: 'Loading 3D engine', w: .42 },
  { key: 'scene', label: 'Compiling shaders', w: .28 },
];
const done = new Set();
const markDone = (key) => done.add(key);
const pctEl = document.querySelector('[data-pct]');
const stageEl = document.querySelector('[data-stage]');
const barEl = document.querySelector('[data-bar]');
let pct = 0;
let stageStart = performance.now();
let lastStage = '';
let forceReady = false;
setTimeout(() => { forceReady = true; }, 7000);

function loaderTick(now) {
  const current = STAGES.find((s) => !done.has(s.key));
  if (current && current.key !== lastStage) { lastStage = current.key; stageStart = now; }
  let goal = STAGES.reduce((a, s) => a + (done.has(s.key) ? s.w : 0), 0);
  if (current) goal += current.w * Math.min(.85, (now - stageStart) / 2500); // creep within the running stage
  const ready = !current || forceReady;
  if (ready) goal = 1;
  pct += (goal * 100 - pct) * (ready ? .2 : .1);
  if (pctEl) pctEl.textContent = String(Math.round(pct)).padStart(3, '0');
  if (barEl) barEl.style.setProperty('--lp', (pct / 100).toFixed(3));
  if (stageEl) stageEl.textContent = ready ? 'Igniting core' : current.label;
  if (ready && pct > 99.3) { onLoaded(); return; }
  requestAnimationFrame(loaderTick);
}
requestAnimationFrame(loaderTick);
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => markDone('fonts'));

/* ---------------- Boot: projects → worlds → universe ---------------- */
const worldsList = document.getElementById('worlds-list');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const booted = fetch('projects.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(({ projects = [] }) => projects.filter((p) => p && p.name))
  .catch(() => null)
  .then(async (projects) => {
    markDone('data');
    const list = projects || [];
    if (projects === null || !list.length) {
      worldsList.append(el('section', { class: 'world' },
        el('article', { class: 'world-panel world-error' },
          el('p', { class: 'world-tagline', text: projects === null ? "Couldn't load the project list." : 'Projects are on the way.' }),
          el('p', { class: 'world-copy' }, document.createTextNode('See every project on '),
            el('a', { href: `https://github.com/${ORG}`, text: 'GitHub' }), document.createTextNode('.')))));
    }
    const built = list.map(world);
    worldsList.append(...built.map((b) => b.section));
    panels = [...worldsList.querySelectorAll('.world-panel')];

    const count = document.getElementById('stat-count');
    if (count) count.dataset.count = String(list.length);

    initConstellation(document.getElementById('sphere'), buildGraph(list, built.map((b) => b.accent)), built.map((b) => b.section));
    observeReveals(document);
    bindPointerFX(document);
    collectKeyframes();
    measure();
    onScroll();

    const known = new Set(list.flatMap((p) => [p.id, p.repo && p.repo.split('/')[1]]).filter(Boolean).map((s) => s.toLowerCase()));
    discover(known);

    const worlds = list.map((p, i) => ({ accent: built[i].accent, planet: p.planet }));
    try {
      const { createUniverse } = await import('./scene.js');
      markDone('engine');
      await nextFrame(); // let the loader show "Compiling shaders" before the GPU work blocks
      universe = createUniverse(document.getElementById('universe'), { mobile: innerWidth < 760, reduce, worlds, tier });
      measure();
      onScroll();
    } catch (err) {
      console.warn('3D scene unavailable, using static background.', err);
      root.classList.add('no-webgl');
      markDone('engine');
    }
    markDone('scene');
  });

/* ---------------- Cinematic entrance ---------------- */
let loadedOnce = false;
function onLoaded() {
  if (loadedOnce) return;
  loadedOnce = true;
  if (pctEl) pctEl.textContent = '100';
  root.classList.add('loaded');

  let seen = false;
  try { seen = sessionStorage.getItem('kr-intro') === '1'; sessionStorage.setItem('kr-intro', '1'); } catch { /* storage blocked */ }
  const dur = universe ? universe.intro(seen) : 0;
  requestAnimationFrame(() => root.classList.add('scene-ready'));

  const heroAt = reduce || !dur ? 0 : dur * 520; // headline rises just after the core ignites
  const doneAt = reduce || !dur ? 0 : dur * 880;
  setTimeout(() => {
    root.classList.add('hero-in');
    document.querySelectorAll('.hero .reveal').forEach((n) => n.classList.add('in'));
    booted.then(countUp);
  }, heroAt);
  setTimeout(() => root.classList.add('intro-done'), doneAt);
}

function countUp() {
  document.querySelectorAll('[data-count]').forEach((n) => {
    const to = Number(n.dataset.count);
    if (reduce) { n.textContent = to; return; }
    const t0 = performance.now() + 300;
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
if (fine && glowEl) {
  const follow = () => {
    if (!reduce) {
      ptr.gx += (ptr.x - ptr.gx) * .12;
      ptr.gy += (ptr.y - ptr.gy) * .12;
      glowEl.style.setProperty('--cx', `${ptr.gx}px`);
      glowEl.style.setProperty('--cy', `${ptr.gy}px`);
    }
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

addEventListener('pointerdown', (e) => {
  if (e.target.closest('.sphere')) return; // dragging the constellation shouldn't spark
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
