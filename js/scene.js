// KasunRocz universe — Three.js scene driven by scroll keyframes.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const COLORS = {
  teal: 0x3cf2c8,
  amber: 0xffb547,
  sky: 0x5cc8ff,
  violet: 0xb197fc,
  deep: 0x0b1030,
};

/* ---------------- Shaders ---------------- */
const ORB_V = /* glsl */`
  uniform float uTime; uniform float uDistort; uniform float uPulse;
  varying vec3 vN; varying vec3 vV; varying float vNoise;
  void main(){
    vec3 p = position;
    float n = sin(p.x*2.3 + uTime*.8) * sin(p.y*2.7 + uTime*.6) * sin(p.z*2.1 + uTime*.9);
    n += .5 * sin(p.x*5.1 - uTime*1.3) * sin(p.z*4.7 + uTime);
    p += normal * n * (uDistort + uPulse * .22);
    vNoise = n;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const ORB_F = /* glsl */`
  uniform vec3 uColor; uniform vec3 uColor2; uniform float uPulse;
  varying vec3 vN; varying vec3 vV; varying float vNoise;
  void main(){
    float f = 1. - clamp(dot(normalize(vN), normalize(vV)), 0., 1.);
    vec3 col = uColor2 * (.12 + .3 * (vNoise * .5 + .5));
    col = mix(col, uColor, pow(f, 2.2));
    col += uColor * pow(f, 6.) * 1.3;
    col += uColor * (vNoise * .5 + .5) * .08;
    col += uColor * uPulse * .4;
    gl_FragColor = vec4(col, 1.);
  }`;

const PTS_V = /* glsl */`
  attribute float aSize; attribute float aSeed; attribute vec3 aColor;
  uniform float uTime; uniform float uPR; uniform float uPulse;
  varying vec3 vC; varying float vA;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * uPR * (70. / max(d, .1)), 0., 42.);
    float tw = .55 + .45 * sin(uTime * (.8 + aSeed * 2.) + aSeed * 40.);
    vA = tw * smoothstep(170., 30., d) * smoothstep(.4, 3., d) * (1. + uPulse * .9);
    vC = aColor;
  }`;
const PTS_F = /* glsl */`
  varying vec3 vC; varying float vA;
  void main(){
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, 0., d); a *= a;
    gl_FragColor = vec4(vC, a * vA);
  }`;

const RING_V = /* glsl */`
  varying vec2 vP;
  void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RING_F = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uIn; uniform float uOut;
  varying vec2 vP;
  void main(){
    float r = length(vP);
    float t = (r - uIn) / (uOut - uIn);
    float bands = .5 + .5 * sin(t * 42.);
    float a = smoothstep(0., .1, t) * smoothstep(1., .8, t) * (.25 + .75 * bands) * .6;
    float ang = atan(vP.y, vP.x);
    a *= .65 + .35 * sin(ang * 2. + uTime * .7);
    gl_FragColor = vec4(uColor, a);
  }`;

const LANE_V = /* glsl */`
  attribute float aT; varying float vT;
  void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const LANE_F = /* glsl */`
  uniform float uTime; uniform vec3 uColor; varying float vT;
  void main(){
    float d = fract(vT * 70. - uTime * .55);
    float a = smoothstep(0., .08, d) * smoothstep(.55, .08, d);
    gl_FragColor = vec4(uColor, .05 + a * .55);
  }`;

/* ---------------- Helpers ---------------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(.18, 'rgba(255,255,255,.5)');
  grd.addColorStop(.45, 'rgba(255,255,255,.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- Universe ---------------- */
