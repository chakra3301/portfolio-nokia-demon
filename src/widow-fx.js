/**
 * Black Widow daemon backdrop v2 — a realistic widow drops in on a dragline,
 * spins an orb web (frame → radii → capture spiral, laid outside-in like a
 * real orb weaver), then hangs head-down at the hub showing her hourglass.
 *
 * Realism upgrades over v1:
 *   - anatomically posed body (small cephalothorax, globose abdomen,
 *     spinnerets, pedipalps) oriented along her heading
 *   - 8 legs with 2-bone IK and a true alternating-tetrapod stepping gait
 *     (feet PLANT on the silk and swing to new holds — no sine wiggle)
 *   - web with sagging threads, per-spoke jitter, a free zone at the hub,
 *     and a capture spiral that follows her as she lays it
 *   - damped pendulum drop from the spinnerets, breathing at rest, strand
 *     plucks that ripple through the web
 *
 * Rendering grammar matches joust-fx.js: dots on an offscreen canvas, the
 * instrument's ordered-Bayer post pass requantizes on composite. Colors are
 * "black widow in moonlight" — dark steel body with bright rim so it survives
 * the screen blend, hot red hourglass.
 */

const BODY = "#59627A";        // body base — dark steel, reads black after blend
const BODY_RIM = "#C7D2E8";    // rim light on legs/carapace
const BODY_GLOSS = "#EDF3FF";  // specular glint on the abdomen
const MARK_RED = "#FF3B5C";    // hourglass
const MARK_RED_DIM = "#B2273F";
const SILK = "#B9C3D6";
const SILK_DIM = "#77819A";
const GLINT = "#EAF1FF";

const NUM_RADII = 13;
const SPIRAL_TURNS = 4.2;
const SPIRAL_SAMPLES = 260;
const FREE_ZONE = 0.24;        // spiral stops this fraction of rmax from the hub
const TAU = Math.PI * 2;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut2 = (t) => 1 - (1 - t) * (1 - t);

function drawDot(ctx, x, y, color, alpha, size) {
  if (alpha <= 0.004) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
}

// dotted segment (joust-fx line grammar)
function strand(ctx, x1, y1, x2, y2, color, alpha, step, size) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    drawDot(ctx, x1 + dx * tt, y1 + dy * tt, color, alpha, size);
  }
}

// dotted quadratic — silk threads sag, they are never straight
function sagStrand(ctx, x1, y1, x2, y2, sag, color, alpha, step, size) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.round(len / step));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = lerp(x1, mx, t), b = lerp(mx, x2, t);
    const c = lerp(y1, my, t), d = lerp(my, y2, t);
    drawDot(ctx, lerp(a, b, t), lerp(c, d, t), color, alpha, size);
  }
}

function fillEllipseDots(ctx, cx, cy, rx, ry, rot, color, alpha, step) {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (let y = -ry; y <= ry; y += step) {
    for (let x = -rx; x <= rx; x += step) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
        drawDot(ctx, cx + x * cos - y * sin, cy + x * sin + y * cos, color, alpha, step * 1.05);
      }
    }
  }
}

// hourglass: two stacked triangles, drawn in abdomen-local space
function fillHourglass(ctx, cx, cy, w, h, rot, color, alpha, step) {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const half = w / 2;
  for (let y = -h; y <= h; y += step) {
    const span = half * (Math.abs(y) / h);
    for (let x = -span; x <= span; x += step) {
      drawDot(ctx, cx + x * cos - y * sin, cy + x * sin + y * cos, color, alpha, step * 1.05);
    }
  }
}

/**
 * Leg rig. Base angles are relative to the body heading (+x = forward).
 * Pair I reaches forward and is longest; pair III is shortest — true to
 * Latrodectus proportions.
 */
