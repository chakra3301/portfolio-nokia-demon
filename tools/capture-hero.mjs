import { chromium } from "playwright";
import { resolve } from "node:path";
const out = resolve(".previews");
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("console", m => { if (m.type()==="error") errs.push(m.text()); });
const tag = () => page.evaluate(() => (document.querySelector(".hero-tagline")||{}).textContent);
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.keyboard.press("Enter");                         // skip video → hero
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${out}/nokia-hero-1-wisdom-decode.png` });
console.log("t~1.1s:", JSON.stringify(await tag()));
await page.waitForTimeout(1000);                            // WISDOM solid
await page.screenshot({ path: `${out}/nokia-hero-2-wisdom.png` });
console.log("t~2.1s:", JSON.stringify(await tag()));
await page.waitForTimeout(1400);                            // through glitch → real tagline
await page.screenshot({ path: `${out}/nokia-hero-3-tagline.png` });
console.log("t~3.5s:", JSON.stringify(await tag()));
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/nokia-hero-4-final.png` });
console.log("final:", JSON.stringify(await tag()));
console.log("errors:", errs.length ? errs : "none");
await browser.close();
