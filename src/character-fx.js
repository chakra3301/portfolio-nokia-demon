/** EMP's original Jester and wordmark in the daemon stage. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { budgetPixelRatio } from "./render-budget.js";
import tokens from "../design-tokens.json";

const vertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uScene, uGlyphs;
  uniform vec2 uRes;
  uniform float uCell, uCount, uReveal;
  vec3 displayColor(vec3 c) {
    c = clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c));
  }
  vec4 picture(vec2 uv) {
    vec4 s = texture2D(uScene, clamp(uv, vec2(0.0), vec2(1.0)));
    // Scene render targets store premultiplied RGB against transparent black.
    return vec4(displayColor(s.rgb / max(s.a, .001)), s.a);
  }
  void main() {
    vec4 result;
    vec2 cell = floor(vUv * uRes / uCell);
    vec2 center = (cell + .5) * uCell / uRes;
    vec4 s = picture(center);
    float lum = dot(s.rgb, vec3(.299, .587, .114));
    float index = floor(clamp(pow(lum, .72), 0.0, .999) * uCount);
    vec2 f = fract(vUv * uRes / uCell);
    float ink = texture2D(uGlyphs, vec2((index + f.x) / uCount, f.y)).r;
    vec3 color = mix(vec3(.6), s.rgb * 1.25, .88);
    result = vec4(color, s.a * mix(.16, 1.0, ink));
    gl_FragColor = vec4(result.rgb, result.a * uReveal);
  }
`;

function glyphAtlas(glyphs) {
  const chars = [...glyphs], size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = chars.length * size; canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, size);
  context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle";
  context.font = `700 43px ${tokens.typography.family.text}`;
  chars.forEach((char, index) => context.fillText(char, index * size + size / 2, size / 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  return { texture, count: chars.length };
}

export function createCharacterFx(id, { reduced = false } = {}) {
  const settings = tokens.characters, config = settings[id];
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), stage = new THREE.Group(); scene.add(stage);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10000); camera.position.z = 2000;
  const environmentScene = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .04);
  scene.environment = environment.texture; scene.environmentIntensity = config.envIntensity;
  environmentScene.dispose(); pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, config.keyLight); key.position.set(1.4, 2.4, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe6e8ec, config.rimLight); rim.position.set(-1.8, 1.6, -2); scene.add(rim);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const atlas = glyphAtlas(tokens.characters.emp.glyphs);
  const uniforms = {
    uScene: { value: target.texture }, uGlyphs: { value: atlas.texture },
    uRes: { value: new THREE.Vector2() }, uCell: { value: 5 }, uCount: { value: atlas.count },
    uReveal: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true,
    depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), post = new THREE.Scene(); post.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pointer = new THREE.Vector2(), goal = new THREE.Vector2();
  const card = document.querySelector("[data-daemon-card]");
  const observer = new ResizeObserver(() => { if (active) resize(); });
  let active = false, destroyed = false, model = null, mixer = null, currentAction = null, hips = null, hipsRest = null;
  let time = 0, width = 1, height = 1;
  let bounds = null, layout = null, moveIndex = 0, wordmark = null;
  const actions = new Map(), textures = new Set();

  function resize() {
    width = innerWidth; height = innerHeight;
    const ratio = budgetPixelRatio(width, height, Math.min(devicePixelRatio || 1, settings.maxDpr), settings.maxPixels);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); target.setSize(canvas.width, canvas.height);
    uniforms.uRes.value.set(canvas.width, canvas.height); uniforms.uCell.value = Math.round((config.glyphCell || 5) * ratio);
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
    const rect = card?.getBoundingClientRect(), frame = settings.frame;
    const left = Math.max(width * frame.left, (rect?.right || 0) + frame.gutter);
    layout = { x: left, y: height * frame.top, width: width * (1 - frame.right) - left, height: height * (frame.bottom - frame.top) };
    if (height > width || layout.width < 150) {
      const top = Math.max(64, height * frame.top);
      layout = { x: width * .1, y: top, width: width * .8,
        height: Math.max(100, (rect?.top || height * .5) - top - frame.gutter) };
    }
    if (model && bounds) {
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(layout.height / size.y, layout.width * .92 / size.x);
      stage.scale.setScalar(scale);
      stage.position.set(layout.x + layout.width / 2 - width / 2 - center.x * scale,
        height / 2 - layout.y - layout.height - bounds.min.y * scale, 0);
    }
    if (wordmark) {
      const mark = config.wordmark;
      wordmark.scale.set(layout.width * mark.width, layout.height * mark.height, 1);
      wordmark.position.set(layout.x + layout.width / 2 - width / 2,
        height / 2 - layout.y - layout.height * mark.centerY, -1000);
    }
  }

  function play(name, once = false) {
    const action = actions.get(name); if (!action || action === currentAction) return;
    action.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once; action.play();
    currentAction?.crossFadeTo(action, .35, false); currentAction = action;
  }
  function onMove(event) {
    if (!layout || event.target.closest?.("a,button,[data-daemon-card]")) return;
    goal.set(THREE.MathUtils.clamp((event.clientX - layout.x) / layout.width * 2 - 1, -1, 1),
      THREE.MathUtils.clamp((event.clientY - layout.y) / layout.height * 2 - 1, -1, 1));
  }
  function resetPointer() { goal.set(0, 0); }
  function onClick(event) {
    if (!layout || event.target.closest?.("a,button,[data-daemon-card]")) return;
    if (event.clientX < layout.x || event.clientX > layout.x + layout.width || event.clientY < layout.y || event.clientY > layout.y + layout.height) return;
    play(["Dance", "Cheer", "Greeting"][moveIndex++ % 3], true);
  }

  async function load() {
    const [gltf, sourceTexture] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(config.model),
      new THREE.TextureLoader().loadAsync(config.wordmark.src),
    ]);
    if (destroyed) { disposeModel(gltf.scene); sourceTexture.dispose(); return; }
    // Rasterize the outline SVG at artwork resolution: SVGs without explicit
    // dimensions can upload an empty image directly to WebGL on Chromium.
    const markCanvas = document.createElement("canvas");
    markCanvas.width = config.wordmark.textureWidth; markCanvas.height = config.wordmark.textureHeight;
    markCanvas.getContext("2d").drawImage(sourceTexture.image, 0, 0, markCanvas.width, markCanvas.height);
    const texture = new THREE.CanvasTexture(markCanvas); sourceTexture.dispose();
    texture.colorSpace = THREE.SRGBColorSpace;
    wordmark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    scene.add(wordmark);
    model = gltf.scene;
    model.traverse(object => { if (object.isMesh) object.frustumCulled = false; });
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    play("Idle"); mixer.update(0);
    mixer.addEventListener("finished", () => play("Idle"));
    stage.add(model); model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model, true);
    hips = model.getObjectByName("hips"); hipsRest = hips?.position.clone();
    if (active) { resize(); play("Greeting", true); }
  }
  load().catch(error => { console.warn(`${id} artwork unavailable`, error); });

  function render() {
    if (!active || destroyed) return;
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(post, postCamera);
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(renderer.domElement, 0, 0);
  }
  function disposeModel(root) {
    root.traverse(object => {
      object.geometry?.dispose(); object.skeleton?.dispose();
      for (const mat of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
        mat.dispose();
      }
    });
    textures.forEach(texture => texture.dispose()); textures.clear();
  }
  return {
    canvas, preserveColor: true, dotPitch: 0, backgroundDim: config.backgroundDim,
    dither: { pitch: 1, intensity: .06, mode: 2 },
    get active() { return active; }, get ready() { return !!model; },
    get layout() { return layout; }, get phase() { return time; },
    get renderInfo() { return { calls: renderer.info.render.calls, ...renderer.info.memory }; },
    start() {
      if (destroyed || active) return;
      active = true; time = 0; resize(); if (card) observer.observe(card);
      window.addEventListener("resize", resize);
      if (!reduced) {
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("click", onClick); document.addEventListener("pointerleave", resetPointer);
        if (model) play("Greeting", true);
      }
      render();
    },
    stop() {
      active = false; observer.disconnect(); window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("click", onClick);
      document.removeEventListener("pointerleave", resetPointer); resetPointer();
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || destroyed || document.hidden) return;
      if (model) time += Math.min(dt, .05);
      uniforms.uReveal.value = reduced ? 1 : THREE.MathUtils.smoothstep(time, 0, settings.enter);
      pointer.lerp(goal, 1 - Math.exp(-dt * settings.followRate));
      stage.rotation.y = reduced ? 0 : pointer.x * settings.bodyYaw;
      mixer?.update(reduced ? 0 : dt);
      if (hips && hipsRest) { hips.position.x = hipsRest.x; hips.position.z = hipsRest.z; }
      render();
    },
    resize, render,
    destroy() {
      if (destroyed) return; this.stop(); destroyed = true;
      mixer?.stopAllAction(); if (model) { mixer?.uncacheRoot(model); disposeModel(model); }
      if (wordmark) disposeModel(wordmark);
      environment.dispose(); target.dispose(); atlas.texture.dispose();
      quad.geometry.dispose(); material.dispose(); scene.clear(); post.clear();
      renderer.dispose(); renderer.forceContextLoss(); canvas.width = canvas.height = 1;
    },
  };
}
