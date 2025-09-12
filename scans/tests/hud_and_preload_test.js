// Tests for HUD formatting and preload logic using the same utils as the viewer.
const { isImageName, computePreloadKeep, formatHud } = require('../viewer_utils.js');

function assertEq(actual, expected, msg) {
  if (actual !== expected) { throw new Error(`${msg}: expected ${expected}, got ${actual}`); }
}

(function run() {
  const images = ['0001.jpg', '0002.jpg', '0003.jpg'];
  // Filter sanity
  const filtered = images.filter(isImageName);
  assertEq(filtered.length, 3, 'filtered length');

  // HUD formatting
  assertEq(formatHud(0, images), '1/3  0001.jpg', 'HUD at idx 0');
  assertEq(formatHud(1, images), '2/3  0002.jpg', 'HUD at idx 1');
  assertEq(formatHud(2, images), '3/3  0003.jpg', 'HUD at idx 2');

  // Preload window: excludes current image; neighbors only, no wrap
  const base = 'images_optimized/';
  let keep = computePreloadKeep(images, 0, 2, base);
  assertEq(keep.size, 2, 'keep size at 0');
  keep = computePreloadKeep(images, 1, 2, base);
  assertEq(keep.size, 2, 'keep size at 1');
  keep = computePreloadKeep(images, 2, 2, base);
  assertEq(keep.size, 2, 'keep size at 2');

  console.log('RESULT: PASS');
})();

