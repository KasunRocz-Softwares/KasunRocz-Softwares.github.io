// KasunRocz universe — Three.js scene.
// One studio core, one planet + environment per project (from projects.json), a galaxy,
// a cinematic intro, and a camera that travels a continuous spline as you scroll.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const COLORS = {
  teal: 0x3cf2c8,
  sky: 0x5cc8ff,
  violet: 0xb197fc,
  deep: 0x0b1030,
  bg: 0x04050a,
};

// Rendering budgets per device class. app.js picks the tier.
const TIERS = {
  high: { pr: 1.75, stars: 3600, galaxy: 7500, env: 1, detail: 40, aa: true, nebula: 4 },
  medium: { pr: 1.5, stars: 2200, galaxy: 4200, env: .6, detail: 24, aa: false, nebula: 3 },
  low: { pr: 1, stars: 1200, galaxy: 2200, env: .35, detail: 14, aa: false, nebula: 2 },
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

// Stars + galaxy. uReveal makes stars bloom in one by one during the intro.
const PTS_V = /* glsl */`
  attribute float aSize; attribute float aSeed; attribute vec3 aColor;
  uniform float uTime; uniform float uPR; uniform float uPulse; uniform float uReveal; uniform float uSpeed;
  varying vec3 vC; varying float vA;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * (1. + uSpeed * .7) * uPR * (70. / max(d, .1)), 0., 42.);
    float tw = .55 + .45 * sin(uTime * (.8 + aSeed * 2.) + aSeed * 40.);
    float rev = smoothstep(aSeed, aSeed + .08, uReveal * 1.1);
    vA = tw * rev * smoothstep(170., 30., d) * smoothstep(.4, 3., d) * (1. + uPulse * .9 + uSpeed * .5);
    vC = aColor;
  }`;
const PTS_F = /* glsl */`
  varying vec3 vC; varying float vA;
  void main(){
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, 0., d); a *= a;
    gl_FragColor = vec4(vC, a * vA);
  }`;

// Planet environments: particles that orbit (uSpin) and breathe (uAmp) around a world.
const ENV_V = /* glsl */`
  attribute float aSize; attribute float aSeed; attribute vec3 aColor;
  uniform float uTime; uniform float uPR; uniform float uAmp; uniform float uSpin; uniform float uReveal;
  varying vec3 vC; varying float vA;
  void main(){
    vec3 p = position;
    float ang = uTime * uSpin * (.6 + aSeed * .8);
    float c = cos(ang), s = sin(ang);
    p.xz = mat2(c, -s, s, c) * p.xz;
    p *= 1. + uAmp * sin(uTime * 2.6 + aSeed * 12.);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    gl_PointSize = clamp(aSize * uPR * (60. / max(d, .1)), 0., 36.);
    vA = (.55 + .45 * sin(uTime * 1.7 + aSeed * 30.)) * smoothstep(90., 10., d) * uReveal;
    vC = aColor;
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

// Radar disc: a rotating sweep with a fading trail over faint range rings.
const RADAR_F = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uIn; uniform float uOut;
  varying vec2 vP;
  void main(){
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float sweep = mod(a - uTime * 1.2, 6.28318) / 6.28318;
    float trail = pow(1. - sweep, 5.);
    float rings = smoothstep(.03, 0., abs(fract(r * 1.6) - .5) - .46);
    float edge = smoothstep(uOut, uOut - .3, r) * smoothstep(uIn, uIn + .3, r);
    gl_FragColor = vec4(uColor, (trail * .5 + rings * .14) * edge);
  }`;

const LANE_V = /* glsl */`
  attribute float aT; varying float vT;
  void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const LANE_F = /* glsl */`
  uniform float uTime; uniform vec3 uColor; uniform float uReveal; uniform float uSpeed; varying float vT;
  void main(){
    float d = fract(vT * 70. - uTime * (.55 + uSpeed * 2.));
    float a = smoothstep(0., .08, d) * smoothstep(.55, .08, d);
    gl_FragColor = vec4(uColor, (.05 + a * (.55 + uSpeed * .4)) * uReveal);
  }`;

/* ---------------- Helpers ---------------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOutCubic = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

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
export function createUniverse(canvas, { mobile = false, reduce = false, worlds = [], tier = 'high' } = {}) {
  const Q = TIERS[tier] || TIERS.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
  renderer.setClearColor(COLORS.bg, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 64 : 52, 1, .1, 420);

  const shared = {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uPR: { value: renderer.getPixelRatio() },
    uReveal: { value: reduce ? 1 : 0 },
    uSpeed: { value: 0 },
  };
  const GLOW = makeGlowTexture();
  const glow = (color, size, opacity = .55) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
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
  const pointsGeo = (n, fill) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    const c = new THREE.Color();
    const out = { x: 0, y: 0, z: 0, color: c, size: 1 };
    for (let i = 0; i < n; i++) {
      fill(i, out);
      pos.set([out.x, out.y, out.z], i * 3);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = out.size;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return geo;
  };
  const pointsMat = () => new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uPR: shared.uPR, uPulse: shared.uPulse, uReveal: shared.uReveal, uSpeed: shared.uSpeed },
    vertexShader: PTS_V, fragmentShader: PTS_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const envPoints = (n, fill, { spin = .05, amp = 0 } = {}) => new THREE.Points(
    pointsGeo(Math.max(40, Math.round(n * Q.env)), fill),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uPR: shared.uPR, uReveal: shared.uReveal, uSpin: { value: spin }, uAmp: { value: amp } },
      vertexShader: ENV_V, fragmentShader: PTS_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  // Coloured gas clouds behind a world — gives each project its own atmosphere.
  const nebula = (color) => {
    const g = new THREE.Group();
    const c1 = new THREE.Color(color);
    const c2 = c1.clone().offsetHSL(.07, 0, -.08);
    const c3 = c1.clone().offsetHSL(-.09, .05, -.12);
    [[c1, 2, -2, -8, 26, .1], [c2, -7, 3, -11, 30, .08], [c3, 8, -3, -12, 24, .07], [c1, -3, 5, -5, 16, .06]]
      .slice(0, Q.nebula)
      .forEach(([c, x, y, z, s, o]) => { const sp = glow(c, s, o); sp.position.set(x, y, z); g.add(sp); });
    return g;
  };

  /* ---- World anchors: one planet per project, alternating sides ---- */
  const SPACING = 28;
  const anchors = worlds.map((_, i) => V(i % 2 ? -7 : 7, i % 2 ? -1.5 : 1.5, -SPACING * (i + 1)));
  const G = V(0, -4, -SPACING * (worlds.length + 1) - 13);

  /* ---- Starfield ---- */
  {
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xcfe0ff), new THREE.Color(COLORS.teal), new THREE.Color(COLORS.violet), new THREE.Color(COLORS.sky)];
    const depth = 60 + SPACING * (worlds.length + 2) + 40;
    const geo = pointsGeo(Q.stars, (i, o) => {
      o.x = (Math.random() - .5) * 150;
      o.y = (Math.random() - .5) * 95;
      o.z = 40 - Math.random() * depth;
      const r = Math.random();
      o.color.copy(palette[r < .62 ? 0 : r < .82 ? 1 : r < .9 ? 2 : r < .96 ? 3 : 4]);
      o.size = .5 + Math.pow(Math.random(), 3) * 2.4;
    });
    scene.add(new THREE.Points(geo, pointsMat()));
  }

  /* ---- Origin core (the studio) + intro effects ---- */
  const core = new THREE.Group();
  scene.add(core);
  const coreBody = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, Q.detail), orbMat(COLORS.teal, COLORS.deep, .14));
  core.add(coreBody);
  const coreShell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.35, 1), new THREE.MeshBasicMaterial({ color: COLORS.teal, wireframe: true, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.add(coreShell);
  const coreGlow = glow(COLORS.teal, 11, .5);
  core.add(coreGlow);
  const orbits = [];
  [[3.4, .35, COLORS.teal], [4.4, -.5, COLORS.violet], [5.6, .9, COLORS.sky]].forEach(([r, tilt, c], i) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(tilt, 0, tilt * .6);
    const line = new THREE.Line(circle(r), lineMat(c, .22));
    pivot.add(line);
    const holder = new THREE.Group();
    const moon = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true }));
    const mg = glow(c, .9, .9);
    moon.position.x = r; mg.position.x = r;
    holder.add(moon, mg);
    pivot.add(holder);
    scene.add(pivot);
    orbits.push({ holder, line, moon, mg, speed: .35 - i * .08 });
  });
  const flash = glow(0xe8fffa, 30, 0);
  scene.add(flash);
  const shockMat = new THREE.MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const shock = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 160, 1), shockMat);
  const shock2 = new THREE.Mesh(shock.geometry, shockMat.clone());
  shock2.material.color.set(COLORS.violet);
  shock2.rotation.x = 1.1;
  scene.add(shock, shock2);

  /* ---- Planet builders: each returns { group, update(e) } with its own environment ---- */
  const dummy = new THREE.Object3D();
  const deepOf = (c) => new THREE.Color(c).multiplyScalar(.14).getHex();
  const lighter = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k);

  // Mobility: ringed planet, asteroid belt, one moon.
  function ringPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .05)));
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
    const beltPivot = new THREE.Group();
    beltPivot.rotation.set(-1.15 + Math.PI / 2, .25, .35);
    const warm = lighter(color, .55);
    beltPivot.add(envPoints(1100, (i, o) => {
      const a = Math.random() * Math.PI * 2;
      const r = 4.1 + Math.pow(Math.random(), .7) * 2;
      o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = (Math.random() - .5) * .3;
      o.color.copy(Math.random() < .7 ? new THREE.Color(color) : warm);
      o.size = .35 + Math.pow(Math.random(), 3) * 1.6;
    }, { spin: .09 }));
    g.add(beltPivot);
    const moonPivot = new THREE.Group();
    moonPivot.rotation.set(.4, 0, -.3);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 2), orbMat(lighter(color, .6).getHex(), deepOf(color), 0));
    moon.position.x = 6.6;
    moonPivot.add(moon);
    g.add(moonPivot);
    g.add(nebula(color));
    return { group: g, update(e) { ring.rotation.z = .35 + e * .08; moonPivot.rotation.y = e * .4; g.rotation.y = Math.sin(e * .2) * .15; } };
  }

  // Audio: pulsing sound waves, an equalizer ring, and a breathing spectrum shell.
  function wavePlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .1)));
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
    const hi = lighter(color, .6);
    g.add(envPoints(900, (i, o) => {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const r = 5.4 + (Math.random() - .5) * .8;
      o.x = s * Math.cos(a) * r; o.y = u * r; o.z = s * Math.sin(a) * r;
      o.color.copy(Math.random() < .75 ? new THREE.Color(color) : hi);
      o.size = .35 + Math.pow(Math.random(), 3) * 1.4;
    }, { spin: .04, amp: .07 }));
    g.add(nebula(color));
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

  // Security: faceted crystal, wireframe cage, orbiting locks, drifting shards.
  function crystalPlanet(color) {
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), orbMat(color, deepOf(color), 0));
    g.add(crystal);
    g.add(glow(color, 9, .45));
    const cage = new THREE.Mesh(new THREE.DodecahedronGeometry(2.7, 0), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(cage);
    const LOCKS = 14;
    const locks = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .16, .16), new THREE.MeshBasicMaterial({ color: lighter(color, .55) }), LOCKS);
    const lockPivot = new THREE.Group();
    lockPivot.rotation.set(.5, 0, .25);
    lockPivot.add(locks);
    lockPivot.add(new THREE.Line(circle(3.6), lineMat(color, .18)));
    g.add(lockPivot);
    const SHARDS = Math.max(8, Math.round(26 * Q.env));
    const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.14, 0), new THREE.MeshBasicMaterial({ color: lighter(color, .3), transparent: true, opacity: .75 }), SHARDS);
    const shardData = Array.from({ length: SHARDS }, () => ({ r: 5 + Math.random() * 3.5, a: Math.random() * Math.PI * 2, y: (Math.random() - .5) * 5, s: .5 + Math.random() * 1.2, w: (Math.random() < .5 ? -1 : 1) * (.05 + Math.random() * .08) }));
    g.add(shards);
    g.add(envPoints(500, (i, o) => {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 3;
      o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = (Math.random() - .5) * 7;
      o.color.copy(lighter(color, Math.random() * .5));
      o.size = .3 + Math.pow(Math.random(), 3) * 1.2;
    }, { spin: -.03 }));
    g.add(nebula(color));
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
        shardData.forEach((d, i) => {
          const a = d.a + e * d.w;
          dummy.position.set(Math.cos(a) * d.r, d.y + Math.sin(e * .6 + i) * .3, Math.sin(a) * d.r);
          dummy.rotation.set(e * .7 + i, e * .4 + i * 2, 0);
          dummy.scale.setScalar(d.s);
          dummy.updateMatrix();
          shards.setMatrixAt(i, dummy.matrix);
        });
        shards.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // Monitoring: a watched globe, a radar sweep, server blips and orbiting satellites.
  function radarPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .03)));
    g.add(glow(color, 8, .4));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.8, 18, 12), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(shell);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 4.8, 128, 1),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uTime: shared.uTime, uIn: { value: 2.2 }, uOut: { value: 4.8 } },
        vertexShader: RING_V, fragmentShader: RADAR_F, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    disc.rotation.set(-1.25, 0, .2);
    g.add(disc);
    const status = [new THREE.Color(0x3cf2c8), new THREE.Color(0xffb547), new THREE.Color(color)];
    const blipPivot = new THREE.Group();
    blipPivot.rotation.set(-1.25 + Math.PI / 2, 0, .2);
    blipPivot.add(envPoints(420, (i, o) => {
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 2.2;
      o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = (Math.random() - .5) * .12;
      const k = Math.random();
      o.color.copy(status[k < .7 ? 0 : k < .9 ? 1 : 2]);
      o.size = .5 + Math.pow(Math.random(), 3) * 1.8;
    }, { spin: .02 }));
    g.add(blipPivot);
    const sats = [0x3cf2c8, 0x3cf2c8, 0xffb547, color].map((c, i) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(.3 + i * .5, i * 1.3, -.2 + i * .25);
      const m = new THREE.Mesh(new THREE.BoxGeometry(.16, .16, .16), new THREE.MeshBasicMaterial({ color: c }));
      const gl = glow(c, .9, .8);
      m.position.x = gl.position.x = 3 + i * .45;
      pivot.add(m, gl);
      g.add(pivot);
      return { pivot, m, gl, speed: .5 - i * .08, alarm: c === color };
    });
    g.add(nebula(color));
    return {
      group: g,
      update(e) {
        shell.rotation.y = e * .12;
        sats.forEach((s, i) => {
          s.pivot.rotation.y = i * 1.3 + e * s.speed;
          s.m.rotation.set(e, e * .7, 0);
          if (s.alarm) s.gl.material.opacity = .45 + .45 * Math.sin(e * 6);
        });
      },
    };
  }

  // Quality: a dependency graph. Nodes coloured by test status; pulses run along edges.
  function graphPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .04)));
    g.add(glow(color, 8, .4));
    const net = new THREE.Group();
    g.add(net);
    const shellGeo = new THREE.IcosahedronGeometry(3, 1);
    net.add(new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo), lineMat(color, .3)));
    const pos = shellGeo.getAttribute('position');
    const verts = [];
    for (let i = 0; i < pos.count; i++) {
      const v = V(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (!verts.some((u) => u.distanceTo(v) < .01)) verts.push(v);
    }
    const statusCols = [color, color, color, 0xffb547, 0xff5d6c];
    const alarms = [];
    verts.forEach((v, i) => {
      const c = statusCols[i % statusCols.length];
      const m = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 10), new THREE.MeshBasicMaterial({ color: c }));
      m.position.copy(v);
      const gl = glow(c, .7, .8);
      gl.position.copy(v);
      net.add(m, gl);
      if (c === 0xff5d6c) alarms.push(gl);
    });
    const pairs = [];
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) if (verts[i].distanceTo(verts[j]) < 2.2) pairs.push([verts[i], verts[j]]);
    }
    const pulses = Array.from({ length: Math.max(6, Math.round(16 * Q.env)) }, () => {
      const sp = glow(lighter(color, .55), .45, .95);
      net.add(sp);
      return { sp, pair: pairs[(Math.random() * pairs.length) | 0], u: Math.random(), speed: .35 + Math.random() * .4 };
    });
    g.add(nebula(color));
    let last = 0;
    return {
      group: g,
      update(e) {
        const dt = Math.min(.05, Math.max(0, e - last));
        last = e;
        net.rotation.y = e * .08;
        net.rotation.x = Math.sin(e * .2) * .1;
        pulses.forEach((p) => {
          p.u += dt * p.speed;
          if (p.u >= 1) { p.u = 0; p.pair = pairs[(Math.random() * pairs.length) | 0]; }
          p.sp.position.lerpVectors(p.pair[0], p.pair[1], p.u);
          p.sp.material.opacity = Math.sin(p.u * Math.PI) * .95;
        });
        alarms.forEach((gl) => { gl.material.opacity = .45 + .45 * Math.sin(e * 5); });
      },
    };
  }

  // Release documentation: page cards orbit the core like a release history; in turn the front-left
  // card is published — it lights up, a stamp ripple spreads from it and a beam links it to the core.
  // Matches the hero on the DocPulse site (kr-hero.js, kind "pages").
  function pagesPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .03)));
    g.add(glow(color, 8, .4));
    const light = lighter(color, .55);
    const pc = document.createElement('canvas'); pc.width = 128; pc.height = 164;
    const px = pc.getContext('2d');
    const box = (x, y, w, h, r) => { px.beginPath(); if (px.roundRect) px.roundRect(x, y, w, h, r); else px.rect(x, y, w, h); };
    px.fillStyle = 'rgba(255,255,255,.14)'; box(4, 4, 120, 156, 12); px.fill();
    px.strokeStyle = 'rgba(255,255,255,.95)'; px.lineWidth = 4; box(4, 4, 120, 156, 12); px.stroke();
    px.fillStyle = 'rgba(255,255,255,.95)'; box(16, 18, 48, 14, 7); px.fill();
    px.fillStyle = 'rgba(255,255,255,.55)';
    [46, 62, 78, 94, 110].forEach((y, i) => { box(16, y, i % 2 ? 66 : 96, 7, 3.5); px.fill(); });
    px.fillStyle = 'rgba(255,255,255,.9)'; px.beginPath(); px.arc(102, 138, 10, 0, Math.PI * 2); px.fill();
    const pageTex = new THREE.CanvasTexture(pc);
    const add = (c, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });
    const N = 9, R = 3.3;
    const orbit = new THREE.Group();
    orbit.rotation.set(.34, 0, -.14);
    g.add(orbit);
    orbit.add(new THREE.Line(circle(R), lineMat(color, .22)));
    const cardGeo = new THREE.PlaneGeometry(.95, 1.22);
    const cards = Array.from({ length: N }, (_, i) => {
      const a = i / N * Math.PI * 2;
      const m = new THREE.Mesh(cardGeo, add(color, .5, { map: pageTex }));
      m.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      m.rotation.y = Math.PI / 2 - a;
      orbit.add(m);
      return m;
    });
    const ripple = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 64), add(light, 0));
    const stamp = glow(light, 1.6, 0);
    const beamGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
    const beam = new THREE.Line(beamGeo, lineMat(light, 0));
    orbit.add(beam);
    const dustPivot = new THREE.Group();
    dustPivot.rotation.set(.34, 0, -.14);
    dustPivot.add(envPoints(600, (i, o) => {
      const a = Math.random() * Math.PI * 2, r = 4.7 + Math.random() * 1.6;
      o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = (Math.random() - .5) * .25;
      o.color.copy(Math.random() < .7 ? new THREE.Color(color) : light);
      o.size = .4 + Math.pow(Math.random(), 3) * 1.4;
    }, { spin: .03 }));
    g.add(dustPivot);
    g.add(nebula(color));
    const P = 2.6, wp = V(0, 0, 0), cp = V(0, 0, 0);
    let cycle = -1, lit = cards[0];
    return {
      group: g,
      update(e) {
        orbit.rotation.y = e * .16;
        const k = Math.floor(e / P), ph = (e % P) / P;
        if (k !== cycle) {
          cycle = k;
          let best = -Infinity;
          orbit.getWorldPosition(cp).applyMatrix4(camera.matrixWorldInverse);
          cards.forEach((m) => {
            m.getWorldPosition(wp).applyMatrix4(camera.matrixWorldInverse);
            const score = (wp.z - cp.z) - (wp.x - cp.x) * 1.4;
            if (score > best) { best = score; lit = m; }
          });
          lit.add(ripple, stamp);
          beamGeo.attributes.position.setXYZ(1, lit.position.x, lit.position.y, lit.position.z);
          beamGeo.attributes.position.needsUpdate = true;
        }
        const pulse = ph < .12 ? ph / .12 : Math.pow(1 - (ph - .12) / .88, 2);
        cards.forEach((m) => { const on = m === lit ? pulse : 0; m.material.opacity = .42 + on * .55; m.scale.setScalar(1 + on * .16); });
        ripple.scale.setScalar(.5 + ph * 1.05);
        ripple.material.opacity = (1 - ph) * .7;
        stamp.material.opacity = pulse * .9;
        beam.material.opacity = pulse * .6;
      },
    };
  }

  // Diagnostics: a lens over a data world. A scan sweeps the glass while a ring of bars (storage and
  // load) rises and falls around it. Matches the hero on the Qulaxy Lens site (kr-hero.js, kind "lens").
  function lensPlanet(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, Math.round(Q.detail * .6)), orbMat(color, deepOf(color), .04)));
    g.add(glow(color, 8, .4));
    const light = lighter(color, .55);
    const add = (c, opacity) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const lens = new THREE.Group();
    lens.rotation.set(.18, -.5, .08);
    lens.position.z = .4;
    g.add(lens);
    lens.add(new THREE.Mesh(new THREE.TorusGeometry(2.5, .055, 12, 160), add(light, .85)));
    lens.add(new THREE.Mesh(new THREE.TorusGeometry(2.62, .015, 8, 160), add(color, .5)));
    const uTime = { value: 0 };
    lens.add(new THREE.Mesh(new THREE.CircleGeometry(2.48, 96), new THREE.ShaderMaterial({
      uniforms: { uTime, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vP;
        void main(){ float r = length(vP) / 2.48;
          float edge = smoothstep(.55, 1., r);
          float sweep = mod(atan(vP.y, vP.x) - uTime * .9, 6.2831853);
          float trail = exp(-sweep * 2.2);
          float grid = smoothstep(.04, 0., abs(fract(vP.x * 1.6) - .5) - .47) + smoothstep(.04, 0., abs(fract(vP.y * 1.6) - .5) - .47);
          gl_FragColor = vec4(uColor, edge * .16 + trail * .22 * (1. - r * .4) + grid * .035); }`,
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    const glint = glow(light, 1.4, .8);
    glint.position.set(-1.6, 1.7, .05);
    lens.add(glint);
    const BARS = 56, R = 3.55;
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, 1, .07), add(color, .5), BARS);
    const barPivot = new THREE.Group();
    barPivot.rotation.set(.32, 0, -.12);
    barPivot.add(bars);
    g.add(barPivot);
    const dustPivot = new THREE.Group();
    dustPivot.rotation.set(.32, 0, -.12);
    dustPivot.add(envPoints(600, (i, o) => {
      const a = Math.random() * Math.PI * 2, r = 4.4 + Math.random() * 2;
      o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = (Math.random() - .5) * .25;
      o.color.copy(Math.random() < .7 ? new THREE.Color(color) : light);
      o.size = .4 + Math.pow(Math.random(), 3) * 1.4;
    }, { spin: .03 }));
    g.add(dustPivot);
    g.add(nebula(color));
    return {
      group: g,
      update(e) {
        uTime.value = e;
        lens.rotation.y = -.5 + Math.sin(e * .25) * .18;
        lens.rotation.x = .18 + Math.sin(e * .31) * .06;
        barPivot.rotation.y = e * .12;
        for (let i = 0; i < BARS; i++) {
          const a = i / BARS * Math.PI * 2;
          const h = .25 + .9 * Math.pow(.5 + .5 * Math.sin(e * 1.3 + i * .55) * Math.sin(e * .7 + i * .21), 2);
          dummy.position.set(Math.cos(a) * R, h / 2 - .2, Math.sin(a) * R);
          dummy.scale.set(1, h, 1);
          dummy.rotation.set(0, -a, 0);
          dummy.updateMatrix();
          bars.setMatrixAt(i, dummy.matrix);
        }
        bars.instanceMatrix.needsUpdate = true;
      },
    };
  }

  const BUILDERS = { ring: ringPlanet, waves: wavePlanet, crystal: crystalPlanet, radar: radarPlanet, graph: graphPlanet, pages: pagesPlanet, lens: lensPlanet };
  const KINDS = Object.keys(BUILDERS);
  const worldColors = [];
  const planets = worlds.map((w, i) => {
    const build = BUILDERS[w.planet] || BUILDERS[KINDS[i % KINDS.length]];
    let color = COLORS.teal;
    try { color = new THREE.Color(w.accent || '#3cf2c8').getHex(); } catch { /* keep teal */ }
    worldColors.push(color);
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
    const inner = new THREE.Color(COLORS.teal), outer = new THREE.Color(COLORS.violet);
    const hot = worldColors.map((c) => new THREE.Color(c));
    const ARMS = 4, R = 22;
    galaxy.add(new THREE.Points(pointsGeo(Q.galaxy, (i, o) => {
      const r = Math.pow(Math.random(), 1.5) * R;
      const ang = (i % ARMS) / ARMS * Math.PI * 2 + r * .36;
      const spread = (1.2 - r / R) * .25 + .12;
      const j = () => Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * r * spread;
      o.x = Math.cos(ang) * r + j(); o.y = j() * .45; o.z = Math.sin(ang) * r + j();
      o.color.copy(inner).lerp(outer, r / R);
      if (hot.length && Math.random() < .05) o.color.copy(hot[(Math.random() * hot.length) | 0]);
      o.size = .5 + Math.pow(Math.random(), 4) * 2.2 + (r < 2 ? 1 : 0);
    }), pointsMat()));
    galaxy.add(glow(COLORS.teal, 16, .55));
    galaxy.add(glow(COLORS.violet, 34, .22));
  }

  /* ---- Warp lane through all worlds ---- */
  {
    const lanePts = [V(0, 0, 0)];
    anchors.forEach((a, i) => { lanePts.push(V(i % 2 ? 4 : -4, i % 2 ? 3 : -1, a.z + SPACING / 2), a); });
    lanePts.push(V(3, -2, G.z + 21), G);
    const curve = new THREE.CatmullRomCurve3(lanePts);
    const pts = curve.getPoints(tier === 'low' ? 400 : 900);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(pts.map((_, i) => i / (pts.length - 1))), 1));
    scene.add(new THREE.Line(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(COLORS.teal) }, uReveal: shared.uReveal, uSpeed: shared.uSpeed },
      vertexShader: LANE_V, fragmentShader: LANE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
  }

  /* ---- Camera path: a continuous spline through every stop ---- */
  const bg = new THREE.Color(COLORS.bg);
  // Mix in sRGB so a small k stays a subtle tint (mixing in linear space brightens it a lot).
  const tintOf = (c, k) => bg.clone().convertLinearToSRGB().lerp(new THREE.Color(c).convertLinearToSRGB(), k).convertSRGBToLinear();
  let KF = [];
  let posCurve = null;
  let lookCurve = null;
  let isMobileLayout = mobile;
  function buildPath(m) {
    const side = m ? 0 : 3.2;
    const dy = m ? -2.4 : 0;
    const back = m ? 12.5 : 9;
    KF = [
      { pos: V(0, 0, m ? 13 : 10), look: V(m ? 0 : -3.4, dy, 0), tint: tintOf(COLORS.teal, .03) },
      ...anchors.map((a, i) => ({
        pos: a.clone().add(V(0, 0, back)),
        look: a.clone().add(V(i % 2 ? side : -side, dy, 0)), // look past the planet so it sits opposite its panel
        tint: tintOf(worldColors[i], .07),
      })),
      { pos: G.clone().add(V(0, 12, m ? 38 : 27)), look: G.clone().add(V(m ? 0 : -7, m ? -4 : 0, 0)), tint: tintOf(COLORS.violet, .05) },
      { pos: G.clone().add(V(17, 5, 12)), look: G.clone(), tint: tintOf(COLORS.violet, .06) },
      { pos: G.clone().add(V(0, 2.4, 7)), look: G.clone().add(V(0, -1, -5)), tint: tintOf(COLORS.teal, .05) },
      { pos: V(0, 48, G.z + 117), look: V(0, -8, G.z + 51), tint: tintOf(COLORS.sky, .03) },
    ];
    posCurve = new THREE.CatmullRomCurve3(KF.map((k) => k.pos), false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(KF.map((k) => k.look), false, 'centripetal');
  }
  buildPath(mobile);

  let tTarget = 0;
  const target = { pos: V(), look: V(), tint: new THREE.Color() };
  function sample(t) {
    const n = KF.length - 1;
    t = clamp(t, 0, n);
    const i = Math.min(Math.floor(t), n - 1);
    const f = smooth(.06, .94, t - i); // brief dwell at each stop, continuous glide between
    posCurve.getPoint((i + f) / n, target.pos);
    lookCurve.getPoint((i + f) / n, target.look);
    target.tint.copy(KF[i].tint).lerp(KF[i + 1].tint, f);
  }
  sample(0);
  const curPos = target.pos.clone();
  const curLook = target.look.clone();
  const curTint = target.tint.clone();
  const prevPos = curPos.clone();
  const vel = V();
  const right = V();
  camera.position.copy(curPos);
  camera.lookAt(curLook);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  /* ---- Resize ---- */
  let lastW = 0, lastH = 0, baseFov = mobile ? 64 : 52;
  function resize(force = false) {
    const w = window.innerWidth, h = window.innerHeight;
    if (!force && w === lastW && Math.abs(h - lastH) < 120) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const m = w < 760;
    baseFov = m ? 64 : 52;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    if (m !== isMobileLayout) { isMobileLayout = m; buildPath(m); }
  }
  resize(true);
  window.addEventListener('resize', () => resize());

  /* ---- Intro state ---- */
  let introT = reduce ? 1 : 0;
  let introDur = 3.6;
  let introPlaying = false;
  let introStart = 0;
  let ignited = reduce;

  /* ---- Loop ---- */
  const clock = new THREE.Clock();
  let timeScale = reduce ? .2 : 1;
  let elapsed = 0, frames = 0, slowAcc = 0, degraded = false, roll = 0, speed = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), .05);
    elapsed += dt * timeScale;
    shared.uTime.value = elapsed;
    shared.uPulse.value *= Math.exp(-dt * 2.6);

    // adaptive quality: drop resolution if the first seconds run slow
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

    // intro timeline
    if (introPlaying) {
      // wall-clock time, so a slow device stays in step with the page's own intro timers
      introT = Math.min(1, (performance.now() - introStart) / 1000 / introDur);
      if (introT >= 1) introPlaying = false;
    }
    const it = introT;
    shared.uReveal.value = smooth(0, .62, it);
    const ign = smooth(.28, .64, it);
    core.scale.setScalar(Math.max(.001, easeOutBack(ign)));
    if (!ignited && it > .3) { ignited = true; shared.uPulse.value = 1.3; }
    flash.material.opacity = smooth(.26, .32, it) * (1 - smooth(.32, .62, it)) * .9;
    flash.scale.setScalar(8 + 34 * smooth(.28, .62, it));
    const sp = smooth(.3, .82, it);
    const shockOn = it > .3 && it < 1 ? 1 : 0;
    shock.scale.setScalar(1 + sp * 40);
    shock.material.opacity = (1 - sp) * .8 * shockOn;
    const sp2 = smooth(.36, .9, it);
    shock2.scale.setScalar(1 + sp2 * 28);
    shock2.material.opacity = (1 - sp2) * .6 * (it > .36 && it < 1 ? 1 : 0);
    const orbitIn = smooth(.55, .92, it);
    orbits.forEach((o) => {
      o.line.material.opacity = .22 * orbitIn;
      o.moon.material.opacity = orbitIn;
      o.mg.material.opacity = .9 * orbitIn;
    });

    // camera travel
    sample(tTarget);
    const k = reduce ? 1 : 1 - Math.exp(-dt * 2.4);
    curPos.lerp(target.pos, k);
    curLook.lerp(target.look, k);
    curTint.lerp(target.tint, 1 - Math.exp(-dt * 2));
    renderer.setClearColor(curTint, 1);

    vel.subVectors(curPos, prevPos).divideScalar(Math.max(dt, 1e-3));
    prevPos.copy(curPos);
    speed += (clamp(vel.length() / 45, 0, 1) - speed) * (1 - Math.exp(-dt * 4));
    shared.uSpeed.value = reduce ? 0 : speed;

    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
    const off = 1 - easeInOutCubic(it); // intro: start far out and swoop in
    camera.position.set(
      curPos.x + pointer.sx * .8 + Math.sin(off * 1.3) * 22 * off,
      curPos.y + pointer.sy * .5 + 9 * off,
      curPos.z + 70 * off,
    );
    camera.lookAt(curLook);
    // bank into lateral motion, like a ship turning
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    const lateral = reduce ? 0 : clamp(-vel.dot(right) * .006, -.22, .22);
    roll += (lateral + off * .35 - roll) * (1 - Math.exp(-dt * 3));
    camera.rotateZ(roll);
    const fov = baseFov + (reduce ? 0 : speed * 9) + off * 12;
    if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    // core
    const e = elapsed;
    coreBody.rotation.y = e * .15;
    coreBody.rotation.x = Math.sin(e * .3) * .2;
    coreShell.rotation.y = -e * .1;
    coreShell.rotation.z = e * .05;
    coreGlow.material.opacity = (.45 + Math.sin(e * 1.4) * .06 + shared.uPulse.value * .4) * Math.min(1, ign * 1.5);
    orbits.forEach((o) => { o.holder.rotation.y = e * o.speed; });

    planets.forEach((p) => p.update(e));
    galaxy.rotation.y = e * .03;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // Compile every shader now (while the loader is up) so the first frames don't stutter.
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);

  return {
    camera,
    setProgress(t) { tTarget = t; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    pulse(amount = 1) { shared.uPulse.value = Math.min(1.4, shared.uPulse.value + amount); },
    // Plays the cinematic entrance. Returns its duration in seconds (0 when motion is reduced).
    intro(fast = false) {
      if (reduce) { introT = 1; return 0; }
      introDur = fast ? 1.8 : 3.6;
      introT = 0;
      introStart = performance.now();
      ignited = false;
      introPlaying = true;
      return introDur;
    },
    setReduced(b) {
      reduce = b;
      timeScale = b ? .2 : 1;
      if (b) { introT = 1; introPlaying = false; }
    },
  };
}
