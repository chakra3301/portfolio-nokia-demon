import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { const t = m.text(); if (/error|shader|webgl|GL_|compile/i.test(t)) console.log("CONSOLE:", t); });

await page.goto("http://localhost:5183", { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.waitForTimeout(600);
await page.locator(".eyebrow-btn").click();
await page.waitForFunction(() => document.body.dataset.state === "operator");
await page.waitForTimeout(700);
// scroll the dossier down to the archive → IO activates the field
await page.locator("[data-op-scroll]").evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(1500);
const active = await page.evaluate(() => document.querySelector("[data-op-field]").classList.contains("is-active"));
console.log("field active:", active, "archiveActive:", await page.evaluate(() => window.__archiveActive));
// sweep the cursor into the field
await page.mouse.move(720, 450);
await page.waitForTimeout(500);
await page.mouse.move(560, 520, { steps: 8 });
await page.waitForTimeout(1200);
await page.screenshot({ path: ".previews/field-a.png" });
await page.mouse.move(900, 400, { steps: 10 });
await page.waitForTimeout(1200);
await page.screenshot({ path: ".previews/field-b.png" });
await browser.close();
