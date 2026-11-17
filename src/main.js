/**
 * NOKIADEMON orchestrator.
 *
 * State machine over fixed decks (no document scroll — "a machine you operate"):
 *   loader → hero → hub ⇄ warp ⇄ daemon
 *
 * Input is routed per-state (wheel / touch / keyboard). The astrolabe ring
 * mechanic (hover-to-arm, wheel-to-rotate, align-to-lock) is the mouse delight;
 * the ring rail <button>s auto-align the dial and enter; manual dial still works.
 *
 * prefers-reduced-motion falls back to an accessible, scrollable document.
 */
import gsap from "gsap";
import { createInstrument } from "./scene.js";
import { mountUnicornBg } from "./unicorn-bg.js";
import { PROJECTS, PROJECT_BY_ID, RINGS } from "./data.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const body = document.body;
const canvas = $("#bg");
const statusEl = $("#status");
const scenes = {
  loader: $("#loader"),
  hero: $("#hero"),
  hub: $("#hub"),
  operator: $("#operator"),
  daemon: $("#daemon"),
};

const instrument = createInstrument(canvas, { reduced });
// Daemon backdrops are route-level features. Loading them during the cold boot
// made every visitor parse every effect (and construct hidden canvases) before
// the loader title could paint. Fetch only the selected process during its warp.
const fxRegistry = {};
const fxPromises = {};
const fxLoaders = {
  joust: () => import("./joust-fx.js").then(({ createJoustFx }) => createJoustFx({ reduced })),
  widow: () => import("./widow-fx.js").then(({ createWidowFx }) => createWidowFx({ reduced })),
  forge: () => import("./forge-fx.js").then(({ createForgeFx }) => createForgeFx({ reduced })),
  finders: () => import("./finders-fx.js").then(({ createFindersFx }) => createFindersFx({ reduced })),
  ekko: () => import("./ekko-fx.js").then(({ createEkkoFx }) => createEkkoFx({ reduced, getOrigin: () => instrument.coreScreen() })),
  orion: () => import("./orion-fx.js").then(({ createOrionFx }) => createOrionFx({ reduced })),
  dia: () => import("./dia-fx.js").then(({ createDiaFx }) => createDiaFx({ reduced })),
  life: () => import("./life-fx.js").then(({ createLifeFx }) => createLifeFx({ reduced })),
  bonkler: () => import("./bonkler-fx.js").then(({ createBonklerFx }) => createBonklerFx({ reduced })),
  emp: () => import("./character-fx.js").then(({ createCharacterFx }) => createCharacterFx("emp", { reduced })),
  archives: () => import("./archives-title.js").then(({ createArchivesTitle }) => createArchivesTitle({ reduced })),
};
function ensureFx(id) {
  if (fxRegistry[id]) return Promise.resolve(fxRegistry[id]);
  if (!fxLoaders[id]) return Promise.resolve(null);
  if (!fxPromises[id]) {
    fxPromises[id] = fxLoaders[id]()
      .then((fx) => (fxRegistry[id] = fx))
      .catch(() => null);
  }
  return fxPromises[id];
}
const activeFx = () => Object.values(fxRegistry).filter((fx) => fx.active);
if (import.meta.env.DEV) { window.__fx = fxRegistry; window.__instrument = instrument; } // debug hooks (dev only)
const daemonShell = () => document.querySelector(".daemon-card-shell");
let liquidGlass = null;
let liquidGlassPromise = null;
function ensureLiquidGlass() {
  if (reduced) return Promise.resolve(null);
  if (liquidGlass) return Promise.resolve(liquidGlass);
  if (!liquidGlassPromise) {
    liquidGlassPromise = import("./liquid-glass.js")
      .then(({ createLiquidGlass }) => {
        liquidGlass = createLiquidGlass({ shell: daemonShell(), sourceCanvas: canvas, reduced });
        return liquidGlass;
      })
      .catch(() => null);
  }
  return liquidGlassPromise;
}
let unicornBg = null;
let state = "loader";
let locked = null; // latch to prevent warp re-trigger
let lastTick = performance.now();

function announce(msg) { statusEl.textContent = msg; }

// ── render loop ───────────────────────────────────────────────────────────────
function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;
  for (const fx of activeFx()) fx.update(dt);
  instrument.update();
  if (state === "hub") updateReticle();
  if (state === "hub" && !reduced) checkLock();
  if (state === "loader") tickLoader();
  requestAnimationFrame(tick);
}

