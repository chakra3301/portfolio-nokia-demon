import test from "node:test";
import assert from "node:assert/strict";
import { budgetPixelRatio, createFrameLimiter, INSTRUMENT_MAX_PIXELS, AMBIENT_MAX_PIXELS } from "../src/render-budget.js";

for (const refresh of [60, 120, 144, 240]) {
  test(`${refresh}Hz displays render the instrument at 60fps`, () => {
    const accept = createFrameLimiter(60);
    let draws = 0;
    for (let frame = 0; frame <= refresh * 10; frame++) {
      if (accept(frame * 1000 / refresh)) draws++;
    }
    assert.ok(draws >= 590 && draws <= 601, `${draws} draws over 10 seconds`);
  });
}

test("resuming after a pause does not burst queued frames", () => {
  const accept = createFrameLimiter(60);
  assert.equal(accept(1000), true);
  assert.equal(accept(8000), true);
  assert.equal(accept(8001), false);
});

test("4K and ultrawide buffers stay within their budget; smaller buffers retain their ratio", () => {
  for (const budget of [INSTRUMENT_MAX_PIXELS, AMBIENT_MAX_PIXELS]) {
    for (const [w, h] of [[1440, 900], [3840, 2160], [5120, 1440]]) {
      const ratio = budgetPixelRatio(w, h, 1.75, budget);
      assert.ok(Math.floor(w * ratio) * Math.floor(h * ratio) <= budget);
      assert.ok(Math.round(w * ratio) * Math.round(h * ratio) <= budget);
      assert.ok(ratio <= 1.75);
    }
  }
  assert.equal(budgetPixelRatio(1440, 900, 1.75, INSTRUMENT_MAX_PIXELS), 1.75);
  assert.equal(budgetPixelRatio(1440, 900, 1.15, AMBIENT_MAX_PIXELS), 1.15);
});
