import { isPhoneDevice } from "./device-support.js";

const phone = isPhoneDevice({
  userAgent: navigator.userAgent,
  mobile: navigator.userAgentData?.mobile,
  maxTouchPoints: navigator.maxTouchPoints,
  coarsePointer: matchMedia("(pointer: coarse)").matches,
  screenWidth: screen.width,
  screenHeight: screen.height,
});

if (phone) {
  document.documentElement.classList.add("phone-only");
  document.body.dataset.state = "phone-only";
  document.querySelector("#device-notice").hidden = false;
  document.querySelector(".skip-link").hidden = true;
} else {
  document.querySelector("#main").hidden = false;
  // Phones never fetch/execute Three.js, GSAP, media, or the background SDK.
  import("./main.js");
}
