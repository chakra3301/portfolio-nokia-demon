/**
 * NOKIADEMON instrument — the WebGL world.
 *
 * Layers, all resolved through ONE ordered-dither post pass whose pitch/intensity
 * are tuned per state (brief §3.3, §6):
 *   - ambient glyph field  (instanced billboards sampling a glyph atlas)
 *   - dust                 (depth cue)
 *   - chrome core          (faceted icosa + wireframe + fresnel, recolourable)
 *   - three rings          (thin tori + engraved graduations + project glyph-marks)
 *   - warp streaks         (spent only during the warp beat)
 *
 * The dither is a real render-to-texture + fullscreen ordered-dither pass, not a
 * CSS filter, so pitch and intensity are genuinely tunable per layer/state.
 */
import * as THREE from "three";
import gsap from "gsap";
import { buildAtlas, glyphTexture } from "./glyphs.js";
import { PROJECTS, RINGS } from "./data.js";

const COL = {
  bg: new THREE.Color("#06070A"),
  chromeBase: new THREE.Color("#B8BCC2"),
  chromeHi: new THREE.Color("#E4E6E9"),
  chromeLo: new THREE.Color("#2A2D31"),
  whiteHot: new THREE.Color("#FFFFFF"),
  muted: new THREE.Color("#7C8088"),
};

const LOCK_ANGLE = Math.PI / 2; // top of the disc, under the reticle

// ── shaders ────────────────────────────────────────────────────────────────
const CHROME_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CHROME_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uBase, uHi, uLo, uAccent;
  uniform float uAccentAmt, uWire;
  uniform sampler2D uEnvPanorama;
  uniform float uEnvAmt;
  varying vec3 vN;
  varying vec3 vView;

  vec3 samplePanorama(vec3 dir) {
    vec2 uv = vec2(
      atan(dir.z, dir.x) / 6.2831853 + 0.5,
      asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5
    );
    return texture2D(uEnvPanorama, uv).rgb;
  }

  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(vView);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
    vec3 R = normalize(reflect(-V, N));
    float g = R.y * 0.5 + 0.5;
    vec3 fakeEnv = mix(uLo, uHi, smoothstep(0.12, 0.9, g));
    vec3 env = fakeEnv;
    if (uEnvAmt > 0.001) env = mix(fakeEnv, samplePanorama(R), uEnvAmt);
    vec3 col = mix(uBase * 0.55, env, 0.72);
    col += fres * (0.35 + uAccentAmt * 0.9) * uAccent;
    col = mix(col, uAccent, uAccentAmt * fres * 0.8);
    col += uWire * 0.25 * uHi;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FIELD_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 aOffset;
  attribute float aCell;
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  uniform float uTime;
  uniform float uCols;
  uniform float uDrift;
  varying vec2 vUv;
  varying float vCell;
  varying float vBright;
  varying float vFog;
  varying float vPhase;
  void main(){
    vec3 off = aOffset;
    off.y += sin(uTime * 0.35 + aPhase) * 0.18 * uDrift;
    vec4 mv = modelViewMatrix * vec4(off, 1.0);
    mv.xy += position.xy * aSize;                 // billboard in view space
    vUv = uv;
    vCell = aCell;
    vBright = aBright;
    vPhase = aPhase;
    vFog = clamp((-mv.z - 6.0) / 34.0, 0.0, 1.0); // recede into bg
    gl_Position = projectionMatrix * mv;
  }
`;
const FIELD_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uCols;
  uniform float uTime;
  uniform vec3 uInk;
  uniform vec3 uHot;
  uniform vec3 uBolt;
  varying vec2 vUv;
  varying float vCell;
  varying float vBright;
  varying float vFog;
  varying float vPhase;

  float fieldStrike(float phase) {
    float rate = 0.35 + fract(sin(phase * 12.9898) * 43758.5453) * 1.4;
    float gate = step(0.86, fract(sin(phase * 78.233) * 43758.5453));
    float tick = uTime * rate + phase * 9.17;
    float f = fract(tick);
    float a = smoothstep(0.968, 0.978, f) * (1.0 - smoothstep(0.978, 0.990, f));
    float b = smoothstep(0.984, 0.990, f) * (1.0 - smoothstep(0.990, 0.998, f));
    return max(a, b * 0.9) * gate;
  }

  void main(){
    float cell = floor(vCell + 0.5);
    float col = mod(cell, uCols);
    float row = floor(cell / uCols);
    vec2 uv = (vec2(col, row) + vUv) / uCols;
    vec4 tex = texture2D(uAtlas, uv);
    if (tex.a < 0.06) discard;
    // Atlas bakes black + purple outline; tint only the neutral white fill
    vec3 c = tex.rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    bool isFill = lum > 0.82 && c.r > 0.75 && c.g > 0.75 && c.b > 0.75;
    bool isPurple = !isFill && c.b > 0.52 && c.r < 0.92 && c.g > 0.30;
    if (isFill) c = mix(uInk, uHot, vBright);
    else if (isPurple) c = mix(c, uBolt * 0.62, 0.32); // thin outline — lift brightness in shader
    float bolt = isPurple ? fieldStrike(vPhase) : 0.0;
    if (bolt > 0.001) {
      vec3 flash = mix(uBolt, vec3(1.0), clamp(bolt * 1.4, 0.0, 0.72));
      c = mix(c, flash, clamp(bolt * 4.0, 0.0, 1.0));
      c += flash * bolt * 2.4;
    }
    float fade = mix(1.0, 0.12, vFog);
    gl_FragColor = vec4(c * fade, tex.a * (0.14 + vBright * 0.38) * fade);
  }
`;

