import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
const wheel = (dy, n = 3) =>
  page.evaluate(([d, k]) => { for (let i = 0; i < k; i++) window.dispatchEvent(new WheelEvent("wheel", { deltaY: d, cancelable: true, bubbles: true })); }, [dy, n]);

await page.goto("http://localhost:5183", { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.waitForTimeout(600);
await page.locator(".eyebrow-btn").click();
await page.waitForFunction(() => document.body.dataset.state === "operator");
await page.waitForTimeout(800);
// scroll the dossier down to the wall
await page.locator("[data-op-scroll]").evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(1200); // let lazy imgs load + dither paint
// nudge mouse to a neutral spot to relax the lens, screenshot the dithered field
await page.mouse.move(200, 200);
await page.waitForTimeout(600);
await page.screenshot({ path: ".previews/wall-field.png" });
// hover a cell → lens magnify + decode
const wall = page.locator("[data-op-wall]");
const box = await wall.boundingBox();
await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.5);
await page.waitForTimeout(700);
await page.screenshot({ path: ".previews/wall-lens.png" });
// click that cell → lightbox
await page.mouse.click(box.x + box.width * 0.34, box.y + box.height * 0.5);
await page.waitForTimeout(600);
await page.screenshot({ path: ".previews/wall-lightbox.png" });
const lbOpen = await page.locator("[data-op-lightbox]").evaluate((el) => !el.hidden);
console.log("lightbox open:", lbOpen);
await browser.close();
