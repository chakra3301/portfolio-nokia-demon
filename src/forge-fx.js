const LIME = "#9BCB4B";
const LIME_HI = "#D5FF8A";
const INK = "#070A06";
const PAPER = "#D9DED4";
const MUTED = "#78806F";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
};

/** Forge Studio daemon — trait layers converge into a generated collection. */
export function createForgeFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  let active = false;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let time = 0;

  function resize() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    dpr = Math.min(devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (active) draw(reduced ? 2.8 : time);
  }

  function line(x1, y1, x2, y2, color = LIME, lineWidth = 1) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    context.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    context.stroke();
  }

  function roundRect(x, y, w, h, radius = 8) {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
  }

  function label(text, x, y, size = 10, color = MUTED, weight = 500) {
    context.fillStyle = color;
    context.font = `${weight} ${size}px "IBM Plex Mono", monospace`;
    context.fillText(text, x, y);
  }

  function drawGrid() {
    const step = Math.max(32, Math.min(width, height) / 17);
    context.save();
    context.globalAlpha = 0.16;
    for (let x = 0; x <= width; x += step) line(x, 0, x, height, LIME);
    for (let y = 0; y <= height; y += step) line(0, y, width, y, LIME);
    context.restore();

    const sweep = reduced ? height * 0.44 : (time * 42) % (height + 100) - 50;
    const glow = context.createLinearGradient(0, sweep - 45, 0, sweep + 45);
    glow.addColorStop(0, "rgba(155,203,75,0)");
    glow.addColorStop(0.5, "rgba(155,203,75,0.07)");
    glow.addColorStop(1, "rgba(155,203,75,0)");
    context.fillStyle = glow;
    context.fillRect(0, sweep - 45, width, 90);
  }

  function drawLayerIcon(x, y, size, index, opacity = 1) {
    context.save();
    context.globalAlpha = opacity;
    roundRect(x, y, size, size, Math.max(8, size * 0.07));
    context.fillStyle = index % 2 ? "rgba(155,203,75,0.08)" : "rgba(217,222,212,0.035)";
    context.fill();
    context.strokeStyle = index === 4 ? LIME_HI : "rgba(155,203,75,0.62)";
    context.lineWidth = index === 4 ? 1.5 : 1;
    context.stroke();

    const cx = x + size / 2;
    const cy = y + size / 2;
    context.strokeStyle = index === 4 ? LIME_HI : LIME;
    context.fillStyle = "rgba(155,203,75,0.13)";
    context.lineWidth = Math.max(1, size * 0.012);
    if (index === 0) {
      context.beginPath(); context.arc(cx, cy, size * 0.27, 0, Math.PI * 2); context.fill(); context.stroke();
    } else if (index === 1) {
      context.beginPath();
      context.moveTo(cx, y + size * 0.18); context.lineTo(x + size * 0.8, y + size * 0.74);
      context.lineTo(x + size * 0.2, y + size * 0.74); context.closePath(); context.fill(); context.stroke();
    } else if (index === 2) {
      for (let i = -1; i <= 1; i += 1) {
        context.beginPath(); context.arc(cx + i * size * 0.18, cy, size * 0.13, 0, Math.PI * 2); context.stroke();
      }
    } else if (index === 3) {
      context.strokeRect(x + size * 0.25, y + size * 0.25, size * 0.5, size * 0.5);
      line(x + size * 0.25, y + size * 0.75, x + size * 0.75, y + size * 0.25, LIME);
    } else {
      context.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 ? size * 0.18 : size * 0.34;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.fill(); context.stroke();
    }
    context.restore();
  }

  function drawWorkbench() {
    const mobile = width < 720;
    const panel = mobile
      ? { x: width * 0.06, y: height * 0.11, w: width * 0.88, h: height * 0.7 }
      : { x: width * 0.4, y: height * 0.08, w: width * 0.55, h: height * 0.82 };
    const headerH = Math.max(32, panel.h * 0.065);
    const railW = mobile ? 0 : panel.w * 0.25;

    context.fillStyle = "rgba(7,10,6,0.34)";
    context.fillRect(panel.x, panel.y, panel.w, panel.h);
    context.strokeStyle = "rgba(155,203,75,0.5)";
    context.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
    context.fillStyle = "rgba(155,203,75,0.08)";
    context.fillRect(panel.x, panel.y, panel.w, headerH);
    line(panel.x, panel.y + headerH, panel.x + panel.w, panel.y + headerH, "rgba(155,203,75,0.44)");

    label("FORGE // NFT STUDIO", panel.x + 14, panel.y + headerH * 0.62, Math.max(9, Math.min(12, width / 120)), LIME_HI, 600);
    context.textAlign = "right";
    label("5 LAYERS  ·  24 ASSETS  ·  READY", panel.x + panel.w - 14, panel.y + headerH * 0.62, Math.max(8, Math.min(10, width / 145)), PAPER);
    context.textAlign = "left";

    if (!mobile) {
      line(panel.x + railW, panel.y + headerH, panel.x + railW, panel.y + panel.h, "rgba(155,203,75,0.3)");
      label("STRUCTURE", panel.x + 14, panel.y + headerH + 24, 9, MUTED, 600);
      const names = ["BACKGROUND", "BODY", "EYES", "HEADWEAR", "OVERLAY"];
      names.forEach((name, index) => {
        const y = panel.y + headerH + 48 + index * 50;
        context.fillStyle = index === 4 ? "rgba(155,203,75,0.13)" : "rgba(217,222,212,0.025)";
        context.fillRect(panel.x + 10, y, railW - 20, 36);
        label(String(index + 1).padStart(2, "0"), panel.x + 20, y + 22, 9, LIME);
        label(name, panel.x + 48, y + 22, 9, index === 4 ? PAPER : MUTED);
      });
      label("RARITY RULES", panel.x + 14, panel.y + panel.h - 48, 9, MUTED, 600);
      label("12 ACTIVE", panel.x + 14, panel.y + panel.h - 26, 10, LIME_HI);
    }

    const stageX = panel.x + railW;
    const stageW = panel.w - railW;
    const stageTop = panel.y + headerH;
    const stageH = panel.h - headerH;
    const cardSize = Math.min(stageW * (mobile ? 0.52 : 0.43), stageH * 0.52);
    const targetX = stageX + stageW * 0.57 - cardSize / 2;
    const targetY = stageTop + stageH * 0.43 - cardSize / 2;
    const cycle = reduced ? 0.72 : (time % 6) / 6;
    const assemble = ease(cycle / 0.58);

    label("LIVE COMPOSITE", stageX + 16, stageTop + 24, 9, MUTED, 600);
    label("PREVIEW / 0042", stageX + 16, stageTop + 43, 10, PAPER);

    for (let index = 0; index < 5; index += 1) {
      const spread = mobile ? cardSize * 0.16 : cardSize * 0.25;
      const startX = targetX + (index - 2) * spread;
      const startY = targetY + (2 - index) * spread * 0.34;
      const settle = clamp01(assemble * 1.35 - index * 0.07);
      const x = startX + (targetX + index * 3 - startX) * settle;
      const y = startY + (targetY - index * 3 - startY) * settle;
      drawLayerIcon(x, y, cardSize, index, 0.34 + index * 0.12);
    }

    if (assemble > 0.78) {
      const flash = clamp01((assemble - 0.78) / 0.22);
      context.save();
      context.globalAlpha = flash * (0.55 + Math.sin(time * 5) * 0.08);
      context.shadowColor = LIME;
      context.shadowBlur = 22;
      roundRect(targetX - 4, targetY - 4, cardSize + 8, cardSize + 8, 12);
      context.strokeStyle = LIME_HI;
      context.lineWidth = 2;
      context.stroke();
      context.restore();
    }

    const footerY = panel.y + panel.h - Math.max(46, panel.h * 0.075);
    line(stageX, footerY, panel.x + panel.w, footerY, "rgba(155,203,75,0.34)");
    label("GENERATING UNIQUE COMBINATIONS", stageX + 16, footerY + 19, 9, MUTED, 600);
    const progressX = stageX + 16;
    const progressY = footerY + 30;
    const progressW = stageW - 124;
    context.fillStyle = "rgba(217,222,212,0.09)";
    context.fillRect(progressX, progressY, progressW, 4);
    context.fillStyle = LIME;
    context.fillRect(progressX, progressY, progressW * (0.42 + assemble * 0.5), 4);
    context.textAlign = "right";
    label(`${Math.round(420 + assemble * 500)} / 1000`, panel.x + panel.w - 16, progressY + 4, 9, LIME_HI);
    context.textAlign = "left";
  }

  function draw(frameTime) {
    time = frameTime;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(7,10,6,0.2)";
    context.fillRect(0, 0, width, height);
    drawGrid();
    drawWorkbench();
  }

  return {
    canvas,
    get active() { return active; },
    start() {
      active = true;
      time = 0;
      resize();
      addEventListener("resize", resize, { passive: true });
      draw(reduced ? 2.8 : 0);
    },
    stop() {
      active = false;
      time = 0;
      removeEventListener("resize", resize);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
    update(dt) {
      if (!active || reduced) return;
      draw(time + dt);
    },
    resize,
    destroy() { this.stop(); },
  };
}
