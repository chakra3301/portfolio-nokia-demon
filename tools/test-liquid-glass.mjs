/**
 * Browser rendering regression: glass must sample the same screen position at
 * native and capped canvas resolutions. Import testLiquidGlass in an
 * ego-browser nodejs round and pass its existing Page on the Vite dev server.
 */
export async function testLiquidGlass(page) {
  const results = await page.evaluate(async () => {
  const { createLiquidGlass } = await import("/src/liquid-glass.js");
  const samples = [];
  for (const ratio of [1, 1.75, 2]) {
    const source = document.createElement("canvas");
    source.width = Math.round(innerWidth * ratio);
    source.height = Math.round(innerHeight * ratio);
    const context = source.getContext("2d");
    const halfWidth = source.width / 2, halfHeight = source.height / 2;
    for (const [x, y, color] of [[0, 0, "#ff0000"], [1, 0, "#ffff00"], [0, 1, "#0000ff"], [1, 1, "#00ff00"]]) {
      context.fillStyle = color;
      context.fillRect(x * halfWidth, y * halfHeight, halfWidth, halfHeight);
    }

    // The center sits just to the right of the vertical color boundary, in the
    // green bottom-right quadrant. Either an inverted Y or mixed pixel units
    // samples a different quadrant.
    const shell = document.createElement("div");
    shell.style.cssText = "position:fixed;left:35vw;top:63vh;width:32vw;height:18vh;pointer-events:none;z-index:10";
    const canvas = document.createElement("canvas");
    canvas.dataset.daemonGlass = "";
    shell.append(canvas);
    document.body.append(shell);
    let effect;
    try {
      effect = createLiquidGlass({ shell, sourceCanvas: source, reduced: true });
      if (!effect) throw new Error("WebGL unavailable for the glass regression");
      effect.start();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const pixel = new Uint8Array(4);
      const gl = canvas.getContext("webgl");
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const [red, green, blue] = pixel;
      samples.push({ ratio, pixel: [...pixel], passed: green > 80 && red < 30 && blue < 30 });
    } finally {
      effect?.destroy();
      shell.remove();
    }
  }
  return samples;
  });
  if (results.some(result => !result.passed)) throw new Error("Glass sampled the wrong screen position");
  return results;
}
