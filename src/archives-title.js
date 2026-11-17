/** Archives 47's original hero lettering and chrome, isolated as route artwork. */
import * as THREE from "three";
import { budgetPixelRatio } from "./render-budget.js";
import tokens from "../design-tokens.json";

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// Chrome ramp and bevel normals come directly from archives-site/src/hero.js.
const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uMark, uBevel;
  uniform vec2 uRes;
  uniform vec4 uMarkRect;
  uniform float uTime, uBevelPx, uWarp, uReveal, uFloor, uFloorFade, uRipple;
  uniform vec3 uC100, uC300, uC500, uC900, uAccent;

  vec3 chrome(vec2 m, vec2 n) {
    float t = uTime;
    float ry = m.y + n.y * 0.34 + uWarp * 3.0 * sin(m.x * 17.0 + n.x * 4.0 + t * 0.9) + 0.03 * sin(m.x * 5.0 - t * 0.5);
    vec3 sky = mix(uC100, uC300, smoothstep(0.0, 0.44, ry));
    vec3 grd = mix(uC900, uC500, smoothstep(0.47, 0.62, ry));
    grd = mix(grd, uC300, smoothstep(0.7, 1.05, ry));
    vec3 col = mix(sky, grd, smoothstep(0.44, 0.465, ry));
    float rd = (ry - 0.468) / 0.0045;
    col = mix(col, uAccent, 0.85 * exp(-rd * rd));
    float rim = clamp(length(n) * 1.6, 0.0, 1.0);
    return mix(col, uC100, rim * rim * 0.55 * (0.5 + 0.5 * sin(m.x * 31.0 + t * 1.3 + n.y * 6.0)));
  }
  vec2 bevelN(vec2 px) {
    vec2 m = (px - uMarkRect.xy) / uMarkRect.zw;
    vec2 e = 1.5 / uMarkRect.zw;
    float hx = texture2D(uBevel, vec2(m.x + e.x, 1.0 - m.y)).a - texture2D(uBevel, vec2(m.x - e.x, 1.0 - m.y)).a;
    float hy = texture2D(uBevel, vec2(m.x, 1.0 - m.y - e.y)).a - texture2D(uBevel, vec2(m.x, 1.0 - m.y + e.y)).a;
    return vec2(hx, hy) / 3.0 * uBevelPx;
  }
  vec4 title(vec2 px) {
    vec2 m = (px - uMarkRect.xy) / uMarkRect.zw;
    if (m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0) return vec4(0.0);
    float a = texture2D(uMark, vec2(m.x, 1.0 - m.y)).a;
    return vec4(chrome(m, bevelN(px)), a);
  }
  void main() {
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
    float base = uMarkRect.y + uMarkRect.w;
    vec4 color;
    if (px.y <= base) color = title(px);
    else {
      float below = px.y - base;
      vec2 r = vec2(px.x + sin(below / uRes.y * 38.0 - uTime * 1.4) * uRipple * uRes.x * (0.4 + below / uRes.y * 4.0), base - below);
      color = title(r);
      color.a *= uFloor * exp(-below / (uFloorFade * uRes.y));
    }
    gl_FragColor = vec4(color.rgb, color.a * uReveal);
  }
