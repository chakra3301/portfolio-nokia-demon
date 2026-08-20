/** Regression: tab changes and operator → hub fades must never reveal the legacy grid. */
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const wallState = () => page.evaluate(() => {
  const wall = document.querySelector("[data-op-wall]");
  const style = getComputedStyle(wall);
  return {
    hidden: document.hidden,
    archiveActive: window.__archiveActive === true,
    superseded: wall.classList.contains("is-superseded"),
    opacity: Number(style.opacity),
    pointerEvents: style.pointerEvents,
  };
});

await page.goto(url, { waitUntil: "networkidle" });
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });
await page.locator(".eyebrow-btn").click();
await page.waitForFunction(() => window.__archiveActive === true, { timeout: 15000 });
const beforeTab = await wallState();

// Headless Chromium does not consistently mark background pages hidden, so
// dispatch the same Page Visibility lifecycle deterministically.
await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
const whileHidden = await wallState();

await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForFunction(() => window.__archiveActive === true, { timeout: 8000 });
const afterReturn = await wallState();

await page.locator(".op-back").click();
await page.waitForFunction(() => document.body.dataset.state === "hub");
const duringBackFade = await wallState();

const states = [beforeTab, whileHidden, afterReturn, duringBackFade];
const noGrid = states.every((entry) => entry.superseded && entry.opacity === 0 && entry.pointerEvents === "none");
const lifecycle = beforeTab.archiveActive && !whileHidden.archiveActive && afterReturn.archiveActive;
const ok = noGrid && lifecycle && errors.length === 0;
console.log(JSON.stringify({ beforeTab, whileHidden, afterReturn, duringBackFade, errors, result: ok ? "PASS" : "FAIL" }, null, 2));

await browser.close();
process.exit(ok ? 0 : 1);
