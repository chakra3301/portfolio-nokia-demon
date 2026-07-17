/** Mobile + reduced-motion captures for NOKIADEMON. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const url = process.argv[2] || "http://localhost:5173";
const outDir = resolve(".previews");
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

// ── mobile ──
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter"); // skip boot feed into the site
  await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/nokia-m-hero.png` });
  await page.locator(".scroll-prompt").click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${outDir}/nokia-m-hub.png` });
  await page.locator('.mark-btn[data-project="joust"]').click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${outDir}/nokia-m-daemon.png` });
  console.log("mobile errors:", errs.length ? errs : "none");
  await page.close();
}

// ── reduced-motion (accessible document mode) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/nokia-reduced-top.png`, fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/nokia-reduced-mid.png`, fullPage: false });
  console.log("reduced errors:", errs.length ? errs : "none");
  await ctx.close();
}
await browser.close();
