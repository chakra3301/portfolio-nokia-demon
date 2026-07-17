/**
 * ARCHIVE FIELD — a fullscreen WebGL Voronoi force-field of film-poster cells.
 *
 * Our own take on the voroforce technique (gnovotny/nothing-to-watch — its GLSL
 * is CC-BY-NC-SA, so none of it is copied here). Two halves:
 *
 *   1. A force SIMULATION (plain JS) moves a near-regular lattice of cell sites.
 *      The cursor injects a radial force that shoves neighbouring sites outward,
 *      clearing a large cell under the pointer — that is what balloons the focused
 *      poster and makes the whole field jostle with liquid momentum. Displacements
 *      are uploaded to a small float data-texture each frame.
 *
 *   2. A Voronoi fragment shader (IQ's two-pass nearest-site + border metric, our
 *      own code) tessellates those sites into organic polygon cells. Each cell
 *      shows its poster under a convex glass dome (lit + bulged), separated by
 *      thin glossy bevels, receding to black at the edges.
 *
 * One extra WebGL2 context, only rendering while the archive is on screen. Falls
 * back to null (caller keeps the accessible dither grid) when WebGL2 is absent,
 * reduced-motion is set, or the viewport is too small for a hover field.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
  in vec2 position;
  out vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uCursor;      // 0..1, smoothed
  uniform float uFocus;      // 0..1 — how "engaged" the lens is
  uniform float uActive;     // 0..1 fade in/out
  uniform sampler2D uAtlas;
  uniform vec2 uAtlasGrid;   // cols, rows in the poster atlas
  uniform float uCount;      // number of real posters
  uniform vec2 uGrid;        // Voronoi lattice resolution (cols, rows)
  uniform sampler2D uSites;  // per-cell displacement (xy), grid units
  uniform float uPick;       // 1.0 → output encoded poster id for readback
  uniform float uIntro;      // 0 → collapsed vortex, 1 → settled field

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  vec3 sampleCell(vec2 acell, vec2 uv) {
    return texture(uAtlas, (acell + clamp(uv, 0.0, 1.0)) / uAtlasGrid).rgb;
  }
  // actual position of the site owning grid-cell gc (base centre + displacement)
  vec2 siteOf(vec2 gc) {
    vec2 gcl = clamp(gc, vec2(0.0), uGrid - 1.0);
    vec2 disp = texture(uSites, (gcl + 0.5) / uGrid).xy;
    return gcl + 0.5 + disp;
  }

  void main() {
    float aspect = uRes.x / uRes.y;

    // radial force-lens — a soft magnifier over the cursor. The heavy lifting is
    // done by the simulation (which physically grows the focused cell); this just
    // adds a touch of optical zoom on top.
    vec2 duv = (vUv - uCursor); duv.x *= aspect;
    float r = length(duv);
    float lensMag = 0.34 * exp(-r * r / (2.0 * 0.22 * 0.22));
    float mag = 1.0 - uFocus * lensMag;
    vec2 p = uCursor + (vUv - uCursor) * mag;

    // intro — the whole field spins up into a bright pinwheel vortex, then unwinds
    if (uIntro < 0.999) {
      vec2 c = p - 0.5; c.x *= aspect;
      float rad = length(c);
      float ang = atan(c.y, c.x);
      float inv = 1.0 - uIntro;
      ang += inv * (2.0 + 3.4 / (rad + 0.16));
      rad *= mix(0.70, 1.0, uIntro);
      c = vec2(cos(ang), sin(ang)) * rad;
      c.x /= aspect;
      p = 0.5 + c;
    }

    // into lattice space (cells are ~square on screen because uGrid tracks aspect)
    vec2 gp = p * uGrid;
    vec2 gi = floor(gp);

    // pass 1 — nearest site (the Voronoi cell this pixel belongs to)
    vec2 nRel = vec2(8.0);      // vector gp → nearest site
    vec2 nCell = gi;
    float md = 64.0;
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 gc = gi + vec2(float(i), float(j));
      vec2 rel = siteOf(gc) - gp;
      float d = dot(rel, rel);
      if (d < md) { md = d; nRel = rel; nCell = clamp(gc, vec2(0.0), uGrid - 1.0); }
    }

    // pass 2 — distance to the nearest Voronoi border (IQ metric)
    float border = 8.0;
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 gc = gi + vec2(float(i), float(j));
      vec2 rel = siteOf(gc) - gp;
      vec2 diff = rel - nRel;
      float dd = dot(diff, diff);
      if (dd > 1e-4) border = min(border, dot(0.5 * (nRel + rel), normalize(diff)));
    }

    // poster id for this cell
    float k = floor(hash1(nCell + 0.5) * uCount);
    k = clamp(k, 0.0, uCount - 1.0);
    if (uPick > 0.5) { fragColor = vec4(k / 255.0, 0.0, 0.0, 1.0); return; }
    vec2 acell = vec2(mod(k, uAtlasGrid.x), floor(k / uAtlasGrid.x));

    // per-cell engagement — how close this cell's site is to the cursor
    vec2 siteUv = (nCell + 0.5) / uGrid;
    vec2 cd = (siteUv - uCursor); cd.x *= aspect;
    float cellFoc = exp(-dot(cd, cd) / (2.0 * 0.24 * 0.24)) * uFocus;

    // gap between cells + the poster inset from the bevel
    float gap  = smoothstep(0.0, 0.02, border - 0.028);       // 0 in the gutter
    float dome = smoothstep(0.0, 0.42, border);               // 0 edge → 1 centre

    // convex glass dome: height peaks at the cell centre, lights + bulges the poster
    float h = sqrt(clamp(dome, 0.0, 1.0));
    float hs = 1.7;
    vec3 nrm = normalize(vec3(-dFdx(h) * hs, -dFdy(h) * hs, 1.0));
    vec2 lean = (uCursor - siteUv); lean.x *= aspect;
    nrm = normalize(nrm + vec3(lean * 1.1 * cellFoc, 0.0));
    vec3 L = normalize(vec3(-0.36, 0.5, 0.82));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float diff = 0.72 + 0.34 * max(dot(nrm, L), 0.0);
    float spec = pow(max(dot(nrm, H), 0.0), 36.0);

    // poster sampled inside the cell, magnified a little by the dome (glass bulge)
    vec2 luv = 0.5 - nRel;                                     // ~[0,1] within the cell
    vec2 rc = luv - 0.5;
    float bulge = 0.86 + 0.34 * dot(rc, rc);                   // <1 centre zoom, >1 rim
    vec2 duvS = 0.5 + rc * bulge;
    vec2 caDir = rc * (1.0 - h) * 0.010;                       // faint rim fringe
    vec3 img;
    img.r = sampleCell(acell, duvS + caDir).r;
    img.g = sampleCell(acell, duvS).g;
    img.b = sampleCell(acell, duvS - caDir).b;
    img = pow(max(img, 0.0), vec3(0.82));                     // lift shadows so dark posters read

    float imgMask = smoothstep(0.0, 0.03, border - 0.085);
    vec3 lit   = img * diff * (1.0 + 0.4 * cellFoc)
               + spec * vec3(0.92, 0.96, 1.0) * (0.28 + 0.6 * cellFoc);
    vec3 bevel = vec3(0.02, 0.025, 0.034) * diff + spec * vec3(0.82, 0.87, 1.0) * 0.9;
    vec3 cellCol = mix(bevel, lit, imgMask);

    // depth — cells away from the focus recede, but every poster stays legible
    cellCol *= mix(0.64, 1.32, cellFoc);

    vec3 gutter = vec3(0.006, 0.008, 0.013);
    vec3 col = mix(gutter, cellCol, gap);

    // vignette to black at the frame edges (the tunnel)
    float vig = 1.0 - 0.5 * smoothstep(0.32, 1.2, length((vUv - 0.5) * vec2(aspect, 1.0)));
    col *= vig;

    fragColor = vec4(col * uActive, 1.0);
  }
`;

export function createArchiveField({ images = [], onPick, onHover, reduced = false } = {}) {
  const supported =
    !reduced &&
    window.matchMedia("(min-width: 760px)").matches &&
    (() => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2");
        gl && gl.getExtension("WEBGL_lose_context")?.loseContext();
        return !!gl;
      } catch { return false; }
    })();
  if (!supported || !images.length) return null;

  const canvas = document.querySelector("[data-op-field]");
  if (!canvas) return null;

  // The wall <img>s are lazy + hidden while the field is up, so they may never
  // decode. Load our own eager copies from their sources so the atlas is whole.
  const srcs = images.map((el) => el?.currentSrc || el?.getAttribute?.("src") || el?.src || "");
  const loaders = srcs.map((src) => {
    const im = new Image();
    im.decoding = "async";
    if (src) im.src = src;
    return im;
  });

  const count = loaders.length;
  const atlasCols = Math.ceil(Math.sqrt(count));
  const atlasRows = Math.ceil(count / atlasCols);
  const CELL = 256;

  // ── poster atlas (cover-cropped squares) ────────────────────────────────────
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCols * CELL;
  atlasCanvas.height = atlasRows * CELL;
  const actx = atlasCanvas.getContext("2d");
  const drawAtlas = () => {
    loaders.forEach((img, k) => {
      if (!img.naturalWidth) return;
      const cx = (k % atlasCols) * CELL;
      const cy = Math.floor(k / atlasCols) * CELL;
      const ir = img.naturalWidth / img.naturalHeight;
      let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
      if (ir > 1) { sw = img.naturalHeight; sx = (img.naturalWidth - sw) / 2; }
      else { sh = img.naturalWidth; sy = (img.naturalHeight - sh) / 2; }
      actx.drawImage(img, sx, sy, sw, sh, cx, cy, CELL, CELL);
    });
    texture.needsUpdate = true;
  };

  // ── renderer / scene ────────────────────────────────────────────────────────
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR);

  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); contextLost = true; }, false);
  canvas.addEventListener("webglcontextrestored", () => { contextLost = false; drawAtlas(); resize(); kick(); }, false);

  loaders.forEach((im) => { im.onload = () => { drawAtlas(); }; });

  const texture = new THREE.CanvasTexture(atlasCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  drawAtlas();

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));

  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uCursor: { value: new THREE.Vector2(0.5, 0.5) },
    uFocus: { value: 0 },
    uActive: { value: 0 },
    uAtlas: { value: texture },
    uAtlasGrid: { value: new THREE.Vector2(atlasCols, atlasRows) },
    uCount: { value: count },
    uGrid: { value: new THREE.Vector2(16, 10) },
    uSites: { value: null },
    uPick: { value: 0 },
    uIntro: { value: 1 },
  };
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(geo, material));

  // ── force simulation state ──────────────────────────────────────────────────
  let COLS = 0, ROWS = 0, N = 0;
  let sitesData = null;      // RGBA float per cell — .xy = displacement (grid units)
  let svel = null;           // per-cell velocity (2 floats)
  let sbase = null;          // per-cell static jitter → organic cells even at rest
  let sitesTex = null;

  function buildLattice(cols, rows) {
    COLS = cols; ROWS = rows; N = cols * rows;
    sitesData = new Float32Array(N * 4);
    svel = new Float32Array(N * 2);
    sbase = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const bx = (Math.random() - 0.5) * 0.34;
      const by = (Math.random() - 0.5) * 0.34;
      sbase[i * 2] = bx; sbase[i * 2 + 1] = by;
      sitesData[i * 4] = bx; sitesData[i * 4 + 1] = by;   // rest at the jittered base
    }
    sitesTex = new THREE.DataTexture(sitesData, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType);
    sitesTex.minFilter = sitesTex.magFilter = THREE.NearestFilter;
    sitesTex.wrapS = sitesTex.wrapT = THREE.ClampToEdgeWrapping;
    sitesTex.needsUpdate = true;
    uniforms.uSites.value = sitesTex;
    uniforms.uGrid.value.set(COLS, ROWS);
  }

  // one physics step: cursor shoves neighbouring sites out, springs pull home
  const CAP = 0.62;
  function stepSim(dt) {
    if (!sitesData) return;
    const c = uniforms.uCursor.value;
    const cx = c.x * COLS, cy = c.y * ROWS;
    const foc = uniforms.uFocus.value;
    const R = 3.4, push = 30.0, kRet = 18.0, damp = 0.86;
    const t = uniforms.uTime.value;
    for (let i = 0; i < N; i++) {
      const gx = i % COLS, gy = (i / COLS) | 0;
      const dx = sitesData[i * 4], dy = sitesData[i * 4 + 1];
      const sx = gx + 0.5 + dx, sy = gy + 0.5 + dy;
      // spring back to the jittered base + a whisper of idle drift so it never freezes
      let ax = -kRet * (dx - sbase[i * 2]) + 0.5 * Math.sin(t * 0.7 + gx * 1.3 + gy * 0.7);
      let ay = -kRet * (dy - sbase[i * 2 + 1]) + 0.5 * Math.cos(t * 0.6 + gy * 1.1 - gx * 0.5);
      // radial shove away from the cursor → clears a big cell under the pointer
      const rx = sx - cx, ry = sy - cy;
      const rr = Math.hypot(rx, ry) + 1e-4;
      if (rr < R) {
        const fall = 1 - rr / R;
        const f = push * fall * fall * (0.35 + foc);
        ax += (rx / rr) * f; ay += (ry / rr) * f;
      }
      let vx = (svel[i * 2] + ax * dt) * damp;
      let vy = (svel[i * 2 + 1] + ay * dt) * damp;
      let ndx = dx + vx * dt, ndy = dy + vy * dt;
      const m = Math.hypot(ndx, ndy);
      if (m > CAP) { ndx *= CAP / m; ndy *= CAP / m; }
      svel[i * 2] = vx; svel[i * 2 + 1] = vy;
      sitesData[i * 4] = ndx; sitesData[i * 4 + 1] = ndy;
    }
    sitesTex.needsUpdate = true;
  }

  // ── loop state ──────────────────────────────────────────────────────────────
  let raf = 0, active = false, last = performance.now();
  const cursor = new THREE.Vector2(0.5, 0.5);
  const vel = new THREE.Vector2(0, 0);
  const target = new THREE.Vector2(0.5, 0.5);
  let focusTarget = 0.3;
  let lastPointer = -1e9;
  let lastHoverPick = 0, lastHoverIdx = -1;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w * DPR, h * DPR);
    // dense-ish lattice, cells roughly square on screen
    const cols = Math.round(THREE.MathUtils.clamp(w / 84, 11, 22));
    const rows = Math.max(6, Math.round(cols * (h / w)));
    if (cols !== COLS || rows !== ROWS) buildLattice(cols, rows);
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    uniforms.uTime.value += dt;

    // idle: let the lens roam slowly so the field stays alive
    const engaged = (now - lastPointer) < 1200;
    if (!engaged) {
      const t = uniforms.uTime.value;
      target.set(0.5 + 0.2 * Math.sin(t * 0.23), 0.5 + 0.16 * Math.sin(t * 0.31 + 1.3));
      focusTarget = 0.42;
    }
    // spring with momentum — the lens chases with a liquid, slightly overshooting feel
    vel.x += (target.x - cursor.x) * 0.11; vel.y += (target.y - cursor.y) * 0.11;
    vel.multiplyScalar(0.80);
    cursor.x += vel.x; cursor.y += vel.y;
    uniforms.uCursor.value.copy(cursor);
    uniforms.uFocus.value += (focusTarget - uniforms.uFocus.value) * 0.07;
    uniforms.uActive.value += ((active ? 1 : 0) - uniforms.uActive.value) * 0.09;

    stepSim(dt);
    if (!contextLost) renderer.render(scene, camera);
    if (active || uniforms.uActive.value > 0.01) raf = requestAnimationFrame(frame);
    else raf = 0;
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // ── interaction ─────────────────────────────────────────────────────────────
  function setFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    target.set((e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height);
    focusTarget = 1;
    lastPointer = performance.now();
  }
  const pxOf = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [
      Math.round((e.clientX - rect.left) * DPR),
      Math.round((rect.height - (e.clientY - rect.top)) * DPR),
    ];
  };
  const onMove = (e) => {
    if (!active) return;
    setFromEvent(e);
    if (onHover && !contextLost) {
      const now = performance.now();
      if (now - lastHoverPick > 80) {
        lastHoverPick = now;
        const [px, py] = pxOf(e);
        const idx = pickAt(px, py);
        if (idx !== lastHoverIdx) { lastHoverIdx = idx; onHover(idx, e.clientX, e.clientY); }
      }
    }
  };
  const onLeave = () => { focusTarget = 0.42; lastHoverIdx = -1; onHover && onHover(-1); };
  const onClick = (e) => {
    if (!active || !onPick || contextLost) return;
    const [px, py] = pxOf(e);
    onPick(pickAt(px, py));
  };

  // full-frame pick: render encoded ids to a target, read one pixel back → poster idx
  let fullTarget = null;
  function pickAt(px, py) {
    const w = Math.floor((canvas.clientWidth || window.innerWidth) * DPR);
    const h = Math.floor((canvas.clientHeight || window.innerHeight) * DPR);
    if (!fullTarget) fullTarget = new THREE.WebGLRenderTarget(w, h);
    else fullTarget.setSize(w, h);
    uniforms.uPick.value = 1;
    renderer.setRenderTarget(fullTarget);
    renderer.render(scene, camera);
    const buf = new Uint8Array(4);
    renderer.readRenderTargetPixels(fullTarget, THREE.MathUtils.clamp(px, 0, w - 1), THREE.MathUtils.clamp(py, 0, h - 1), 1, 1, buf);
    renderer.setRenderTarget(null);
    uniforms.uPick.value = 0;
    return Math.min(count - 1, Math.round((buf[0] / 255) * 255));
  }

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  window.addEventListener("resize", resize);
  resize();

  return {
    activate() {
      uniforms.uIntro.value = 1;               // no spin — field appears settled
      if (active) { kick(); return; }
      active = true; drawAtlas(); resize(); kick();
    },
    deactivate() { active = false; focusTarget = 0; kick(); },
    refreshAtlas: drawAtlas,
    destroy() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("resize", resize);
      geo.dispose(); material.dispose(); texture.dispose();
      sitesTex?.dispose(); fullTarget?.dispose(); renderer.dispose();
    },
  };
}