// ── scene switching ───────────────────────────────────────────────────────────
function showScene(id, { fade = true } = {}) {
  Object.entries(scenes).forEach(([key, el]) => {
    if (!el) return;
    if (key === id) {
      el.hidden = false;
      if (fade && !reduced) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" });
    } else {
      if (fade && !reduced && !el.hidden) {
        gsap.to(el, { opacity: 0, duration: 0.35, ease: "power2.in", onComplete: () => (el.hidden = true) });
      } else {
        el.hidden = true;
      }
    }
  });
  body.dataset.state = id;
}

function setState(next) {
  state = next;
  // drift + dither per state
  if (next === "hub") { instrument.setDrift(1); instrument.setDither({ pitch: 2.0, intensity: 0.55, mode: 0 }); instrument.setExposure(1, 0.5); }
  else if (next === "hero") { instrument.setDrift(1); instrument.setDither({ pitch: 2.4, intensity: 0.4, mode: 0 }); instrument.setExposure(0.9, 0.6); }
  else { instrument.setDrift(0); }
  if (unicornBg) instrument.setHdriAmount(next === "loader" ? 0 : 1);
}

// ── loader (2.1) ──────────────────────────────────────────────────────────────
let loaderEls = null;
let burnCaptured = false;
// boot feed: [progress fraction, line] — lines stream in as the footage decodes
const BOOT_FEED = [
  [0.00, "establishing feed"],
  [0.16, "decoding frames"],
  [0.34, "allocating glyph field"],
  [0.52, "compositing dither grid"],
  [0.70, "seating chrome core"],
  [0.86, `mounting ${PROJECTS.length} processes`],
  [0.98, "ready"],
];

function pushFeedLine(text) {
  const feed = loaderEls.feed;
  const prev = feed.lastElementChild;
  if (prev && prev.textContent !== "ready") prev.classList.add("feed-ok"); // mark previous done
  const li = document.createElement("li");
  li.textContent = text;
  feed.appendChild(li);
  while (feed.children.length > 6) feed.removeChild(feed.firstElementChild); // rolling window
}

// advance the feed to a progress fraction; freeze the near-final frame as the burn ghost
function updateLoaderFeed(frac) {
  if (!loaderEls) return;
  while (loaderEls.step < BOOT_FEED.length && frac >= BOOT_FEED[loaderEls.step][0]) {
    pushFeedLine(BOOT_FEED[loaderEls.step][1]);
    loaderEls.step++;
  }
  if (!burnCaptured && frac >= 0.9) { instrument.captureBurn(); burnCaptured = true; }
}

function tickLoader() {
  if (!loaderEls || !loaderEls.usingVideo) return;
  const v = loaderEls.video;
  if (!v.duration || v.paused) return;
  updateLoaderFeed(Math.min(1, v.currentTime / v.duration));
}

// glyph pool the message decodes through before each character locks in
const SCRAMBLE_GLYPHS = [..."アイウエオカキクケコサシスセタチツテトナニヌネノ0123456789#@%*+=?/"];
const randGlyph = () => SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
const FIXED_CH = (ch) => ch === " " || ch === "\n";
// the invocation shown under the name before it resolves to the real tagline
const HERO_INVOCATION = "WISDOM\n\nYOU ARE A BEING UNTO YOURSELF\nYOU ARE A LAW UNTO YOURSELF\nEACH INTELLIGENCE IS HOLY\nFOR ALL THAT LIVES IS HOLY";

