# NOKIADEMON

An operable **cipher-instrument** portfolio. Not a page you read — a machine you
operate. A chrome core sits at the center; ten projects orbit it as engraved
glyph-marks on three concentric rings. You don't click a project, you **decode**
it: rotate a ring until its glyph aligns under the reticle, it locks, and the
mechanism warps you into that project's running process.

Built to the *NOKIADEMON — Design & Build Brief v1*.

## Artwork gallery

The operator gallery contains 118 entries: the 16 curated files plus 102 imports
from the local artwork folder, including seven films. Five duplicate photographs
are represented by their existing copies. Original files and editable masters
stay in the source folder; the site serves exported WebP images and MP4 clips.

The interactive field uses small previews. The gallery presents only artwork,
with icon controls and no headings, captions or metadata panels. Clicking a
piece in the desktop field zooms and stabilizes it in place; another click or
Escape releases it. The mobile and keyboard grid opens the full viewer, which
preserves image proportions, supports native video controls, and stops playback
on close. Mobile, keyboard and reduced-motion visitors can
browse the scrollable image grid. The archive loads only when its route opens.

To rebuild the imports (Sharp, FFmpeg, macOS sips, ImageMagick and Python
PyMuPDF are used for the supported source formats):

```sh
node tools/build-gallery-assets.mjs "/Users/lucaorion/Desktop/artworks"
```

Titles and descriptions live in `tools/gallery-catalog.json`; the generated
manifest is `src/gallery-entries.json` and the exports live in `public/artworks`.
The GPU field uses one bounded virtual atlas and resolves titles from the same
media IDs as its shader. Import and browser check reports live in `.previews`.

## Stack

Vanilla JS · **Three.js** (WebGL) · **GSAP** · custom **GLSL** · Vite.
No framework. Initial JS stays below the 300 KB compressed budget; project effects
and the operator archive load on demand.

## Production

The portfolio is live at **https://www.3301studios.com/** on Vercel project
`portfolio-nokia-demon`. `3301studios.com` redirects to the www address.

| Project | Production URL | Vercel project |
|---------|----------------|----------------|
| Orion Studio | https://orionterminal.app/ | `orion-site` |
| Joust | https://joust.3301studios.com/ | `joust` |
| Black Widow | https://blackwidow.3301studios.com/ | `blackwidow` |
| Forge Studio | https://web3forge.3301studios.com/ | `web-3-forge` |
| Finders x Keepers | https://www.findersxkeepers.com/ | `finders-x-keepers-szad` |
| life.exe | https://life.3301studios.com/ | `life-exe` |
| Bonkler Battle | https://bonkler.3301studios.com/ | `bonkler-game` |
| Dead Internet Archive | https://dia.3301studios.com/ | `dead-internet-archive-demo` |
| EMP | https://emp.orionterminal.app/ | `emp-site` |
| Archives 47 | https://archives.orionterminal.app/ | `archives-site` |

Deploy this working directory with `vercel --prod --yes --scope chakras-projects-f36100ee`.
`.vercelignore` excludes local previews, references, tools, environment files, and
temporary deployment sources. Vercel builds the Vite app into `dist`.

Joust and Black Widow publish their existing CLI landing pages from
`chakra3301/AI-JOUSTING` (`docs/index.html`) and `chakra3301/Black-Widow`
(`index.html`). Their static deployment directories are `deployments/joust`
and `deployments/blackwidow`; each includes its canonical URL, sitemap,
robots file, and a Vercel config with installation/build disabled. The CLI tools
continue to install from npm. Bonkler uses the portfolio subdomain because
`game.bonkler.online` did not resolve at launch.

Redeploy either landing with `vercel --prod --yes --scope chakras-projects-f36100ee
--cwd deployments/joust` (or `deployments/blackwidow`). If the directory is not
linked yet, run `vercel link --yes --project joust --scope chakras-projects-f36100ee
--cwd deployments/joust` first, using `blackwidow` for its corresponding directory.

