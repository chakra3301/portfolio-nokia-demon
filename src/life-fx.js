import * as THREE from "three";
import { FluidSimulation, FLUID_CONFIG, randomFluidColor } from "./life-fluid.js";

/**
 * life.exe daemon backdrop — the site's cobalt pointer-fluid field carrying two
 * deterministic molecular studies: recombinant HGH/somatropin and Melanotan I.
 *
 * This canvas is composited through the instrument's existing Bayer post-pass,
 * so the fluid and molecular wireframes inherit the same dither grammar as the
 * other project daemons. The WebGL simulation only exists while this project is
 * visited; reduced motion and unsupported contexts receive a static 2D plate.
 */

const BLUE = 0x4e8cff;
const BLUE_BRIGHT = 0x9ac2ff;
const BLUE_DEEP = 0x1f5fd1;
const TAU = Math.PI * 2;

function rng32(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function addNode(model, x, y, z, energy = 0) {
  model.nodes.push({ x, y, z, energy });
  return model.nodes.length - 1;
}

function bond(model, a, b, order = 1) {
  model.bonds.push({ a, b, order });
}

function normalizeModel(model) {
  const center = model.nodes.reduce(
    (sum, node) => ({ x: sum.x + node.x, y: sum.y + node.y, z: sum.z + node.z }),
    { x: 0, y: 0, z: 0 },
  );
  center.x /= model.nodes.length;
  center.y /= model.nodes.length;
  center.z /= model.nodes.length;
  let radius = 0;
  for (const node of model.nodes) {
    node.x -= center.x;
    node.y -= center.y;
    node.z -= center.z;
    radius = Math.max(radius, Math.hypot(node.x, node.y, node.z));
  }
  const scale = radius ? 1 / radius : 1;
  for (const node of model.nodes) {
    node.x *= scale;
    node.y *= scale;
    node.z *= scale;
  }
  return model;
}

// Four alpha-helical bundles give HGH its folded protein silhouette without
// shipping an analytical conformer or a heavy model file.
function hghModel() {
  const model = { nodes: [], bonds: [] };
  const random = rng32(191);
  const helices = [
    { origin: [-1.05, -1.25, -0.45], tilt: 0.15, count: 34 },
    { origin: [-0.34, 1.35, 0.54], tilt: -0.16, count: 31 },
    { origin: [0.45, -1.22, 0.40], tilt: 0.12, count: 38 },
    { origin: [1.10, 1.26, -0.48], tilt: -0.13, count: 32 },
  ];
  let previousEnd = -1;

  helices.forEach((helix, helixIndex) => {
    let previous = -1;
    let first = -1;
    for (let index = 0; index < helix.count; index += 1) {
      const t = index / (helix.count - 1);
      const angle = index * 1.76 + helixIndex * 0.9;
      const x = helix.origin[0] + Math.cos(angle) * 0.25 + (t - 0.5) * helix.tilt;
      const y = helix.origin[1] + (helixIndex % 2 ? -1 : 1) * t * 2.55;
      const z = helix.origin[2] + Math.sin(angle) * 0.25;
      const node = addNode(model, x, y, z, index % 17 === 0 ? 0.9 : 0);
      if (first < 0) first = node;
      if (previous >= 0) bond(model, previous, node);
      previous = node;
      if (index % 3 === 0) {
        const side = addNode(
          model,
          x + Math.cos(angle) * (0.38 + random() * 0.12),
          y + (random() - 0.5) * 0.15,
          z + Math.sin(angle) * (0.38 + random() * 0.12),
          index % 9 === 0 ? 0.5 : 0,
        );
        bond(model, node, side);
      }
    }
    if (previousEnd >= 0) bond(model, previousEnd, first, 0);
    previousEnd = previous;
  });

  // Sparse tertiary contacts make the bundle read as one folded protein.
  for (let a = 0; a < model.nodes.length; a += 1) {
    for (let b = a + 12; b < model.nodes.length; b += 1) {
      const p = model.nodes[a];
      const q = model.nodes[b];
      if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 0.36 && random() > 0.78) {
        bond(model, a, b, 0);
      }
    }
  }
  return normalizeModel(model);
}