// decode: every char flickers through glyphs then locks in a random order
function scrambleReveal(el, finalText, delayMs, durMs) {
  const chars = [...finalText];
  const settle = chars.map((ch) => (FIXED_CH(ch) ? 0 : 0.2 + Math.random() * 0.75));
  const start = performance.now() + delayMs;
  function frame(now) {
    const t = (now - start) / durMs;
    if (t >= 1) { el.textContent = finalText; return; }
    let out = "";
    for (let i = 0; i < chars.length; i++) out += FIXED_CH(chars[i]) ? chars[i] : (t >= settle[i] ? chars[i] : randGlyph());
    el.textContent = out;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// glitch-swap: a brief full scramble burst, then decode into the final text
function glitchSwap(el, finalText, onDone) {
  el.classList.remove("dithered");
  el.classList.add("glitching");
  const chars = [...finalText];
  const start = performance.now(), burst = 220;
  function frame(now) {
    if (now - start < burst) {
      el.textContent = chars.map((c) => (FIXED_CH(c) ? c : randGlyph())).join("");
      requestAnimationFrame(frame);
    } else {
      el.classList.remove("glitching");
      scrambleReveal(el, finalText, 0, 650);
      if (onDone) onDone();
    }
  }
  requestAnimationFrame(frame);
}

// enter the site — replaces the old "click to start" gate
function launch() {
  if (!loaderEls || loaderEls.launched) return;
  loaderEls.launched = true;
  window.removeEventListener("keydown", onSkip);
  if (!burnCaptured) { instrument.captureBurn(); burnCaptured = true; }
  loaderEls.video.pause();
  goHero();
}
function onSkip(e) { // keyboard operators can skip straight in (past the message too)
  if (!["Enter", " ", "Escape"].includes(e.key)) return;
  e.preventDefault();
  loaderEls?.revealTl?.kill();
  gsap.set("[data-flash]", { opacity: 0 });
  launch();
}

function runLoader() {
  const feed = $("[data-feed]");
  const video = instrument.loaderVideo;
  body.dataset.state = "loader";
  loaderEls = { feed, video, usingVideo: false, step: 0, launched: false };
  instrument.setChromeVisible(false); // loader shows only the footage, as a glyph grid
  instrument.setAscii(true);          // render the boot footage as a character/glyph dither
  instrument.videoAmtU.value = 1.0;   // full footage luminance drives the glyph grid
  window.addEventListener("keydown", onSkip);

  // footage ends → hold the frame, then into the hero
  video.addEventListener("ended", () => {
    updateLoaderFeed(1);
    instrument.captureBurn(); burnCaptured = true;
    gsap.delayedCall(0.3, launch);       // hold the last frame a beat, then into the hero
  }, { once: true });

  video.play().then(() => {
    loaderEls.usingVideo = true;
  }).catch(() => {
    // autoplay blocked → timed boot feed over the plain instrument, then launch
    instrument.setAscii(false); instrument.setChromeVisible(true); instrument.videoAmtU.value = 0;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: 1, duration: 2.6, ease: "power1.inOut",
      onUpdate() { updateLoaderFeed(obj.v); },
      onComplete() { gsap.delayedCall(0.4, launch); },
    });
  });
}

// ── hero (2.2) ────────────────────────────────────────────────────────────────
function ensureUnicornBg() {
  if (reduced || unicornBg) return;
  const mount = $("#unicorn-bg");
  if (!mount) return;
  mountUnicornBg(mount).then((bg) => {
    unicornBg = bg;
    body.classList.add("unicorn-bg-on", "hdri-on");
    const usCanvas = bg.canvas?.();
    if (usCanvas) {
      instrument.setHdriSource(usCanvas);
      instrument.setHdriAmount(1);
    }
  }).catch(() => {});
}

function goHero() {
  ensureUnicornBg();
  instrument.setChromeVisible(true); // instrument emerges as the glyph grid dissolves
  instrument.setAscii(false);
  gsap.to(instrument.videoAmtU, { value: 0, duration: 0.6, ease: "power2.inOut" });
  gsap.to(instrument.videoBurnU, { value: 0.12, duration: 1.2, ease: "power2.out" }); // last frame burns in faintly
  showScene("hero");
  setState("hero");
  announce("Hero. Enter the instrument to reach the astrolabe.");
  if (!reduced) {
    const tagline = $(".hero-tagline");
    const realText = tagline.textContent.replace(/\s+/g, " ").trim();
    // measure both heights up front so the column stays put while the taller invocation shows
    tagline.style.whiteSpace = "pre-line";
    tagline.textContent = HERO_INVOCATION;
    const wisdomH = tagline.offsetHeight;
    tagline.style.whiteSpace = "";
    tagline.textContent = realText;
    const realH = tagline.offsetHeight;
    tagline.style.minHeight = wisdomH + "px";
    tagline.style.whiteSpace = "pre-line";
    tagline.textContent = "";
    gsap.set("[data-reveal]", { opacity: 0, y: 18 });
    gsap.to("[data-reveal]", { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, delay: 0.5, ease: "power3.out" });
    gsap.delayedCall(0.7, () => runTaglineInvocation(tagline, realText, realH));
  } else {
    gsap.set("[data-reveal]", { opacity: 1, y: 0 });
  }
}

// under the name: decode the WISDOM invocation, solidify ~0.7s, then glitch to the real tagline
function runTaglineInvocation(el, realText, realH) {
  const wisdomDur = 1200;
  el.classList.add("dithered");                          // dot-dither texture on the invocation
  scrambleReveal(el, HERO_INVOCATION, 0, wisdomDur);
  gsap.delayedCall((wisdomDur + 1500) / 1000, () => {    // solidify 1.5s, then glitch over
    glitchSwap(el, realText, () => {
      el.style.whiteSpace = "";
      gsap.to(el, { minHeight: realH, duration: 0.5, ease: "power2.inOut", onComplete: () => { el.style.minHeight = ""; } });
    });
  });
}

