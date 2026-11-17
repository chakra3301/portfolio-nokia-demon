import * as THREE from "three";
import tokens from "../design-tokens.json";

const vertexShader = `
  uniform float uTime;
  uniform float uMotion;
  uniform vec4 uCrop;
  uniform float uBreathRate;
  uniform float uBreathAmount;
  varying vec2 vUv;
  varying vec2 vLocalUv;
  void main() {
    vLocalUv = uv;
    vUv = uCrop.xy + uv * uCrop.zw;
    vec3 p = position;
    float chest = exp(-pow((vUv.y - .62) * 6.0, 2.0));
    float breath = sin(uTime * uBreathRate) * uBreathAmount * uMotion;
    p.x *= 1.0 + breath * chest;
    p.y += breath * chest * .16;
    p.z = cos((uv.x - .5) * 3.14) * chest * .025;
    p.z += breath * chest * .15;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragmentShader = `
  uniform sampler2D uFigure;
  uniform float uTime;
  uniform float uMotion;
  uniform float uReveal;
  uniform float uPortrait;
  uniform float uPixelRatio;
  uniform float uDotPitch;
  uniform float uDotStrength;
  uniform float uOpacity;
  uniform float uGlitchPeriod;
  uniform float uGlitchDuration;
  uniform float uGlitchDelay;
  uniform float uGlitchOffset;
  uniform vec3 uTint;
  uniform float uScanGlow;
  varying vec2 vUv;
  varying vec2 vLocalUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // A few horizontal bands briefly lose alignment, rather than flashing
    // the entire figure. The print remains readable between signal tears.
    float signalTime = max(0.0, uTime - uGlitchDelay);
    float phase = mod(signalTime, uGlitchPeriod);
    float pulse = (1.0 - smoothstep(0.0, uGlitchDuration, phase))
      * step(uGlitchDelay, uTime) * uMotion;
    float row = floor(vLocalUv.y * 24.0);
    float event = floor(signalTime / uGlitchPeriod);
    float band = step(.72, hash(vec2(row, event + 9.0)));
    float direction = hash(vec2(row + 7.0, event)) * 2.0 - 1.0;
    vec2 uv = vUv + vec2(direction * band * pulse * uGlitchOffset, 0.0);
    uv = clamp(uv, .001, .999);
    vec4 figure = texture2D(uFigure, uv);
    vec2 split = vec2(uGlitchOffset * .32 * pulse * band, 0.0);
    figure.r = mix(figure.r, texture2D(uFigure, uv + split).r, pulse * band);
    figure.b = mix(figure.b, texture2D(uFigure, uv - split).b, pulse * band);

    // Partial alpha between the dots lets the actual page show through,
    // while retaining the dark hoodie and the original print's color.
    vec2 dotUv = fract(gl_FragCoord.xy / (uDotPitch * uPixelRatio)) - .5;
    float dotInk = 1.0 - smoothstep(.36, .47, length(dotUv));
    float dotCoverage = mix(1.0, dotInk, uDotStrength);
    float scan = exp(-pow((vLocalUv.y - fract(uTime * .14)) * 55.0, 2.0)) * uMotion;
    figure.rgb += uTint * uScanGlow * scan;
    // A portrait crop fades at the hem rather than cutting the figure sharply.
    float hem = mix(1.0, smoothstep(.0, .085, vLocalUv.y), uPortrait);
    float signal = 1.0 - pulse * band * .14;
    gl_FragColor = vec4(figure.rgb, figure.a * uReveal * hem * uOpacity * dotCoverage * signal);
    #include <colorspace_fragment>
  }