export function createUniverse(canvas, { mobile = false, reduce = false, worlds = [] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  let prCap = mobile ? 1.5 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
  renderer.setClearColor(0x04050a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 64 : 52, 1, .1, 420);

  const shared = { uTime: { value: 0 }, uPulse: { value: 0 }, uPR: { value: renderer.getPixelRatio() } };
  const GLOW = makeGlowTexture();
  const glow = (color, size, opacity = .55) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(size);
    return s;
  };
  const orbMat = (c1, c2, distort = 0) => new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uPulse: shared.uPulse, uColor: { value: new THREE.Color(c1) }, uColor2: { value: new THREE.Color(c2) }, uDistort: { value: distort } },
    vertexShader: ORB_V, fragmentShader: ORB_F,
  });
  const lineMat = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const circle = (r, seg = 160) => {
    const pts = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pts.push(V(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const pointsMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uPR: shared.uPR, uPulse: shared.uPulse },
    vertexShader: PTS_V, fragmentShader: PTS_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  /* ---- World anchors: one planet per project, alternating sides ---- */
  const SPACING = 28;
  const anchors = worlds.map((_, i) => V(i % 2 ? -7 : 7, i % 2 ? -1.5 : 1.5, -SPACING * (i + 1)));
  const G = V(0, -4, -SPACING * (worlds.length + 1) - 13);

  /* ---- Starfield ---- */
  {
    const n = mobile ? 1600 : 3600;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xcfe0ff), new THREE.Color(COLORS.teal), new THREE.Color(COLORS.violet), new THREE.Color(COLORS.sky)];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * 150;
      pos[i * 3 + 1] = (Math.random() - .5) * 95;
      pos[i * 3 + 2] = 40 - Math.random() * 230;
      const r = Math.random();
      const c = palette[r < .62 ? 0 : r < .82 ? 1 : r < .9 ? 2 : r < .96 ? 3 : 4];
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = .5 + Math.pow(Math.random(), 3) * 2.4;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    scene.add(new THREE.Points(geo, pointsMat()));
  }

  /* ---- Origin core (the studio) ---- */
  const core = new THREE.Group();
  scene.add(core);
  const coreBody = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, mobile ? 20 : 40), orbMat(COLORS.teal, COLORS.deep, .14));
  core.add(coreBody);
  const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.35, 1), new THREE.MeshBasicMaterial({ color: COLORS.teal, wireframe: true, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.add(coreShell);
  const coreGlow = glow(COLORS.teal, 11, .5);
  core.add(coreGlow);
  const orbits = [];
  [[3.4, .35, COLORS.teal], [4.4, -.5, COLORS.violet], [5.6, .9, COLORS.sky]].forEach(([r, tilt, c], i) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(tilt, 0, tilt * .6);
    pivot.add(new THREE.Line(circle(r), lineMat(c, .22)));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 12), new THREE.MeshBasicMaterial({ color: c }));
    const mg = glow(c, .9, .9);
    const holder = new THREE.Group();
    moon.position.x = r; mg.position.x = r;
    holder.add(moon, mg);
    pivot.add(holder);
    core.add(pivot);
    orbits.push({ holder, speed: .35 - i * .08 });
  });

  /* ---- Planet builders ---- */
  const dummy = new THREE.Object3D();
  const deepOf = (c) => new THREE.Color(c).multiplyScalar(.14).getHex();

  // Ringed planet (used for My moto by default)
  function ringPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, mobile ? 12 : 24), orbMat(color, deepOf(color), .05)));
    g.add(glow(color, 9, .42));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 3.6, 128, 1),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: shared.uTime, uIn: { value: 2.1 }, uOut: { value: 3.6 } },
        vertexShader: RING_V, fragmentShader: RING_F, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.set(-1.15, .25, .35);
    g.add(ring);
    const moonPivot = new THREE.Group();
    moonPivot.rotation.set(.4, 0, -.3);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 2), orbMat(new THREE.Color(color).lerp(new THREE.Color(0xffffff), .6).getHex(), deepOf(color), 0));
    moon.position.x = 4.6;
    moonPivot.add(moon);
    g.add(moonPivot);
    return { group: g, update(e) { ring.rotation.z = .35 + e * .08; moonPivot.rotation.y = e * .4; g.rotation.y = Math.sin(e * .2) * .15; } };
  }

  // Sound-wave planet (used for SyncSound by default)
  function wavePlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, mobile ? 12 : 24), orbMat(color, deepOf(color), .1)));
    g.add(glow(color, 8, .42));
    const waves = [];
    const waveGeo = new THREE.RingGeometry(.985, 1, 128, 1);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -1.2; m.rotation.y = .3;
      g.add(m);
      waves.push(m);
    }
    const BARS = 56;
    const eq = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, 1, .07), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }), BARS);
    const eqPivot = new THREE.Group();
    eqPivot.rotation.set(-1.2 + Math.PI / 2, .3, 0);
    eqPivot.add(eq);
    g.add(eqPivot);
    return {
      group: g,
      update(e) {
        waves.forEach((w, i) => {
          const ph = (e * .32 + i / waves.length) % 1;
          w.scale.setScalar(1.5 + ph * 4.2);
          w.material.opacity = (1 - ph) * .55;
        });
        for (let i = 0; i < BARS; i++) {
          const a = i / BARS * Math.PI * 2;
          const h = .25 + Math.abs(Math.sin(e * 3.1 + i * .7) * Math.sin(e * 1.7 + i * .23)) * 1.3;
          dummy.position.set(Math.cos(a) * 2.05, 0, Math.sin(a) * 2.05);
          dummy.rotation.set(0, -a, 0);
          dummy.scale.set(1, h, 1);
          dummy.updateMatrix();
          eq.setMatrixAt(i, dummy.matrix);
        }
        eq.instanceMatrix.needsUpdate = true;
        eqPivot.rotation.z = e * .1;
      },
    };
  }

  // Crystal in a cage (used for the vault by default)
  function crystalPlanet(color) {
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), orbMat(color, deepOf(color), 0));
    g.add(crystal);
    g.add(glow(color, 9, .45));
    const cage = new THREE.Mesh(new THREE.DodecahedronGeometry(2.7, 0), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(cage);
    const LOCKS = 14;
    const locks = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .16, .16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .55) }), LOCKS);
    const lockPivot = new THREE.Group();
    lockPivot.rotation.set(.5, 0, .25);
    lockPivot.add(locks);
    lockPivot.add(new THREE.Line(circle(3.6), lineMat(color, .18)));
    g.add(lockPivot);
    return {
      group: g,
      update(e) {
        crystal.rotation.y = e * .35;
        crystal.rotation.x = Math.sin(e * .5) * .25;
        cage.rotation.y = -e * .12;
        cage.rotation.x = e * .07;
        for (let i = 0; i < LOCKS; i++) {
          const a = i / LOCKS * Math.PI * 2 + e * .3;
          dummy.position.set(Math.cos(a) * 3.6, Math.sin(e * 2 + i) * .08, Math.sin(a) * 3.6);
          dummy.rotation.set(e + i, e * .6, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          locks.setMatrixAt(i, dummy.matrix);
        }
        locks.instanceMatrix.needsUpdate = true;
      },
    };
  }

  const BUILDERS = { ring: ringPlanet, waves: wavePlanet, crystal: crystalPlanet };
  const KINDS = Object.keys(BUILDERS);
  const planets = worlds.map((w, i) => {
    const build = BUILDERS[w.planet] || BUILDERS[KINDS[i % KINDS.length]];
    let color = COLORS.teal;
    try { color = new THREE.Color(w.accent || '#3cf2c8').getHex(); } catch {}
    const p = build(color);
    p.group.position.copy(anchors[i]);
    scene.add(p.group);
    return p;
  });

  /* ---- Galaxy (constellation) ---- */
  const galaxy = new THREE.Group();
  galaxy.position.copy(G);
  galaxy.rotation.x = .12;
  scene.add(galaxy);
  {
    const n = mobile ? 3200 : 7500;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    const inner = new THREE.Color(COLORS.teal), outer = new THREE.Color(COLORS.violet), hot = new THREE.Color(COLORS.amber), c = new THREE.Color();
    const ARMS = 4, R = 22;
    for (let i = 0; i < n; i++) {
      const r = Math.pow(Math.random(), 1.5) * R;
      const arm = (i % ARMS) / ARMS * Math.PI * 2;
      const ang = arm + r * .36;
      const spread = (1.2 - r / R) * .25 + .12;
      const rx = Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * r * spread;
      const ry = Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * r * spread * .45;
      const rz = Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * r * spread;
      pos.set([Math.cos(ang) * r + rx, ry, Math.sin(ang) * r + rz], i * 3);
      c.copy(inner).lerp(outer, r / R);
      if (Math.random() < .04) c.copy(hot);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = .5 + Math.pow(Math.random(), 4) * 2.2 + (r < 2 ? 1 : 0);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    galaxy.add(new THREE.Points(geo, pointsMat()));
    galaxy.add(glow(COLORS.teal, 16, .55));
    galaxy.add(glow(COLORS.violet, 34, .22));
  }

  /* ---- Warp lane through all worlds ---- */
  {
    const lanePts = [V(0, 0, 0)];
    anchors.forEach((a, i) => { lanePts.push(V(i % 2 ? 4 : -4, i % 2 ? 3 : -1, a.z + SPACING / 2), a); });
    lanePts.push(V(3, -2, G.z + 21), G);
    const curve = new THREE.CatmullRomCurve3(lanePts);
    const pts = curve.getPoints(mobile ? 500 : 900);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(pts.map((_, i) => i / (pts.length - 1))), 1));
    scene.add(new THREE.Line(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(COLORS.teal) } },
      vertexShader: LANE_V, fragmentShader: LANE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
  }

  /* ---- Camera keyframes ---- */
  let KF = [];
  let isMobileLayout = mobile;
  function buildKeyframes(m) {
    const side = m ? 0 : 3.2;
    const dy = m ? -2.4 : 0;
    const back = m ? 12.5 : 9;
    KF = [
      { pos: V(0, 0, m ? 13 : 10), look: V(m ? 0 : -3.4, dy, 0) },
      ...anchors.map((a, i) => {
        const s = i % 2 ? side : -side; // look past the planet so it sits opposite its panel
        return { pos: a.clone().add(V(0, 0, back)), look: a.clone().add(V(s, dy, 0)) };
      }),
      { pos: G.clone().add(V(0, 12, m ? 38 : 27)), look: G.clone().add(V(m ? 0 : -7, m ? -4 : 0, 0)) },
      { pos: G.clone().add(V(17, 5, 12)), look: G.clone() },
      { pos: G.clone().add(V(0, 2.4, 7)), look: G.clone().add(V(0, -1, -5)) },
      { pos: V(0, 48, G.z + 117), look: V(0, -8, G.z + 51) },
    ];
  }
  buildKeyframes(mobile);

  let tTarget = 0;
  const target = { pos: V(), look: V() };
  function sample(t) {
    const n = KF.length - 1;
    t = clamp(t, 0, n);
    const i = Math.min(Math.floor(t), n - 1);
    const f = smooth(.1, .9, t - i);
    target.pos.lerpVectors(KF[i].pos, KF[i + 1].pos, f);
    target.look.lerpVectors(KF[i].look, KF[i + 1].look, f);
    const arc = Math.sin(f * Math.PI);
    target.pos.y += arc * 2.6;
    target.pos.x += arc * (i % 2 ? -2.4 : 2.4);
  }
  sample(0);
  const curPos = target.pos.clone();
  const curLook = target.look.clone();
  camera.position.copy(curPos);
  camera.lookAt(curLook);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  /* ---- Resize ---- */
  let lastW = 0, lastH = 0;
  function resize(force = false) {
    const w = window.innerWidth, h = window.innerHeight;
    if (!force && w === lastW && Math.abs(h - lastH) < 120) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const m = w < 760;
    camera.fov = m ? 64 : 52;
    camera.updateProjectionMatrix();
    if (m !== isMobileLayout) { isMobileLayout = m; buildKeyframes(m); }
  }
  resize(true);
  window.addEventListener('resize', () => resize());

  /* ---- Loop ---- */
  const clock = new THREE.Clock();
  const timeScale = reduce ? .2 : 1;
  let elapsed = 0, frames = 0, slowAcc = 0, degraded = false, running = true;

  function tick() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), .05);
    elapsed += dt * timeScale;
    shared.uTime.value = elapsed;
    shared.uPulse.value *= Math.exp(-dt * 2.6);

    // adaptive quality
    frames++;
    if (!degraded && frames > 60 && frames < 240) {
      slowAcc += dt;
      if (frames === 239 && slowAcc / 179 > .024) {
        degraded = true;
        renderer.setPixelRatio(1);
        shared.uPR.value = 1;
        resize(true);
      }
    }

    // camera
    sample(tTarget);
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4);
    curPos.lerp(target.pos, k);
    curLook.lerp(target.look, k);
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
    camera.position.set(curPos.x + pointer.sx * .8, curPos.y + pointer.sy * .5, curPos.z);
    camera.lookAt(curLook);

    // core
    const e = elapsed;
    coreBody.rotation.y = e * .15;
    coreBody.rotation.x = Math.sin(e * .3) * .2;
    coreShell.rotation.y = -e * .1;
    coreShell.rotation.z = e * .05;
    coreGlow.material.opacity = .45 + Math.sin(e * 1.4) * .06 + shared.uPulse.value * .4;
    orbits.forEach((o) => { o.holder.rotation.y = e * o.speed; });

    planets.forEach((p) => p.update(e));

    // galaxy
    galaxy.rotation.y = e * .03;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);

  return {
    camera,
    setProgress(t) { tTarget = t; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    pulse(amount = 1) { shared.uPulse.value = Math.min(1.4, shared.uPulse.value + amount); },
    stop() { running = false; },
  };
}
