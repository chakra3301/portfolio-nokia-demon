/**
 * OPERATOR WALL — an interactive archive field, in the site's own grammar.
 *
 * Concept borrowed from gnovotny/nothing-to-watch: a packed grid where the tile
 * under the cursor swells and its neighbours compress — a fluid magnifying lens.
 * Rendered here through NOKIADEMON's signature: every tile sits DITHERED (the
 * same 4x4 ordered Bayer + cell pitch as the WebGL post pass in scene.js), and
 * the magnified / focused tile DECODES to the real colour image as the lens
 * passes over it. "Align a glyph, decode the work."
 *
 * No second WebGL context (the Three.js instrument already owns one). The lens
 * is a separable gaussian applied to CSS grid tracks — cheap, smooth, and it
 * degrades to a static dithered grid under prefers-reduced-motion.
 */

import { createArchiveField } from "./archive-field.js";
import { createVoroField } from "./voro-real.js";
import { mountGallery } from "./gallery.js";

const INK = [236, 238, 240]; // --fg
const BG = [6, 7, 10]; // --bg
const LEVELS = 3; // tonal steps in the dither ramp
const CELL_PX = 2; // dither cell pitch (source px) — upscaled crisp via pixelated

// 4x4 ordered Bayer matrix, normalised 0..1 (matches scene.js bayer()).
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function ditherToCanvas(img, aspect) {
  // low-res render → CSS upscales pixelated, so each source pixel reads as a
  // crisp dither cell (same look as the loader's glyph field)
  const w = Math.max(64, Math.round(260 / CELL_PX));
  const h = Math.max(64, Math.round((260 * aspect) / CELL_PX));
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  // cover-fit the image into the low-res buffer
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > cr) { sw = img.naturalHeight * cr; sx = (img.naturalWidth - sw) / 2; }
  else { sh = img.naturalWidth / cr; sy = (img.naturalHeight - sh) / 2; }
  sctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const id = sctx.getImageData(0, 0, w, h);
  const d = id.data;
  const n = LEVELS - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const t = BAYER[y & 3][x & 3] - 0.5;
      let q = Math.round(lum * n + t) / n;
      q = q < 0 ? 0 : q > 1 ? 1 : q;
      d[i] = BG[0] + (INK[0] - BG[0]) * q;
      d[i + 1] = BG[1] + (INK[1] - BG[1]) * q;
      d[i + 2] = BG[2] + (INK[2] - BG[2]) * q;
      d[i + 3] = 255;
    }
  }
  sctx.putImageData(id, 0, 0);
  return src;
}

function bestColumns(count, aspect) {
  // choose a column count that minimises trailing blank cells, then favours a
  // grid whose aspect is closest to the container's
  let best = 3, bestScore = Infinity;
  for (let cols = 2; cols <= 8 && cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const blanks = cols * rows - count;
    const gridAspect = cols / rows;
    const score = blanks * 10 + Math.abs(gridAspect - aspect);
    if (score < bestScore) { bestScore = score; best = cols; }
  }
  return best;
}

