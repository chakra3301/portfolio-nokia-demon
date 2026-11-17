import assets from "./forge-assets.json";

const LIME = "#9BCB4B";
const PAPER = "#D9DED4";
const CYCLE = 10;
const ASSEMBLY = 5.6;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = (value) => 1 - (1 - clamp(value)) ** 3;

/** Deterministic combinations, using the original full-canvas trait alignment. */
export function forgeRecipe(edition) {
  let seed = (edition + 1) * 2654435761 >>> 0;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const pick = (group) => assets.groups[group][Math.floor(random() * assets.groups[group].length)];
  const layers = [{ sprite: pick("background"), label: "BACKGROUND" }];
  const special = edition % 4 === 2;
  layers.push({ sprite: pick(special ? "face" : "base"), label: "FACE" });
  if (!special) {
    layers.push({ sprite: pick("hat"), label: "HEADWEAR" });
    if (random() > 0.35) layers.push({ sprite: pick("accessory"), label: "ACCESSORY" });
  }
  if (random() > 0.3) layers.push({ sprite: pick("frame"), label: "FRAME" });
  for (const group of ["topLeft", "topRight", "left", "right"]) {
    layers.push({ sprite: pick(group), label: "STICKERS" });
  }
  if (random() > 0.8) layers.push({ sprite: pick("overlay"), label: "OVERLAY" });
  return layers;
}

