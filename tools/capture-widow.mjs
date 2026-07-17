/**
 * Drives straight to the Black Widow daemon panel and screenshots the
 * spider-web backdrop across its loop (drop → spokes → spiral → hold).
 * NOTE: software-rendered/headless Chromium can run requestAnimationFrame
 * well under 60fps, and widow-fx.js clamps its own dt per frame — so the
 * animation can play out slower than real time in this harness. Waits below
 * are padded generously for that; a real GPU-accelerated browser will settle
 * into "hold" well within ~8s of entering the panel.
 * Usage: node tools/capture-widow.mjs [url]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.argv[2] || "http://localhost:5183";
const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

const shot = async (name) => { await page.screenshot({ path: `${outDir}/widow-${name}.png` }); console.log("saved", name); };

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });
await page.waitForTimeout(1000);
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);

await page.locator('.mark-btn[data-project="widow"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 8000 });

await page.waitForTimeout(600);
await shot("0-drop");
await page.waitForTimeout(9000);
await shot("1-spokes-or-spiral");
await page.waitForTimeout(9000);
await shot("2-spiral-or-hold");
await page.waitForTimeout(9000);
await shot("3-hold");

console.log("\nConsole errors:", errs.length ? errs : "none");
await browser.close();
