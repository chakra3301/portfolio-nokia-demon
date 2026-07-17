/**
 * Joust daemon backdrop — two dot-dither knights on horseback, lances couched,
 * charge in from opposite edges, collide center-screen, and disintegrate into
 * falling debris.
 *
 * Rendering: shapes are rasterized as a dense grid of small filled squares on an
 * offscreen canvas (solid fills, no dithering here). The instrument's own
 * fullscreen ordered-Bayer post pass (scene.js POST_FRAG) requantizes this into
 * the dot-dither look on composite — that's what gives the final "made out of
 * dot dither" texture, coherent with the rest of the instrument.
 */

const BODY_LIGHT = "#D3E2F7"; // horse coat / knight armor — bright, not blown-out
const BODY_HOT = "#8FC4FF";    // mane, plume, lance-tip glint — hottest accent
const BODY_DARK = "#2E5386";   // shaded legs / tail / pennant / underbelly
const LANCE_COLOR = "#A7CBF2";
const BG_FADE = "6, 7, 10";    // matches --bg, used for the trailing motion-blur wipe

const STRIDE_DUR = 0.3; // seconds per gallop stride cycle

// ── local-space rasterizer (unscaled, "facing right / charging right") ────────
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function fillPoly(poly, color, out, step, density = 1) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (density < 1 && Math.random() > density) continue;
      if (pointInPoly(x, y, poly)) out.push({ x, y, color });
    }
  }
}

function fillCircle(cx, cy, r, color, out, step) {
  for (let y = cy - r; y <= cy + r; y += step) {
    for (let x = cx - r; x <= cx + r; x += step) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.push({ x, y, color });
    }
  }
}

function line(x1, y1, x2, y2, thickness, color, out, step) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 0.0001;
  const nx = -dy / len, ny = dx / len;
  const along = Math.max(1, Math.round(len / step));
  const across = Math.max(1, Math.round(thickness / step));
  for (let i = 0; i <= along; i++) {
    const tt = i / along;
    const cx = x1 + dx * tt, cy = y1 + dy * tt;
    for (let w = -across; w <= across; w++) {
      const off = (w / Math.max(1, across)) * (thickness / 2);
      out.push({ x: cx + nx * off, y: cy + ny * off, color });
    }
  }
}

/** Full horse + knight + lance silhouette in local units, facing/charging +x. */
function buildRig(cycleT, step) {
  const pts = [];

  // body (barrel, leaner at the chest, rising to the withers)
  fillPoly([[-16, -4], [-4, -7], [4, -4], [6, 2], [2, 7], [-12, 8], [-18, 2]], BODY_LIGHT, pts, step);
  // underbelly shading
  fillPoly([[-15, 3], [1, 4.5], [-11, 8], [-17, 2.5]], BODY_DARK, pts, step, 0.55);

  // neck + head, reaching forward-down (galloping posture)
  fillPoly([[3, -5], [9, -11], [13, -9], [14, -6], [8, -4]], BODY_LIGHT, pts, step);
  fillPoly([[13, -11], [15, -9], [21, -8], [24, -6], [25, -4], [22, -3], [16, -6]], BODY_LIGHT, pts, step);
  fillPoly([[13, -13], [15, -13], [14, -16.5]], BODY_DARK, pts, step * 0.75); // ear
  line(9, -11, 14.5, -6.5, 1.4, BODY_HOT, pts, step); // mane streak

  // tail, flowing backward with the gallop
  const tailWave = Math.sin(cycleT * Math.PI * 2) * 1.4;
  line(-16, -3, -22, -6 + tailWave, 1.8, BODY_HOT, pts, step);
  line(-22, -6 + tailWave, -28, -2 + tailWave * 0.6, 1.1, BODY_HOT, pts, step);

  // 4 legs — diagonal gallop pairing (front-near/back-far together, etc.)
  const legs = [
    { hip: [3, 3], phase: 0.0 },
    { hip: [1, 4], phase: 0.14 },
    { hip: [-14, 4], phase: 0.5 },
    { hip: [-16, 5], phase: 0.62 },
  ];
  for (const leg of legs) {
    const a = ((cycleT + leg.phase) % 1) * Math.PI * 2;
    const swing = Math.sin(a);
    const lift = Math.max(0, Math.cos(a));
    const knee = [leg.hip[0] + swing * 3.2, leg.hip[1] + 5 - lift * 1.6];
    const hoof = [leg.hip[0] + swing * 6.2, leg.hip[1] + 10 - lift * 4.2];
    line(leg.hip[0], leg.hip[1], knee[0], knee[1], 1.5, BODY_DARK, pts, step);
    line(knee[0], knee[1], hoof[0], hoof[1], 1.15, BODY_DARK, pts, step);
  }

  // rider: torso leaning into the charge, helmet, plume, reins arm, lance arm
  const pelvis = [-3, -8];
  const shoulder = [4, -15];
  line(pelvis[0], pelvis[1], shoulder[0], shoulder[1], 2.3, BODY_LIGHT, pts, step);
  const helm = [shoulder[0] + 1, shoulder[1] - 2];
  fillCircle(helm[0], helm[1], 2.1, BODY_HOT, pts, step);
  const plumeWave = Math.sin(cycleT * Math.PI * 4) * 1.2;
  line(helm[0] - 0.5, helm[1] - 1.5, helm[0] - 4 + plumeWave, helm[1] - 3.4, 1, BODY_HOT, pts, step);
  line(shoulder[0], shoulder[1], 8, -9, 1, BODY_DARK, pts, step); // reins arm
  const grip = [shoulder[0] + 6, shoulder[1] + 2];
  line(shoulder[0], shoulder[1], grip[0], grip[1], 1.8, BODY_LIGHT, pts, step); // lance arm

  // lance — couched, leveled at the opponent, tapering to a glinting tip
  const mid = [grip[0] + 18, grip[1] + 0.6];
  const tip = [grip[0] + 30, grip[1] + 1];
  line(grip[0], grip[1], mid[0], mid[1], 2.6, LANCE_COLOR, pts, step);
  line(mid[0], mid[1], tip[0], tip[1], 1.4, LANCE_COLOR, pts, step);
  line(tip[0] - 4, tip[1] - 0.3, tip[0], tip[1], 1.6, BODY_HOT, pts, step);

  // pennant fluttering off the grip
  const flutter = Math.sin(cycleT * Math.PI * 3) * 2.4;
  fillPoly([[grip[0] - 1, grip[1] - 1.4], [grip[0] - 1, grip[1] + 1.4], [grip[0] - 7 - flutter, grip[1]]], BODY_DARK, pts, step * 0.8);

  return pts;
}

