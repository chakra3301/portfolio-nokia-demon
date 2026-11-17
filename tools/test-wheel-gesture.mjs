import assert from "node:assert/strict";
import { test } from "node:test";
import { createWheelGesture } from "../src/wheel-gesture.js";

const wheel = (deltaY, overrides = {}) => ({ deltaY, deltaX: 0, deltaMode: 0, ...overrides });

test("a long trackpad fling advances only once, then a fresh gesture responds", () => {
  const gesture = createWheelGesture();
  const navigation = [];
  for (let time = 0; time <= 2400; time += 16) {
    const direction = gesture.read(wheel(time < 100 ? 24 : 3), time, 900);
    if (direction) navigation.push(direction);
  }
  assert.deepEqual(navigation, [1]);
  assert.equal(gesture.read(wheel(120), 2650, 900), 1);
});

test("ordinary mouse gestures 250 ms apart each advance a section", () => {
  const gesture = createWheelGesture();
  assert.deepEqual([0, 250, 500, 750].map(time => gesture.read(wheel(120), time, 900)), [1, 1, 1, 1]);
});

test("reversing direction responds without waiting for a transition timer", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.read(wheel(120), 0, 900), 1);
  assert.equal(gesture.read(wheel(-120), 50, 900), -1);
  assert.equal(gesture.read(wheel(120), 100, 900), 1);
});

test("pixel, line, and page wheel devices can navigate with a single ordinary input", () => {
  for (const event of [wheel(48), wheel(3, { deltaMode: 1 }), wheel(1, { deltaMode: 2 })]) {
    assert.equal(createWheelGesture().read(event, 0, 900), 1);
  }
});

test("small unrelated movements cannot accumulate into a later section change", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.read(wheel(30), 0, 900), 0);
  assert.equal(gesture.read(wheel(30), 300, 900), 0);
  assert.equal(gesture.read(wheel(-30), 320, 900), 0);
  assert.equal(gesture.read(wheel(-18), 340, 900), -1);
});

test("zoom and horizontal gestures do not navigate", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.read(wheel(120, { ctrlKey: true }), 0, 900), 0);
  assert.equal(gesture.read(wheel(40, { deltaX: 120 }), 16, 900), 0);
  assert.equal(gesture.read(wheel(0), 32, 900), 0);
});

test("a gesture spent scrolling content or during a warp cannot spill into the next scene", () => {
  const gesture = createWheelGesture();
  gesture.read(wheel(20), 0, 900);
  gesture.consume();
  assert.equal(gesture.read(wheel(120), 100, 900), 0);
  assert.equal(gesture.read(wheel(120), 350, 900), 1);
});