// ── hub (2.3) ─────────────────────────────────────────────────────────────────
const reticleEl = $(".reticle");
const ringNameEl = $("[data-ring-name]");
const glyphNameEl = $("[data-glyph-name]");
let descent = 0; // accumulates wheel when no ring armed → scroll back to hero
let lastRotateAt = 0; // a lock may only fire shortly after the user rotates a ring
let opWall = null;
let opWallPromise = null;
function ensureOperatorWall() {
  if (opWall) return Promise.resolve(opWall);
  if (!opWallPromise) {
    opWallPromise = import("./operator-wall.js")
      .then(({ initOperatorWall }) => {
        opWall = initOperatorWall({ reduced });
        return opWall;
      })
      .catch(() => null);
  }
  return opWallPromise;
}

function goHub() {
  opWall && opWall.leave();
  showScene("hub");
  setState("hub");
  descent = 0; lockTimer = 0; lastRotateAt = 0;
  instrument.cancelAlign();
  picking = null;
  instrument.setActiveRing(null); // stop any idle detent on the ring we just left
  // NOTE: do not clear `locked` here. When we return from a daemon the same glyph
  // is still under the reticle; the latch below releases only once it leaves the
  // gate, so we don't instantly re-lock and warp straight back in.
  announce("Astrolabe. Select a project from the index, or drag a ring to align a glyph under the reticle.");
}

function updateReticle() {
  const ring = instrument.activeRing || "B";
  const p = instrument.reticleScreen(ring);
  if (p.visible) {
    reticleEl.style.left = p.x + "px";
    reticleEl.style.top = p.y + "px";
  }
  const armed = instrument.getArmed();
  reticleEl.classList.toggle("armed", !!armed && Math.abs(armed.delta) < 0.14);
  ringNameEl.textContent = instrument.activeRing ? RINGS[instrument.activeRing].label : "IDLE";
  glyphNameEl.textContent = armed && Math.abs(armed.delta) < 0.2 ? armed.project.name.toUpperCase() : "NONE ALIGNED";
  // rail arm highlight
  $$(".mark-btn").forEach((b) => b.dataset.armed = armed && armed.id === b.dataset.project && Math.abs(armed.delta) < 0.1 ? "true" : "false");
  $$(".ring-group").forEach((g) => (g.dataset.active = g.dataset.ring === instrument.activeRing ? "true" : "false"));
}

let lockTimer = 0;
let picking = null; // project id currently auto-aligning from the rail

function checkLock() {
  if (picking || instrument.aligning) return;
  const armed = instrument.getArmed();
  // Hold the latch until the just-locked glyph has clearly left the reticle gate
  // (rotated away, or a different ring/glyph armed). Prevents auto re-lock loops.
  if (locked) {
    if (!armed || armed.id !== locked || Math.abs(armed.delta) > 0.28) { locked = null; lockTimer = 0; }
    else return;
  }
  // Only lock as a consequence of recent user rotation, never at idle. goHub()
  // resets lastRotateAt to 0, so this window can be generous without re-introducing
  // the auto re-lock loop — seating a glyph after a scroll takes a beat.
  const engaged = lastRotateAt > 0 && performance.now() - lastRotateAt < 1600;
  if (engaged && armed && Math.abs(armed.delta) < 0.05) {
    lockTimer += 1;
    if (lockTimer > 7) { // glyph seated under the reticle after rotating
      locked = armed.id;
      reticleEl.classList.add("locking");
      setTimeout(() => reticleEl.classList.remove("locking"), 280);
      enterProject(armed.project);
    }
  } else {
    lockTimer = 0;
  }
}

// ── operator file (2.4) — the about dossier ───────────────────────────────
function goOperator() {
  if (state === "warp" || state === "daemon") return;
  showScene("operator");
  setState("operator");
  instrument.setDrift(0.4);
  opAscent = 0;
  const opSection = document.getElementById("operator");
  if (opSection) opSection.scrollTop = 0;
  // The archive engine is a large, isolated route. Load it on demand and only
  // activate it if the operator scene is still current when initialization ends.
  ensureOperatorWall().then((wall) => {
    if (wall && state === "operator") wall.enter();
  });
  announce("Operator file, CHAKRA3301. A live archive field — sweep to decode a work, click to open it. Scroll up, escape, or back returns to the instrument.");
  if (!reduced) {
    gsap.fromTo("[data-op-reveal]",
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, delay: 0.15, ease: "power3.out", overwrite: "auto" });
  }
}

