/** Keep phone detection independent of viewport width and orientation. */
export function isPhoneDevice({
  userAgent = "", mobile = false, maxTouchPoints = 0,
  coarsePointer = false, screenWidth = 0, screenHeight = 0,
} = {}) {
  // Explicit phone UAs cover foldables and phones requesting a wider viewport.
  if (/iPhone|iPod|Windows Phone|Android.*Mobile|Mobile.*Android/i.test(userAgent)) return true;
  if (/Windows NT|CrOS/i.test(userAgent)) return false;
  const shortSide = Math.min(screenWidth, screenHeight);
  // Desktop-site mode may mask the UA; physical screen dimensions still identify
  // a phone in either orientation. A narrow desktop window keeps desktop access.
  return shortSide > 0 && shortSide <= 700 &&
    (mobile || (maxTouchPoints > 0 && coarsePointer));
}
