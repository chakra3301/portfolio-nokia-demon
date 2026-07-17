import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:5183";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.body.dataset.state === "hero");
await page.locator(".scroll-prompt").click();
await page.waitForTimeout(1200);

const dump = async (label) =>
  console.log(label, await page.evaluate(() =>
    Object.entries(window.__fx).map(([k, v]) => `${k}:${v.active ? "ON" : "off"}`).join(" ")));

await page.locator('.mark-btn[data-project="orion"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon");
await page.waitForTimeout(4000);
await dump("in orion:");
await page.locator(".daemon-back").click();
await page.waitForFunction(() => document.body.dataset.state === "hub");
await page.waitForTimeout(800);
await dump("back in hub:");
await page.locator('.mark-btn[data-project="dia"]').click();
await page.waitForFunction(() => document.body.dataset.state === "daemon");
await page.waitForTimeout(2500);
await dump("in dia:");
await browser.close();
