/** Regression test: back out of a daemon must return to hub and STAY there. */
import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const stateOf = () => page.evaluate(() => document.body.dataset.state);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.keyboard.press("Enter"); // skip boot feed into the site
await page.waitForFunction(() => document.body.dataset.state === "hero", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1400);
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);
console.log("after enter hub:", await stateOf());

// enter a project via the rail
await page.locator('.mark-btn[data-project="ekko"]').click();
await page.waitForTimeout(1800);
console.log("after select:", await stateOf(), "(expect daemon)");

// back out via the button
await page.locator(".daemon-back").click();
await page.waitForTimeout(1600);
const s1 = await stateOf();
console.log("1.6s after back:", s1, "(expect hub)");
await page.waitForTimeout(1500);
const s2 = await stateOf();
console.log("3.1s after back:", s2, "(expect hub, NOT daemon/warp)");

// also test wheel-past-last-panel exit
await page.locator('.mark-btn[data-project="joust"]').click();
await page.waitForTimeout(1800);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(650); }
await page.waitForTimeout(1600);
const s3 = await stateOf();
console.log("after wheel-past-end:", s3, "(expect hub, NOT stuck in daemon loop)");
await page.waitForTimeout(1500);
const s4 = await stateOf();
console.log("+1.5s:", s4);

const ok = s1 === "hub" && s2 === "hub" && s3 !== "warp";
console.log("\nRESULT:", ok ? "PASS ✓" : "FAIL ✗", "| errors:", errs.length ? errs : "none");
await browser.close();
process.exit(ok ? 0 : 1);
