#!/usr/bin/env node
/**
 * Visual feedback loop for PI DESIGNER.
 * Renders a local URL or HTML file in headless Chromium and saves screenshots
 * at multiple viewports so the agent can SEE and critique its own work.
 *
 * Safe by design: local-only by default, no network beyond the target URL,
 * no filesystem writes outside ./.previews, no eval. Review before use.
 *
 * Setup (once):   npm i -D playwright && npx playwright install chromium
 * Usage:
 *   node tools/screenshot.mjs http://localhost:5173
 *   node tools/screenshot.mjs ./index.html
 *   node tools/screenshot.mjs http://localhost:5173 --full --wait 1500
 *
 * Output: ./.previews/<name>-<viewport>.png  (then read them with the read tool)
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: node tools/screenshot.mjs <url|file> [--full] [--wait ms]");
  process.exit(1);
}
const fullPage = args.includes("--full");
const waitIdx = args.indexOf("--wait");
const waitMs = waitIdx !== -1 ? parseInt(args[waitIdx + 1], 10) || 0 : 800;

const url = /^https?:\/\//.test(target)
  ? target
  : pathToFileURL(resolve(target)).href;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });
const slug = target.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "page";

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    // Scroll through the page so IntersectionObserver reveals / lazy content fire.
    await page.evaluate(async () => {
      await new Promise((res) => {
        let y = 0;
        const t = setInterval(() => {
          window.scrollTo(0, y);
          y += window.innerHeight * 0.8;
          if (y >= document.body.scrollHeight) { clearInterval(t); res(); }
        }, 60);
      });
      window.scrollTo(0, 0);
    });
    if (waitMs) await page.waitForTimeout(waitMs);
    const file = `${outDir}/${slug}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage });
    console.log(`saved ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
}
