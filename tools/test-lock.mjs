import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const stateOf = () => page.evaluate(() => document.body.dataset.state);
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.keyboard.press("Enter"); // skip boot feed into the site
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(1300);
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);
// mimic real use: rotate a burst, then PAUSE to let the glyph seat + lock
let locked = false;
for (let i = 0; i < 24 && !locked; i++) {
  await page.mouse.move(720, 300);            // keep ring armed
  for (let j = 0; j < 3; j++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(60); }
  await page.waitForTimeout(700);             // pause: detent seats, dwell accrues (< engaged window)
  const s = await stateOf();
  if (s === "warp" || s === "daemon") { locked = true; console.log("locked via scroll+settle after burst", i+1, "-> state", s); }
}
await page.waitForTimeout(1500);
console.log("final:", await stateOf());
console.log("RESULT:", locked ? "PASS ✓ ring lock works" : "FAIL ✗ never locked");
await browser.close();
process.exit(locked ? 0 : 1);