`;

/** A breathing, lightly dithered hologram on a shallow portrait mesh. */
export function createDiaFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  camera.position.z = 1000;
  const stage = new THREE.Group();
  scene.add(stage);
  const geometry = new THREE.PlaneGeometry(1, 1, 16, 24);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const motion = tokens.motion.dia;
  const hologram = tokens.hologram.dia;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFigure: { value: blank }, uTime: { value: 0 }, uReveal: { value: reduced ? 1 : 0 },
      uMotion: { value: reduced ? 0 : 1 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uPortrait: { value: 0 }, uBreathRate: { value: motion.breathRate },
      uBreathAmount: { value: motion.breathAmount },
      uPixelRatio: { value: 1 }, uDotPitch: { value: hologram.dotPitch },
      uDotStrength: { value: hologram.dotStrength }, uOpacity: { value: hologram.opacity },
      uGlitchPeriod: { value: motion.glitchPeriod }, uGlitchDuration: { value: motion.glitchDuration },
      uGlitchDelay: { value: motion.glitchDelay }, uGlitchOffset: { value: hologram.glitchOffset },
      uTint: { value: new THREE.Color(hologram.tint) }, uScanGlow: { value: hologram.scanGlow },
    },
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const figure = new THREE.Mesh(geometry, material);
  figure.frustumCulled = false;
  stage.add(figure);
  const textures = new Set([blank]);
  const image = new Image();
  image.decoding = "async";
  const pointer = new THREE.Vector2(), targetPointer = new THREE.Vector2();
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cardElement = document.querySelector("[data-daemon-card]");
  const cardObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => { if (active) resize(); }) : null;
  let width = 1, height = 1, ratio = 1, time = 0, sourceAspect = 2 / 3;
  let active = false, destroyed = false, assetReady = false, failed = false;
  let layoutBox = null, framing = "full";

  function render() {
    if (!active || destroyed) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
    if (!assetReady) {
      context.save();
      context.scale(ratio, ratio);
      context.font = `10px ${tokens.typography.family.text}`;
      context.fillStyle = tokens.color.muted;
      context.textAlign = "center";
      context.fillText(failed ? "DIA · FIGURE UNAVAILABLE" : "DIA · MATERIALIZING",
        layoutBox.x + layoutBox.width / 2, layoutBox.y + layoutBox.height / 2);
      context.restore();
    }
  }

  function resize() {
    if (destroyed) return;
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight);
    ratio = Math.min(devicePixelRatio || 1, width <= 700 ? 1 : 1.25);
    material.uniforms.uPixelRatio.value = ratio;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    const card = cardElement?.getBoundingClientRect();
    const left = Math.max(width * .47, (card?.right || width * .5) + 28);
    const desktopRoom = width - left - 30;
    if ((width > 700 || width > height) && desktopRoom > 150) {
      layoutBox = { x: left, y: height * .07, width: desktopRoom, height: height * .85 };
    } else {
      const top = 48;
      const bottom = Math.max(top + 90, (card?.top || height * .52) - 24);
      layoutBox = { x: 20, y: top, width: width - 40, height: bottom - top };
    }
    const portrait = layoutBox.height < 430;
    framing = portrait ? "portrait" : "full";
    const crop = material.uniforms.uCrop.value;
    crop.set(...(portrait ? [.14, .35, .72, .65] : [0, 0, 1, 1]));
    material.uniforms.uPortrait.value = portrait ? 1 : 0;
    const aspect = sourceAspect * crop.z / crop.w;
    const figureHeight = Math.min(layoutBox.height * .98, layoutBox.width * .96 / aspect);
    stage.scale.set(figureHeight * aspect, figureHeight, figureHeight);
    stage.position.set(layoutBox.x + layoutBox.width / 2 - width / 2,
      height / 2 - layoutBox.y - layoutBox.height / 2, 0);
    render();
  }

  function onPointerMove(event) {
    if (!layoutBox) return;
    const x = (event.clientX - layoutBox.x) / layoutBox.width * 2 - 1;
    const y = (event.clientY - layoutBox.y) / layoutBox.height * 2 - 1;
    targetPointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }
  function resetPointer() { targetPointer.set(0, 0); }

  image.onload = () => {
    if (destroyed) return;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    textures.add(texture);
    material.uniforms.uFigure.value = texture;
    sourceAspect = image.naturalWidth / image.naturalHeight;
    assetReady = true;
    if (active) resize();
  };
  image.onerror = () => { if (!destroyed) { failed = true; render(); } };
  image.src = "/fx/dia-hooded-figure.webp";

  return {
    canvas, dotPitch: tokens.dither.dia.dotPitch, backgroundDim: tokens.dither.dia.backgroundDim,
    preserveColor: true, dither: tokens.dither.dia,
    get active() { return active; },
    get ready() { return assetReady; },
    get layout() { return layoutBox; },
    get framing() { return framing; },
    get phase() { return time; },
    get renderInfo() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...renderer.info.memory }; },
    start() {
      if (destroyed || active) return;
      active = true; time = reduced ? motion.enter : 0;
      pointer.set(0, 0); targetPointer.set(0, 0); stage.rotation.set(0, 0, 0);
      material.uniforms.uTime.value = time;
      material.uniforms.uReveal.value = reduced ? 1 : 0;
      if (cardElement) cardObserver?.observe(cardElement);
      resize(); window.addEventListener("resize", resize);
      if (finePointer && !reduced) {
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("pointerleave", resetPointer);
      }
    },
    stop() {
      active = false;
      cardObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", resetPointer);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || destroyed || reduced || document.hidden) return;
      const step = Math.min(dt, .1);
      if (assetReady) time += step;
      material.uniforms.uTime.value = time;
      const progress = Math.min(1, time / motion.enter);
      material.uniforms.uReveal.value = progress * progress * (3 - 2 * progress);
      pointer.lerp(targetPointer, 1 - Math.exp(-step * 4));
      stage.rotation.set(-pointer.y * .015, pointer.x * .035, Math.sin(time * .3) * .002);
      render();
    },
    resize, render,
    destroy() {
      if (destroyed) return;
      this.stop(); destroyed = true;
      image.onload = image.onerror = null;
      image.removeAttribute("src");
      geometry.dispose(); material.dispose();
      textures.forEach(texture => texture.dispose()); textures.clear();
      renderer.dispose(); renderer.forceContextLoss(); scene.clear();
      canvas.width = canvas.height = 1;
    },
  };
}
