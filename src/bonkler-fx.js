const TEAL_HI = "#62fff0";
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

/** Two Bonklers trading attacks on a transparent stage. */
export function createBonklerFx({ reduced = false } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  let active = false;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let time = 0;
  const imageReady = () => {
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

  function draw(frameTime) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const mobile = width < 720;
    const stage = {
      x: width * (mobile ? 0.04 : 0.39),
      y: height * 0.08,
      w: width * (mobile ? 0.92 : 0.57),
      h: height * 0.76,
    };
    const cycle = frameTime % 8;
    const aAttack = pulse(cycle, 1.15, 1.25);
    const bAttack = pulse(cycle, 4.55, 1.25);
    const aHit = pulse(cycle, 5.0, 0.55);
    const bHit = pulse(cycle, 1.62, 0.55);
    const floorY = stage.y + stage.h - Math.max(72, height * 0.12);
    const fighterHeight = Math.min(stage.h * (mobile ? 0.63 : 0.68), stage.w * (mobile ? 0.82 : 0.43));
    const bob = Math.sin(frameTime * 3.2) * (reduced ? 0 : 3);
    const leftX = stage.x + stage.w * (mobile ? 0.35 : 0.34);
    const rightX = stage.x + stage.w * (mobile ? 0.68 : 0.72);
    // Mirror the left unit toward stage-right and keep the right unit facing
    // stage-left: weapons lead into the encounter, shields stay on the outside.
    drawFighter(fighterA, leftX, floorY + bob, fighterHeight, aAttack * stage.w * 0.13, true, aHit);
    drawFighter(fighterB, rightX, floorY - bob, fighterHeight, -bAttack * stage.w * 0.13, false, bHit);
  }

  return {
    canvas,
    dotPitch: 3.2,
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
