/**
 * Orion Terminal daemon backdrop — R.O.S.I.E (Recursive Oracle: Sentient
 * Interface Entity) spawns into the process and introduces herself.
 *
 * Her real 3D character (the Orion Terminal companion GLB, re-compressed to
 * ~3.4 MB and lazy-loaded only when this daemon opens) is rendered in a
 * private Three.js scene to an offscreen WebGL canvas, then composited onto
 * a 2D canvas with a slice-glitch materialize, typed caption, and spawn
 * rings. The instrument's ordered-Bayer post pass requantizes the whole
 * frame on composite — so she and her EVIL SHADOW (a dark clone that mimics
 * her a half-beat late and occasionally desyncs) render in the same
 * dot-dither art as the other daemon animations.
 *
 * Timeline: load → glitch-in → Formal_Bow (caption types) → Idle_15 loop
 *           → the shadow flickers in behind her … and stays.
 */
import * as THREE from "three";

const ACCENT = "#4DE8FF";       // Orion project cyan
const SHADOW_RED = "#8C1224";
const CAPTION_LINES = [
  "R.O.S.I.E ONLINE",
  "recursive oracle : sentient interface entity",
  "\u201Chello, operator. the terminal is listening.\u201D",
];
const SHADOW_LINE = "\u2026something else is listening too.";
const TYPE_SPEED = 34; // chars per second

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);

