/**
 * Dead Internet Archive daemon backdrop — the sticker-covered CRT monitor
 * from the site sits in the frame, still on, flipping between dead
 * channels. Analog static bursts between channels, a refresh line rolls,
 * the phosphor breathes. The instrument's ordered-Bayer post pass
 * requantizes the whole thing into the dot-dither language on composite.
 *
 * Assets: /fx/crt-frame.webp (transparent screen window, detected at load)
 *         /fx/channel-{0..4}.webp (the site's channel art)
 */

const PHOSPHOR = "#6BFF8E";
const CHANNELS = 5;
const CHANNEL_DUR = 3.2;   // seconds per channel
const STATIC_DUR = 0.28;   // static burst between channels

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createDiaFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let frameImg = null;
  let channels = [];
  let screenRect = null;   // transparent window within the frame image (image px)
  let loading = false;
  let ready = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** find the transparent screen window inside the CRT frame art */
  function detectScreen(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const midY = Math.floor(c.height * 0.35);
    const midX = Math.floor(c.width * 0.5);
    const row = g.getImageData(0, midY, c.width, 1).data;
    const col = g.getImageData(midX, 0, 1, c.height).data;
    let x0 = -1, x1 = -1, y0 = -1, y1 = -1;
    for (let x = Math.floor(c.width * 0.1); x < c.width * 0.9; x++) {
      const a = row[x * 4 + 3];
      if (a < 20) { if (x0 < 0) x0 = x; x1 = x; }
    }
    for (let y = Math.floor(c.height * 0.05); y < c.height * 0.9; y++) {
      const a = col[y * 4 + 3];
      if (a < 20) { if (y0 < 0) y0 = y; y1 = y; }
    }
    if (x0 < 0 || y0 < 0) { // fallback: measured fractions of outline-2.png
      x0 = c.width * 0.155; x1 = c.width * 0.84;
      y0 = c.height * 0.12; y1 = c.height * 0.585;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, iw: c.width, ih: c.height };
  }

  function load() {
    if (loading || ready) return;
    loading = true;
    let pending = 1 + CHANNELS;
    const done = () => { if (--pending === 0) { ready = true; loading = false; } };
    const frame = new Image();
    frame.onload = () => { frameImg = frame; screenRect = detectScreen(frame); done(); };
    frame.onerror = done;
    frame.src = "/fx/crt-frame.webp";
    for (let i = 0; i < CHANNELS; i++) {
      const img = new Image();
      img.onload = () => { channels[i] = img; done(); };
      img.onerror = done;
      img.src = `/fx/channel-${i}.webp`;
    }
  }

  /** Keep the complete CRT in frame instead of treating it as cover art.
   *  Seat it behind the daemon on desktop; lift it above the card on mobile. */
  function monitorBox() {
    const desktop = w > 860;
    const maxW = w * (desktop ? 0.56 : 0.84);
    const maxH = h * (desktop ? 0.86 : 0.7);
    const scale = Math.min(maxW / screenRect.iw, maxH / screenRect.ih);
    const mw = screenRect.iw * scale;
    const mh = screenRect.ih * scale;
    const cx = desktop ? w * 0.66 : w * 0.5;
    const cy = desktop ? h * 0.5 : h * 0.3;
    return { x: cx - mw / 2, y: cy - mh / 2, w: mw, h: mh };
  }

  function drawStatic(sx, sy, sw, sh, intensity) {
    const step = Math.max(3, sw / 90);
    ctx.globalAlpha = 1;
    for (let y = sy; y < sy + sh; y += step) {
      for (let x = sx; x < sx + sw; x += step) {
        if (Math.random() > intensity) continue;
        const v = Math.random();
        ctx.fillStyle = v > 0.5 ? "#cfd6e4" : "#3a4148";
        ctx.globalAlpha = 0.25 + Math.random() * 0.5;
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  function update(dt) {
    if (!active) return;
    t += dt;
    ctx.clearRect(0, 0, w, h);
    if (!ready || !frameImg || !screenRect) return;

    const box = monitorBox();
    const k = box.w / screenRect.iw; // image px → screen px
    const sx = box.x + screenRect.x * k;
    const sy = box.y + screenRect.y * k;
    const sw = screenRect.w * k;
    const sh = screenRect.h * k;

    // ── screen content ────────────────────────────────────────────────────
    const cycle = CHANNEL_DUR + STATIC_DUR;
    const idx = reduced ? 0 : Math.floor(t / cycle) % CHANNELS;
    const local = reduced ? 1 : (t % cycle);
    const inStatic = !reduced && local > CHANNEL_DUR;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();

    const img = channels[idx];
    if (img && !inStatic) {
      // phosphor breathe + occasional horizontal jitter
      const flicker = reduced ? 0.64 : 0.6 + Math.sin(t * 9.7) * 0.03 + Math.sin(t * 1.3) * 0.04;
      const jx = !reduced && Math.random() < 0.05 ? (Math.random() - 0.5) * 6 : 0;
      ctx.globalAlpha = flicker;
      // cover-fit the channel art into the screen
      const ar = img.naturalWidth / img.naturalHeight;
      const sar = sw / sh;
      let dw = sw, dh = sh;
      if (ar > sar) dw = sh * ar; else dh = sw / ar;
      ctx.drawImage(img, sx + jx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
      // light persistent snow over the picture
      if (!reduced) drawStatic(sx, sy, sw, sh, 0.05);
    } else if (!reduced) {
      drawStatic(sx, sy, sw, sh, 0.85); // full static between channels
    }

    // scanlines
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000";
    for (let y = sy; y < sy + sh; y += 4) ctx.fillRect(sx, y, sw, 1.4);

    // rolling refresh line
    if (!reduced) {
      const ry = sy + ((t * 42) % (sh + 60)) - 30;
      const grad = ctx.createLinearGradient(0, ry - 14, 0, ry + 14);
      grad.addColorStop(0, "rgba(180,220,200,0)");
      grad.addColorStop(0.5, "rgba(190,235,210,0.16)");
      grad.addColorStop(1, "rgba(180,220,200,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.fillRect(sx, ry - 14, sw, 28);
    }

    // channel OSD
    ctx.globalAlpha = inStatic ? 0.4 : 0.85;
    ctx.fillStyle = PHOSPHOR;
    ctx.font = `600 ${Math.max(11, sw * 0.045)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`CH-0${idx + 1}`, sx + sw * 0.05, sy + sh * 0.12);

    ctx.restore();

    // ── the monitor itself, over the screen ───────────────────────────────
    // the shell art is near-black — lift it so it survives the screen-blend
    // composite (dark pixels contribute nothing there)
    ctx.globalAlpha = 0.9;
    ctx.filter = "brightness(2.2) saturate(1.0)";
    ctx.drawImage(frameImg, box.x, box.y, box.w, box.h);
    ctx.filter = "none";

    // ambient veil: full-bleed footage must sit *behind* the instrument, not
    // compete with it — recess the whole composition into the dark
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(4, 5, 8, 0.2)";
    ctx.fillRect(0, 0, w, h);

    // soft phosphor spill around the screen
    if (!reduced) {
      const glow = ctx.createRadialGradient(sx + sw / 2, sy + sh / 2, sw * 0.2, sx + sw / 2, sy + sh / 2, sw * 0.9);
      glow.addColorStop(0, "rgba(120,200,150,0.05)");
      glow.addColorStop(1, "rgba(120,200,150,0)");
      ctx.globalAlpha = 0.7 + Math.sin(t * 9.7) * 0.15;
      ctx.fillStyle = glow;
      ctx.fillRect(box.x - 60, box.y - 60, box.w + 120, box.h + 120);
    }

    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      resize();
      active = true;
      t = 0;
      ctx.clearRect(0, 0, w, h);
      window.addEventListener("resize", resize);
      load();
    },
    stop() {
      active = false;
      t = 0;
      ctx.clearRect(0, 0, w, h);
      window.removeEventListener("resize", resize);
    },
    update,
    resize,
  };
}
