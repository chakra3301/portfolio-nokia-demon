/**
 * VORO-REAL — the actual voroforce engine (gnovotny/nothing-to-watch), vendored.
 *
 * The engine + its GLSL live in src/vendor/voroforce (MIT) and src/vendor/vf-config
 * (the fragment shaders are CC-BY-NC-SA 3.0 — see the credit rendered in the
 * operator footer). This module is a thin, framework-free integration: it feeds
 * the engine our own images through the `uncompressed-single` media path (each
 * lattice layer resolves to one of our images, cycled — the browser caches the
 * handful of real fetches) and relays the engine's focus/select events back out.
 *
 * Returns null when WebGL2 is unavailable, reduced-motion is set, or the viewport
 * is too small — the caller then keeps the accessible dither grid.
 */
import voroforce, { mergeConfigs } from "√";
import baseConfig from "./vendor/vf-config/config/config.ts";
// The reference site (nothing-to-watch) uses the DEPTH preset: a raymarched 3D
// post-processing pass (post-depth.frag) that turns the flat voronoi cells into
// premium dark-glass tiles with real relief, reflections and inter-cell shadow.
// That post pass is what makes it look good — minimal is flat by comparison.
import depth from "./vendor/vf-config/presets/depth/depth.ts";

export function createVoroField({ images = [], container, onHover, onPick, onDeselect, reduced = false } = {}) {
  const ok =
    !reduced &&
    window.matchMedia("(min-width: 760px)").matches &&
    (() => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2");
        gl && gl.getExtension("WEBGL_lose_context")?.loseContext();
        return !!gl;
      } catch { return false; }
    })();
  if (!ok || !container) return null;
  // accept <img> elements or URL strings; the field needs full-res URLs
  const srcs = images
    .map((el) =>
      typeof el === "string"
        ? el
        : el?.dataset?.full || el?.currentSrc || el?.src || el?.getAttribute?.("src") || "",
    )
    .filter(Boolean);
  if (!srcs.length) return null;
  images = srcs;

  // Dense lattice like the reference. We only have `images.length` unique tiles,
  // so the virtual texture is tiny and FIXED (one array layer of N tiles); cells
  // sample it modulo, so we can push the cell count high for the packed look
  // without any VRAM cost.
  const cells = 1400;
  const capCols = Math.ceil(Math.sqrt(images.length));
  const capRows = Math.ceil(images.length / capCols);
  const capacity = capCols * capRows;
  const virtualLayers = 1;
  // Bound the expanded archive to a 4096px texture edge and ~50MB decoded.
  // Full-size exports load separately when an artwork is opened.
  const tile = Math.min(640, Math.floor(4096 / Math.max(capCols, capRows)), Math.floor(Math.sqrt(12_000_000 / images.length)));

  // One uncompressed-single version describing how our images tile into the
  // virtual array texture. The engine's LOD indexes media.versions by a cell's
  // targetMediaVersion (0..3), and the demo's poster renderer lives in the
  // virtual slot (V3) — so we provide 4 identical versions (valid indexing) and
  // pin every cell to V3 (see the sim patch). `preload: 'v0'` eagerly fills the
  // virtual texture with all our images up front.
  const makeVersion = () => ({
    cols: 1,
    rows: 1,
    virtualCols: capCols,
    virtualRows: capRows,
    tileWidth: tile,
    tileHeight: tile,
    width: capCols * tile,
    height: capRows * tile,
    layers: capacity,
    virtualLayers,
    layerIndexStart: 0,
    // layer → image URL, cycled across our set (browser caches the real files)
    layerSrcFormat: (i) => images[i % images.length],
    type: "uncompressed-single",
  });
  const media = {
    enabled: true,
    baseUrl: "",
    preload: "v0",
    compressionFormat: "dds",
    versions: [makeVersion(), makeVersion(), makeVersion(), makeVersion()],
  };

  let config = mergeConfigs(baseConfig, depth);
  config = mergeConfigs(config, {
    cells,
    media,
    multiThreading: { enabled: false, renderInParallel: false },
    // The depth pass is fill-rate bound. At DPR 2 it shades 5.18M pixels per
    // frame before post-processing; 1.25 keeps the image retina-clean while
    // cutting that work by 61% (measured ~35 → ~71 fps on an M3 Pro).
    display: { renderer: { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25) } },
    devTools: { enabled: false },
    handleVisibilityChange: { enabled: true, hiddenDelay: 4000 },
    // Pointer tracking. The engine's default `autoFocusCenter` pins the lens to a
    // center cell at startup and only releases it via a DetachGestureHandler that
    // ONLY exists when freezeOnShake/Jolt are enabled — so it would stay stuck on
    // center and never follow the cursor. We disable autoFocusCenter (never pin),
    // which lets the pointer track the mouse directly, and keep freeze off.
    controls: {
      // Match the reference's smooth, settled feel: the engine defaults
      // (ease 0.15 / maxSpeed 10) glide and then hold steady when the cursor
      // stops. Our earlier ease 0.35 / maxSpeed 60 snapped hard and never quite
      // settled, which read as jitter when the mouse was still.
      ease: 0.15,
      easePinned: 0.15,
      maxSpeed: 10,
      autoFocusCenter: { enabled: false },
      freezeOnShake: { enabled: false },
      freezeOnJolt: { enabled: false },
    },
  });

  // Resolve the display uniforms' initial values from their mode/theme structure
  // (the demo does this in its React store via getVoroforceConfigUniforms; we
  // inline it). Mode = preview (0), theme = dark.
  const MODE = 0;
  const resolveUniforms = (map) => {
    if (!map) return;
    for (const u of Object.values(map)) {
      if (!u || typeof u.value !== "undefined") continue;
      // We don't run the demo's transition ticker, so land on the final mode/theme
      // value directly (ignoring `initial`, which would otherwise stick).
      if (u.modes) u.value = u.modes[MODE]?.value ?? u.modes.default?.value ?? 0;
      else if (u.themes) u.value = u.themes.dark?.value ?? u.themes.default?.value ?? 0;
      else u.value = 0;
    }
  };
  const scene = config.display?.scene;
  resolveUniforms(scene?.main?.uniforms);
  resolveUniforms(scene?.post?.uniforms);

  // Lazily boot the engine on first activate (it starts its own ticker on
  // creation). Exposes the same shape as createArchiveField so the operator
  // wall can drive it interchangeably.
  let instance = null;
  let lastIdx = -1;
  // Cell positions are reordered into a center-outward lattice. Metadata must
  // follow the shader's media id, including the repeated slots in the last row.
  const idxOf = (cell) => cell && cell.id != null ? (cell.id % capacity) % images.length : -1;

  // ── MODE (native voroforce SELECT, like the reference) ──────────────────────
  // Reconstructs the demo's un-vendored mode orchestration (app/vf/integrations/
  // mode.ts). On a click of the focused cell we swap THREE things to SELECT:
  //  1. every display uniform (main + post) — zeroes ripple/noise/weight-offset
  //     and eases the bulge, flattening the selected cell into a clean rectangle;
  //  2. the simulation force step — origin.latticeScale spreads the lattice aside
  //     and manageWeights lets the selected cell claim the frame;
  //  3. the control config (slower, zoom locked).
  // Uniforms flagged `transition:true` ease toward their target on the ticker.
  // Deselect (Esc / click again) reverses all of it.
  const PREVIEW = 0;
  const SELECT = 1;
  let mode = PREVIEW;
  const transitioning = new Set();

  const previewControls = {
    autoFocusCenter: { enabled: false }, maxSpeed: 10, ease: 0.15, easePinned: 0.15,
    freezeOnShake: { enabled: false }, freezeOnJolt: { enabled: false },
    zoom: { enabled: true, min: 1, max: 1.5 },
  };
  const selectControls = {
    autoFocusCenter: { enabled: false }, maxSpeed: 4, ease: 0.1, easePinned: 0.25,
    freezeOnShake: { enabled: false }, freezeOnJolt: { enabled: false },
    zoom: { enabled: true, min: 1, max: 1.01 },
  };

  const applyUniformsByMode = (map, m, snap = false) => {
    if (!map) return;
    for (const u of Object.values(map)) {
      const um = u?.modes?.[m] ?? u?.modes?.default;
      if (!um || typeof um.value === "undefined") continue;
      if (!snap && typeof um.value === "number" && u.transition) {
        if (u.value !== um.value) { u.targetValue = um.value; transitioning.add(u); }
      } else { u.value = um.value; u.targetValue = undefined; transitioning.delete(u); }
    }
  };

  // eased convergence toward targetValue, called every engine tick
  const tickUniforms = () => {
    if (!transitioning.size) return;
    for (const u of transitioning) {
      if (typeof u.value !== "number" || typeof u.targetValue !== "number") { transitioning.delete(u); continue; }
      const f = Math.max((u.targetFactor ?? 0.025) * 6, 0.06);
      let next = u.value + (u.targetValue - u.value) * f;
      if (Math.abs(u.targetValue - next) < 0.001) { next = u.targetValue; u.targetValue = undefined; transitioning.delete(u); }
      u.value = next;
    }
  };

  const applyForceMode = (m) => {
    const gcfg = instance?.config;
    const sim = instance?.simulation;
    const fc = gcfg?.simulation?.forceStepModeConfigs?.[m];
    if (!sim || !fc) return;
    gcfg.simulation.steps.force = fc;
    sim.handleForceStepConfigUpdated();
  };

  const changeMode = (m) => {
    if (!instance || m === mode) return;
    mode = m;
    const c = instance.controls;
    const scene = instance.config?.display?.scene;
    const snap = m === PREVIEW; // snap back to browse instantly to avoid a stuck transition
    c?.updateConfig?.(m === SELECT ? selectControls : previewControls);
    applyUniformsByMode(scene?.main?.uniforms, m, snap);
    applyUniformsByMode(scene?.post?.uniforms, m, snap);
    applyForceMode(m);
    // Pin the pointer onto the selected cell so magnification builds around a
    // fixed centre and never drifts.
    if (m === SELECT) c?.pinPointer?.(c?.cells?.selected);
    else c?.unpinPointer?.();
  };

  const boot = () => {
    if (instance) return true;
    try {
      instance = voroforce(container, config);
      instance.controls?.listen?.("focused", ({ cell }) => {
        if (mode === SELECT) return;
        lastIdx = idxOf(cell);
        onHover && onHover(lastIdx);
      });
      // The engine emits `selected` on select/deselect; drive the mode off it.
      instance.controls?.listen?.("selected", ({ cell }) => {
        if (cell) {
          lastIdx = idxOf(cell);
          changeMode(SELECT);
          onPick && onPick(lastIdx);
        } else {
          changeMode(PREVIEW);
          onDeselect && onDeselect();
        }
      });
      // Use one selection handler. The engine's speed gate can prevent selection,
      // while leaving both handlers attached can select and deselect in one click.
      container.removeEventListener("click", instance.controls?.boundOnPointerClick);
      container.addEventListener("click", () => {
        const c = instance?.controls;
        if (!c) return;
        if (c.pointer?.dragging) { c.pointer.dragging = false; return; }
        if (c.hasSelection?.()) { c.deselect?.(); return; }
        const idx = c.cells?.focusedIndex;
        if (idx != null && idx >= 0) c.selectCell?.(idx);
      });
      instance.ticker?.addEventListener?.("tick", tickUniforms);
      return true;
    } catch (e) {
      console.warn("[voro] init failed", e);
      return false;
    }
  };

  return {
    activate() {
      container.classList.add("is-active");
      container.setAttribute("aria-hidden", "false");
      boot();
      instance?.resume();
    },
    deactivate() {
      container.classList.remove("is-active");
      container.setAttribute("aria-hidden", "true");
      if (mode === SELECT) instance?.controls?.deselect?.();
      instance?.pause();
    },
    refreshAtlas() {},
    get instance() { return instance; },
    get selected() { return mode === SELECT; },
    hasSelection() { return !!instance?.controls?.hasSelection?.(); },
    deselect() { instance?.controls?.deselect?.(); },
    destroy() {
      try { instance?.ticker?.removeEventListener?.("tick", tickUniforms); } catch { /* noop */ }
      try { instance?.dispose?.() ?? instance?.destroy?.(); } catch { /* noop */ }
    },
  };
}