const LEG_DEFS = [];
{
  const pairs = [
    { ang: 0.52, reach: 1.85, len: 2.05 }, // I  — forward
    { ang: 1.12, reach: 1.55, len: 1.75 }, // II
    { ang: 1.95, reach: 1.30, len: 1.5 },  // III — shortest
    { ang: 2.62, reach: 1.70, len: 1.9 },  // IV — rear
  ];
  pairs.forEach((p, i) => {
    for (const side of [1, -1]) {
      LEG_DEFS.push({
        id: i * 2 + (side > 0 ? 0 : 1),
        side,
        baseAng: p.ang * side,
        reach: p.reach,   // rest distance of the foot, in body units
        len: p.len,       // total leg length (femur+tibia), in body units
        // alternating tetrapod: R1,L2,R3,L4 = group 0 / L1,R2,L3,R4 = group 1
        group: (i + (side > 0 ? 0 : 1)) % 2,
      });
    }
  });
}

export function createWidowFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let active = false;
  let w = 0, h = 0, dpr = 1;
  let t = 0;           // time within current phase
  let tAll = 0;        // global clock (wind, breathing)
  let phase = "drop";
  let loopSeed = Math.random();

  // web geometry (built per loop)
  let hub = { x: 0, y: 0 };
  let anchorY = 0;     // dragline anchor above the hub (offscreen)
  let rmax = 0;
  let radii = [];      // { ang, len, sag, grow 0..1 }
  let spiral = [];     // [{x,y}] local to hub, outside-in
  let spiralOn = 0;    // samples revealed
  let plucks = [];     // strand vibration events { ang, age, life }

  // spider body state
  const body = { x: 0, y: 0, heading: Math.PI / 2, scale: 4 };
  const feet = LEG_DEFS.map(() => ({ x: 0, y: 0, swing: 0, from: null, to: null }));
  let swingGroup = 0;
  let lastStepAt = 0;

  const DUR = reduced
    ? { drop: 0.5, radii: 0.6, spiral: 0.8, hold: Infinity, retreat: 0 }
    : { drop: 2.3, radii: 3.4, spiral: 4.4, hold: 7.0, retreat: 1.7 };

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

  function newLoop() {
    loopSeed = Math.random();
    hub.x = w * (0.54 + loopSeed * 0.16); // clear of both the card and the core
    hub.y = h * (0.4 + loopSeed * 0.1);
    anchorY = -h * 0.08;
    rmax = Math.min(Math.max(Math.min(w, h) * 0.33, 170), 470);
    radii = Array.from({ length: NUM_RADII }, (_, i) => {
      const ang = (i / NUM_RADII) * TAU + (Math.random() - 0.5) * 0.16;
      const len = rmax * (0.86 + Math.random() * 0.24);
      return { ang, len, sag: (2 + Math.random() * 4) * Math.abs(Math.cos(ang)), grow: 0 };
    });
    // capture spiral, OUTSIDE-IN (real orb weavers lay it outer → hub)
    spiral = [];
    const startAng = radii[0].ang + Math.random() * TAU;
    for (let i = 0; i <= SPIRAL_SAMPLES; i++) {
      const q = i / SPIRAL_SAMPLES; // 0 outer → 1 inner
      const rad = rmax * lerp(0.9, FREE_ZONE, q);
      const ang = startAng - q * SPIRAL_TURNS * TAU; // widdershins, inward
      spiral.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
    }
    spiralOn = 0;
    plucks = [];
    body.scale = Math.max(4.5, Math.min(w, h) / 145);
    body.x = hub.x; body.y = anchorY;
    body.heading = Math.PI / 2; // descending, head down
    for (const f of feet) { f.swing = 0; f.from = null; f.to = null; }
  }

  // ── wind: everything on silk sways together ────────────────────────────────
  function wind(x, y, mult = 1) {
    if (reduced) return { x: 0, y: 0 };
    const k = (y - hub.y) * 0.004 + tAll * 0.7;
    const amp = 1.6 * mult;
    return { x: Math.sin(k) * amp + Math.sin(tAll * 0.31 + x * 0.002) * amp * 0.5, y: Math.cos(k * 0.7) * amp * 0.4 };
  }

  // ── web drawing ────────────────────────────────────────────────────────────
  function drawWeb(alpha) {
    if (alpha <= 0.004) return;
    const step = Math.max(2.3, Math.min(w, h) / 360);

    // dragline / bridge thread above the hub — the web hangs FROM something
    const wv0 = wind(hub.x, anchorY, 0.4);
    sagStrand(ctx, hub.x - rmax * 0.9, anchorY + 14, hub.x + wv0.x, hub.y + wv0.y, 8, SILK_DIM, alpha * 0.4, step * 1.7, step);
    sagStrand(ctx, hub.x + rmax * 0.95, anchorY + 6, hub.x + wv0.x, hub.y + wv0.y, 8, SILK_DIM, alpha * 0.4, step * 1.7, step);

    // radii, with sag + wind
    for (const r of radii) {
      if (r.grow <= 0.01) continue;
      const ex = hub.x + Math.cos(r.ang) * r.len * r.grow;
      const ey = hub.y + Math.sin(r.ang) * r.len * r.grow;
      const wv = wind(ex, ey);
      sagStrand(ctx, hub.x, hub.y, ex + wv.x, ey + wv.y, r.sag * r.grow, SILK_DIM, alpha * 0.72, step * 1.55, step);
    }

    // capture spiral — sagging arcs between samples, vibrating near plucks
    for (let i = 0; i < spiralOn - 1; i++) {
      const a = spiral[i], b = spiral[i + 1];
      let vib = 0;
      for (const p of plucks) {
        const pd = Math.abs(Math.atan2(a.y, a.x) - p.ang);
        const d = Math.min(pd, TAU - pd);
        if (d < 0.9) vib += Math.sin(p.age * 34 - d * 5) * 3.2 * (1 - d / 0.9) * (1 - p.age / p.life);
      }
      const wv = wind(hub.x + a.x, hub.y + a.y, 0.8);
      sagStrand(
        ctx,
        hub.x + a.x + wv.x, hub.y + a.y + wv.y + vib,
        hub.x + b.x + wv.x, hub.y + b.y + wv.y + vib,
        1.6,
        SILK, alpha * 0.85, step * 1.4, step,
      );
    }

    // dew glints on the finished web
    if (!reduced && spiralOn > SPIRAL_SAMPLES * 0.5 && Math.random() < 0.15) {
      const s = spiral[(Math.random() * (spiralOn - 1)) | 0];
      drawDot(ctx, hub.x + s.x, hub.y + s.y, GLINT, 0.7 * alpha, step * 1.7);
    }
  }

  // ── spider ─────────────────────────────────────────────────────────────────
  /** desired world-space foot hold for a leg given current body pose */
  function footTarget(leg, lead = 0) {
    const s = body.scale;
    const a = body.heading + leg.baseAng;
    return {
      x: body.x + Math.cos(a) * leg.reach * 3.4 * s + Math.cos(body.heading) * lead,
      y: body.y + Math.sin(a) * leg.reach * 3.4 * s + Math.sin(body.heading) * lead,
    };
  }

  function settleFeet() { // teleport all feet to their rest holds (phase changes)
    LEG_DEFS.forEach((leg, i) => {
      const p = footTarget(leg);
      feet[i].x = p.x; feet[i].y = p.y; feet[i].swing = 0; feet[i].from = null;
    });
  }

  /** stepping gait — swing a tetrapod group when its feet overreach */
  function updateGait(dt, speed) {
    const s = body.scale;
    const thresh = 2.6 * s + speed * 0.05;
    let groupNeeds = false;
    LEG_DEFS.forEach((leg, i) => {
      if (leg.group !== swingGroup) return;
      const want = footTarget(leg, speed * 0.09);
      if (Math.hypot(want.x - feet[i].x, want.y - feet[i].y) > thresh) groupNeeds = true;
    });
    const now = tAll;
    if (groupNeeds && now - lastStepAt > 0.09) {
      LEG_DEFS.forEach((leg, i) => {
        if (leg.group !== swingGroup) return;
        const f = feet[i];
        f.from = { x: f.x, y: f.y };
        f.to = footTarget(leg, speed * 0.12);
        f.swing = 0.0001;
      });
      swingGroup = 1 - swingGroup;
      lastStepAt = now;
    }
    for (const f of feet) {
      if (f.swing > 0 && f.from) {
        f.swing = Math.min(1, f.swing + dt / 0.11);
        const e = easeOut2(f.swing);
        f.x = lerp(f.from.x, f.to.x, e);
        f.y = lerp(f.from.y, f.to.y, e) - Math.sin(f.swing * Math.PI) * 2.2 * s * 0.4; // lift
        if (f.swing >= 1) { f.swing = 0; f.from = null; }
      }
    }
  }

  /**
   * Draw the spider at body.{x,y,heading}. pose:
   *  "walk"  — legs at their planted feet (gait)
   *  "hang"  — descending on the dragline, legs reaching up/out
   *  "rest"  — parked head-down, legs drawn in, breathing
   */
  function drawSpider(pose, alpha) {
    const s = body.scale;
    const step = Math.max(1.35, s * 0.32);
    const cos = Math.cos(body.heading), sin = Math.sin(body.heading);
    const fwd = (d) => ({ x: body.x + cos * d, y: body.y + sin * d });

    // body sections along the heading axis: head at +, abdomen at −
    const breathe = pose === "rest" && !reduced ? 1 + Math.sin(tAll * 2.1) * 0.03 : 1;
    const ceph = fwd(1.7 * s);
    const abdo = fwd(-2.6 * s);

    // legs
    LEG_DEFS.forEach((leg, i) => {
      let foot;
      if (pose === "walk") {
        foot = feet[i];
      } else if (pose === "hang") {
        // reaching pose — legs up toward the thread, slight individual drift
        const a = body.heading + leg.baseAng * 0.62 - Math.PI * (leg.side > 0 ? 0.06 : -0.06);
        const rr = leg.reach * 2.6 * s + (reduced ? 0 : Math.sin(tAll * 2.4 + i) * 1.3);
        foot = { x: body.x + Math.cos(a) * rr - sin * leg.side * 1.2 * s, y: body.y + Math.sin(a) * rr };
      } else {
        // rest — drawn in, gripping the hub
        const a = body.heading + leg.baseAng * 0.82;
        const rr = leg.reach * 2.55 * s + (reduced ? 0 : Math.sin(tAll * 1.1 + i * 1.7) * 0.7);
        foot = { x: body.x + Math.cos(a) * rr, y: body.y + Math.sin(a) * rr };
      }
      // 2-bone IK: femur + tibia, knee raised away from the body plane
      const hip = { x: ceph.x + (abdo.x - ceph.x) * 0.32 - sin * leg.side * 1.05 * s, y: ceph.y + (abdo.y - ceph.y) * 0.32 + cos * leg.side * 1.05 * s };
      const dx = foot.x - hip.x, dy = foot.y - hip.y;
      const d = Math.min(Math.hypot(dx, dy), leg.len * 3.35 * s * 0.99);
      const L = leg.len * 3.35 * s * 0.5;
      const lift = Math.sqrt(Math.max(L * L - (d / 2) * (d / 2), 0));
      const nx = -dy / (d || 1), ny = dx / (d || 1);
      const kneeUp = leg.side > 0 ? 1 : -1; // knees point outward from the body
      const knee = { x: hip.x + dx / 2 + nx * lift * kneeUp, y: hip.y + dy / 2 + ny * lift * kneeUp };
      strand(ctx, hip.x, hip.y, knee.x, knee.y, BODY, alpha * 0.92, step, Math.max(1.5, s * 0.5));    // femur, thicker
      strand(ctx, knee.x, knee.y, foot.x, foot.y, BODY_RIM, alpha * 0.8, step, Math.max(1.2, s * 0.34)); // tibia+tarsus, thin
    });

    // pedipalps — two short feelers at the head
    const palpA = body.heading + 0.26, palpB = body.heading - 0.26;
    const head = fwd(2.5 * s);
    strand(ctx, head.x, head.y, head.x + Math.cos(palpA) * 1.5 * s, head.y + Math.sin(palpA) * 1.5 * s, BODY_RIM, alpha * 0.7, step, Math.max(1.1, s * 0.26));
    strand(ctx, head.x, head.y, head.x + Math.cos(palpB) * 1.5 * s, head.y + Math.sin(palpB) * 1.5 * s, BODY_RIM, alpha * 0.7, step, Math.max(1.1, s * 0.26));

    // cephalothorax — small, with a rim-lit edge
    fillEllipseDots(ctx, ceph.x, ceph.y, 1.75 * s, 1.45 * s, body.heading, BODY, alpha, step);
    fillEllipseDots(ctx, ceph.x - cos * 0.4 * s, ceph.y - sin * 0.4 * s, 1.15 * s, 0.85 * s, body.heading, BODY_RIM, alpha * 0.35, step);

    // abdomen — large and globose, gloss highlight, hourglass on the venter
    fillEllipseDots(ctx, abdo.x, abdo.y, 2.9 * s * breathe, 3.3 * s * breathe, body.heading, BODY, alpha, step);
    fillEllipseDots(ctx, abdo.x - sin * 0.9 * s, abdo.y + cos * 0.9 * s, 1.15 * s, 1.5 * s, body.heading, BODY_GLOSS, alpha * 0.28, step);
    const hgPulse = pose === "rest" && !reduced ? 0.85 + Math.sin(tAll * 2.1) * 0.15 : 1;
    fillHourglass(ctx, abdo.x, abdo.y, 2.1 * s, 2.0 * s, body.heading + Math.PI / 2, MARK_RED, alpha * hgPulse, step * 0.9);
    fillHourglass(ctx, abdo.x, abdo.y, 1.1 * s, 1.05 * s, body.heading + Math.PI / 2, MARK_RED_DIM, alpha * 0.6, step * 0.8);

    // spinnerets — silk leaves from the abdomen tip, not the body center
    const spin = fwd(-4.1 * s * breathe);
    fillEllipseDots(ctx, spin.x, spin.y, 0.7 * s, 0.55 * s, body.heading, BODY_RIM, alpha * 0.6, step);
    return spin;
  }

  // ── phases ────────────────────────────────────────────────────────────────
  function phaseDrop(dt, webAlpha) {
    const p = clamp01(t / DUR.drop);
    const e = easeOut2(p);
    const damp = reduced ? 0 : Math.pow(1 - p, 1.7);
    const sway = reduced ? 0 : Math.sin(p * Math.PI * 3.4) * 26 * damp;
    body.x = hub.x + sway;
    body.y = lerp(anchorY, hub.y, e);
    body.heading = Math.PI / 2 + sway * -0.004; // head down, tilting with the swing
    const spin = drawSpider("hang", 1);
    // dragline pays out from the spinnerets to the anchor
    strand(ctx, hub.x, anchorY, spin.x, spin.y, SILK, 0.8, 3.4, 1.1);
  }

  function phaseRadii(dt) {
    const p = clamp01(t / DUR.radii);
    // radii grow in staggered — a time-lapse of frame building
    radii.forEach((r, i) => {
      r.grow = clamp01(p * NUM_RADII * 0.62 - i * 0.52);
    });
    // she runs out along the newest radius and back — montage of trips
    const trips = 5;
    const ti = Math.min(trips - 1, Math.floor(p * trips));
    const local = clamp01(p * trips - ti);
    const r = radii[Math.min(NUM_RADII - 1, ti * 3)];
    const out = local < 0.58 ? local / 0.58 : 1 - (local - 0.58) / 0.42;
    const dist = r.len * out * 0.92;
    const nx = hub.x + Math.cos(r.ang) * dist;
    const ny = hub.y + Math.sin(r.ang) * dist;
    const speed = Math.hypot(nx - body.x, ny - body.y) / Math.max(dt, 0.001);
    if (dist > 2) body.heading = Math.atan2(ny - body.y || Math.sin(r.ang) * (out > 0.5 ? -1 : 1), nx - body.x || Math.cos(r.ang) * (out > 0.5 ? -1 : 1));
    body.x = nx; body.y = ny;
    updateGait(dt, speed);
    drawSpider("walk", 1);
    // silk trails from her spinnerets back to the hub while she lays the radius
    strand(ctx, hub.x, hub.y, body.x, body.y, SILK, 0.5, 3.6, 1);
  }

  function phaseSpiral(dt) {
    const p = clamp01(t / DUR.spiral);
    const idx = Math.min(SPIRAL_SAMPLES, p * SPIRAL_SAMPLES);
    spiralOn = Math.floor(idx);
    const i0 = Math.min(SPIRAL_SAMPLES - 1, Math.floor(idx));
    const a = spiral[i0], b = spiral[Math.min(SPIRAL_SAMPLES, i0 + 1)];
    const f = idx - i0;
    const nx = hub.x + lerp(a.x, b.x, f);
    const ny = hub.y + lerp(a.y, b.y, f);
    const speed = Math.hypot(nx - body.x, ny - body.y) / Math.max(dt, 0.001);
    body.heading = Math.atan2(ny - body.y || (b.y - a.y), nx - body.x || (b.x - a.x));
    body.x = nx; body.y = ny;
    updateGait(dt, speed);
    drawSpider("walk", 1);
  }

  function phaseHold(dt) {
    spiralOn = SPIRAL_SAMPLES;
    for (const r of radii) r.grow = 1;
    // parked just off the hub, head-down (widows hang venter-out, hourglass showing)
    const wv = wind(hub.x, hub.y, 0.5);
    body.x = hub.x + wv.x * 0.6;
    body.y = hub.y + 2 + wv.y * 0.6;
    body.heading = Math.PI / 2 + (reduced ? 0 : Math.sin(tAll * 0.5) * 0.05);
    drawSpider("rest", 1);
    // she plucks the web now and then — ripple runs through the spiral
    if (!reduced && Math.random() < dt * 0.45 && plucks.length < 2) {
      plucks.push({ ang: Math.random() * TAU, age: 0, life: 1.4 });
    }
  }

  function phaseRetreat(dt) {
    const p = clamp01(t / Math.max(0.001, DUR.retreat));
    body.x = hub.x;
    body.y = lerp(hub.y, anchorY, easeOut2(p));
    body.heading = -Math.PI / 2; // climbing back up, head first
    const spin = drawSpider("hang", 1);
    strand(ctx, hub.x, anchorY, spin.x, spin.y, SILK, 0.8, 3.4, 1.1);
  }

  // ── loop ──────────────────────────────────────────────────────────────────
  function update(dt) {
    if (!active) return;
    t += dt; tAll += dt;
    ctx.clearRect(0, 0, w, h);

    if (phase === "drop" && t >= DUR.drop) { phase = "radii"; t = 0; settleFeet(); }
    else if (phase === "radii" && t >= DUR.radii) { phase = "spiral"; t = 0; settleFeet(); }
    else if (phase === "spiral" && t >= DUR.spiral) { phase = "hold"; t = 0; }
    else if (phase === "hold" && t >= DUR.hold) { phase = DUR.retreat > 0 ? "retreat" : "hold"; t = 0; }
    else if (phase === "retreat" && t >= DUR.retreat) { newLoop(); phase = "drop"; t = 0; }

    for (let i = plucks.length - 1; i >= 0; i--) {
      plucks[i].age += dt;
      if (plucks[i].age > plucks[i].life) plucks.splice(i, 1);
    }

    let webAlpha = 1;
    if (phase === "retreat") webAlpha = 1 - clamp01(t / Math.max(0.001, DUR.retreat)) * 0.85;
    drawWeb(webAlpha);

    if (phase === "drop") phaseDrop(dt, webAlpha);
    else if (phase === "radii") phaseRadii(dt);
    else if (phase === "spiral") phaseSpiral(dt);
    else if (phase === "hold") phaseHold(dt);
    else if (phase === "retreat") phaseRetreat(dt);

    ctx.globalAlpha = 1;
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      resize();
      active = true;
      phase = reduced ? "hold" : "drop";
      t = 0; tAll = 0;
      newLoop();
      if (reduced) { spiralOn = SPIRAL_SAMPLES; for (const r of radii) r.grow = 1; body.x = hub.x; body.y = hub.y; }
      window.addEventListener("resize", resize);
    },
    stop() {
      active = false;
      t = 0;
      plucks = [];
      ctx.clearRect(0, 0, w, h);
      window.removeEventListener("resize", resize);
    },
    update,
    resize,
  };
}
