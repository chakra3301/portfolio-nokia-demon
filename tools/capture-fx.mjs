/**
 * Drives into each daemon and screenshots its backdrop animation at staged
 * beats. Usage: node tools/capture-fx.mjs [url] [projectId ...]
 * Defaults to all new fx: finders orion dia widow
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http")) || "http://localhost:5183";
const ids = args.filter((a) => !a.startsWith("http"));
const projects = ids.length ? ids : ["finders", "orion", "dia", "widow"];
const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });
await page.waitForTimeout(900);
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);

for (const id of projects) {
  await page.locator(`.mark-btn[data-project="${id}"]`).click();
  await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 10000 });
  for (const [name, wait] of [["a-load", 900], ["b-mid", 3200], ["c-settled", 6500]]) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${outDir}/fx-${id}-${name}.png` });
    console.log("saved", id, name);
  }
  await page.locator(".daemon-back:not(.op-back)").click();
  await page.waitForFunction(() => document.body.dataset.state === "hub", { timeout: 10000 });
  await page.waitForTimeout(900);
}

console.log("\nConsole errors:", errs.length ? errs : "none");
await browser.close();