/** Forge Studio — several real NFTs build from trait planes into a collection. */
export function createForgeFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  const sheet = new Image();
  sheet.decoding = "async";
  let active = false;
  let destroyed = false;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let time = 0;
  let slots = [];

  function layout() {
    const compact = width < 720 && height >= 620;
    const card = document.querySelector("[data-daemon-card]")?.getBoundingClientRect();
    slots = [];
    if (compact) {
      const columns = 3;
      const gap = 10;
      const size = Math.min(148, (width - 28 - gap * (columns - 1)) / columns,
        Math.max(58, (card?.top || height * 0.3) - 76),
        Math.max(58, height - (card?.bottom || height * 0.68) - 62));
      const x = (width - size * columns - gap * (columns - 1)) / 2;
      const top = Math.max(58, (card?.top || height * 0.3) - size - 32);
      const bottom = Math.min(height - size - 48, (card?.bottom || height * 0.68) + 30);
      for (const y of [top, bottom]) {
        for (let column = 0; column < columns; column += 1) {
          slots.push({ x: x + column * (size + gap), y, size, edition: -1 });
        }
      }
    } else {
      const x = Math.max(width * 0.46, (card?.right || width * 0.5) + 26);
      const right = width - Math.max(24, width * 0.025);
      const availableWidth = Math.max(48, right - x);
      const columns = availableWidth > 430 ? 3 : availableWidth > 240 ? 2 : 1;
      const rows = height < 600 && columns > 1 ? 2 : 3;
      const gap = clamp(width * 0.017, 16, 30);
      const size = Math.min((availableWidth - gap * (columns - 1)) / columns, (height * 0.76 - gap * (rows - 1)) / rows, 240);
      const y = (height - (size + gap) * rows + gap) / 2;
      const startX = x + (availableWidth - (size + gap) * columns + gap) / 2;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          slots.push({ x: startX + column * (size + gap), y: y + row * (size + gap), size, edition: -1 });
        }
      }
    }
  }

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    dpr = Math.min(devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    layout();
    if (active) draw();
  }

  function line(x1, y1, x2, y2, alpha = 0.25) {
    context.save();
    context.strokeStyle = LIME;
    context.globalAlpha = alpha;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.restore();
  }

  function label(text, x, y, color = PAPER) {
    context.fillStyle = color;
    context.font = `500 ${width < 720 ? 8 : 10}px "IBM Plex Mono", monospace`;
    context.fillText(text, x, y);
  }

  function drawSprite(spriteIndex, x, y, size) {
    const sprite = assets.sprites[spriteIndex];
    context.drawImage(sheet, sprite.x, sprite.y, assets.tile, assets.tile, x, y, size, size);
  }

  function drawNFT(slot, index) {
    const localTime = reduced ? ASSEMBLY + 1 : time + index * 0.83;
    const generation = Math.floor(localTime / CYCLE);
    const phase = localTime % CYCLE;
    const edition = generation * slots.length + index;
    if (slot.edition !== edition) {
      slot.edition = edition;
      slot.layers = forgeRecipe(edition);
      // Cache completed layer prefixes once per NFT, never read pixels per frame.
      slot.composites = [];
      for (const [layerIndex, layer] of slot.layers.entries()) {
        const composite = document.createElement("canvas");
        composite.width = assets.tile;
        composite.height = assets.tile;
        const ctx = composite.getContext("2d");
        if (layerIndex) ctx.drawImage(slot.composites[layerIndex - 1], 0, 0);
        const sprite = assets.sprites[layer.sprite];
        ctx.drawImage(sheet, sprite.x, sprite.y, assets.tile, assets.tile, 0, 0, assets.tile, assets.tile);
        slot.composites.push(composite);
      }
    }

    const build = clamp(phase / ASSEMBLY) * slot.layers.length;
    const completed = Math.min(slot.layers.length, Math.floor(build));
    const progress = build - completed;
    const isComplete = completed === slot.layers.length;
    const fade = reduced ? 1 : 1 - clamp((phase - 9.25) / 0.75);
    const { x, y, size } = slot;
    context.save();
    context.globalAlpha = fade;

    // Registration marks reveal each tile's destination before it is built.
    for (const [cornerX, cornerY, dx, dy] of [[x, y, 1, 1], [x + size, y, -1, 1], [x, y + size, 1, -1], [x + size, y + size, -1, -1]]) {
      line(cornerX - dx * 4, cornerY - dy * 4, cornerX + dx * 9, cornerY - dy * 4, 0.3 * fade);
      line(cornerX - dx * 4, cornerY - dy * 4, cornerX - dx * 4, cornerY + dy * 9, 0.3 * fade);
    }
    if (completed) context.drawImage(slot.composites[completed - 1], x, y, size, size);

    if (!isComplete) {
      const layer = slot.layers[completed];
      const settle = ease(progress / 0.84);
      const offset = (1 - settle) * size * 0.25;
      const angle = (1 - settle) * (completed % 2 ? -0.06 : 0.06);
      const layerSize = size * (1 + (1 - settle) * 0.075);
      context.save();
      context.globalAlpha = fade * clamp(progress * 5);
      context.translate(x + size / 2 + offset * (completed % 2 ? -1 : 1), y + size / 2 - offset);
      context.rotate(angle);
      drawSprite(layer.sprite, -layerSize / 2, -layerSize / 2, layerSize);
      context.strokeStyle = "rgba(155,203,75,0.38)";
      context.strokeRect(-layerSize / 2, -layerSize / 2, layerSize, layerSize);
      context.restore();

      const scanY = y + size * progress;
      line(x, scanY, x + size, scanY, 0.5 * fade * (1 - settle));
    }

    const progressY = y + size + 9;
    context.fillStyle = "rgba(155,203,75,0.15)";
    context.fillRect(x, progressY, size, 1);
    context.fillStyle = LIME;
    context.fillRect(x, progressY, size * clamp(build / slot.layers.length), 1);
    label(`#${String(edition + 1).padStart(4, "0")}`, x, progressY + 13, LIME);
    context.textAlign = "right";
    label(isComplete ? "BUILT" : slot.layers[completed].label, x + size, progressY + 13);
    context.textAlign = "left";
    context.restore();
  }

  function draw() {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!sheet.complete || !sheet.naturalWidth) return;
    for (let index = 0; index < slots.length; index += 1) drawNFT(slots[index], index);
  }

  sheet.addEventListener("load", () => { if (active && !destroyed) draw(); }, { once: true });
  sheet.src = "/fx/forge-traits.webp";

  return {
    canvas,
    dotPitch: 3.2,
    get active() { return active; },
    start() {
      if (destroyed) return;
      active = true;
      time = 0;
      resize();
      addEventListener("resize", resize, { passive: true });
    },
    stop() {
      active = false;
      removeEventListener("resize", resize);
      for (const slot of slots) slot.composites = [];
      slots = [];
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || reduced || document.hidden || !sheet.complete || !sheet.naturalWidth) return;
      time += dt;
      draw();
    },
    resize,
    destroy() {
      this.stop();
      destroyed = true;
      sheet.removeAttribute("src");
      canvas.width = canvas.height = 1;
    },
  };
}
