/**
 * Finders x Keepers daemon backdrop — the brand mark (white shield ring +
 * gold crosshair) assembles itself out of scattered dot-dither debris, locks
 * on with a target-acquired beat, then rests with a slow radar sweep.
 *
 * Same rendering grammar as joust-fx / widow-fx: the real logo PNG is sampled
 * into a sparse grid of colored dots on an offscreen canvas; the instrument's
 * ordered-Bayer post pass requantizes everything on composite.
 *
 * Phases: gather (dots fly in, shield first, crosshair snaps after)
 *       → lock   (scale settle + ping rings + flash)
 *       → rest   (radar sweep brightens dots it passes, gentle breathe)
 *
 * Set piece: "the find" — Mega Charizard X itself, rebuilt from the same
 * dot-dither debris as the mark (joust/widow grammar): bold cel shapes
 * sampled into colored dots, swaying in pseudo-3D while a holo sheen band
 * sweeps across the creature.
 */

const PING = "#E8C468";      // project gold
const PING_HOT = "#FFE9B0";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (t) => { const c = 1.4; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);

export function createFindersFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let dots = null;      // sampled logo dots
  let loading = false;
  let cardDots = null;  // sampled Charizard dots — "the find"
  let cardAspect = 0.717;
  let cx = 0, cy = 0, size = 0, dotSize = 2;
  let cardX = 0, cardY = 0, cardH = 0;
  let pings = [];       // expanding lock rings { r, age, life }
  let lockFired = false;

  const GATHER = reduced ? 0.01 : 2.3;
  const LOCK_AT = GATHER;
  const LOCK_DUR = 0.5;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the mark rests tiny in the bottom-right corner, like a wax seal
    cx = w * 0.9;
    cy = h * 0.82;
    size = Math.min(Math.min(w, h) * 0.16, 145);
    dotSize = Math.max(1.5, size / 90);
    // the find floats in the gap between the info card and the core,
    // tucked behind both (DOM card overlays; the bright core burns through)
    cardX = w * 0.55;
    cardY = h * 0.48;
    cardH = Math.min(h * 0.84, 780);
  }

  /** Sample the Charizard artwork into dot targets (normalized, -0.5..0.5 tall). */
  function sampleCard(img) {
    const ROWS = 132;
    cardAspect = img.naturalWidth / img.naturalHeight;
    const COLS = Math.round(ROWS * cardAspect);
    const c = document.createElement("canvas");
    c.width = COLS; c.height = ROWS;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, COLS, ROWS);
    const px = g.getImageData(0, 0, COLS, ROWS).data;
    const out = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = (y * COLS + x) * 4;
        const a = px[i + 3];
        if (a < 60) continue; // transparent bg — creature only, no card frame
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
        // lift every dot so the dark body survives the screen-blend composite,
        // hue preserved — slate stays slate, navy wings stay navy
        const m = Math.max(r, gg, b, 8);
        const k = Math.min((150 + lum * 105) / m, 5);
        out.push({
          x: (x / COLS - 0.5) * cardAspect,
          y: y / ROWS - 0.5,
          color: `rgb(${Math.min(255, r * k) | 0},${Math.min(255, gg * k) | 0},${Math.min(255, b * k) | 0})`,
          alpha: (Math.min(0.9, 0.44 + lum * 0.6)) * (a / 255),
          // assembles bottom-up like rising sparks, with per-dot scatter
          delay: 0.35 + (1 - (y / ROWS)) * 0.9 + Math.random() * 0.45,
          dur: 0.7 + Math.random() * 0.5,
          sx: (Math.random() - 0.5) * 1.6,
          sy: 0.35 + Math.random() * 0.55, // drift up into place
          tw: Math.random() * Math.PI * 2, // shimmer phase
        });
      }
    }
    return out;
  }

  /** the find: dot-dither Charizard card, pseudo-3D sway + holo sheen sweep */
  function drawCardDots() {
    if (!cardDots) return;
    const yBob = reduced ? 0 : Math.sin(t * 0.7) * 7;
    const ang = reduced ? 0 : Math.sin(t * 0.42) * 0.3; // slow rotateY sway
    const sinA = Math.sin(ang), cosA = Math.cos(ang);
    const s = Math.max(1.8, cardH / 150);
    // holo sheen: diagonal band position, sweeps across with rest gaps
    const sweep = reduced ? -1 : ((t * 0.2) % 1.5) - 0.25;
    for (const d of cardDots) {
      const q = reduced ? 1 : clamp01((t - d.delay) / d.dur);
      if (q <= 0) continue;
      const e = easeOut3(q);
      const nx = lerp(d.sx, d.x, e);
      const ny = lerp(d.y + d.sy, d.y, e);
      // perspective: rotate around the vertical card axis
      const z = nx * sinA;
      const persp = 1 / (1 + z * 0.55);
      const px = cardX + nx * cosA * cardH * persp;
      const py = cardY + yBob + ny * cardH * persp;
      let alpha = d.alpha * e;
      // receding side falls into shadow, near side catches light
      alpha *= 1 - Math.max(0, z) * 1.1;
      if (alpha <= 0.01) continue;
      // sheen band brightens dots it passes (diagonal across the face)
      if (sweep >= 0 && sweep <= 1) {
        const u = (d.x / cardAspect + 0.5) * 0.7 + (d.y + 0.5) * 0.3;
        const dist = Math.abs(u - sweep);
        if (dist < 0.12) alpha = Math.min(1, alpha + (1 - dist / 0.12) * 0.5);
      }
      // per-dot shimmer — the dither never sits still
      alpha *= 0.82 + 0.18 * Math.sin(t * 2.1 + d.tw);
      drawDot(px, py, d.color, alpha, s * persp);
    }
    ctx.globalAlpha = 1;
  }

  /** Sample the logo image into dot targets (normalized -0.5..0.5 space). */
  function sample(img) {
    const N = 120; // sampling grid
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data;
    const out = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        const a = px[i + 3];
        if (a < 60) continue;
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
        if (lum < 0.09) continue; // drop near-black shading, keep the mark
        // crosshair = warm; shield ring = neutral. Classify by hue warmth.
        const warm = r > 120 && r > b * 1.5;
        const nx = x / N - 0.5, ny = y / N - 0.5;
        const rad = Math.hypot(nx, ny);
        out.push({
          x: nx, y: ny, rad,
          warm,
          color: warm ? `rgb(${r},${Math.max(gg, 60)},20)` : `rgba(226,232,244,1)`,
          alpha: warm ? Math.min(1, lum * 1.5) * (a / 255) : Math.min(0.62, lum * 0.9) * (a / 255),
          // gather choreography: shield ring blooms in first, crosshair snaps after
          delay: (warm ? 0.85 : 0) + rad * 0.7 + Math.random() * 0.35,
          dur: 0.75 + Math.random() * 0.45,
          // spawn scattered on a wide ring with jitter
          sx: Math.cos(Math.random() * Math.PI * 2) * (0.8 + Math.random() * 0.9),
          sy: Math.sin(Math.random() * Math.PI * 2) * (0.8 + Math.random() * 0.9),
          spin: (Math.random() - 0.5) * 2.4, // radians of swirl on the way in
        });
      }
    }
    return out;
  }

  function drawDot(x, y, color, alpha, s) {
    if (alpha <= 0.004) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }

  function drawPings() {
    const step = Math.max(2.2, size / 170);
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i];
      p.age += 1 / 60;
      const q = p.age / p.life;
      if (q >= 1) { pings.splice(i, 1); continue; }
      const rad = p.r + easeOut3(q) * size * 0.42;
      const alpha = (1 - q) * 0.55;
      const n = Math.max(40, Math.round(rad * 0.55));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        drawDot(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, PING, alpha, step);
      }
    }
  }

  function update(dt) {
    if (!active || !dots) return;
    t += dt;
    ctx.clearRect(0, 0, w, h);

    drawCardDots(); // the find sits behind the mark and the pings

    const lockQ = clamp01((t - LOCK_AT) / LOCK_DUR);
    // whole-mark scale: overshoot settle on the lock beat, then breathe
    let scale = 1;
    if (!reduced) {
      if (t < LOCK_AT) scale = 1.04;
      else if (lockQ < 1) scale = lerp(1.04, 1, easeOutBack(lockQ));
      else scale = 1 + Math.sin(t * 0.9) * 0.006;
    }
    // radar sweep angle (rest phase)
    const sweepOn = t > LOCK_AT + LOCK_DUR && !reduced;
    const sweepAng = (t * 0.7) % (Math.PI * 2) - Math.PI;

    if (!lockFired && t >= LOCK_AT && !reduced) {
      lockFired = true;
      pings.push({ r: size * 0.1, age: 0, life: 0.9 });
      pings.push({ r: size * 0.02, age: -0.18, life: 1.0 });
    }

    for (const d of dots) {
      const q = reduced ? 1 : clamp01((t - d.delay) / d.dur);
      if (q <= 0) continue;
      const e = easeOut3(q);
      // swirl in: rotate the spawn offset toward zero as it converges
      const swirl = d.spin * (1 - e);
      const ox = lerp(d.sx, 0, e), oy = lerp(d.sy, 0, e);
      const rx = ox * Math.cos(swirl) - oy * Math.sin(swirl);
      const ry = ox * Math.sin(swirl) + oy * Math.cos(swirl);
      const px = (d.x + rx) * size * scale;
      const py = (d.y + ry) * size * scale;

      let alpha = d.alpha * (0.25 + 0.75 * e);
      let color = d.color;
      // lock flash: crosshair dots blaze for a beat
      if (lockQ > 0 && lockQ < 1 && d.warm) {
        alpha = Math.min(1, alpha + (1 - lockQ) * 0.5);
        if (lockQ < 0.3) color = PING_HOT;
      }
      // radar sweep brightens what it passes
      if (sweepOn) {
        const a = Math.atan2(d.y, d.x);
        let diff = Math.abs(a - sweepAng);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.5) alpha = Math.min(1, alpha + (1 - diff / 0.5) * 0.35);
      }
      // per-dot shimmer keeps it feeling alive in the dither
      alpha *= 0.86 + Math.random() * 0.14;
      drawDot(cx + px, cy + py, color, alpha, dotSize);
    }

    drawPings();
    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      resize();
      active = true;
      t = 0;
      pings = [];
      lockFired = false;
      ctx.clearRect(0, 0, w, h);
      window.addEventListener("resize", resize);
      if (!dots && !loading) {
        loading = true;
        const img = new Image();
        img.onload = () => { dots = sample(img); loading = false; };
        img.onerror = () => { loading = false; };
        img.src = "/fx/finders-logo.webp";
      }
      if (!cardDots) {
        const card = new Image();
        card.onload = () => { cardDots = sampleCard(card); };
        card.src = "/fx/charizard.webp";
      }
    },
    stop() {
      active = false;
      t = 0;
      pings = [];
      ctx.clearRect(0, 0, w, h);
      window.removeEventListener("resize", resize);
    },
    update,
    resize,
  };
}
