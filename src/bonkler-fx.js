const TEAL = "#00b8a9";
const TEAL_HI = "#62fff0";
const BLUE = "#1639b8";
const INK = "#05090b";
const PAPER = "#d5dad9";
const RED = "#ef3d4f";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const pulse = (time, start, duration) => {
  const t = clamp01((time - start) / duration);
  return Math.sin(t * Math.PI);
};

function loadImage(src, onReady) {
  const image = new Image();
  image.decoding = "async";
  image.onload = onReady;
  image.src = src;
  return image;
}

/** Bonkler Battle daemon — a live Windows-2000 combat terminal with real units. */
export function createBonklerFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  let active = false;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let time = 0;
  let ready = 0;

  const imageReady = () => {
    ready += 1;
    if (active) draw(reduced ? 0.8 : time);
  };
  const fighterA = loadImage("/fx/bonkler-a.webp", imageReady);
  const fighterB = loadImage("/fx/bonkler-b.webp", imageReady);

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    dpr = Math.min(devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    if (active) draw(reduced ? 0.8 : time);
  }

  function line(x1, y1, x2, y2, color = TEAL, lineWidth = 1) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    context.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    context.stroke();
  }

  function drawTerminalFrame() {
    context.fillStyle = "rgba(2, 14, 17, 0.72)";
    context.fillRect(0, 0, width, height);

    const horizon = height * 0.69;
    context.save();
    context.globalAlpha = 0.28;
    for (let x = -width; x < width * 2; x += Math.max(34, width / 28)) {
      line(width * 0.5, horizon, x, height, TEAL);
    }
    for (let row = 0; row < 12; row += 1) {
      const p = row / 11;
      const y = horizon + p * p * (height - horizon);
      line(0, y, width, y, row === 0 ? TEAL_HI : TEAL);
    }
    context.restore();

    const panelX = width < 720 ? width * 0.04 : width * 0.39;
    const panelY = height * 0.08;
    const panelW = width < 720 ? width * 0.92 : width * 0.57;
    const panelH = height * 0.76;
    context.fillStyle = "rgba(4, 12, 14, 0.34)";
    context.fillRect(panelX, panelY, panelW, panelH);
    context.strokeStyle = "rgba(98, 255, 240, 0.52)";
    context.lineWidth = 1;
    context.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

    const barH = Math.max(24, height * 0.038);
    context.fillStyle = BLUE;
    context.fillRect(panelX + 4, panelY + 4, panelW - 8, barH);
    context.fillStyle = PAPER;
    context.font = `600 ${Math.max(9, Math.min(13, width / 105))}px "IBM Plex Mono", monospace`;
    context.textBaseline = "middle";
    context.fillText("BONKLER BATTLE // ACTIVE ENCOUNTER", panelX + 14, panelY + 4 + barH / 2);
    context.textAlign = "right";
    context.fillText("BUILD 1.8.1", panelX + panelW - 15, panelY + 4 + barH / 2);
    context.textAlign = "left";

    return { x: panelX, y: panelY, w: panelW, h: panelH, titleH: barH + 8 };
  }

  function drawHealth(panel, aAttack, bAttack) {
    const y = panel.y + panel.titleH + 13;
    const gap = Math.max(28, panel.w * 0.06);
    const barW = (panel.w - gap - 28) / 2;
    const barH = Math.max(7, height * 0.012);
    const aHealth = 0.94 - bAttack * 0.17;
    const bHealth = 0.84 - aAttack * 0.24;

    context.font = `500 ${Math.max(8, Math.min(11, width / 125))}px "IBM Plex Mono", monospace`;
    context.fillStyle = PAPER;
    context.fillText("PLAYER UNIT", panel.x + 14, y);
    context.fillText("HOSTILE UNIT", panel.x + 14 + barW + gap, y);

    const healthY = y + 8;
    for (const [x, amount, color] of [
      [panel.x + 14, aHealth, TEAL],
      [panel.x + 14 + barW + gap, bHealth, RED],
    ]) {
      context.fillStyle = "rgba(213, 218, 217, 0.18)";
      context.fillRect(x, healthY, barW, barH);
      context.fillStyle = color;
      context.fillRect(x, healthY, barW * amount, barH);
      context.strokeStyle = "rgba(213, 218, 217, 0.6)";
      context.strokeRect(x + 0.5, healthY + 0.5, barW - 1, barH - 1);
    }
  }

  function drawFighter(image, centerX, floorY, fighterHeight, offsetX, flip = false, hit = 0) {
    if (!image.complete || !image.naturalWidth) return;
    const drawHeight = fighterHeight * (1 - hit * 0.035);
    const drawWidth = drawHeight * (image.naturalWidth / image.naturalHeight);
    context.save();
    context.translate(Math.round(centerX + offsetX), Math.round(floorY - drawHeight));
    if (flip) context.scale(-1, 1);
    context.globalAlpha = 0.98;
    if (hit > 0.05) {
      context.shadowColor = RED;
      context.shadowBlur = 24 * hit;
    } else {
      context.shadowColor = TEAL_HI;
      context.shadowBlur = 8;
    }
    context.drawImage(image, -drawWidth / 2, 0, drawWidth, drawHeight);
    context.restore();
  }

  function drawImpact(x, y, amount) {
    if (amount <= 0.02) return;
    context.save();
    context.globalAlpha = amount;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 3;
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const inner = 12 + amount * 18;
      const outer = 28 + amount * 72;
      line(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer, index % 2 ? TEAL_HI : "#ffffff", 2);
    }
    context.fillStyle = `rgba(255,255,255,${0.26 * amount})`;
    context.beginPath();
    context.arc(x, y, 36 * amount, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawLog(panel, aAttack, bAttack) {
    const boxH = Math.max(62, height * 0.11);
    const x = panel.x + 12;
    const y = panel.y + panel.h - boxH - 12;
    const w = panel.w - 24;
    context.fillStyle = "rgba(213, 218, 217, 0.08)";
    context.fillRect(x, y, w, boxH);
    context.strokeStyle = "rgba(213, 218, 217, 0.3)";
    context.strokeRect(x + 0.5, y + 0.5, w - 1, boxH - 1);
    context.font = `500 ${Math.max(8, Math.min(10, width / 140))}px "IBM Plex Mono", monospace`;
    context.fillStyle = TEAL_HI;
    const lineOne = aAttack > 0.1 ? "> PLAYER executes SLASH // 74 DMG" : "> ENCOUNTER LINK STABLE";
    const lineTwo = bAttack > 0.1 ? "> HOSTILE counter signal detected" : "> LOADOUT: 7 LAYERS // DEMO READY";
    context.fillText(lineOne, x + 10, y + boxH * 0.38);
    context.fillStyle = bAttack > 0.1 ? RED : PAPER;
    context.fillText(lineTwo, x + 10, y + boxH * 0.68);
  }

  function draw(frameTime) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const panel = drawTerminalFrame();
    const cycle = frameTime % 8;
    const aAttack = pulse(cycle, 1.15, 1.25);
    const bAttack = pulse(cycle, 4.55, 1.25);
    const aHit = pulse(cycle, 5.0, 0.55);
    const bHit = pulse(cycle, 1.62, 0.55);
    drawHealth(panel, aAttack, bAttack);

    const mobile = width < 720;
    const floorY = panel.y + panel.h - Math.max(72, height * 0.12);
    const fighterHeight = Math.min(panel.h * (mobile ? 0.63 : 0.68), panel.w * (mobile ? 0.82 : 0.43));
    const bob = Math.sin(frameTime * 3.2) * (reduced ? 0 : 3);
    const leftX = panel.x + panel.w * (mobile ? 0.35 : 0.34);
    const rightX = panel.x + panel.w * (mobile ? 0.68 : 0.72);
    // Mirror the left unit toward stage-right and keep the right unit facing
    // stage-left: weapons lead into the encounter, shields stay on the outside.
    drawFighter(fighterA, leftX, floorY + bob, fighterHeight, aAttack * panel.w * 0.13, true, aHit);
    drawFighter(fighterB, rightX, floorY - bob, fighterHeight, -bAttack * panel.w * 0.13, false, bHit);
    drawImpact((leftX + rightX) / 2, floorY - fighterHeight * 0.52, Math.max(aAttack, bAttack));
    drawLog(panel, aAttack, bAttack);

    context.save();
    context.globalAlpha = 0.13;
    context.fillStyle = PAPER;
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 1);
    context.restore();

    if (ready < 2) {
      context.fillStyle = PAPER;
      context.font = `500 10px "IBM Plex Mono", monospace`;
      context.fillText("ASSEMBLING COMBAT UNITS…", panel.x + 14, panel.y + panel.h * 0.52);
    }
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      active = true;
      time = 0;
      resize();
      addEventListener("resize", resize, { passive: true });
      draw(reduced ? 0.8 : 0);
    },
    stop() {
      active = false;
      removeEventListener("resize", resize);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || reduced) return;
      time += dt;
      draw(time);
    },
    resize,
    destroy() {
      this.stop();
      fighterA.onload = null;
      fighterB.onload = null;
    },
  };
}
