import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5183/orion-test.html", { waitUntil: "networkidle" });
await page.waitForTimeout(4000); // load glb
for (const s of [2, 6, 10]) {
  await page.evaluate((secs) => { for (let i = 0; i < secs/0.05; i++) window.__orion.update(0.05); }, s === 2 ? 2 : 4);
  await page.screenshot({ path: `.previews/harness-orion-${s}s.png` });
  console.log("saved", s);
}
await browser.close();