// ── warp (2.4) → daemon (2.5) ─────────────────────────────────────────────────
function pickProject(project) {
  if (state === "warp" || state === "daemon") return;
  if (picking === project.id) return;
  if (state !== "hub") {
    goHub();
  }
  picking = project.id;
  locked = null;
  lockTimer = 0;
  announce(`Aligning ${project.name}.`);
  instrument.alignToProject(project, () => {
    if (picking !== project.id) return;
    picking = null;
    enterProject(project);
  });
}

function enterProject(project) {
  if (state !== "hub") { showScene("hub", { fade: false }); setState("hub"); }
  // Start route chunks while the 1.4s warp is playing; they are normally ready
  // before the daemon appears and never compete with the initial LCP.
  const effectsReady = Promise.all([ensureFx(project.id), ensureLiquidGlass()]);
  locked = project.id; // engage latch for every entry path (align / rail)
  setState("warp");
  reticleEl.classList.remove("armed");
  announce(`Locking ${project.name}. Warping into process.`);
  // fade hub HUD out immediately, keep canvas
  gsap.to(scenes.hub, { opacity: 0, duration: 0.3, onComplete: () => (scenes.hub.hidden = true) });
  instrument.warpTo(project, () => {
    buildDaemon(project);
    showScene("daemon");
    setState("daemon");
    effectsReady.then(([fx, glass]) => {
      if (state !== "daemon" || currentProject?.id !== project.id) return;
      if (fx) {
        fx.start();
        // Preserve the new projects' original glyph and liquid-chrome colors.
        instrument.setDaemonFx(fx.canvas, 1, ["orion", "bonkler", "emp", "archives"].includes(project.id) ? 1 : 0, fx.dotPitch || 0, {
          backgroundDim: fx.backgroundDim || 0, preserveColor: fx.preserveColor || false,
        });
        if (fx.dither) instrument.setDither(fx.dither);
      }
      glass?.start();
    });
    announce(`${project.name}. ${project.thesis}`);
  });
}

// ── daemon-stack (2.5) ────────────────────────────────────────────────────────
let daemonPanels = [];
let daemonIndex = 0;
let currentProject = null;
const INFO_DOT_COUNT = 3;

function buildDaemon(project) {
  currentProject = project;
  const vp = $("[data-daemon-viewport]");
  const cta = ctaMarkup(project);
  const panels = [
    // 1 Identity
    `<div class="daemon-kicker"><span class="dot"></span> ${project.category} · Ring ${project.ring}</div>
     <div class="daemon-glyph" aria-hidden="true">${project.glyph}</div>
     <h2 class="daemon-name">${project.name}</h2>
     <p class="daemon-thesis">${project.thesis}</p>`,
    // 2 Process
    `<div class="daemon-kicker"><span class="dot"></span> Process</div>
     <h2 class="daemon-name daemon-name--sm">The process</h2>
     <p class="daemon-body">${project.description}</p>`,
    // 3 Readout
    `<div class="daemon-kicker"><span class="dot"></span> Readout</div>
     <div class="daemon-readout">${project.readout}</div>
     <div class="daemon-grid">
       <div class="daemon-field"><h3>Stack</h3><div class="daemon-stack-list">${project.stack.map((s) => `<span>${s}</span>`).join("")}</div></div>
       <div class="daemon-field"><h3>Role</h3><p>${project.role}</p></div>
       <div class="daemon-field"><h3>Status</h3><p>${project.statusNote}</p></div>
     </div>`,
    // 4 Action
    `<div class="daemon-kicker"><span class="dot"></span> Action</div>
     <h2 class="daemon-name daemon-name--sm">${project.name}</h2>
     ${cta}
     <p class="daemon-body daemon-body--hint">Scroll on to back out of the process.</p>`,
  ];
  vp.style.setProperty("--proj", project.color);
  vp.innerHTML = panels
    .map((html, i) => `<article class="daemon-panel" data-current="${i === 0}" aria-hidden="${i !== 0}">${html}</article>`)
    .join("");
  daemonPanels = $$(".daemon-panel", vp);
  daemonIndex = 0;
  buildDaemonDots();
  updateDaemonDots();
  scenes.daemon.style.setProperty("--proj", project.color);
  scenes.daemon.dataset.project = project.id;
  $("[data-daemon-card]")?.style.setProperty("--proj", project.color);
  resetDaemonCardTilt();
}