The corrected DIA clothing storefront is saved in `deployments/dia`, copied from
`/Users/lucaorion/chop-shop/static-site`. Redeploy that existing Vercel project with
`vercel deploy --prod --yes --scope chakras-projects-f36100ee --cwd deployments/dia`.
The October 1 corrected release is live, with nine original garments, working
product details, and readable catalog labels. Desktop and mobile accessibility
checks pass. See `deployments/dia/README.md` for its release details.

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

- **Mouse:** move over a ring to arm it, then drag to rotate it. Align a glyph
  under the reticle to auto-lock and warp, or select a project from the index.
  Scroll down through Hero → Hub → Operator; scroll up to return. Inside a
  project, scroll advances or reverses one panel per gesture. A brief pause or
  direction change starts a new gesture; trackpad momentum stays in one section.
- **Keyboard:** `Enter/Space` boot · `Tab` to the project rail · `Enter` selects ·
  `←/→` rotate armed ring · `↑/↓` navigate daemon panels · `Esc` backs out.
- **Touch:** tap a ring group in the bottom dock to arm it, then drag the
  astrolabe to rotate; tap a project to open it. Swipe vertically to navigate
  sections and project panels; each new swipe responds immediately.

Scroll input regressions: `npm run test:scroll`.

## Architecture

| File | Role |
|------|------|
| `index.html` | DOM shell for every scene (progressive-enhancement friendly). |
| `src/scene.js` | The WebGL instrument: glyph field, chrome core, rings + marks, warp, and the **ordered-dither post pass** (real render-to-texture, per-state pitch/intensity — brief §3.3/§6). |
| `src/glyphs.js` | Glyph atlas builder + hero fabrication effect. |
| `src/data.js` | Real per-project content model + stable PID readouts. |
| `src/main.js` | State machine, per-state input routing, accessibility. |
| `src/static-instrument.js` | Original scene stills for reduced motion and unavailable WebGL; same portfolio interface and controls. |
| `src/forge-fx.js` | Original Epic PFP traits assemble into changing NFT collections; circular dot dither runs in the existing post pass. |
| `src/dia-fx.js` | A faceless hooded hologram wears DIA's multicolor grin design, with subtle breathing, alpha dot dither, and brief horizontal signal tears against the full ambient field. |
| `src/character-fx.js` | EMP's original Jester + oversized wordmark, drawn with colored luminance glyphs. |
| `src/archives-title.js` | Archives' original hero wordmark with its liquid-chrome shader, bevels, green horizon and floor reflection. |
| `src/styles.css` | Near-monochrome design system (mirrors `design-tokens.json`). |

Forge artwork uses a 74-trait WebP sprite sheet loaded when its project opens.
Rebuild it from the original layer folder with
`node tools/build-forge-assets.mjs "/path/to/epic pfp gen"`.

Orion Studio uses the current app's Rosie model, copied without altering its
mesh, materials, or animations. Run `node tools/build-rosie.mjs` to refresh it
from `Orion_Terminal/public/characters/rosie.glb`, or pass another source path.
The Meshopt decoder loads with the character; Bashful greets the operator before
the Happy idle loop. Its render buffer stays below 2M pixels, and matching still
frames preserve the current Rosie in reduced-motion mode.

EMP and Archives 47 join Ring C (Sites). EMP's original Jester and SVG wordmark
come from `/Users/lucaorion/Studio/emp-site/public/`. The oversized red EMP title
sits behind the Jester; both are drawn as colored luminance glyphs. The Jester
greets on entry and plays an animation when clicked. Archives uses only the
hero title from `/Users/lucaorion/Studio/archives-site/`: the original
`public/assets/archives-wordmark.svg` and the chrome ramp / bevel shader from
`src/hero.js`. The stretched lettering retains its silver finish, thin green
horizon and subtle wet-floor reflection against the portfolio's ambient field.
Both renderers load per route, cap their buffers at 2M pixels, and clean up on exit.
Reduced motion and unavailable WebGL use the matching desktop/portrait stills.
Their framing, colors and effect settings live in `design-tokens.json`.

