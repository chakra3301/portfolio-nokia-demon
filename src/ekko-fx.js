/**
 * EKKO daemon backdrop — echo pulses radiate from the chrome core as the
 * process loads, and a dot-dithered rendering of the EKKO wordmark fades in
 * to rest in the background. When a pulse front crosses the wordmark, the
 * dots it touches displace outward and flash — the logo itself echoes.
 *
 * Same grammar as the other daemon fx: dots on an offscreen canvas, the
 * instrument's ordered-Bayer post pass requantizes on composite.
 */

const PULSE = "#B46BFF";       // project violet
const PULSE_HOT = "#EBD9FF";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut2 = (t) => 1 - (1 - t) * (1 - t);

export function createEkkoFx({ reduced = false, getOrigin = null } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let dots = null;        // sampled wordmark
  let loading = false;
  let logoW = 0, logoH = 0, logoCx = 0, logoCy = 0, dotSize = 2;
  let pulses = [];        // { age, life, boost } — expanding echo fronts
  let nextPulseAt = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    logoW = Math.min(w * 0.5, 760);
    logoH = logoW * 0.52; // source aspect 670x349
    logoCx = w * 0.64;
    logoCy = h * 0.44;
    dotSize = Math.max(2, logoW / 250);
  }

  /** where pulses are born — the live chrome core if the caller provides it */
  function origin() {
    if (getOrigin) {
      const p = getOrigin();
      if (p && p.visible !== false) return p;
    }
    return { x: w * 0.64, y: h * 0.47 };
  }

  function sample(img) {
    const NX = 150, NY = 78;
    const c = document.createElement("canvas");
    c.width = NX; c.height = NY;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, NX, NY);
    const px = g.getImageData(0, 0, NX, NY).data;
    const out = [];
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const i = (y * NX + x) * 4;
        const a = px[i + 3];
        if (a < 90) continue;
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
        if (lum > 0.93 && b > 230 && r > 230) continue; // skip the white halo
        if (lum < 0.1) continue;                        // skip dead shadow
        out.push({
          x: x / NX - 0.5,
          y: y / NY - 0.5,
          color: `rgb(${r},${gg},${b})`,
          alpha: Math.min(0.55, 0.12 + lum * 0.55),
          phase: Math.random() * Math.PI * 2,
          kick: 0, // transient displacement when an echo front crosses
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

  function emitPulse(boost = 1) {
    pulses.push({ age: 0, life: 2.4, boost });
  }

  function pulseRadius(p) {
    return easeOut2(clamp01(p.age / p.life)) * Math.max(w, h) * 0.75;
  }

  function drawPulses(dt) {
    const o = origin();
    const step = Math.max(2.4, Math.min(w, h) / 320);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.age += dt;
      const q = clamp01(p.age / p.life);
      if (q >= 1) { pulses.splice(i, 1); continue; }
      const rad = pulseRadius(p);
      const alpha = (1 - q) * 0.5 * p.boost;
      // slightly elliptical ring — reads as a sound front, not a circle stamp
      const n = Math.max(50, Math.round(rad * 0.5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        // sparse jitter so the ring is made of dither, not a line
        if (Math.random() < 0.25) continue;
        const rr = rad + (Math.random() - 0.5) * step * 3;
        drawDot(
          o.x + Math.cos(a) * rr,
          o.y + Math.sin(a) * rr * 0.86,
          q < 0.12 ? PULSE_HOT : PULSE,
          alpha * (0.7 + Math.random() * 0.3),
          step,
        );
      }
    }
  }

  function drawLogo(dt) {
    if (!dots) return;
    const o = origin();
    const fadeIn = reduced ? 1 : clamp01((t - 0.8) / 1.6);
    if (fadeIn <= 0) return;
    for (const d of dots) {
      const px = logoCx + d.x * logoW;
      const py = logoCy + d.y * logoH;
      // echo fronts kick the dots they cross
      if (!reduced) {
        for (const p of pulses) {
          const rad = pulseRadius(p);
          const dist = Math.hypot(px - o.x, (py - o.y) / 0.86);
          if (Math.abs(dist - rad) < 26) d.kick = Math.min(1, d.kick + dt * 9 * p.boost);
        }
        d.kick = Math.max(0, d.kick - dt * 2.2);
      }
      const k = easeOut2(d.kick);
      const ang = Math.atan2(py - o.y, px - o.x);
      const ox = Math.cos(ang) * k * 9;
      const oy = Math.sin(ang) * k * 9;
      const breathe = reduced ? 0 : Math.sin(t * 1.1 + d.phase) * 0.05;
      const alpha = (d.alpha + breathe * d.alpha + k * 0.45) * fadeIn * (0.88 + Math.random() * 0.12);
      drawDot(px + ox, py + oy, k > 0.25 ? PULSE_HOT : d.color, alpha, dotSize + k * 1.5);
    }
  }

  function update(dt) {
    if (!active) return;
    t += dt;
    ctx.clearRect(0, 0, w, h);

    // load-in burst: three strong fronts, then a slow heartbeat
    if (!reduced && t >= nextPulseAt) {
      const early = t < 2.2;
      emitPulse(early ? 1 : 0.55);
      nextPulseAt = t + (early ? 0.55 : 2.8 + Math.random() * 1.2);
    }

    drawLogo(dt);
    if (!reduced) drawPulses(dt);
    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      resize();
      active = true;
      t = 0;
      pulses = [];
      nextPulseAt = 0.15;
      ctx.clearRect(0, 0, w, h);
      window.addEventListener("resize", resize);
      if (!dots && !loading) {
        loading = true;
        const img = new Image();
        img.onload = () => { dots = sample(img); loading = false; };
        img.onerror = () => { loading = false; };
        img.src = "/fx/ekko-font.webp";
      }
    },
    stop() {
      active = false;
      t = 0;
      pulses = [];
      ctx.clearRect(0, 0, w, h);
      window.removeEventListener("resize", resize);
    },
    update,
    resize,
  };
}