function buildDaemonDots() {
  const dotsEl = $("[data-daemon-dots]");
  if (!dotsEl) return;
  dotsEl.innerHTML = Array.from({ length: INFO_DOT_COUNT }, (_, i) =>
    `<button type="button" class="daemon-dot" data-dot="${i}" aria-label="Section ${i + 1}"></button>`,
  ).join("");
  $$(".daemon-dot", dotsEl).forEach((btn) => {
    btn.addEventListener("click", () => goDaemonPanel(+btn.dataset.dot));
  });
}

function updateDaemonDots() {
  $$(".daemon-dot").forEach((dot, i) => {
    const onAction = daemonIndex >= INFO_DOT_COUNT;
    const active = onAction ? i === INFO_DOT_COUNT - 1 : i === daemonIndex;
    const passed = onAction || i < daemonIndex;
    dot.dataset.active = active;
    dot.dataset.passed = passed;
    dot.setAttribute("aria-current", active ? "step" : "false");
  });
  const hint = $("[data-daemon-scroll-hint]");
  if (hint) hint.hidden = daemonIndex >= daemonPanels.length - 1;
}

function resetDaemonCardTilt() {
  const card = $("[data-daemon-card]");
  if (!card) return;
  card.style.setProperty("--tilt-x", "0deg");
  card.style.setProperty("--tilt-y", "0deg");
  liquidGlass?.setTilt(0, 0);
}

function onDaemonCardPointer(e) {
  if (state !== "daemon" || reduced) return;
  const card = $("[data-daemon-card]");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  card.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
  card.style.setProperty("--tilt-y", `${(x * 9).toFixed(2)}deg`);
  liquidGlass?.setTilt(x, y);
}

function ctaMarkup(p) {
  if (p.cta.kind === "status") return `<span class="daemon-cta" data-kind="status">${p.cta.label}</span>`;
  const rel = p.cta.kind === "source" || p.cta.kind === "external" ? "noopener" : "";
  return `<a class="daemon-cta" data-kind="${p.cta.kind}" href="${p.cta.href}" target="_blank" rel="${rel}">${p.cta.label} <span aria-hidden="true">↗</span></a>`;
}

function goDaemonPanel(i) {
  if (i < 0) { exitDaemon(); return; }
  if (i >= daemonPanels.length) { exitDaemon(); return; }
  daemonPanels.forEach((el, idx) => {
    const cur = idx === i;
    if (cur && !reduced) {
      gsap.fromTo(el, { opacity: 0, y: 40, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" });
    }
    el.dataset.current = cur;
    el.setAttribute("aria-hidden", !cur);
  });
  daemonIndex = i;
  updateDaemonDots();
  announce(`Panel ${i + 1} of ${daemonPanels.length}.`);
}
function exitDaemon() {
  const departingId = currentProject?.id;
  for (const fx of activeFx()) fx.stop();
  liquidGlass?.stop();
  instrument.setDaemonFx(null, 0);
  if (["emp", "archives"].includes(departingId) && fxRegistry[departingId]) {
    fxRegistry[departingId].destroy?.();
    delete fxRegistry[departingId];
    delete fxPromises[departingId];
  }
  setState("warp");
  instrument.backToHub(() => { goHub(); });
  announce("Backing out of process to the astrolabe.");
}

// ── input routing ─────────────────────────────────────────────────────────────
// One gesture, one meaning:
//   hero:   deliberate scroll down → hub
//   hub:    scroll does NOT touch the dial (drag / arrow keys / rail rotate it);
//           deliberate scroll up → back to hero
//   daemon: scroll steps panels, debounced so trackpad momentum can't blow
//           through the whole stack
let heroDescent = 0;
let wheelAcc = 0;
let lastWheelAt = 0;
let wheelLockUntil = 0;
let wheelBlockedUntil = 0;
let opAscent = 0;
const WHEEL_TRANSITION_LOCK_MS = 1100;
const WHEEL_RELEASE_MS = 320;

function holdWheelUntilRelease(now = performance.now()) {
  // A trackpad fling keeps emitting inertial wheel events after the state has
  // changed. Enforce a minimum transition cooldown, keep extending it while
  // momentum arrives, then require a fresh gesture in the new scene.
  wheelBlockedUntil = now + WHEEL_TRANSITION_LOCK_MS;
  heroDescent = 0;
  descent = 0;
  wheelAcc = 0;
  opAscent = 0;
  lastWheelAt = now;
}

function onWheel(e) {
  if (reduced) return;
  const now = performance.now();

  if (now < wheelBlockedUntil) {
    e.preventDefault();
    wheelBlockedUntil = Math.max(wheelBlockedUntil, now + WHEEL_RELEASE_MS);
    return;
  }

  if (state === "operator") {
    // the archive field owns the screen; a deliberate scroll up climbs back to the
    // dial. (fallback with no field scrolls the section natively until its top.)
    const sc = window.__archiveActive ? null : document.getElementById("operator");
    const atTop = !sc || sc.scrollTop <= 0;
    if (atTop && e.deltaY < 0) {
      if (now - lastWheelAt > 900) opAscent = 0;
      lastWheelAt = now;
      opAscent += e.deltaY;
      if (opAscent < -180) {
        holdWheelUntilRelease(now);
        goHub();
      }
    } else {
      opAscent = 0;
    }
    return;
  }
  e.preventDefault();
  const dy = e.deltaY;

  if (state === "hero") {
    heroDescent = now - lastWheelAt > 500 ? dy : heroDescent + dy;
    lastWheelAt = now;
    if (heroDescent > 110) {
      holdWheelUntilRelease(now);
      goHub();
    }
    return;
  }
  if (state === "hub") {
    // rings are driven by drag / keys / the index — never by scroll.
    // scroll up climbs to the hero; scroll down descends into the operator file
    if (now - lastWheelAt > 900) descent = 0;
    lastWheelAt = now;
    descent += dy;
    if (descent < -220) {
      holdWheelUntilRelease(now);
      goHero();
    } else if (descent > 220) {
      holdWheelUntilRelease(now);
      goOperator();
    }
    return;
  }
  if (state === "daemon") {
    if (now < wheelLockUntil) return;
    if (now - lastWheelAt > 350) wheelAcc = 0;
    lastWheelAt = now;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) > 80) {
      const dir = wheelAcc > 0 ? 1 : -1;
      wheelLockUntil = now + 600;
      holdWheelUntilRelease(now);
      goDaemonPanel(daemonIndex + dir);
    }
  }
}

