import { chromium } from "playwright";
import { resolve } from "node:path";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const logs = [];
page.on("pageerror", e => logs.push("PAGEERR: "+e.message.slice(0,140)));
await page.goto("file://" + resolve(".tmp/us-preview.html"), { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
await page.screenshot({ path: resolve(".previews/unicorn-scene-2a.png") });
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(".previews/unicorn-scene-2b.png") });
const manifest = await page.evaluate(() => {
  try { const s = window.UnicornStudio?.scenes?.[0]; return s?.getVariableManifest ? s.getVariableManifest() : "no-manifest-api"; }
  catch(e){ return "err: "+e.message; }
});
console.log("MANIFEST:", JSON.stringify(manifest));
console.log("LOGS:", logs.slice(-4).join(" | ") || "none");
await browser.close();
