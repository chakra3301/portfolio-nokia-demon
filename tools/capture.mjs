/**
 * State-aware capture for NOKIADEMON. Drives the experience through each scene
 * and screenshots it, so the agent can SEE loader → hero → hub → daemon.
 * Usage: node tools/capture.mjs [url]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.argv[2] || "http://localhost:5173";
const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

const shot = async (name) => { await page.screenshot({ path: `${outDir}/nokia-${name}.png` }); console.log("saved", name); };

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2200); // loader footage plays
await shot("1-loader");

// skip the boot feed straight into the site (loader auto-launches at footage end)
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });
await page.waitForTimeout(1400);
await shot("2-hero");

// hero → hub
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1400);
// move mouse over the astrolabe to arm a ring
await page.mouse.move(720, 470);
await page.waitForTimeout(200);
await page.mouse.move(720, 300); // toward a ring radius
await page.waitForTimeout(400);
await shot("3-hub");

// select a project via the rail (accessible path) → warp → daemon
await page.locator('.mark-btn[data-project="ekko"]').click();
await page.waitForTimeout(1800);
await shot("4-daemon-identity");
await page.mouse.wheel(0, 120);
await page.waitForTimeout(900);
await shot("5-daemon-process");
await page.mouse.wheel(0, 120);
await page.waitForTimeout(900);
await page.mouse.wheel(0, 120);
await page.waitForTimeout(900);
await shot("6-daemon-readout-action");

console.log("\nConsole errors:", errs.length ? errs : "none");
await browser.close();
