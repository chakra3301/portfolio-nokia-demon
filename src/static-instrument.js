/**
 * Still frames of the real instrument, for reduced motion and unavailable WebGL.
 * Only the decorative renderer changes; the portfolio keeps its scene controls.
 * Portrait frames retain the original mobile camera and project composition.
 */
export function createStaticInstrument(canvas) {
  const picture = document.createElement("picture");
  picture.id = "static-bg";
  picture.setAttribute("aria-hidden", "true");
  const portrait = document.createElement("source");
  portrait.media = "(orientation: portrait)";
  const image = document.createElement("img");
  image.alt = "";
  image.fetchPriority = "high";
  picture.append(portrait, image);
  canvas.hidden = true;
  canvas.after(picture);

  let current = "";
  function setScene(scene, project) {
    const name = scene === "daemon" && project ? project : "instrument";
    if (scene === "warp" || name === current) return;
    current = name;
    portrait.srcset = `/stills/${name}-phone.webp`;
    image.src = `/stills/${name}-desktop.webp`;
  }
  setScene("hero");

  const noop = () => {};
  // Preserve the transition callback contract, without a motion timeline.
  const arrive = (callback) => { callback?.(); return { progress: noop }; };
  return {
    setScene,
    update: noop, render: noop, resize: noop,
    setActiveRing: noop, rotateActive: noop, rotateBy: noop,
    getArmed: () => null, ringOfPointer: () => null,
    reticleScreen: () => ({ visible: false }),
    alignToProject: (_project, callback) => callback?.(), cancelAlign: noop,
    setDither: noop, setDrift: noop, setChromeVisible: noop, setAscii: noop,
    warpTo: (_project, callback) => arrive(callback), backToHub: arrive,
    setExposure: noop, onPointerMove: noop,
    setHdriSource: noop, setHdriAmount: noop,
    setDaemonFx: noop, updateDaemonFx: noop,
    captureBurn: noop, videoAmtU: { value: 0 }, videoBurnU: { value: 0 },
    activeRing: null, aligning: false,
    dispose() { picture.remove(); canvas.hidden = false; },
  };
}
