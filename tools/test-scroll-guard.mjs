/** Regression: one wheel/touch gesture may navigate only one deck or panel. */
import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const state = () => page.evaluate(() => document.body.dataset.state);
const burst = (deltaY, count = 20) => page.evaluate(
  ({ deltaY: dy, count: total }) => {
    for (let index = 0; index < total; index += 1) {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true }));
    }
  },
  { deltaY, count },
);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 });

// A long start-page fling must stop at the astrolabe, not continue into operator.
await burst(48, 30);
await page.waitForTimeout(120);
const afterHeroFling = await state();

// Once the wheel stream has gone quiet, a new gesture may descend one deck.
await page.waitForTimeout(1250);
await burst(48, 30);
await page.waitForTimeout(120);
const afterFreshHubFling = await state();

// A daemon wheel burst may advance exactly one panel, not race to Action/exit.
await page.waitForTimeout(1250);
await page.keyboard.press("Escape");
await page.waitForFunction(() => document.body.dataset.state === "hub");
await page.locator('.mark-btn[data-project="life"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon", { timeout: 10000 });
await page.waitForTimeout(700);
await burst(48, 30);
await page.waitForTimeout(120);
const activePanel = await page.evaluate(() => {
  const panels = [...document.querySelectorAll(".daemon-panel")];
  return panels.findIndex((panel) => panel.dataset.current === "true");
});

const ok = afterHeroFling === "hub" && afterFreshHubFling === "operator" && activePanel === 1 && errors.length === 0;
console.log(JSON.stringify({ afterHeroFling, afterFreshHubFling, activePanel, errors, result: ok ? "PASS" : "FAIL" }, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
