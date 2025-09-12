// Viewer utilities shared by index.html and tests.
// UMD-style export for both browser and Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ViewerUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isImageName(s) {
    return typeof s === 'string' && /\.(jpe?g|png)$/i.test(s);
  }

  function imgSrcAt(images, i, base) {
    return `${base}${images[i]}`;
  }

  // Compute neighbor preload set without wrapping. Excludes current image.
  function computePreloadKeep(images, idx, preload, base = 'images_optimized/') {
    const n = images.length;
    const keep = new Set();
    if (n === 0) return keep;
    if (idx < 0 || idx >= n) throw new RangeError('idx out of range');
    for (let k = 1; k <= preload; k++) {
      const r = idx + k;
      const l = idx - k;
      if (r < n && isImageName(images[r])) keep.add(imgSrcAt(images, r, base));
      if (l >= 0 && isImageName(images[l])) keep.add(imgSrcAt(images, l, base));
    }
    return keep;
  }

  function formatHud(idx, images) {
    if (!images || !images.length) return '';
    const i = Math.max(0, Math.min(images.length - 1, idx));
    return `${i + 1}/${images.length}  ${images[i]}`;
  }

  return { isImageName, computePreloadKeep, formatHud };
});