export function initOperatorWall({ reduced = false } = {}) {
  const wall = document.querySelector("[data-op-wall]");
  if (!wall) return;
  mountGallery(wall);
  const cells = Array.from(wall.querySelectorAll(".op-cell"));
  if (!cells.length) return;
  // Buttons retain their native semantics; the labelled container supplies the
  // collection context without overriding button roles with invalid listitems.
  cells.forEach((cell) => {
    cell.removeAttribute("role");
    cell.setAttribute("aria-label", `Open ${cell.dataset.title}`);
  });

  // ── dither every tile once its image is ready ──────────────────────────────
  cells.forEach((cell) => {
    const img = cell.querySelector("img");
    const paint = () => {
      if (!img.naturalWidth) return;
      const aspect = img.naturalHeight / img.naturalWidth;
      let canvas = cell.querySelector(".op-cell-dither");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "op-cell-dither";
        canvas.setAttribute("aria-hidden", "true");
        cell.insertBefore(canvas, cell.firstChild);
      }
      const dithered = ditherToCanvas(img, aspect);
      canvas.width = dithered.width;
      canvas.height = dithered.height;
      canvas.getContext("2d").drawImage(dithered, 0, 0);
    };
    if (img.complete && img.naturalWidth) paint();
    else img.addEventListener("load", paint, { once: true });
  });

  // ── grid columns (recomputed on resize) ────────────────────────────────────
  let cols = 3;
  const layout = () => {
    const r = wall.getBoundingClientRect();
    cols = cells.length > 24
      ? Math.max(2, Math.min(6, Math.floor((r.width || 1) / 190)))
      : bestColumns(cells.length, (r.width || 1) / (r.height || 1));
    wall.style.setProperty("--op-cols", cols);
  };
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(wall);

  // ── proximity lens (separable gaussian over grid tracks) ───────────────────
  const SIGMA = 0.19, PEAK = 2.6, BASE = 0.55;
  let raf = 0, active = false;
  let tx = 0.5, ty = 0.5; // target cursor (0..1)
  let cxN = 0.5, cyN = 0.5; // current, lerped
  let idle = true; // no focus → relax to uniform

  const tracks = (center, count) => {
    // gaussian-weighted fr values; averages to 1 so the grid keeps its box
    const out = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const c = (i + 0.5) / count;
      const dv = c - center;
      const w = BASE + PEAK * Math.exp(-(dv * dv) / (2 * SIGMA * SIGMA));
      out.push(w);
      sum += w;
    }
    const k = count / sum;
    return out.map((w) => (w * k).toFixed(4) + "fr").join(" ");
  };

  const rows = () => Math.ceil(cells.length / cols);

  const frame = () => {
    const relax = idle ? 0.12 : 0.22;
    cxN += (tx - cxN) * relax;
    cyN += (ty - cyN) * relax;
    // when idle, ease targets back to centre so the field relaxes to uniform
    if (idle) { tx += (0.5 - tx) * 0.12; ty += (0.5 - ty) * 0.12; }
    wall.style.gridTemplateColumns = tracks(cxN, cols);
    wall.style.gridTemplateRows = tracks(cyN, rows());
    const settled = idle && Math.abs(cxN - 0.5) < 0.002 && Math.abs(cyN - 0.5) < 0.002;
    if (settled) {
      wall.style.gridTemplateColumns = "";
      wall.style.gridTemplateRows = "";
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };

  if (!reduced) {
    wall.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return; // touch scrolls the dossier
      const r = wall.getBoundingClientRect();
      tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      idle = false;
      active = true;
      kick();
    });
    wall.addEventListener("pointerleave", () => { idle = true; active = false; kick(); });
    // keyboard: focusing a tile drives the lens to its centre
    cells.forEach((cell, i) => {
      cell.addEventListener("focus", () => {
        const c = i % cols, rIdx = Math.floor(i / cols);
        tx = (c + 0.5) / cols;
        ty = (rIdx + 0.5) / rows();
        idle = false;
        kick();
      });
      cell.addEventListener("blur", () => { idle = true; kick(); });
    });
  }

  // ── artwork-only viewer ───────────────────────────────────────────────────
  const lb = document.querySelector("[data-op-lightbox]");
  const lbTitle = lb?.querySelector("[data-op-lightbox-title]");
  const previewImage = lb?.querySelector("[data-op-preview-image]");
  const previewVideo = lb?.querySelector("[data-op-preview-video]");
  let lastFocus = null;
  const modalSiblings = () => section
    ? Array.from(section.children).filter((child) => child !== lb)
    : [];

  const openLightbox = (cell, fromField = false) => {
    if (!lb) return;
    lastFocus = fromField ? section.querySelector(".op-back") : cell;
    previewImage.hidden = !!cell.dataset.video;
    previewVideo.hidden = !cell.dataset.video;
    if (cell.dataset.video) {
      previewVideo.poster = cell.dataset.full;
      previewVideo.src = cell.dataset.video;
      previewVideo.setAttribute("aria-label", cell.dataset.title);
      previewVideo.load();
    } else {
      previewImage.src = cell.dataset.full;
      previewImage.alt = cell.querySelector("img")?.alt || "";
    }
    if (lbTitle) lbTitle.textContent = cell.dataset.title || "";
    modalSiblings().forEach((element) => { element.inert = true; });
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add("is-open"));
    const closeBtn = lb.querySelector("button[data-op-lightbox-close]");
    closeBtn && closeBtn.focus();
  };
  const closeLightbox = () => {
    if (!lb || lb.hidden) return;
    previewVideo.pause();
    previewVideo.removeAttribute("src");
    previewVideo.load();
    if (field?.selected) field.deselect();
    lb.classList.remove("is-open");
    const done = () => { lb.hidden = true; lb.removeEventListener("transitionend", done); };
    lb.addEventListener("transitionend", done);
    setTimeout(() => { if (!lb.hidden) done(); }, 400);
    modalSiblings().forEach((element) => { element.inert = false; });
    if (lastFocus) lastFocus.focus();  // pointer/field opens don't yank focus back to the hidden grid
  };

  cells.forEach((cell) => cell.addEventListener("click", () => openLightbox(cell)));
  if (lb) {
    lb.querySelectorAll("[data-op-lightbox-close]").forEach((el) =>
      el.addEventListener("click", closeLightbox)
    );
    // Esc closes the preview first (capture so it beats the operator→hub Esc)
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && !lb.hidden) {
          e.stopPropagation();
          closeLightbox();
          return;
        }
        if (e.key === "Tab" && !lb.hidden) {
          const focusable = Array.from(lb.querySelectorAll("button, video[controls], [href], [tabindex]:not([tabindex='-1'])"))
            .filter((element) => !element.disabled && element.getClientRects().length);
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      },
      true
    );
  }

  // ── fullscreen voronoi force-field (the "full effect") ─────────────────────
  const section = document.getElementById("operator");
  const fieldCanvas = document.querySelector("[data-op-field]");
  const vfContainer = document.querySelector("[data-op-vf]");
  const onPick = (i) => { if (i >= 0 && cells[i]) openLightbox(cells[i], true); };
  // Esc deselects the field first (capture beats the operator→hub handler)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && field && field.selected) { e.stopPropagation(); field.deselect(); }
  }, true);

  // Primary: the real vendored voroforce engine. Falls back to our own
  // voronoi shader, then (in setField) to the accessible dither grid.
  let usingVoro = true;
  let field = createVoroField({
    images: cells.map((c) => c.querySelector("img")?.src),
    container: vfContainer,
    reduced,
    // Keep the engine's native zoom-and-stabilize selection in the field.
    onPick: () => vfContainer.classList.add("is-selected"),
    onDeselect: () => vfContainer.classList.remove("is-selected"),
  });
  if (!field) {
    usingVoro = false;
    field = createArchiveField({
      images: cells.map((c) => c.querySelector("img")),
      reduced,
      onPick,
    });
  }
  const activeFieldEl = usingVoro ? vfContainer : fieldCanvas;

  // No field (no WebGL2 / reduced-motion / narrow): show the scrollable grid.
  if (!field) {
    section && section.classList.add("no-field");
    wall.classList.remove("is-superseded");
    return { isLightboxOpen: () => lb && !lb.hidden, enter() {}, leave() {} };
  }

  // repaint the atlas as lazy images finish loading
  cells.forEach((cell) => {
    const img = cell.querySelector("img");
    if (img.complete && img.naturalWidth) return;
    img.addEventListener("load", () => field.refreshAtlas(), { once: true });
  });

  let fieldOn = false;
  const setField = (on) => {
    if (on === fieldOn) return;
    fieldOn = on;
    window.__archiveActive = on && !document.hidden;
    activeFieldEl.classList.toggle("is-active", on);
    section.classList.toggle("field-live", on && usingVoro);
    // This wall is only an accessibility/WebGL fallback. Never reveal it during
    // a normal field pause or the operator → hub fade from the live experience.
    wall.classList.add("is-superseded");
    if (on && !document.hidden) field.activate();
    else {
      if (field.selected) field.deselect();
      field.deactivate();
      section.classList.remove("kbd-grid");
    }
  };
  // Tab changes pause GPU work without taking the logical operator route down.
  // Re-activate on return; using setField(false) here exposed the obsolete grid.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.__archiveActive = false;
      if (field.selected) field.deselect();
      field.deactivate();
      section.classList.remove("kbd-grid");
    } else if (fieldOn) {
      field.activate();
      window.__archiveActive = true;
    }
  });
  // keyboard users: focusing a grid tile reveals the accessible grid over the field
  wall.addEventListener("focusin", () => { if (fieldOn) section.classList.add("kbd-grid"); });
  wall.addEventListener("focusout", () => {
    if (!wall.contains(document.activeElement)) section.classList.remove("kbd-grid");
  });

  return {
    isLightboxOpen: () => lb && !lb.hidden,
    enter: () => setField(true),   // operator scene opened → straight into the field
    leave: () => setField(false),  // back to the instrument
  };
}
