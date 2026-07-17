/**
 * Glyph system for NOKIADEMON.
 *  - GLYPHS: the machine's "material" — katakana + a few kanji + technical marks.
 *  - buildAtlas(): one canvas texture (grid of glyphs) sampled by the WebGL field.
 *  - fabricate(): hero handle assembles from scattered random glyphs into the word.
 */
import * as THREE from "three";

// Digital glyph field face (JP gothic), falls back to mono.
const GLYPH_FONT = '700 96px "Zen Kaku Gothic New", "IBM Plex Mono", monospace';

// 64 glyphs → 8×8 atlas. Katakana-forward, seasoned with kanji + instrument marks.
export const GLYPHS = [
  ..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ",
  ..."マミムメモヤユヨラリルレロワヲン",
  ..."機械器演算記号暗号錠環星核",
  ..."0123456789",
  ..."◈◇◐▚✦⟠",
];

const ATLAS_COLS = 8;
const ATLAS_ROWS = 8;
const CELL = 128; // px per cell

// Match hero name strokes (styles.css) scaled to the 96px field glyph size
const GLYPH_FONT_PX = 96;
const OUTLINE_BLACK = GLYPH_FONT_PX * 0.015; // ≈0.25pt hairline
const OUTLINE_PURPLE = GLYPH_FONT_PX * (0.015 + 0.009); // thin purple ring (0.15pt outside black)
const OUTLINE_PURPLE_COLOR = "#c77bff"; // brighter than hero default #b46cff
const OUTLINE_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-0.707, -0.707], [0.707, -0.707], [-0.707, 0.707], [0.707, 0.707],
];

/** Black hairline + purple outer ring + white fill (baked for FIELD_FRAG + Bayer dither). */
function drawOutlinedGlyph(ctx, char, cx, cy) {
  ctx.font = GLYPH_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = OUTLINE_PURPLE_COLOR;
  for (const [dx, dy] of OUTLINE_DIRS) {
    ctx.fillText(char, cx + dx * OUTLINE_PURPLE, cy + dy * OUTLINE_PURPLE);
  }

  ctx.fillStyle = "#000";
  for (const [dx, dy] of OUTLINE_DIRS) {
    ctx.fillText(char, cx + dx * OUTLINE_BLACK, cy + dy * OUTLINE_BLACK);
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillText(char, cx, cy);
}

/** Draw all glyphs into one power-of-two canvas → CanvasTexture for instancing. */
export function buildAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < GLYPHS.length; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    drawOutlinedGlyph(ctx, GLYPHS[i], cx, cy);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return { texture: tex, cols: ATLAS_COLS, rows: ATLAS_ROWS, count: GLYPHS.length };
}

/** One crisp glyph → its own texture (used for engraved ring-marks). */
export function glyphTexture(char, { size = 256, color = "#ECEEF0", weight = 500 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.font = `${weight} ${Math.round(size * 0.62)}px "Zen Kaku Gothic New", "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(char, size / 2, size / 2 + size * 0.02);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Hero fabrication: each character starts on a random glyph and races to its
 * final letter, locking one by one. DOM-based (crisp text), gated by caller.
 * Returns a control with .play() and .settle() (instant).
 */
export function fabricate(el, { reduced = false } = {}) {
  const final = el.textContent.trim();
  const chars = final.split("");
  el.textContent = "";
  el.setAttribute("aria-label", final);

  const spans = chars.map((ch) => {
    const s = document.createElement("span");
    s.className = "fab-char";
    s.setAttribute("aria-hidden", "true");
    s.textContent = ch === " " ? "\u00a0" : ch;
    el.appendChild(s);
    return { el: s, final: ch };
  });

  const pool = GLYPHS.filter((g) => /[\u30A0-\u30FF\u4E00-\u9FFF]/.test(g));
  const rnd = () => pool[(Math.random() * pool.length) | 0];

  if (reduced) {
    spans.forEach((s) => s.el.classList.add("locked"));
    return { play() {}, settle() {} };
  }

  let raf = 0;
  const start = performance.now();
  const perChar = 90; // ms between each character locking
  const scramble = 520; // ms of scrambling before a char locks

  function frame(now) {
    const t = now - start;
    let done = 0;
    spans.forEach((s, i) => {
      const lockAt = i * perChar + scramble;
      if (t >= lockAt) {
        if (!s.el.classList.contains("locked")) {
          s.el.textContent = s.final === " " ? "\u00a0" : s.final;
          s.el.classList.add("locked");
        }
        done++;
      } else if (t >= i * perChar) {
        // scrambling window for this char
        if ((now | 0) % 2 === 0) s.el.textContent = s.final === " " ? "\u00a0" : rnd();
      }
    });
    if (done < spans.length) raf = requestAnimationFrame(frame);
  }

  return {
    play() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    settle() {
      cancelAnimationFrame(raf);
      spans.forEach((s) => {
        s.el.textContent = s.final === " " ? "\u00a0" : s.final;
        s.el.classList.add("locked");
      });
    },
  };
}

/** Fabricate each `[data-fabricate]` child inside the hero handle (NOKIA + DEMON). */
export function fabricateHero(container, { reduced = false } = {}) {
  const parts = [...container.querySelectorAll("[data-fabricate]")];
  const fabs = parts.map((el) => fabricate(el, { reduced }));
  return {
    play() { fabs.forEach((f) => f.play()); },
    settle() { fabs.forEach((f) => f.settle()); },
  };
}
