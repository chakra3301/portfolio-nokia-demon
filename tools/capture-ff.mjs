/**
 * Fast-forward capture: enters a daemon, then manually advances the fx clock
 * via the dev debug hook (window.__fx) so slow headless rAF can't hide the
 * later phases. Usage: node tools/capture-ff.mjs <projectId> <seconds> [url]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const id = process.argv[2] || "widow";
const seconds = Number(process.argv[3] || 10);
const url = process.argv[4] || "http://localhost:5183";
const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);
await page.locator(`.mark-btn[data-project="${id}"]`).click();
await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 10000 });
await page.waitForTimeout(1500);

await page.evaluate(([pid, secs]) => {
  const fx = window.__fx[pid];
  const steps = Math.ceil(secs / 0.05);
  for (let i = 0; i < steps; i++) fx.update(0.05);
}, [id, seconds]);
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/ff-${id}-${seconds}s.png` });
console.log(`saved ff-${id}-${seconds}s.png`, errs.length ? errs : "");
await browser.close();