export function createJoustFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let t = 0;
  let particles = [];
  let dust = [];
  let collided = false;
  let w = 0, h = 0, dpr = 1;

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

  function clear() { ctx.clearRect(0, 0, w, h); }

  // fade the previous frame toward the instrument's bg color instead of a hard
  // clear — leaves a soft motion trail so the knights read as IN the scene
  // (picking up the same fog/haze quality as the 3D content) rather than a
  // crisp sticker pasted on top of it.
  function fadeTrail(amount) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${BG_FADE}, ${amount})`;
    ctx.fillRect(0, 0, w, h);
  }

  function drawDot(x, y, color, alpha, size) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  function drawRig(cx, cy, scale, mirror, cycleT, alpha, localStep, fadeIn = 1) {
    const pts = buildRig(cycleT, localStep);
    const size = Math.max(1.6, localStep * scale * 1.1);
    for (const p of pts) {
      const wx = cx + (mirror ? -p.x : p.x) * scale;
      const wy = cy + p.y * scale;
      // slight per-dot alpha jitter — an even, perfectly solid fill reads as a
      // flat cutout; a little noise matches the dithered/grainy rest of the scene.
      const a = alpha * fadeIn * (0.8 + Math.random() * 0.2);
      drawDot(wx, wy, p.color, a, size);
    }
    return pts;
  }

  function spawnDebrisFromRig(cx, cy, scale, mirror, cycleT, localStep, dir) {
    const pts = buildRig(cycleT, localStep);
    for (const p of pts) {
      if (Math.random() > 0.5) continue;
      const wx = cx + (mirror ? -p.x : p.x) * scale;
      const wy = cy + p.y * scale;
      const outward = ((mirror ? -p.x : p.x) >= 0 ? 1 : -1) * dir;
      const speed = 70 + Math.random() * 260;
      const ang = (Math.random() - 0.5) * 1.4;
      particles.push({
        x: wx, y: wy,
        vx: Math.cos(ang) * speed * outward * 0.5 + (Math.random() - 0.5) * 60,
        vy: -60 - Math.random() * 200 + Math.sin(ang) * 40,
        color: p.color,
        life: 0.7 + Math.random() * 1.6,
        age: 0,
        size: Math.max(1.6, localStep * scale * (0.7 + Math.random() * 0.6)),
      });
    }
  }

  function drawImpactFlash(cx, cy, intensity) {
    if (intensity <= 0) return;
    const r = 34 + intensity * 130;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const dist = r * (0.25 + Math.random() * 0.75);
      drawDot(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.55, BODY_HOT, intensity, 2.6);
    }
    for (let i = 0; i < 46; i++) {
      const x = cx + (Math.random() - 0.5) * r * 1.7;
      const y = cy + (Math.random() - 0.5) * r * 0.85;
      drawDot(x, y, BODY_LIGHT, intensity * 0.85, 2.1);
    }
  }

  function updateParticles(dt, globalAlpha) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.vy += 460 * dt;
      p.vx *= 0.986;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const life = 1 - p.age / p.life;
      if (life <= 0) { particles.splice(i, 1); continue; }
      drawDot(p.x, p.y, p.color, life * globalAlpha, p.size);
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const life = 1 - d.age / d.life;
      if (life <= 0) { dust.splice(i, 1); continue; }
      drawDot(d.x, d.y, d.color, life * 0.35, d.size);
    }
  }

  function chargeDur() { return reduced ? 0.45 : 2.0; }
  function crashDur() { return reduced ? 0.16 : 0.32; }
  function crumbleDur() { return reduced ? 0.7 : 2.4; }

  function drawCharge(dt) {
    const scale = Math.min(7, Math.max(3.2, w / 300));
    const localStep = 0.9;
    const cy = h * 0.56;
    const dur = chargeDur();
    const p = Math.min(t / dur, 1);
    const ease = Math.pow(p, 1.5);

    const leftX = w * -0.18 + (w * 0.5 - w * -0.18) * ease;
    const rightX = w * 1.18 + (w * 0.5 - w * 1.18) * ease;

    const cycleL = (t / STRIDE_DUR) % 1;
    const cycleR = ((t + STRIDE_DUR * 0.5) / STRIDE_DUR) % 1;
    const bobL = -Math.max(0, Math.cos(cycleL * Math.PI * 2)) * scale * 1.05;
    const bobR = -Math.max(0, Math.cos(cycleR * Math.PI * 2)) * scale * 1.05;
    const fadeIn = Math.min(1, t / 0.22); // ease in instead of popping onscreen at full strength

    drawRig(leftX, cy + bobL, scale, false, cycleL, 0.92, localStep, fadeIn);
    drawRig(rightX, cy + bobR, scale, true, cycleR, 0.92, localStep, fadeIn);

    // light dust trail off the trailing hooves
    if (!reduced && Math.random() < 0.6) {
      dust.push({ x: leftX - 16 * scale * 0.35, y: cy + 9 * scale * 0.5, vx: -40, vy: -10, color: BODY_DARK, life: 0.5 + Math.random() * 0.4, age: 0, size: 2 + Math.random() * 2 });
      dust.push({ x: rightX + 16 * scale * 0.35, y: cy + 9 * scale * 0.5, vx: 40, vy: -10, color: BODY_DARK, life: 0.5 + Math.random() * 0.4, age: 0, size: 2 + Math.random() * 2 });
    }
    updateParticles(dt, 1);

    if (p >= 1 && !collided) {
      collided = true;
      const cx = w * 0.5;
      spawnDebrisFromRig(leftX, cy + bobL, scale, false, cycleL, localStep, 1);
      spawnDebrisFromRig(rightX, cy + bobR, scale, true, cycleR, localStep, -1);
    }
  }

  function drawCrash(dt) {
    const start = chargeDur();
    const dur = crashDur();
    const p = Math.min((t - start) / dur, 1);
    drawImpactFlash(w * 0.5, h * 0.56, 1 - p * 0.3);
    updateParticles(dt, 1);
  }

  function drawCrumble(dt) {
    updateParticles(dt, 0.9);
  }

  function update(dt) {
    if (!active) return;
    t += dt;

    const crashAt = chargeDur();
    const crumbleAt = crashAt + crashDur();
    const doneAt = crumbleAt + crumbleDur();

    if (t < crashAt) {
      // soft motion-blur wipe while galloping — blends the knights into the
      // scene instead of a hard-edged cutout popping in/out each frame
      fadeTrail(Math.min(0.5, dt * 8));
      drawCharge(dt);
    } else if (t < crumbleAt) {
      clear(); // clean, punchy flash — no trail smear on the impact beat
      drawCrash(dt);
    } else if (t < doneAt) {
      fadeTrail(Math.min(0.4, dt * 6)); // gentle streak on the falling debris
      drawCrumble(dt);
    } else {
      clear();
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
      particles = [];
      dust = [];
      collided = false;
      clear();
      window.addEventListener("resize", resize);
    },
    stop() {
      active = false;
      t = 0;
      particles = [];
      dust = [];
      collided = false;
      clear();
      window.removeEventListener("resize", resize);
    },
    update,
    resize,
  };
}
