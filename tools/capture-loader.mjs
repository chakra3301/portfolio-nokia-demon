import { chromium } from "playwright";
import { resolve } from "node:path";
const out = resolve(".previews");
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/nokia-loader-a.png` });   // feed a few lines in
const feedEarly = await page.$$eval("[data-feed] li", els => els.map(e => e.textContent));
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/nokia-loader-b.png` });   // more feed lines

// let it run to the end → should auto-launch into the site (no click)
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 12000 })
  .then(() => console.log("AUTO-LAUNCH: ok → state hero"))
  .catch(() => console.log("AUTO-LAUNCH: FAILED (still on loader)"));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/nokia-loader-d-hero.png` });
console.log("feed@1.6s:", JSON.stringify(feedEarly));
console.log("errors:", errs.length ? errs : "none");
await browser.close();