// ── drag-to-rotate (hub): the dial is a physical thing you take hold of ─────
let dragRing = null;
let dragX = 0;

function onPointerDown(e) {
  if (state !== "hub" || reduced) return;
  if (e.target.closest && e.target.closest(".ring-rail, .daemon-back, button, a")) return;
  if (!instrument.activeRing) return;
  dragRing = instrument.activeRing;
  dragX = e.clientX;
  instrument.cancelAlign();
  picking = null;
  document.body.classList.add("is-dragging-ring");
}
function onPointerUp() {
  if (dragRing) document.body.classList.remove("is-dragging-ring");
  dragRing = null;
}

function onKey(e) {
  if (state === "hero" && (e.key === "ArrowDown" || e.key === "Enter")) { goHub(); }
  else if (state === "hub") {
    if (e.key === "ArrowLeft") { instrument.cancelAlign(); picking = null; instrument.rotateActive(-0.04); lastRotateAt = performance.now(); }
    else if (e.key === "ArrowRight") { instrument.cancelAlign(); picking = null; instrument.rotateActive(0.04); lastRotateAt = performance.now(); }
    else if (e.key === "ArrowDown" && !instrument.activeRing) goOperator();
    else if (e.key === "ArrowUp" && !instrument.activeRing) goHero();
  } else if (state === "daemon") {
    if (e.key === "ArrowDown") goDaemonPanel(daemonIndex + 1);
    else if (e.key === "ArrowUp") goDaemonPanel(daemonIndex - 1);
    else if (e.key === "Escape") exitDaemon();
  } else if (state === "operator" && e.key === "Escape") {
    goHub();
  }
}

// pointer → arm the ring under the cursor (desktop); drive an active drag
function onPointer(e) {
  instrument.onPointerMove(e);
  if (state !== "hub") return;
  if (dragRing) {
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    instrument.setActiveRing(dragRing); // hold the grabbed ring while dragging
    instrument.rotateBy(dx * 0.0035);
    lastRotateAt = performance.now();
    return;
  }
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  // don't hijack when pointer is over the rail
  if (e.target.closest && e.target.closest(".ring-rail")) return;
  instrument.setActiveRing(instrument.ringOfPointer(nx, ny));
}

