import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:5183", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.keyboard.press("Enter").catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: ".previews/reduced-hero.png" });
console.log("state:", await page.evaluate(() => document.body.dataset.state));
// jump straight to orion under reduced motion
const btn = page.locator('.mark-btn[data-project="orion"]');
if (await btn.count()) {
  await page.locator(".scroll-prompt").click().catch(() => {});
  await page.waitForTimeout(1200);
  await btn.click().catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: ".previews/reduced-orion.png" });
  console.log("state2:", await page.evaluate(() => document.body.dataset.state));
}
await browser.close();