function melanotanModel() {
  const sequence = "SYSXEHFRWGKPV";
  const seed = 13;
  const random = rng32(seed);
  const model = { nodes: [], bonds: [] };
  let previousCarbonyl = -1;

  [...sequence].forEach((residue, index) => {
    const t = index - (sequence.length - 1) / 2;
    const fold = index * 1.44 + seed * 0.013;
    const center = {
      x: t * 0.54 + Math.sin(index * 0.73 + seed) * 0.24,
      y: Math.sin(fold) * 0.68 + Math.sin(index * 0.31) * 0.32,
      z: Math.cos(fold) * 0.62 + Math.cos(index * 0.47) * 0.26,
    };
    const direction = { x: 0.42, y: Math.cos(fold) * 0.18, z: -Math.sin(fold) * 0.18 };
    const nitrogen = addNode(model, center.x - direction.x, center.y - direction.y, center.z - direction.z);
    const alpha = addNode(model, center.x, center.y, center.z, index % 5 === 0 ? 0.65 : 0);
    const carbonyl = addNode(model, center.x + direction.x, center.y + direction.y, center.z + direction.z);
    const oxygen = addNode(model, center.x + direction.x + 0.08, center.y + direction.y + 0.34, center.z + direction.z - 0.18, 0.35);
    bond(model, nitrogen, alpha);
    bond(model, alpha, carbonyl);
    bond(model, carbonyl, oxygen, 2);
    if (previousCarbonyl >= 0) bond(model, previousCarbonyl, nitrogen);
    previousCarbonyl = carbonyl;

    const branchCount = 1 + ((residue.charCodeAt(0) + seed) % 3);
    let parent = alpha;
    for (let branch = 0; branch < branchCount; branch += 1) {
      const angle = fold + branch * 0.8 + random() * 0.25;
      const side = addNode(
        model,
        center.x + Math.sin(angle) * (0.40 + branch * 0.28),
        center.y + (branch + 1) * (random() > 0.5 ? 0.22 : -0.22),
        center.z + Math.cos(angle) * (0.40 + branch * 0.28),
        branch === branchCount - 1 ? 0.28 : 0,
      );
      bond(model, parent, side);
      parent = side;
    }
  });
  return normalizeModel(model);
}

function moleculeObject(model, { scale, position, phase }) {
  const group = new THREE.Group();
  const bondPositions = [];
  const contactPositions = [];
  const bondDotPositions = [];
  const nodePositions = [];
  const hotPositions = [];

  for (const edge of model.bonds) {
    const a = model.nodes[edge.a];
    const b = model.nodes[edge.b];
    const target = edge.order === 0 ? contactPositions : bondPositions;
    target.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (edge.order !== 0) {
      for (let step = 1; step < 4; step += 1) {
        const t = step / 4;
        bondDotPositions.push(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
        );
      }
    }
  }
  for (const node of model.nodes) {
    nodePositions.push(node.x, node.y, node.z);
    if (node.energy > 0.4) hotPositions.push(node.x, node.y, node.z);
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bondPositions, 3));
  const contactGeometry = new THREE.BufferGeometry();
  contactGeometry.setAttribute("position", new THREE.Float32BufferAttribute(contactPositions, 3));
  const bondDotGeometry = new THREE.BufferGeometry();
  bondDotGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bondDotPositions, 3));
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
  const hotGeometry = new THREE.BufferGeometry();
  hotGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hotPositions, 3));

  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  group.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: BLUE, opacity: 0.82, ...additive })));
  group.add(new THREE.LineSegments(contactGeometry, new THREE.LineBasicMaterial({ color: BLUE_DEEP, opacity: 0.30, ...additive })));
  group.add(new THREE.Points(bondDotGeometry, new THREE.PointsMaterial({ color: BLUE, opacity: 0.78, size: 2.5, sizeAttenuation: false, ...additive })));
  group.add(new THREE.Points(pointGeometry, new THREE.PointsMaterial({ color: BLUE_BRIGHT, opacity: 0.92, size: 3.0, sizeAttenuation: false, ...additive })));
  group.add(new THREE.Points(hotGeometry, new THREE.PointsMaterial({ color: 0xe5f0ff, opacity: 0.98, size: 4.8, sizeAttenuation: false, ...additive })));
  group.scale.setScalar(scale);
  group.position.set(...position);
  group.userData.phase = phase;
  group.userData.geometries = [lineGeometry, contactGeometry, bondDotGeometry, pointGeometry, hotGeometry];
  return group;
}