// touch: horizontal drag rotates the armed ring; vertical swipe steps panels
let touchY = null, touchX = null;
let touchPanelLock = 0;
let touchGestureConsumed = false;
function onTouchStart(e) {
  touchY = e.touches[0].clientY;
  touchX = e.touches[0].clientX;
  touchGestureConsumed = false;
}
function onTouchMove(e) {
  if (touchY == null) return;
  if (touchGestureConsumed) {
    // One swipe may change one deck/panel. Do not let the remainder of the same
    // finger gesture scroll the scene that has just appeared underneath it.
    e.preventDefault();
    return;
  }
  const y = e.touches[0].clientY;
  const x = e.touches[0].clientX;
  const dy = touchY - y;
  const dx = x - touchX;
  if (state === "hub" && instrument.activeRing && !instrument.aligning && Math.abs(dx) > Math.abs(dy)) {
    instrument.cancelAlign();
    picking = null;
    instrument.rotateBy(dx * 0.004);
    lastRotateAt = performance.now();
    touchX = x; touchY = y;
    e.preventDefault();
  } else if (state === "hub" && Math.abs(dy) > Math.abs(dx) && dy > 90 && !instrument.aligning) {
    // swipe up on the dial → descend into the operator file
    touchGestureConsumed = true;
    e.preventDefault();
    goOperator();
  } else if (state === "daemon" && Math.abs(dy) > 64 && performance.now() > touchPanelLock) {
    touchPanelLock = performance.now() + 600;
    touchGestureConsumed = true;
    e.preventDefault();
    goDaemonPanel(daemonIndex + (dy > 0 ? 1 : -1));
  }
}
function onTouchEnd() {
  touchY = null;
  touchX = null;
  touchGestureConsumed = false;
}

// ── rail buttons + nav ────────────────────────────────────────────────────────
function wireControls() {
  $$(".mark-btn").forEach((btn) => {
    const p = PROJECT_BY_ID[btn.dataset.project];
    btn.addEventListener("click", () => pickProject(p));
    btn.addEventListener("mouseenter", () => instrument.setActiveRing(p.ring));
    btn.addEventListener("focus", () => instrument.setActiveRing(p.ring));
  });
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => {
    const t = b.dataset.goto;
    if (t === "hub") { if (state === "daemon") exitDaemon(); else goHub(); }
    else if (t === "operator") goOperator();
  }));
  $(".scroll-prompt")?.addEventListener("click", goHub);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);
  window.addEventListener("pointermove", onPointer);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  $("[data-daemon-card]")?.addEventListener("pointermove", onDaemonCardPointer);
  $("[data-daemon-card]")?.addEventListener("pointerleave", resetDaemonCardTilt);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd);
}

// ── reduced-motion: accessible document mode ──────────────────────────────────
function bootDocMode() {
  document.documentElement.classList.add("doc-mode");
  body.dataset.state = "doc";
  // reveal hero, hub list, all daemon panels inline — all readable.
  scenes.loader.hidden = true;
  Object.values(scenes).forEach((s) => (s.hidden = false));
  // expand every project inline in the daemon card
  const vp = $("[data-daemon-viewport]");
  const dotsEl = $("[data-daemon-dots]");
  if (dotsEl) dotsEl.hidden = true;
  $("[data-daemon-scroll-hint]")?.setAttribute("hidden", "");
  vp.innerHTML = PROJECTS.map((p) => `
    <article class="daemon-panel" data-current="true" style="--proj:${p.color}">
      <div class="daemon-kicker"><span class="dot"></span> ${p.category} · Ring ${p.ring}</div>
      <div class="daemon-glyph" aria-hidden="true">${p.glyph}</div>
      <h2 class="daemon-name">${p.name}</h2>
      <p class="daemon-thesis">${p.thesis}</p>
      <p class="daemon-body">${p.description}</p>
      <div class="daemon-readout">${p.readout}</div>
      <div class="daemon-grid">
        <div class="daemon-field"><h3>Stack</h3><div class="daemon-stack-list">${p.stack.map((s) => `<span>${s}</span>`).join("")}</div></div>
        <div class="daemon-field"><h3>Role</h3><p>${p.role}</p></div>
        <div class="daemon-field"><h3>Status</h3><p>${p.statusNote}</p></div>
      </div>
      ${ctaMarkup(p)}
    </article>`).join("");
  $$(".mark-btn").forEach((btn) => btn.addEventListener("click", () => {
    document.getElementById("daemon").scrollIntoView({ behavior: "auto" });
  }));
  instrument.render();
}

// ── go ────────────────────────────────────────────────────────────────────────
requestAnimationFrame(tick);
if (reduced) {
  bootDocMode();
  // Document mode exposes the operator archive immediately; initialize its
  // button semantics and static fallback after the critical document paint.
  requestAnimationFrame(() => ensureOperatorWall());
} else {
  wireControls();
  runLoader();
}

if (import.meta.hot) import.meta.hot.dispose(() => { for (const fx of Object.values(fxRegistry)) { fx.stop(); fx.destroy?.(); } liquidGlass?.destroy(); unicornBg?.destroy?.(); instrument.dispose(); });