DIA loads `public/fx/dia-hooded-figure.webp` during the project warp. Its original
generated PNG and prompt are kept in `reference/`. The transparent character
uses one draw call, with a full figure on desktop and a soft portrait crop in
shorter layouts so the grin print stays legible. Partial alpha dots, a soft scan
band, and occasional narrow glitches affect only the figure. The ambient field
keeps the same dither as other project scenes. Motion and hologram settings
live in `design-tokens.json`; render resolution is capped at
1.25 DPR (1 on phones). Listeners, geometry, textures, and the renderer are
disposed on exit. Reduced motion uses a captured still of the original project scene.

## Accessibility & performance

- Phones show **“Only available on desktop.”** before the portfolio initializes.
  `src/boot.js` identifies phone UAs and phone-sized touch screens in either
  orientation, including Safari's desktop-site mode. Three.js, GSAP, the boot
  video, third-party background, and gallery assets are not fetched on phones.
  Desktop access is independent of the browser window's width. Detection checks:
  `node --test tools/test-device-support.mjs`.
- On desktop, `prefers-reduced-motion` and unavailable WebGL retain the same hero, project
  index, detail cards, and gallery navigation. Decorative scenes use locally
  hosted desktop/portrait WebP frames of the original renderer (`public/stills`).
  No automatic motion, boot video, GPU effects, or third-party background is
  loaded in this mode. Artwork still opens through the accessible gallery grid.
- Ring rail is a real `<nav>` of `<button>`s — the keyboard/screen-reader/touch
  equivalent of the ring mechanic. `aria-live` announces state changes.
- The animated instrument is capped at 60fps (30fps on touch), including on
  144/240Hz monitors. Full-screen buffers stay below 4M pixels for the instrument
  and 2.5M for the ambient background; DOM text remains native resolution.
- Ambient textures upload only after a new source frame and reallocate on size
  changes. The ambient/instrument pause in the gallery, and the gallery's ticker
  pauses on exit. This avoids hidden work and repeated cross-context transfers.
- Core light uses an opaque RGB-to-black additive texture rather than a canvas
  alpha gradient. It stays close to the core instead of washing out the dial.
  The hero and project rail have transparent backings, keeping the field visible.
- Particle counts reduce on touch + reduced-motion. Fonts are loaded locally.

## Visual feedback loop

```bash
npm install && npx playwright install chromium
npm run dev
node tools/capture.mjs        # drives loader→hero→hub→daemon→terminal, saves .previews/
node tools/capture-alt.mjs    # mobile + reduced-motion captures
node --test tools/test-render-budget.mjs # high-refresh limits and 4K buffers
```

## Open items (operator's, per brief §7 — real assets to add later)

- [ ] `notes.txt` — replace the placeholder in `src/data.js` (`NOTES`) with your own words.
- [x] Production URLs recorded for all ten projects (`src/data.js`).
- [ ] Contact: real **x** / **linkedin** handles + email (`CONTACT` in `src/data.js`; currently placeholders `#`, `hello@nokiademon.dev`).
- [x] Loader footage wired: source `copy_C1B84886-...MOV` → transcoded grayscale to `public/loader.mp4` (960×720, ~650 KB). Rendered in the post pass as a **glyph (ASCII) dither** — each cell picks a monospace char from a dark→light ramp `" .:-=+*?#@"` by luminance (`scene.js` `asciiCell()` + a canvas glyph atlas; `uAscii` on during the loader). Cell size = `~8 * DPR` px. Last frame frozen to a CanvasTexture, screen-blended at ~0.12 as a persistent ghost. Tune: ramp/cell in `scene.js`, footage = swap `public/loader.mp4`.
- Alternative considered: embedding the user's Unicorn Studio scene `69TbZHkL4pZyS9IghCf2` via CDN SDK. Rejected for the default build (external dep, second WebGL context, outside the JS budget / no-deps rule); the effect is reproduced natively instead. Can be added on request.
  (currently generated).
- [ ] Optional: per-project logos/wordmarks for the daemon Identity panel
  (currently distinctive type + JP glyph-mark only).
- [ ] Sound design — currently silent by design.