const SCREEN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FLUID_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uFluid;
  uniform sampler2D uBloom;
  uniform sampler2D uSunrays;
  uniform vec2 uTexel;
  uniform float uReady;
  uniform float uTime;

  vec3 linearToGamma(vec3 color) {
    color = max(color, vec3(0.0));
    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0.0));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    if (uReady < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec3 center = texture2D(uFluid, vUv).rgb;
    vec3 leftSample = texture2D(uFluid, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 rightSample = texture2D(uFluid, vUv + vec2(uTexel.x, 0.0)).rgb;
    vec3 topSample = texture2D(uFluid, vUv + vec2(0.0, uTexel.y)).rgb;
    vec3 bottomSample = texture2D(uFluid, vUv - vec2(0.0, uTexel.y)).rgb;
    float dx = length(rightSample) - length(leftSample);
    float dy = length(topSample) - length(bottomSample);
    vec3 normal = normalize(vec3(dx, dy, length(uTexel)));
    float diffuse = clamp(dot(normal, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
    float sunrays = texture2D(uSunrays, vUv).r;
    vec3 bloom = linearToGamma(texture2D(uBloom, vUv).rgb) * sunrays;
    vec3 color = center * diffuse * sunrays * 1.18 + bloom * 1.08;
    color += (hash(gl_FragCoord.xy + uTime) - 0.5) / 260.0;
    float alpha = clamp(max(color.r, max(color.g, color.b)) * 2.2, 0.0, 0.82);
    gl_FragColor = vec4(max(color, vec3(0.0)), alpha);
  }
`;

function drawStaticPlate(canvas, models) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const wash = context.createRadialGradient(width * 0.72, height * 0.48, 0, width * 0.72, height * 0.48, width * 0.52);
  wash.addColorStop(0, "rgba(31,95,209,0.08)");
  wash.addColorStop(0.55, "rgba(78,140,255,0.025)");
  wash.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  const drawModel = (model, cx, cy, size, yaw) => {
    const points = model.nodes.map((node) => {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      return { x: cx + (node.x * cos - node.z * sin) * size, y: cy + node.y * size };
    });
    context.strokeStyle = "rgba(130,175,255,0.92)";
    context.lineWidth = Math.max(1.35, width / 650);
    for (const edge of model.bonds) {
      const a = points[edge.a];
      const b = points[edge.b];
      context.globalAlpha = edge.order === 0 ? 0.28 : 0.82;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = "rgba(205,226,255,0.96)";
    points.forEach((point, index) => {
      const radius = model.nodes[index].energy > 0.4 ? 3.8 : 2.0;
      context.fillRect(point.x - radius / 2, point.y - radius / 2, radius, radius);
    });
  };

  drawModel(models.hgh, width * 0.73, height * 0.36, Math.min(width, height) * 0.27, -0.4);
  drawModel(models.melanotan, width * 0.70, height * 0.72, Math.min(width, height) * 0.22, 0.35);
}

export function createLifeFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const models = { hgh: hghModel(), melanotan: melanotanModel() };
  const finePointer = matchMedia("(pointer: fine)").matches;
  let fluidCapable = finePointer;
  let active = false;
  let renderer = null;
  let fluid = null;
  let screenScene = null;
  let moleculeScene = null;
  let camera = null;
  let screenMaterial = null;
  let hgh = null;
  let melanotan = null;
  let width = 1;
  let height = 1;
  let time = 0;
  let fluidAccumulator = 0;
  // Keep mobile/coarse-pointer devices on the static molecular plate: no cursor
  // exists there, and a second live WebGL context would spend GPU for no gain.
  let fallback2d = reduced || !finePointer;
  const pointer = new THREE.Vector2(0.68, 0.5);
  const pointerTarget = new THREE.Vector2(0.68, 0.5);
  const fluidPointer = { x: 0.68, y: 0.5, prevX: 0.68, prevY: 0.5, moved: true, color: randomFluidColor() };

  function initWebGL() {
    if (renderer || fallback2d) return;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
        premultipliedAlpha: false,
      });
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      const gl = renderer.getContext();
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      if (/swiftshader|llvmpipe|software/i.test(String(rendererName))) fluidCapable = false;

      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 4;
      screenScene = new THREE.Scene();
      moleculeScene = new THREE.Scene();
      screenMaterial = new THREE.ShaderMaterial({
        vertexShader: SCREEN_VERTEX,
        fragmentShader: FLUID_FRAGMENT,
        uniforms: {
          uFluid: { value: null },
          uBloom: { value: null },
          uSunrays: { value: null },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uReady: { value: 0 },
          uTime: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenMaterial);
      screen.frustumCulled = false;
      screenScene.add(screen);

      hgh = moleculeObject(models.hgh, { scale: 0.58, position: [0, 0.20, 0], phase: 0.3 });
      melanotan = moleculeObject(models.melanotan, { scale: 0.62, position: [0, -0.50, 0], phase: 1.7 });
      moleculeScene.add(hgh, melanotan);
    } catch {
      renderer?.dispose();
      renderer = null;
      fallback2d = true;
    }
  }

  function resetFluid() {
    fluid?.dispose();
    fluid = null;
    if (!renderer || !fluidCapable || reduced) return;
    try {
      fluid = new FluidSimulation(renderer, width, height);
      screenMaterial.uniforms.uReady.value = 0;
    } catch {
      fluid = null;
      screenMaterial.uniforms.uReady.value = 0;
    }
  }

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (fallback2d) {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      drawStaticPlate(canvas, models);
      return;
    }

    initWebGL();
    if (!renderer) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    hgh.position.x = aspect * 0.30;
    melanotan.position.x = aspect * 0.25;
    screenMaterial.uniforms.uTexel.value.set(1 / width, 1 / height);
    if (!fluid || fluid.width !== width || fluid.height !== height) resetFluid();
  }

  function setPointer(x, y) {
    pointerTarget.set(x, y);
    if (!fluid) return;
    fluidPointer.prevX = fluidPointer.x;
    fluidPointer.prevY = fluidPointer.y;
    fluidPointer.x = THREE.MathUtils.clamp(x, 0, 1);
    fluidPointer.y = THREE.MathUtils.clamp(1 - y, 0, 1);
    fluidPointer.moved = true;
    fluidPointer.color = randomFluidColor();
  }

  function onPointerMove(event) {
    if (!active) return;
    setPointer(event.clientX / width, event.clientY / height);
  }

  function updateFluid(dt) {
    if (!fluid) return;
    fluid.autoSplatTimer += dt;
    if (fluid.autoSplatTimer > FLUID_CONFIG.AUTO_SPLAT_INTERVAL) {
      fluid.autoSplatTimer = 0;
      fluid.multipleSplats(1 + Math.floor(Math.random() * 3));
    }
    if (fluidPointer.moved) {
      fluidPointer.moved = false;
      const aspect = fluid.width / fluid.height;
      let dx = fluidPointer.x - fluidPointer.prevX;
      let dy = fluidPointer.y - fluidPointer.prevY;
      if (aspect < 1) dx *= aspect;
      if (aspect > 1) dy /= aspect;
      fluid.splat(
        fluidPointer.x,
        fluidPointer.y,
        dx * FLUID_CONFIG.SPLAT_FORCE,
        dy * FLUID_CONFIG.SPLAT_FORCE,
        fluidPointer.color,
      );
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    fluid.step(dt);
    fluid.applyBloom();
    fluid.applySunrays();
    renderer.setRenderTarget(null);
    renderer.autoClear = autoClear;
    screenMaterial.uniforms.uFluid.value = fluid.dyeTexture;
    screenMaterial.uniforms.uBloom.value = fluid.bloomTexture;
    screenMaterial.uniforms.uSunrays.value = fluid.sunraysTexture;
    screenMaterial.uniforms.uReady.value = 1;
  }

  function update(dt) {
    if (!active || fallback2d || !renderer) return;
    time += dt;
    pointer.lerp(pointerTarget, 0.08);
    // The Navier–Stokes passes run at 30 Hz while molecular motion and the
    // instrument remain at display rate. This halves the second-context GPU
    // cost without making cursor splats feel delayed.
    fluidAccumulator += dt;
    if (fluidAccumulator >= 1 / 30) {
      updateFluid(Math.min(fluidAccumulator, 1 / 30));
      fluidAccumulator = 0;
    }
    screenMaterial.uniforms.uTime.value = time;

    hgh.rotation.y = time * 0.16 + (pointer.x - 0.5) * 0.42;
    hgh.rotation.x = -0.18 + (pointer.y - 0.5) * 0.24;
    hgh.rotation.z = Math.sin(time * 0.18) * 0.07;
    melanotan.rotation.y = -time * 0.21 + (pointer.x - 0.5) * 0.52;
    melanotan.rotation.x = 0.18 + (pointer.y - 0.5) * 0.28;
    melanotan.rotation.z = Math.sin(time * 0.25 + 1.7) * 0.10;

    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(screenScene, camera);
    renderer.clearDepth();
    renderer.render(moleculeScene, camera);
    renderer.autoClear = autoClear;
  }

  function disposeMolecule(group) {
    if (!group) return;
    for (const geometry of group.userData.geometries || []) geometry.dispose();
    group.traverse((object) => object.material?.dispose?.());
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      active = true;
      time = 0;
      fluidAccumulator = 0;
      initWebGL();
      resize();
      if (fallback2d) drawStaticPlate(canvas, models);
      addEventListener("resize", resize, { passive: true });
      addEventListener("pointermove", onPointerMove, { passive: true });
    },
    stop() {
      active = false;
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onPointerMove);
      if (fallback2d) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      else if (renderer) {
        renderer.setRenderTarget(null);
        renderer.clear();
      }
    },
    update,
    resize,
    destroy() {
      this.stop();
      fluid?.dispose();
      screenScene?.traverse((object) => {
        object.geometry?.dispose?.();
        object.material?.dispose?.();
      });
      disposeMolecule(hgh);
      disposeMolecule(melanotan);
      renderer?.dispose();
    },
  };
}
