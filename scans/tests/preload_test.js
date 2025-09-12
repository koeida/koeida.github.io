// Preload logic unit test (Node)
// Mirrors viewer logic: PRELOAD=2, no wrap, filter images.

function isImageName(s) { return typeof s === 'string' && /\.(jpe?g|png)$/i.test(s); }

function computeKeep(images, idx, preload) {
  const n = images.length;
  const keep = new Set();
  const imgSrcAt = (i) => `images_optimized/${images[i]}`;
  if (n === 0) return keep;
  if (idx < 0 || idx >= n) throw new RangeError('idx out of range');
  // Do NOT include current image; main <img> loads it.
  for (let k = 1; k <= preload; k++) {
    const r = idx + k;
    const l = idx - k;
    if (r < n && isImageName(images[r])) keep.add(imgSrcAt(r));
    if (l >= 0 && isImageName(images[l])) keep.add(imgSrcAt(l));
  }
  return keep;
}

function assertEq(a, b, msg) {
  if (a !== b) { throw new Error(`${msg}: expected ${b}, got ${a}`); }
}

// Test cases
const PRELOAD = 2;
const images = ['0001.jpg', '0002.jpg', '0003.jpg'];

// With 3 images: neighbors only (2 each side but clamped) -> size should be 2 at ends, 2 in middle? Actually:
// - idx=0: neighbors = [1,2] => 2
// - idx=1: neighbors = [2,0] (no wrap) => [2,0] becomes [2,0]? No wrap prevents -1 and 3, so neighbors = [2,0]? Wait, without wrap, idx=1: left=0, right=2 => 2
// - idx=2: neighbors = [1,0] => 2
// Current image is handled by <img>, so total network should be current(1) + neighbors(2) = 3 visible requests.

for (let i = 0; i < images.length; i++) {
  const keep = computeKeep(images, i, PRELOAD);
  console.log(`idx ${i} -> keep.size=${keep.size}`, Array.from(keep));
  assertEq(keep.size, 2, `keep size at idx ${i}`);
}

console.log('RESULT: PASS');