export function createOrionFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas"); // 2D composite (what the instrument samples)
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // three.js internals (built lazily on first start)
  let three = null;   // { renderer, scene, camera, stage, mixer, shadowMixer, clips, char, shadow, shadowMats, glowLight }
  let loadState = "idle"; // idle | loading | ready | failed
  let phase = "loading";  // loading | spawn | bow | idle
  let phaseT = 0;
  let shadowOn = false;
  let shadowRevealT = -1;
  let spawnRings = [];    // { age, life }
  let typed = 0;          // caption characters typed so far
  let feetScreen = { x: 0.66, y: 0.8 }; // normalized anchor, updated by projection

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // match the other fx canvases
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (three) {
      three.renderer.setSize(w, h, false);
      three.camera.aspect = w / h;
      three.camera.updateProjectionMatrix();
      placeStage();
    }
  }

  /** seat the character right-of-center so the daemon card owns the left */
  function placeStage() {
    if (!three) return;
    const { camera, stage } = three;
    const dist = camera.position.z - stage.position.z;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    stage.position.x = 0.34 * halfH * camera.aspect * 2 * 0.5; // ~ndc +0.34
  }

  async function load() {
    if (loadState !== "idle") return;
    loadState = "loading";
    try {
      const [{ GLTFLoader }, { clone: skClone }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/utils/SkeletonUtils.js"),
      ]);
      const gltf = await new GLTFLoader().loadAsync("/fx/rosie.glb");

      // alpha canvas: the 2D pass paints a holo-glow BEHIND her, so her black
      // outfit reads as a hard silhouette instead of vanishing in the screen blend
      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(w || window.innerWidth, h || window.innerHeight, false);

      // IMPORTANT: the model is tiny (~0.017 units tall) and its clips carry
      // root-motion keys in that raw scale. Scaling the mesh up amplifies the
      // root motion into meters of drift — so we keep the model at native
      // scale and bring the CAMERA to it instead. U = her raw height.
      const char = gltf.scene;
      const box = new THREE.Box3().setFromObject(char);
      const size = box.getSize(new THREE.Vector3());
      const U = size.y || 1;
      char.position.y -= box.min.y;
      const k = U / 1.7; // converts "human-scale" tuning values into model units

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, (w || 1) / (h || 1), U * 0.05, U * 60);
      camera.position.set(0, U * 0.62, U * 3.05);
      camera.lookAt(0, U * 0.5, 0);

      // moody portrait lighting in the project accent — generous fill, because
      // dark pixels vanish in the instrument's screen-blend composite
      scene.add(new THREE.AmbientLight(0x5a6878, 2.2));
      const key = new THREE.DirectionalLight(0xdfeaff, 3.2);
      key.position.set(-2.4, 3.2, 3.4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x8fb8cc, 1.4);
      fill.position.set(1.8, 0.6, 4.2);
      scene.add(fill);
      // strong twin rims — her outfit is black, so the silhouette edge IS her
      const rim = new THREE.PointLight(new THREE.Color(ACCENT), 34 * k * k, 14 * k);
      rim.position.set(1.7 * k, 2.2 * k, -1.4 * k);
      scene.add(rim);
      const rim2 = new THREE.PointLight(0xcfe6ff, 22 * k * k, 12 * k);
      rim2.position.set(-2.1 * k, 1.4 * k, -0.8 * k);
      scene.add(rim2);
      const glowLight = new THREE.PointLight(new THREE.Color(SHADOW_RED), 0, 9 * k); // rises with the shadow
      glowLight.position.set(-1.4 * k, 2.1 * k, -1.2 * k);
      scene.add(glowLight);

      const stage = new THREE.Group();
      stage.add(char);
      scene.add(stage);

      const clips = {};
      for (const c of gltf.animations) clips[c.name] = c;
      const mixer = new THREE.AnimationMixer(char);

      // the evil shadow — her dark double, looming larger, half a beat behind
      const shadow = skClone(char);
      const shadowMats = [];
      shadow.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          const m = new THREE.MeshStandardMaterial({
            color: 0x150308,
            emissive: new THREE.Color(SHADOW_RED),
            emissiveIntensity: 0,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0,
          });
          o.material = m;
          shadowMats.push(m);
        }
      });
      shadow.scale.multiplyScalar(1.6);
      shadow.position.set(-1.05 * k, char.position.y * 1.6, -2.1 * k);
      shadow.rotation.y = -0.24; // looming over her shoulder, slightly turned
      stage.add(shadow);
      const shadowMixer = new THREE.AnimationMixer(shadow);

      three = { renderer, scene, camera, stage, mixer, shadowMixer, clips, char, shadow, shadowMats, glowLight, k };
      placeStage();
      loadState = "ready";
      if (active) beginSpawn();
    } catch (e) {
      loadState = "failed";
    }
  }

  function playOnce(mixer, clips, name, fadeFrom = null) {
    const clip = clips[name];
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    if (fadeFrom) { fadeFrom.fadeOut(0.35); a.fadeIn(0.35); }
    a.play();
    return a;
  }
  function playLoop(mixer, clips, name, fadeFrom = null) {
    const clip = clips[name];
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.reset();
    a.setLoop(THREE.LoopRepeat, Infinity);
    if (fadeFrom) { fadeFrom.fadeOut(0.5); a.fadeIn(0.5); }
    a.play();
    return a;
  }

  let bowAction = null;
  function beginSpawn() {
    if (!three) return;
    phase = reduced ? "idle" : "spawn";
    phaseT = 0;
    typed = reduced ? 9999 : 0;
    shadowOn = false;
    shadowRevealT = -1;
    spawnRings = reduced ? [] : [{ age: 0, life: 1.1 }, { age: -0.25, life: 1.2 }];
    three.mixer.stopAllAction();
    three.shadowMixer.stopAllAction();
    if (reduced) {
      playLoop(three.mixer, three.clips, "Idle_15");
      three.mixer.update(0.01);
      // static, faint shadow — present but not animated
      for (const m of three.shadowMats) m.opacity = 0.5;
      playLoop(three.shadowMixer, three.clips, "Idle_15");
      three.shadowMixer.update(0.01);
    }
  }

  /** project her feet + head into screen space for rings/caption anchors */
  const tmpV = new THREE.Vector3();
  function projectFeet() {
    if (!three) return;
    tmpV.set(three.stage.position.x, 0, 0).project(three.camera);
    feetScreen.x = tmpV.x * 0.5 + 0.5;
    feetScreen.y = -tmpV.y * 0.5 + 0.5;
  }

  function drawSpawnRings(dt) {
    const step = Math.max(2.2, Math.min(w, h) / 340);
    const fx = feetScreen.x * w, fy = feetScreen.y * h;
    for (let i = spawnRings.length - 1; i >= 0; i--) {
      const r = spawnRings[i];
      r.age += dt;
      if (r.age < 0) continue;
      const q = clamp01(r.age / r.life);
      if (q >= 1) { spawnRings.splice(i, 1); continue; }
      const rad = easeOut3(q) * Math.min(w, h) * 0.24;
      const alpha = (1 - q) * 0.6;
      const n = Math.max(30, Math.round(rad * 0.6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        if (Math.random() < 0.3) continue;
        ctx.globalAlpha = alpha * (0.7 + Math.random() * 0.3);
        ctx.fillStyle = ACCENT;
        ctx.fillRect(fx + Math.cos(a) * rad - step / 2, fy + Math.sin(a) * rad * 0.3 - step / 2, step, step);
      }
    }
  }

  function drawCaption() {
    const total = CAPTION_LINES.join("\n").length;
    const shown = Math.min(typed, total);
    if (shown <= 0) return;
    const fx = feetScreen.x * w;
    const baseY = Math.min(h * 0.86, feetScreen.y * h + 40);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    let remaining = shown;
    const shadowBeat = shadowOn && shadowRevealT >= 0 && t - shadowRevealT > 0.25 && t - shadowRevealT < 2.1;
    CAPTION_LINES.forEach((line, i) => {
      if (remaining <= 0) return;
      const n = Math.min(line.length, remaining);
      remaining -= line.length + 1;
      let text = line.slice(0, n);
      let color = i === 0 ? ACCENT : "rgba(190,225,240,0.85)";
      let size = i === 0 ? 15 : 12;
      if (i === 2 && shadowBeat) { // the shadow hijacks her sign-off for a beat
        text = SHADOW_LINE;
        color = "#FF3B5C";
        if (Math.random() < 0.2) return; // flicker
      }
      ctx.font = `${i === 0 ? 600 : 400} ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = color;
      const jx = shadowBeat && i === 2 ? (Math.random() - 0.5) * 3 : 0;
      ctx.fillText(text, fx + jx, baseY + i * 20);
      // block cursor on the line being typed
      if (n < line.length || (remaining <= 0 && n === line.length && Math.floor(t * 2.4) % 2 === 0 && !reduced)) {
        const tw = ctx.measureText(text).width;
        ctx.fillRect(fx + tw / 2 + 3, baseY + i * 20 - size + 3, size * 0.55, size);
      }
    });
  }

  function drawLoadingPulse() {
    // tiny breathing dot-cluster where she will appear
    const fx = w * 0.66, fy = h * 0.55;
    const step = 3;
    const r = 10 + Math.sin(t * 3) * 4;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + t;
      ctx.globalAlpha = 0.4 + Math.sin(t * 3 + k) * 0.2;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.5, step, step);
    }
  }

  function update(dt) {
    if (!active) return;
    t += dt;
    phaseT += dt;
    ctx.clearRect(0, 0, w, h);

    if (!three || loadState !== "ready") {
      if (loadState !== "failed") drawLoadingPulse();
      ctx.globalAlpha = 1;
      return;
    }

    const { renderer, scene, camera, mixer, shadowMixer, clips, shadowMats, glowLight } = three;

    // ── holographic projection glow behind her (painted first = behind) ───────
    {
      const gx = feetScreen.x * w || w * 0.66;
      const gyTop = h * 0.16, gyBot = Math.min(h * 0.84, feetScreen.y * h + 14);
      const midY = (gyTop + gyBot) / 2;
      const pulse = 0.8 + Math.sin(t * 1.3) * 0.12 + (shadowOn ? Math.sin(t * 2.2) * 0.06 : 0);
      const beamW = Math.min(w, h) * 0.34;
      const grad = ctx.createRadialGradient(gx, midY, 0, gx, midY, beamW);
      grad.addColorStop(0, `rgba(96,190,220,${0.62 * pulse})`);
      grad.addColorStop(0.55, `rgba(52,120,158,${0.34 * pulse})`);
      grad.addColorStop(1, "rgba(16,36,52,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(gx, midY);
      ctx.scale(0.62, 1);
      ctx.translate(-gx, -midY);
      ctx.fillRect(gx - beamW, gyTop - 60, beamW * 2, gyBot - gyTop + 130);
      ctx.restore();
      // red bleed while the shadow lives back there
      if (shadowOn && shadowRevealT >= 0) {
        const rq = clamp01((t - shadowRevealT) / 1.6);
        const rg = ctx.createRadialGradient(gx - w * 0.055, midY - h * 0.06, 0, gx - w * 0.055, midY - h * 0.06, beamW * 0.9);
        rg.addColorStop(0, `rgba(190,32,58,${0.5 * rq * pulse})`);
        rg.addColorStop(1, "rgba(60,8,16,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(gx - beamW * 1.5, gyTop - 80, beamW * 3, gyBot - gyTop + 170);
      }
    }

    // ── phase logic ──────────────────────────────────────────────────────────
    if (phase === "spawn" && phaseT > 0.95) {
      phase = "bow";
      phaseT = 0;
      bowAction = playOnce(mixer, clips, "Formal_Bow");
    } else if (phase === "bow") {
      // the full clip is ~8s; take the dip and the rise, then hand off to idle
      const bowDur = Math.min(clips.Formal_Bow ? clips.Formal_Bow.duration - 0.4 : 2.5, 3.5);
      if (phaseT > bowDur) {
        phase = "idle";
        phaseT = 0;
        playLoop(mixer, clips, "Idle_15", bowAction);
      }
    } else if (phase === "idle" && !shadowOn && !reduced && phaseT > 1.3) {
      shadowOn = true;
      shadowRevealT = t;
      playLoop(shadowMixer, clips, "Idle_15");
    }

    // typing starts with the bow
    if (!reduced && (phase === "bow" || phase === "idle")) typed += dt * TYPE_SPEED;

    // ── animation ────────────────────────────────────────────────────────────
    if (!reduced || phase !== "idle") mixer.update(dt);
    if (shadowOn && !reduced) {
      // she has a half-beat of lag and sometimes slips out of sync entirely
      const wobble = 0.82 + Math.sin(t * 0.43) * 0.3;
      shadowMixer.update(dt * wobble);
      const reveal = clamp01((t - shadowRevealT) / 1.6);
      const flicker = Math.random() < 0.06 ? 0.25 : 1;
      for (const m of shadowMats) m.opacity = reveal * 0.92 * flicker;
      for (const m of shadowMats) m.emissiveIntensity = reveal * (0.5 + Math.sin(t * 2.2) * 0.18) * flicker;
      glowLight.intensity = reveal * (11 + Math.sin(t * 2.2) * 4) * three.k * three.k * flicker;
    }

    renderer.render(scene, camera);
    projectFeet();

    // ── composite with materialize glitch ────────────────────────────────────
    const src = renderer.domElement;
    if (phase === "spawn" && !reduced) {
      const q = clamp01(phaseT / 0.95);
      const slices = 14;
      const sh = h / slices;
      for (let i = 0; i < slices; i++) {
        const off = (Math.random() - 0.5) * (1 - q) * 90;
        const a = q * 0.7 + Math.random() * 0.3;
        ctx.globalAlpha = Math.random() < q * 1.2 ? a : a * 0.25;
        ctx.drawImage(src, 0, (i * sh * dpr) | 0, src.width, (sh * dpr) | 0, off, i * sh, w, sh);
      }
    } else {
      ctx.globalAlpha = 1;
      ctx.drawImage(src, 0, 0, w, h);
      // ambient corruption once the shadow lives back there
      if (shadowOn && !reduced && Math.random() < 0.025) {
        const y = Math.random() * h;
        const sh2 = 6 + Math.random() * 22;
        ctx.drawImage(src, 0, (y * dpr) | 0, src.width, (sh2 * dpr) | 0, (Math.random() - 0.5) * 34, y, w, sh2);
      }
    }

    drawSpawnRings(dt);
    drawCaption();
    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      resize();
      active = true;
      t = 0; phaseT = 0;
      phase = "loading";
      spawnRings = [];
      typed = 0;
      window.addEventListener("resize", resize);
      if (loadState === "ready") beginSpawn();
      else load();
    },
    stop() {
      active = false;
      t = 0;
      spawnRings = [];
      ctx.clearRect(0, 0, w, h);
      window.removeEventListener("resize", resize);
      if (three) {
        three.mixer.stopAllAction();
        three.shadowMixer.stopAllAction();
      }
    },
    update,
    resize,
    destroy() {
      three?.renderer.dispose();
      three = null;
      loadState = "idle";
    },
  };
}
