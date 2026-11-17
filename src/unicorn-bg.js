/**
 * Unicorn Studio ambient background — full-viewport layer behind the instrument.
 * Project: LAdRpOR2jLiDvLHX5Nmn · SDK 2.2.6
 */
import { budgetPixelRatio, AMBIENT_MAX_PIXELS } from "./render-budget.js";

const SDK_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.6/dist/unicornStudio.umd.js";
export const UNICORN_BG_PROJECT_ID = "LAdRpOR2jLiDvLHX5Nmn";

let sdkPromise = null;
let activeScene = null;
let resizeHandler = null;

function loadSdk() {
  if (window.UnicornStudio?.addScene) return Promise.resolve(window.UnicornStudio);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.UnicornStudio);
    script.onerror = () => reject(new Error("Unicorn Studio SDK failed to load"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function sizeContainer(container) {
  container.style.width = "100vw";
  container.style.height = "100vh";
  container.style.width = "100dvw";
  container.style.height = "100dvh";
}

/** Mount the published scene full-screen into `container`. Returns { scene, destroy }. */
export async function mountUnicornBg(container) {
  if (activeScene) return sceneHandle(container, activeScene);

  sizeContainer(container);
  const UnicornStudio = await loadSdk();
  const mobile = window.matchMedia("(pointer: coarse)").matches;

  const scene = await UnicornStudio.addScene({
    element: container,
    projectId: UNICORN_BG_PROJECT_ID,
    scale: mobile ? 0.72 : 1,
    dpi: mobile ? 0.75 : budgetPixelRatio(innerWidth, innerHeight, 1.15, AMBIENT_MAX_PIXELS),
    fps: mobile ? 30 : 60,
    lazyLoad: false,
    production: true,
    altText: "NOKIADEMON ambient background",
    ariaLabel: "Decorative ambient WebGL background",
    interactivity: { mouse: { disabled: false, disableMobile: true } },
  });

  activeScene = scene;
  scene.resize();

  resizeHandler = () => {
    sizeContainer(container);
    scene.dpi = mobile ? 0.75 : budgetPixelRatio(innerWidth, innerHeight, 1.15, AMBIENT_MAX_PIXELS);
    // Curtains reads its own ratio during resize; changing scene.dpi alone only
    // updates layer uniforms and leaves the actual drawing buffer unbounded.
    scene.curtain.pixelRatio = scene.dpi;
    scene.curtain.renderer.pixelRatio = scene.dpi;
    scene.resize();
  };
  window.addEventListener("resize", resizeHandler, { passive: true });

  return sceneHandle(container, scene);
}

function sceneHandle(container, scene) {
  return {
    scene,
    destroy: destroyUnicornBg,
    canvas: () => container.querySelector("canvas"),
    // SDK 2.2.6 increments this after a source frame, so Three doesn't upload
    // identical pixels between ambient frames (especially on 144/240Hz screens).
    frameVersion: () => scene.local.renderFrameId,
    setActive(active) { scene.paused = !active; },
  };
}

export function destroyUnicornBg() {
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
  activeScene?.destroy?.();
  activeScene = null;
}