// Ordered-dither post pass (real render-to-texture pass).
const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;
const POST_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uPitch;     // dither/pixel cell size (device px)
  uniform float uIntensity; // 0 clean .. 1 full dither
  uniform float uMode;      // 0 engrave, 1 warp-glitch, 2 clean, 3 crt
  uniform float uWarp;      // 0..1 warp energy
  uniform float uTime;
  uniform float uVignette;
  uniform sampler2D uVideoTex;   // loader footage (live)
  uniform sampler2D uBurnTex;    // frozen last frame (persistent ghost)
  uniform float uVideoAmt;       // loader video blend 0..1
  uniform float uVideoBurn;      // burnt-in ghost blend 0..1
  uniform float uVideoAspect;
  uniform float uVideoFlip;
  uniform float uAscii;          // 0 off .. 1 render the frame as a glyph grid
  uniform sampler2D uAsciiAtlas; // luminance ramp of monospace characters
  uniform float uAsciiLevels;
  uniform float uCellPx;         // glyph cell size (device px)
  uniform float uReveal;         // 0 rest .. 1 the frame dims + holds behind the message
  uniform sampler2D uHdriTex;    // live Unicorn canvas → HDRI backdrop
  uniform float uHdriAmt;        // 0 off .. 1 full screen composite
  uniform sampler2D uFxTex;      // per-daemon backdrop (e.g. Joust duel)
  uniform float uFxAmt;          // 0 off .. 1 full blend
  uniform float uFxOcclude;      // 0 = additive screen blend, 1 = alpha composite (solid subjects)
  varying vec2 vUv;

  // Character / "glyph" dither: quantise each cell's luminance to a monospace
  // glyph from a dark->light ramp atlas (the Unicorn Studio ASCII look).
  vec3 asciiCell(){
    float cs = max(uCellPx, 3.0);
    vec2 cid = floor(gl_FragCoord.xy / cs);
    vec2 f   = fract(gl_FragCoord.xy / cs);
    vec2 centerUv = (cid + 0.5) * cs / uRes;
    float sAsp = uRes.x / uRes.y;
    vec2 cu = centerUv;
    if (sAsp > uVideoAspect) cu.y = (centerUv.y - 0.5) * (uVideoAspect / sAsp) + 0.5; // cover-fit
    else cu.x = (centerUv.x - 0.5) * (sAsp / uVideoAspect) + 0.5;
    if (uVideoFlip > 0.5) cu.y = 1.0 - cu.y;
    float vlum = dot(texture2D(uVideoTex, cu).rgb, vec3(0.299,0.587,0.114)) * uVideoAmt;
    float slum = dot(texture2D(tDiffuse, centerUv).rgb, vec3(0.299,0.587,0.114));
    float lv = uAsciiLevels;
    float frameLum = pow(clamp(max(slum, vlum), 0.0, 1.0), 0.82);           // the still frame
    float dim = 1.0 - 0.6 * smoothstep(0.0, 0.4, uReveal);                  // frame dims + HOLDS behind the message
    float gi = floor(frameLum * (lv - 1.0) + 0.001);
    float ink = texture2D(uAsciiAtlas, vec2((gi + f.x) / lv, f.y)).r;
    return vec3(ink * (0.30 + 0.85 * frameLum) * dim);
  }

  // 4x4 ordered Bayer threshold, ES1-safe (no dynamic array indexing).
  float bayer(vec2 p){
    float x = mod(floor(p.x), 4.0);
    float y = mod(floor(p.y), 4.0);
    float v = 0.0;
    if (y == 0.0)      v = (x==0.0)? 0.0  : (x==1.0)? 8.0  : (x==2.0)? 2.0  : 10.0;
    else if (y == 1.0) v = (x==0.0)? 12.0 : (x==1.0)? 4.0  : (x==2.0)? 14.0 : 6.0;
    else if (y == 2.0) v = (x==0.0)? 3.0  : (x==1.0)? 11.0 : (x==2.0)? 1.0  : 9.0;
    else               v = (x==0.0)? 15.0 : (x==1.0)? 7.0  : (x==2.0)? 13.0 : 5.0;
    return (v + 0.5) / 16.0;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main(){
    vec2 frag = vUv * uRes;
    float pitch = max(uPitch, 1.0);
    vec2 cell = floor(frag / pitch);
    vec2 uvp = (cell * pitch + pitch * 0.5) / uRes;

    // warp chromatic split + jitter
    vec2 dir = vUv - 0.5;
    float ca = uWarp * (0.006 + length(dir) * 0.02);
    float jit = (uMode > 0.5 && uMode < 1.5) ? (hash(vec2(cell.y, floor(uTime*60.0))) - 0.5) * uWarp * 0.03 : 0.0;
    vec3 src;
    src.r = texture2D(tDiffuse, uvp + vec2(ca + jit, 0.0)).r;
    src.g = texture2D(tDiffuse, uvp + vec2(jit, 0.0)).g;
    src.b = texture2D(tDiffuse, uvp - vec2(ca - jit, 0.0)).b;

    // HDRI backdrop — screen-blend Unicorn canvas behind the instrument (replaces DOM layer)
    if (uHdriAmt > 0.001) {
      vec3 hdri = texture2D(uHdriTex, uvp).rgb;
      vec3 screened = hdri + src - hdri * src;
      src = mix(src, screened, uHdriAmt);
    }

    // daemon-specific backdrop FX (bright dot art, screen-blended behind glyphs)
    // — tuned soft: inherit a little ambient scene color and let dim areas mix
    // in gently, so it reads as living IN the frame rather than pasted over it.
    if (uFxAmt > 0.001) {
      vec4 fxS = texture2D(uFxTex, uvp);
      if (uFxOcclude > 0.5) {
        // solid-subject composite: the canvas alpha carves the subject out of
        // the scene (black clothing reads as a true silhouette, not a hole)
        float cov = fxS.a * uFxAmt;
        src = mix(src, fxS.rgb, cov);
      } else {
        vec3 fx = fxS.rgb;
        fx = mix(fx, fx * 0.82 + src * 0.4, 0.3);
        float fxLum = dot(fx, vec3(0.299, 0.587, 0.114));
        if (fxLum > 0.008) {
          vec3 fxScreen = fx + src - fx * src;
          float wgt = uFxAmt * clamp(fxLum * 1.3, 0.0, 0.92);
          src = mix(src, fxScreen, wgt);
          src += fx * uFxAmt * 0.2 * fxLum;
        }
      }
    }

    // ── loader footage sits BEHIND the field; the glyph dither overlays it.
    //    Footage is a dimmed b&w background; lit glyphs are composited on top;
    //    everything is quantised together by the Bayer dither below.
    if (uVideoAmt > 0.001 || uVideoBurn > 0.001) {
      float sAsp = uRes.x / uRes.y;
      vec2 cu = uvp;
      if (sAsp > uVideoAspect) cu.y = (uvp.y - 0.5) * (uVideoAspect / sAsp) + 0.5; // cover-fit
      else cu.x = (uvp.x - 0.5) * (sAsp / uVideoAspect) + 0.5;
      if (uVideoFlip > 0.5) cu.y = 1.0 - cu.y;
      float glyph = max(max(src.r, src.g), src.b);   // where the glyph field is lit
      if (uVideoAmt > 0.001) {
        float vl = dot(texture2D(uVideoTex, cu).rgb, vec3(0.299, 0.587, 0.114)) * uVideoAmt;
        src = mix(vec3(vl), src, clamp(glyph * 4.0, 0.0, 1.0)); // glyphs on top of footage
      }
      if (uVideoBurn > 0.001) {                       // faint persistent ghost, under all
        float bl = dot(texture2D(uBurnTex, cu).rgb, vec3(0.299, 0.587, 0.114)) * uVideoBurn;
        src = 1.0 - (1.0 - src) * (1.0 - vec3(bl));
      }
    }

    // ordered dither: quantise each channel with the Bayer offset
    float levels = (uMode > 2.5) ? 4.0 : 6.0;   // crt = fewer levels
    float t = bayer(cell) - 0.5;
    vec3 dith = floor(src * levels + t) / (levels - 1.0);
    vec3 outc = mix(src, dith, uIntensity);

    // glyph (ASCII) dither overrides the halftone when engaged (loader footage)
    if (uAscii > 0.5) outc = asciiCell();

    // crt scanline + green cast handled in CSS; here just soften
    if (uMode > 2.5){
      float scan = 0.92 + 0.08 * sin(frag.y * 3.14159);
      outc *= scan;
    }

    // spark bloom during warp
    outc += uWarp * 0.12 * smoothstep(0.4, 0.0, length(dir));

    // vignette
    float vig = 1.0 - uVignette * dot(dir, dir) * 1.4;
    outc *= clamp(vig, 0.0, 1.0);

    gl_FragColor = vec4(outc, 1.0);
  }
`;

export function createInstrument(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false });
  const dprCap = window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.setClearColor(COL.bg, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.bg, 0.028);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 2.4, 12.4);
  camera.lookAt(0, 0, 0);

  // ── astrolabe group (tilted disc) ─────────────────────────────────────────
  const astro = new THREE.Group();
  astro.rotation.x = -1.02; // lay the disc back so we read it at an angle
  scene.add(astro);

  // chrome core: faceted icosa + wireframe shell + glow
  const coreUniforms = {
    uBase: { value: COL.chromeBase.clone() },
    uHi: { value: COL.chromeHi.clone() },
    uLo: { value: COL.chromeLo.clone() },
    uAccent: { value: COL.whiteHot.clone() },
    uAccentAmt: { value: 0.0 },
    uWire: { value: 0.0 },
    uEnvPanorama: { value: null },
    uEnvAmt: { value: 0.0 },
  };
  const chromeMat = new THREE.ShaderMaterial({ vertexShader: CHROME_VERT, fragmentShader: CHROME_FRAG, uniforms: coreUniforms });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), chromeMat);
  const wireUniforms = { ...coreUniforms, uWire: { value: 1.0 } };
  const wireMat = new THREE.ShaderMaterial({ vertexShader: CHROME_VERT, fragmentShader: CHROME_FRAG, uniforms: wireUniforms, wireframe: true, transparent: true, opacity: 0.5 });
  const coreWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.62, 1), wireMat);
  const coreGroup = new THREE.Group();
  coreGroup.add(core, coreWire);
  scene.add(coreGroup);

  // additive glow halo behind the core
  const glowTex = radialTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: COL.whiteHot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(7, 7, 1);
  coreGroup.add(glow);

  // ── ambient glyph field (instanced billboards) ────────────────────────────
  const atlas = buildAtlas();
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fieldMedium = reduced ? 200 : coarse ? 260 : 540;
  const fieldSmallExtra = reduced ? 80 : coarse ? 120 : 280;
  const fieldCount = fieldMedium + fieldSmallExtra;
  const field = buildField(atlas, fieldCount, fieldMedium);
  const fieldUniforms = field.material.uniforms;
  scene.add(field.mesh);

  // dust points for depth
  const dust = buildDust(reduced ? 140 : 320);
  scene.add(dust.points);

  // ── rings + marks ─────────────────────────────────────────────────────────
  const marks = []; // { id, ring, base, mesh, mat, color, project }
  const ringState = {}; // id → { angle, vel, activity, radius }
  for (const key of Object.keys(RINGS)) {
    const def = RINGS[key];
    ringState[key] = { angle: gsap.utils.random(0.4, 2.6), vel: 0, activity: key === "B" ? 0.35 : 0.2, radius: def.radius, autoAligning: false };
    // ring tube
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius, 0.022, 8, 180),
      new THREE.ShaderMaterial({ vertexShader: CHROME_VERT, fragmentShader: CHROME_FRAG, uniforms: cloneChrome(coreUniforms), transparent: true })
    );
    torus.userData.ring = key;
    astro.add(torus);
    ringState[key].torus = torus;
    // graduations
    astro.add(buildTicks(def.radius, 60));
    // project marks
    const list = def.projects.map((id) => PROJECTS.find((p) => p.id === id));
    list.forEach((p, i) => {
      const base = (i / list.length) * Math.PI * 2 + 0.6; // spaced, none pre-aligned
      const isTools = key === "B";
      const mat = new THREE.SpriteMaterial({
        map: glyphTexture(p.glyph, { color: isTools ? "#F0F2F5" : "#C6CAD0", weight: 600 }),
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(isTools ? 0.78 : 0.72, isTools ? 0.78 : 0.72, 1);
      astro.add(sprite);
      marks.push({ id: p.id, ring: key, base, sprite, mat, color: new THREE.Color(p.color), project: p });
    });
  }

  // ── warp streaks ──────────────────────────────────────────────────────────
  const warp = buildWarp(reduced ? 120 : 420);
  scene.add(warp.points);
  warp.points.visible = false;

  // ── loader footage → dithered b&w material, plus a frozen last-frame ghost ──
  const video = document.createElement("video");
  video.src = "/loader.mp4";
  video.muted = true; video.defaultMuted = true; video.loop = false; video.playsInline = true;
  video.preload = "auto"; video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
  // keep in DOM but offscreen so mobile browsers keep decoding it
  video.style.cssText = "position:fixed;left:-8px;top:-8px;width:2px;height:2px;opacity:0.001;pointer-events:none;";
  document.body.appendChild(video);
  const videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.minFilter = THREE.LinearFilter; videoTex.magFilter = THREE.LinearFilter;
  const burnCanvas = document.createElement("canvas");
  burnCanvas.width = 480; burnCanvas.height = 360;
  const burnCtx = burnCanvas.getContext("2d");
  burnCtx.fillStyle = "#000"; burnCtx.fillRect(0, 0, 480, 360);
  const burnTex = new THREE.CanvasTexture(burnCanvas);
  burnTex.colorSpace = THREE.SRGBColorSpace;
  function captureBurn() {
    try { burnCtx.drawImage(video, 0, 0, 480, 360); burnTex.needsUpdate = true; } catch (e) {}
  }

  // ── glyph (ASCII) dither atlas: a dark→light ramp of monospace characters ──
  const ASCII_RAMP = [" ", ".", ":", "-", "=", "+", "*", "?", "#", "@"];
  function makeAsciiAtlas(cellPx) {
    const cvs = document.createElement("canvas");
    cvs.width = cellPx * ASCII_RAMP.length; cvs.height = cellPx;
    const c = cvs.getContext("2d");
    c.fillStyle = "#000"; c.fillRect(0, 0, cvs.width, cvs.height);
    c.fillStyle = "#fff";
    c.font = `700 ${Math.round(cellPx * 0.78)}px "IBM Plex Mono", ui-monospace, monospace`;
    c.textAlign = "center"; c.textBaseline = "middle";
    ASCII_RAMP.forEach((ch, i) => { if (ch.trim()) c.fillText(ch, i * cellPx + cellPx / 2, cellPx * 0.54); });
    const tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false;
    return tex;
  }
  let asciiAtlas = makeAsciiAtlas(64);

  // (the closing message is now crisp DOM text in index.html, decoded in main.js)

  // rebuild atlas once the webfont is ready so the glyphs are crisp + on-brand
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const t = makeAsciiAtlas(64); asciiAtlas.dispose(); asciiAtlas = t; postUniforms.uAsciiAtlas.value = t;
      const next = buildAtlas();
      fieldUniforms.uAtlas.value.dispose();
      fieldUniforms.uAtlas.value = next.texture;
    });
  }

  // ── dither post pass ──────────────────────────────────────────────────────
  let rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postUniforms = {
    tDiffuse: { value: rt.texture },
    uRes: { value: new THREE.Vector2() },
    uPitch: { value: 2.0 },
    uIntensity: { value: 0.55 },
    uMode: { value: 0 },
    uWarp: { value: 0 },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uVideoTex: { value: videoTex },
    uBurnTex: { value: burnTex },
    uVideoAmt: { value: 0 },
    uVideoBurn: { value: 0 },
    uVideoAspect: { value: 960 / 720 },
    uVideoFlip: { value: 0 },
    uAscii: { value: 0 },
    uAsciiAtlas: { value: asciiAtlas },
    uAsciiLevels: { value: ASCII_RAMP.length },
    uCellPx: { value: 16 },
    uReveal: { value: 0 },
    uHdriTex: { value: null },
    uHdriAmt: { value: 0 },
    uFxTex: { value: null },
    uFxAmt: { value: 0 },
    uFxOcclude: { value: 0 },
  };
  const postMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms: postUniforms });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  // dither target (state) that we ease toward
  const dither = { pitch: 2.0, intensity: 0.55, mode: 0, warp: 0 };

  // ── interaction state ─────────────────────────────────────────────────────
  const pointer = new THREE.Vector2(-2, -2);
  const parallax = new THREE.Vector2(0, 0);
  let activeRing = null;
  let armed = null; // currently aligned mark id (candidate)
  let driftAmt = 1; // 1 in hub/hero, 0 during warp/daemon/terminal
  let baseCellPx = 16; // resting glyph-dither cell size (device px), set in resize()
  let clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let alignTween = null;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    postUniforms.uRes.value.set(w * pr, h * pr);
    baseCellPx = Math.max(6, Math.round(8 * pr)); // glyph-dither cell (device px)
    postUniforms.uCellPx.value = baseCellPx;
  }
  resize();
  window.addEventListener("resize", resize);

  // ── per-frame update ───────────────────────────────────────────────────────
  function update() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    postUniforms.uTime.value = t;

    // ease dither toward target
    postUniforms.uPitch.value += (dither.pitch - postUniforms.uPitch.value) * 0.12;
    postUniforms.uIntensity.value += (dither.intensity - postUniforms.uIntensity.value) * 0.12;
    postUniforms.uWarp.value += (dither.warp - postUniforms.uWarp.value) * 0.2;
    postUniforms.uMode.value = dither.mode;

    // camera: always honour camBase (so warp/daemon dollies apply), add drift on top
    const drift = reduced ? 0 : driftAmt;
    parallax.x += (pointer.x * 0.7 - parallax.x) * 0.04;
    parallax.y += (pointer.y * 0.4 - parallax.y) * 0.04;
    camera.position.x = camBase.x + (parallax.x + Math.sin(t * 0.15) * 0.12) * drift;
    camera.position.y = camBase.y + (parallax.y + Math.cos(t * 0.12) * 0.08) * drift;
    camera.position.z = camBase.z;
    camera.lookAt(camTarget);

    // core life
    coreGroup.rotation.y += dt * (reduced ? 0.0 : 0.12);
    coreGroup.rotation.x = Math.sin(t * 0.2) * 0.06;
    glowMat.opacity = 0.4 + Math.sin(t * 1.3) * 0.05;

    // field slow drift
    if (!reduced) field.mesh.rotation.y = t * 0.01;
    fieldUniforms.uTime.value = t;
    dust.points.rotation.y = t * 0.006;

    // ring physics + mark placement
    armed = null;
    let bestDelta = 999;
    for (const key of Object.keys(ringState)) {
      const rs = ringState[key];
      if (!rs.autoAligning) {
        rs.angle += rs.vel;
        rs.vel *= 0.9; // friction
      }
      // detent snap toward nearest mark when active + slow
      const wake = key === activeRing ? 1 : 0;
      rs.activity += ((wake ? 1 : activeRing ? 0.12 : 0.34) - rs.activity) * 0.08;
      rs.torus.material.uniforms.uAccentAmt.value = rs.activity * 0.25;
      rs.torus.material.uniforms.uAccent.value.copy(COL.whiteHot);
    }
    for (const m of marks) {
      const rs = ringState[m.ring];
      const eff = m.base + rs.angle;
      const r = rs.radius;
      m.sprite.position.set(Math.cos(eff) * r, Math.sin(eff) * r, 0);
      // billboard (keep glyph legible) — sprites already face camera
      const delta = angleDiff(eff, LOCK_ANGLE);
      const near = 1 - Math.min(Math.abs(delta) / 0.5, 1);
      // arm the closest mark of the ACTIVE ring
      if (m.ring === activeRing && Math.abs(delta) < bestDelta) {
        bestDelta = Math.abs(delta);
        armed = { id: m.id, delta, project: m.project };
      }
      // visual: glyph brightens toward its project colour as it nears the gate
      const tools = m.ring === "B";
      const lit = m.ring === activeRing ? near : near * (tools ? 0.62 : 0.4);
      const litAmt = tools ? Math.max(0.42, lit) : lit;
      m.mat.color.copy(tools ? COL.chromeHi : COL.muted).lerp(m.color, litAmt);
      m.mat.opacity = (tools ? 0.68 : 0.5) + lit * 0.32;
      m.sprite.scale.setScalar((tools ? 0.68 : 0.62) + lit * 0.22);
    }

    // magnetic detent: only SNAP HOME a glyph that is already close + slowing.
    // (Must not drag a distant glyph into the gate, or the hub auto-navigates.)
    if (activeRing && armed && !ringState[activeRing].autoAligning && Math.abs(armed.delta) < 0.16 && Math.abs(ringState[activeRing].vel) < 0.045) {
      ringState[activeRing].vel += -armed.delta * 0.1;
    }

    warp.update?.(dt);

    updateHdri();
    updateDaemonFx();
    // the fullscreen archive field takes over the screen — don't waste a draw
    if (!window.__archiveActive) render();
  }

  function render() {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }

  // camera anchors
  const camBase = new THREE.Vector3(0, 2.4, 12.4);
  const camTarget = new THREE.Vector3(0, 0, 0);

  // ── public actions ─────────────────────────────────────────────────────────
  function setActiveRing(id) {
    activeRing = id;
  }
  function rotateActive(delta) {
    if (!activeRing) return;
    ringState[activeRing].vel += delta;
    ringState[activeRing].vel = THREE.MathUtils.clamp(ringState[activeRing].vel, -0.16, 0.16);
  }
  // direct (drag) rotation — angle follows the pointer, tiny vel for release momentum
  function rotateBy(delta) {
    if (!activeRing) return;
    const rs = ringState[activeRing];
    if (rs.autoAligning) return;
    rs.angle += delta;
    rs.vel = THREE.MathUtils.clamp(delta * 0.35, -0.08, 0.08);
  }
  function getArmed() {
    return armed; // { id, delta, project } | null
  }

  function cancelAlign() {
    if (alignTween) {
      alignTween.kill();
      alignTween = null;
    }
    for (const key of Object.keys(ringState)) ringState[key].autoAligning = false;
  }

  // Rotate a ring so the chosen project's seal sits under the reticle, then callback.
  function alignToProject(project, onComplete) {
    cancelAlign();
    const mark = marks.find((m) => m.id === project.id);
    if (!mark) {
      onComplete?.();
      return;
    }
    const ring = mark.ring;
    const rs = ringState[ring];
    setActiveRing(ring);
    rs.vel = 0;
    rs.autoAligning = true;

    const delta = angleDiff(LOCK_ANGLE, mark.base + rs.angle);
    const target = rs.angle + delta;
    const travel = Math.abs(delta);

    const finish = () => {
      rs.angle = LOCK_ANGLE - mark.base;
      rs.autoAligning = false;
      alignTween = null;
      onComplete?.();
    };

    if (reduced || travel < 0.02) {
      finish();
      return;
    }

    alignTween = gsap.to(rs, {
      angle: target,
      duration: 0.45 + Math.min(travel / Math.PI, 1) * 0.55,
      ease: "power2.inOut",
      onComplete: finish,
    });
  }
  function ringOfPointer(nx, ny) {
    // pick the ring whose radius (in astro plane) the pointer is closest to
    // approximate: unproject pointer to the astro plane
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyQuaternion(astro.quaternion), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    astro.worldToLocal(hit);
    const r = Math.hypot(hit.x, hit.y);
    let best = null, bd = 0.7;
    for (const key of Object.keys(RINGS)) {
      const d = Math.abs(r - RINGS[key].radius);
      if (d < bd) { bd = d; best = key; }
    }
    return best;
  }

  // reticle tracks the active ring's 12-o'clock in screen space
  function reticleScreen(ringId) {
    const key = ringId || "B";
    const r = RINGS[key].radius;
    tmp.set(Math.cos(LOCK_ANGLE) * r, Math.sin(LOCK_ANGLE) * r, 0);
    astro.localToWorld(tmp);
    tmp.project(camera);
    return {
      x: (tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmp.y * 0.5 + 0.5) * window.innerHeight,
      visible: tmp.z < 1,
    };
  }

  // chrome core position in screen space (echo pulses are born here)
  function coreScreen() {
    tmp.copy(coreGroup.position);
    tmp.project(camera);
    return {
      x: (tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmp.y * 0.5 + 0.5) * window.innerHeight,
      visible: tmp.z < 1,
    };
  }

  function setDrift(v) { driftAmt = v; }
  function setChromeVisible(v) { coreGroup.visible = v; astro.visible = v; field.mesh.visible = v; dust.points.visible = v; }
  function setAscii(on) { postUniforms.uAscii.value = on ? 1 : 0; }

  function setDither({ pitch, intensity, mode }) {
    if (pitch != null) dither.pitch = pitch;
    if (intensity != null) dither.intensity = intensity;
    if (mode != null) dither.mode = mode;
  }

  // Warp: dolly into the core, recolour, spike dither, spend the streaks.
  function warpTo(project, onArrive) {
    const color = new THREE.Color(project.color);
    warp.points.visible = true;
    warp.active = true;
    const tl = gsap.timeline({
      onComplete: () => {
        warp.active = false;
        warp.points.visible = false;
        onArrive && onArrive();
      },
    });
    const dur = reduced ? 0.5 : 1.15;
    tl.to(dither, { warp: 1, intensity: 0.85, pitch: 3.5, mode: 1, duration: dur * 0.5, ease: "power2.in" }, 0);
    tl.to(camBase, { z: 3.4, y: 0.7, duration: dur, ease: "power3.inOut" }, 0);
    tl.to(camera, { fov: reduced ? 60 : 74, duration: dur * 0.5, ease: "power2.in", onUpdate: () => camera.updateProjectionMatrix() }, 0);
    tl.to([coreUniforms.uAccent.value, wireUniforms.uAccent.value], { r: color.r, g: color.g, b: color.b, duration: dur * 0.6 }, 0);
    tl.to(coreUniforms.uAccentAmt, { value: 0.7, duration: dur * 0.6 }, 0);
    tl.to(glowMat.color, { r: color.r, g: color.g, b: color.b, duration: dur * 0.6 }, 0);
    // resolve into daemon framing: core drifts right, dims, so content owns the left
    tl.to(dither, { warp: 0, intensity: 0.28, pitch: 2.0, mode: 2, duration: dur * 0.5, ease: "power2.out" }, dur * 0.5);
    tl.to(camera, { fov: 46, duration: dur * 0.5, ease: "power2.out", onUpdate: () => camera.updateProjectionMatrix() }, dur * 0.5);
    tl.to(camBase, { z: 7.9, y: 0.5, duration: dur * 0.5, ease: "power2.out" }, dur * 0.5);
    tl.to(coreGroup.position, { x: project.coreShift ?? 2.1, duration: dur * 0.5, ease: "power2.out" }, dur * 0.5);
    tl.to(coreUniforms.uAccentAmt, { value: 0.45, duration: dur * 0.5 }, dur * 0.5);
    tl.to(glowMat, { opacity: 0.26, duration: dur * 0.5 }, dur * 0.5);
    return tl;
  }

  function backToHub(onArrive) {
    const dur = reduced ? 0.4 : 0.9;
    const tl = gsap.timeline({ onComplete: () => onArrive && onArrive() });
    tl.to(dither, { warp: 0, intensity: 0.55, pitch: 2.0, mode: 0, duration: dur, ease: "power2.inOut" }, 0);
    tl.to(camBase, { z: 12.4, y: 2.4, duration: dur, ease: "power3.inOut" }, 0);
    tl.to(camera, { fov: 52, duration: dur, ease: "power2.inOut", onUpdate: () => camera.updateProjectionMatrix() }, 0);
    tl.to([coreUniforms.uAccent.value, wireUniforms.uAccent.value], { r: COL.whiteHot.r, g: COL.whiteHot.g, b: COL.whiteHot.b, duration: dur }, 0);
    tl.to(coreUniforms.uAccentAmt, { value: 0.0, duration: dur }, 0);
    tl.to(coreGroup.position, { x: 0, duration: dur, ease: "power2.inOut" }, 0);
    tl.to(glowMat.color, { r: COL.whiteHot.r, g: COL.whiteHot.g, b: COL.whiteHot.b, duration: dur }, 0);
    tl.to(glowMat, { opacity: 0.45, duration: dur }, 0);
    return tl;
  }

  // fade the instrument down/up (terminal + hero handoff)
  function setExposure(v, dur = 0.6) {
    gsap.to(dither, { intensity: 0.55 * v + 0.02, duration: dur });
    gsap.to(postUniforms.uVignette, { value: 0.5 + (1 - v) * 0.6, duration: dur });
    gsap.to(glowMat, { opacity: 0.45 * v, duration: dur });
  }

  let hdriSource = null;
  let hdriTex = null;
  let fxSource = null;
  let fxTex = null;
  let fxTexW = 0, fxTexH = 0; // dimensions the GPU storage was allocated at

  function setHdriSource(sourceCanvas) {
    if (!sourceCanvas) return;
    hdriSource = sourceCanvas;
    if (!hdriTex) {
      hdriTex = new THREE.CanvasTexture(sourceCanvas);
      hdriTex.colorSpace = THREE.SRGBColorSpace;
      hdriTex.mapping = THREE.EquirectangularReflectionMapping;
      hdriTex.minFilter = THREE.LinearFilter;
      hdriTex.magFilter = THREE.LinearFilter;
      hdriTex.generateMipmaps = false;
    }
    hdriTex.image = sourceCanvas;
    coreUniforms.uEnvPanorama.value = hdriTex;
    postUniforms.uHdriTex.value = hdriTex;
    for (const key of Object.keys(ringState)) {
      ringState[key].torus.material.uniforms.uEnvPanorama.value = hdriTex;
    }
  }

  function setHdriAmount(amt) {
    const v = Math.max(0, Math.min(1, amt));
    coreUniforms.uEnvAmt.value = v;
    postUniforms.uHdriAmt.value = v;
    for (const key of Object.keys(ringState)) {
      ringState[key].torus.material.uniforms.uEnvAmt.value = v;
    }
    wireUniforms.uEnvAmt.value = v;
  }

  function updateHdri() {
    if (hdriTex && hdriSource) hdriTex.needsUpdate = true;
  }

  function setDaemonFx(sourceCanvas, amt = 1, occlude = 0) {
    if (!sourceCanvas) {
      fxSource = null;
      postUniforms.uFxAmt.value = 0;
      postUniforms.uFxOcclude.value = 0;
      return;
    }
    postUniforms.uFxOcclude.value = occlude;
    fxSource = sourceCanvas;
    // NB: recreate the texture when the source canvas changes — WebGL2 texture
    // storage is immutable, so swapping in a different-sized canvas via .image
    // silently fails and the GPU keeps the previous daemon's last frame.
    if (fxTex && fxTex.image !== sourceCanvas) {
      fxTex.dispose();
      fxTex = null;
    }
    if (!fxTex) {
      fxTex = new THREE.CanvasTexture(sourceCanvas);
      fxTex.colorSpace = THREE.SRGBColorSpace;
      fxTex.minFilter = THREE.LinearFilter;
      fxTex.magFilter = THREE.LinearFilter;
      fxTex.generateMipmaps = false;
      fxTexW = sourceCanvas.width;
      fxTexH = sourceCanvas.height;
    }
    postUniforms.uFxTex.value = fxTex;
    postUniforms.uFxAmt.value = Math.max(0, Math.min(1, amt));
  }

  function updateDaemonFx() {
    if (!fxTex || !fxSource) return;
    // window resizes re-size the fx canvas — same immutable-storage trap as above
    if (fxTexW !== fxSource.width || fxTexH !== fxSource.height) {
      const amt = postUniforms.uFxAmt.value;
      const occ = postUniforms.uFxOcclude.value;
      fxTex.dispose();
      fxTex = null;
      setDaemonFx(fxSource, amt, occ);
    }
    fxTex.needsUpdate = true;
  }

  function onPointerMove(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }

  function dispose() {
    window.removeEventListener("resize", resize);
    hdriTex?.dispose();
    fxTex?.dispose();
    renderer.dispose();
    rt.dispose();
  }

  return {
    renderer, camera, update, render, resize, dispose,
    setActiveRing, rotateActive, rotateBy, getArmed, ringOfPointer, reticleScreen, coreScreen,
    alignToProject, cancelAlign,
    setDither, setDrift, setChromeVisible, setAscii, warpTo, backToHub, setExposure, onPointerMove,
    setHdriSource, setHdriAmount, updateHdri, setDaemonFx, updateDaemonFx,
    loaderVideo: video, captureBurn,
    videoAmtU: postUniforms.uVideoAmt, videoBurnU: postUniforms.uVideoBurn,
    revealU: postUniforms.uReveal,
    postUniforms,
    get activeRing() { return activeRing; },
    get aligning() { return !!alignTween; },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function cloneChrome(u) {
  return {
    uBase: { value: u.uBase.value.clone() },
    uHi: { value: u.uHi.value.clone() },
    uLo: { value: u.uLo.value.clone() },
    uAccent: { value: u.uAccent.value.clone() },
    uAccentAmt: { value: 0.0 },
    uWire: { value: 0.0 },
    uEnvPanorama: u.uEnvPanorama,
    uEnvAmt: u.uEnvAmt,
  };
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.25, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function buildField(atlas, count, mediumCount = count) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  const off = new Float32Array(count * 3);
  const cell = new Float32Array(count);
  const size = new Float32Array(count);
  const bright = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // shell around the instrument, biased to the back
    const r = 7 + Math.random() * 24;
    const th = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 22;
    off[i * 3] = Math.cos(th) * r;
    off[i * 3 + 1] = y;
    off[i * 3 + 2] = Math.sin(th) * r - 6;
    cell[i] = Math.floor(Math.random() * atlas.count);
    // keep original medium pool; extras beyond mediumCount are small only
    size[i] = i < mediumCount
      ? 0.5 + Math.random() * 0.9
      : 0.16 + Math.random() * 0.34;
    bright[i] = Math.random() < 0.08 ? 0.72 + Math.random() * 0.28 : Math.random() * 0.58;
    phase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 1));
  geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute("aBright", new THREE.InstancedBufferAttribute(bright, 1));
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
  geo.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uAtlas: { value: atlas.texture },
      uCols: { value: atlas.cols },
      uTime: { value: 0 },
      uDrift: { value: 1 },
      uInk: { value: new THREE.Color("#3a3e46") },
      uHot: { value: new THREE.Color("#6d737d") },
      uBolt: { value: new THREE.Color("#f8eeff") },
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function buildDust(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 4 + Math.random() * 26;
    const th = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 2] = Math.sin(th) * r - 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: COL.muted, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false });
  return { points: new THREE.Points(geo, mat) };
}

function buildTicks(radius, count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const inner = radius - 0.06;
    const outer = radius + (i % 5 === 0 ? 0.16 : 0.08);
    positions.push(Math.cos(a) * inner, Math.sin(a) * inner, 0, Math.cos(a) * outer, Math.sin(a) * outer, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: COL.chromeLo, transparent: true, opacity: 0.6 });
  return new THREE.LineSegments(geo, mat);
}

function buildWarp(count) {
  const pos = new Float32Array(count * 3);
  const spd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    resetStreak(pos, i, true);
    spd[i] = 6 + Math.random() * 22;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  const api = {
    points,
    active: false,
    update(dt) {
      if (!api.active) return;
      const p = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        p[i * 3 + 2] += spd[i] * dt * 4;
        if (p[i * 3 + 2] > 12) resetStreak(p, i, false);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
  return api;
}
function resetStreak(arr, i, spread) {
  const r = 0.4 + Math.random() * 4;
  const a = Math.random() * Math.PI * 2;
  arr[i * 3] = Math.cos(a) * r;
  arr[i * 3 + 1] = Math.sin(a) * r;
  arr[i * 3 + 2] = spread ? -20 - Math.random() * 30 : -24 - Math.random() * 8;
}