`;

export function createArchivesTitle({ reduced = false } = {}) {
  const settings = tokens.characters, config = settings.archives;
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const renderer = new THREE.WebGLRenderer({ alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const markCanvas = document.createElement("canvas"), bevelCanvas = document.createElement("canvas");
  const markTexture = new THREE.CanvasTexture(markCanvas), bevelTexture = new THREE.CanvasTexture(bevelCanvas);
  for (const texture of [markTexture, bevelTexture]) {
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  }
  const color = hex => {
    const rgb = new THREE.Color(hex).getRGB({}, THREE.SRGBColorSpace);
    return new THREE.Vector3(rgb.r, rgb.g, rgb.b);
  };
  const uniforms = {
    uMark: { value: markTexture }, uBevel: { value: bevelTexture },
    uRes: { value: new THREE.Vector2() }, uMarkRect: { value: new THREE.Vector4() },
    uTime: { value: 0 }, uBevelPx: { value: 1 }, uReveal: { value: reduced ? 1 : 0 },
    uWarp: { value: config.warp }, uFloor: { value: config.floorReflect },
    uFloorFade: { value: config.floorFade }, uRipple: { value: config.floorRipple },
    uC100: { value: color(config.chrome100) }, uC300: { value: color(config.chrome300) },
    uC500: { value: color(config.chrome500) }, uC900: { value: color(config.chrome900) }, uAccent: { value: color(config.accent) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const card = document.querySelector("[data-daemon-card]");
  const observer = new ResizeObserver(() => { if (active) resize(); });
  const source = new Image();
  let active = false, destroyed = false, ready = false, time = 0, layout = null;
  source.src = config.wordmark.src;
  source.decode().then(() => {
    if (destroyed) return;
    ready = true; if (active) resize();
  }).catch(error => console.warn("Archives title unavailable", error));

  function resize() {
    if (destroyed) return;
    const width = innerWidth, height = innerHeight;
    const ratio = budgetPixelRatio(width, height, Math.min(devicePixelRatio || 1, settings.maxDpr), settings.maxPixels);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    uniforms.uRes.value.set(canvas.width, canvas.height);
    const rect = card?.getBoundingClientRect(), frame = settings.frame;
    const left = Math.max(width * frame.left, (rect?.right || 0) + frame.gutter);
    layout = { x: left, y: height * frame.top, width: width * (1 - frame.right) - left, height: height * (frame.bottom - frame.top) };
    if (height > width || layout.width < 150) {
      const top = Math.max(64, height * frame.top);
      layout = { x: width * .1, y: top, width: width * .8,
        height: Math.max(100, (rect?.top || height * .5) - top - frame.gutter) };
    }
    const mark = config.wordmark, w = layout.width * mark.width, h = layout.height * mark.height;
    uniforms.uMarkRect.value.set((layout.x + (layout.width - w) / 2) * ratio,
      (layout.y + layout.height * mark.centerY - h / 2) * ratio, w * ratio, h * ratio);
    if (ready) {
      markCanvas.width = bevelCanvas.width = Math.max(2, Math.round(w * ratio));
      markCanvas.height = bevelCanvas.height = Math.max(2, Math.round(h * ratio));
      markCanvas.getContext("2d").drawImage(source, 0, 0, markCanvas.width, markCanvas.height);
      markTexture.needsUpdate = true;
      const bevelPx = config.bevel * ratio * THREE.MathUtils.clamp(width / 1440, .6, 1.4);
      const bevel = bevelCanvas.getContext("2d");
      bevel.filter = `blur(${bevelPx}px)`; bevel.drawImage(markCanvas, 0, 0); bevel.filter = "none";
      bevel.globalCompositeOperation = "destination-in"; bevel.drawImage(markCanvas, 0, 0); bevel.globalCompositeOperation = "source-over";
      bevelTexture.needsUpdate = true; uniforms.uBevelPx.value = bevelPx * .9;
    }
    render();
  }
  function render() {
    if (!active || destroyed || !ready) return;
    renderer.render(scene, camera);
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(renderer.domElement, 0, 0);
  }
  return {
    canvas, preserveColor: true, dotPitch: 0, backgroundDim: config.backgroundDim,
    dither: { pitch: 1, intensity: 0, mode: 2 },
    get active() { return active; }, get ready() { return ready && !destroyed; },
    get layout() { return layout; }, get phase() { return time; },
    get renderInfo() { return { calls: renderer.info.render.calls, ...renderer.info.memory }; },
    start() {
      if (active || destroyed) return;
      active = true; time = 0; resize(); if (card) observer.observe(card);
      window.addEventListener("resize", resize);
    },
    stop() {
      active = false; observer.disconnect(); window.removeEventListener("resize", resize);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || destroyed || !ready || document.hidden) return;
      time += reduced ? 0 : Math.min(dt, .05);
      uniforms.uTime.value = time;
      uniforms.uReveal.value = reduced ? 1 : THREE.MathUtils.smoothstep(time, 0, settings.enter);
      render();
    },
    resize, render,
    destroy() {
      if (destroyed) return;
      this.stop(); destroyed = true;
      quad.geometry.dispose(); material.dispose(); markTexture.dispose(); bevelTexture.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.width = canvas.height = 1;
    },
  };
}
