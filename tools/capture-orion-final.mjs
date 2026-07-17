import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5183", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);
await page.locator('.mark-btn[data-project="orion"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 10000 });
// wait until the character canvas actually has opaque pixels (glb loaded + spawned)
await page.waitForFunction(() => {
  const c = window.__fx.orion.canvas;
  const g = c.getContext("2d");
  const d = g.getImageData(Math.floor(c.width * 0.60), 0, Math.floor(c.width * 0.2), c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
  return n > 2000;
}, { timeout: 30000 });
console.log("character visible — fast-forwarding");
await page.evaluate(() => { for (let i = 0; i < 160; i++) window.__fx.orion.update(0.05); });
await page.waitForTimeout(300);
await page.screenshot({ path: ".previews/final-orion.png" });
console.log("saved final-orion.png");
await browser.close();
