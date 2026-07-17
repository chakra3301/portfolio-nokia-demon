import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5183", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);
await page.locator('.mark-btn[data-project="orion"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 10000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const u = window.__instrument.postUniforms;
  const fx = window.__fx.orion;
  const c = fx.canvas;
  const g = c.getContext("2d");
  // sample center-right where she stands
  const px = g.getImageData(Math.floor(c.width*0.66), Math.floor(c.height*0.5), 1, 1).data;
  return {
    occlude: u.uFxOcclude.value, amt: u.uFxAmt.value,
    texIsCanvas: u.uFxTex.value?.image === c,
    canvasSize: [c.width, c.height],
    samplePx: [...px],
  };
}));
await browser.close();
