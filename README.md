# NOKIADEMON

An operable **cipher-instrument** portfolio. Not a page you read — a machine you
operate. A chrome core sits at the center; six projects orbit it as engraved
glyph-marks on three concentric rings. You don't click a project, you **decode**
it: rotate a ring until its glyph aligns under the reticle, it locks, and the
mechanism warps you into that project's running process.

Built to the *NOKIADEMON — Design & Build Brief v1*.

## Stack

Vanilla JS · **Three.js** (WebGL) · **GSAP** · custom **GLSL** · Vite.
No framework. ~161 KB gzipped JS (budget < 300 KB).

## Scene flow

```
LOADER → HERO → ASTROLABE HUB ⇄ WARP ⇄ DAEMON-STACK (per project)
                     └─ (fall through, nothing selected) → ROOT TERMINAL
```

| Scene | What it is |
|-------|-----------|
| **Loader** | Cold-boot. B&W footage (`public/loader.mp4`) is rendered as a **character / glyph dither** (a grid of monospace glyphs quantised by luminance, the Unicorn Studio ASCII look). A small **boot feed** streams in bottom-left (`› establishing feed … ok`) as the footage decodes. When it ends it goes **straight into the hero** (final frame burns in as a barely-visible ghost). No gate; keyboard operators can Enter/Space/Esc to skip. |
| **Hero** | `NOKIADEMON` fabricates from scattered glyphs. The line under the name first **decodes the WISDOM invocation** (cipher scramble, dot-dither texture), solidifies ~0.7s, then **glitch-swaps** to the real tagline. Nav meta + socials below. Invocation text + decode/glitch live in `src/main.js` (`HERO_INVOCATION`, `scrambleReveal`, `glitchSwap`, `runTaglineInvocation`). |
| **Astrolabe hub** | 3 rings (Apps / Tools / Sites·Media). Hover to arm a ring, wheel to rotate, align a glyph under the reticle to lock. |
| **Warp** | The one loud beat — dolly into the core, chromatic dither spike, recolour. |
| **Daemon-stack** | Inside the process: Identity → Process → Readout → Action. Scroll to advance; past the end backs out. |
| **Root terminal** | Phosphor CRT. `ps aux` recap (secondary nav), `notes.txt`, `contact.txt`, live cursor. |

## Controls

- **Mouse:** move over a ring to arm it · **wheel** rotates the armed ring ·
  align a glyph under the reticle → auto-lock → warp. Wheel with **no ring armed**
  (centre / gaps) falls through to the root terminal. The quiet **`root ⌄`** control
  (bottom) does the same.
- **Keyboard:** `Enter/Space` boot · `Tab` to the project rail · `Enter` selects ·
  `←/→` rotate armed ring · `↑/↓` navigate daemon panels · `Esc` backs out.
- **Touch:** tap a ring group in the bottom dock to arm it, then drag the
  astrolabe to rotate; tap a project to open it.

## Architecture

| File | Role |
|------|------|
| `index.html` | DOM shell for every scene (progressive-enhancement friendly). |
| `src/scene.js` | The WebGL instrument: glyph field, chrome core, rings + marks, warp, and the **ordered-dither post pass** (real render-to-texture, per-state pitch/intensity — brief §3.3/§6). |
| `src/glyphs.js` | Glyph atlas builder + hero fabrication effect. |
| `src/data.js` | Real per-project content model + stable PID readouts. |
| `src/main.js` | State machine, per-state input routing, accessibility. |
| `src/styles.css` | Near-monochrome design system (mirrors `design-tokens.json`). |

## Accessibility & performance

- `prefers-reduced-motion` → an accessible, scrollable **document mode**: every
  project expands inline, WebGL off, no warp/idle motion.
- Ring rail is a real `<nav>` of `<button>`s — the keyboard/screen-reader/touch
  equivalent of the ring mechanic. `aria-live` announces state changes.
- Pixel ratio capped (2 desktop / 1.5 touch); particle counts reduced on
  touch + reduced-motion. Fonts subset via Google Fonts unicode-range.

## Visual feedback loop

```bash
npm install && npx playwright install chromium
npm run dev
node tools/capture.mjs        # drives loader→hero→hub→daemon→terminal, saves .previews/
node tools/capture-alt.mjs    # mobile + reduced-motion captures
```

## Open items (operator's, per brief §7 — real assets to add later)

- [ ] `notes.txt` — replace the placeholder in `src/data.js` (`NOTES`) with your own words.
- [ ] Final URLs / live status for **Orion Terminal** and **Selected Work** (`src/data.js`).
- [ ] Contact: real **x** / **linkedin** handles + email (`CONTACT` in `src/data.js`; currently placeholders `#`, `hello@nokiademon.dev`).
- [x] Loader footage wired: source `copy_C1B84886-...MOV` → transcoded grayscale to `public/loader.mp4` (960×720, ~650 KB). Rendered in the post pass as a **glyph (ASCII) dither** — each cell picks a monospace char from a dark→light ramp `" .:-=+*?#@"` by luminance (`scene.js` `asciiCell()` + a canvas glyph atlas; `uAscii` on during the loader). Cell size = `~8 * DPR` px. Last frame frozen to a CanvasTexture, screen-blended at ~0.12 as a persistent ghost. Tune: ramp/cell in `scene.js`, footage = swap `public/loader.mp4`.
- Alternative considered: embedding the user's Unicorn Studio scene `69TbZHkL4pZyS9IghCf2` via CDN SDK. Rejected for the default build (external dep, second WebGL context, outside the JS budget / no-deps rule); the effect is reproduced natively instead. Can be added on request.
  (currently generated).
- [ ] Optional: per-project logos/wordmarks for the daemon Identity panel
  (currently distinctive type + JP glyph-mark only).
- [ ] Sound design — currently silent by design.
