(function () {
  function getRoi(points, width, height, padding = 40) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      left: Math.max(0, Math.floor(Math.min(...xs) - padding)),
      top: Math.max(0, Math.floor(Math.min(...ys) - padding)),
      right: Math.min(width - 1, Math.ceil(Math.max(...xs) + padding)),
      bottom: Math.min(height - 1, Math.ceil(Math.max(...ys) + padding))
    };
  }

  function pointInGuide(guideMask, x, y) {
    if (!guideMask?.data) return true;
    if (x < 0 || y < 0 || x >= guideMask.width || y >= guideMask.height) return false;
    return guideMask.data[y * guideMask.width + x] > 0;
  }

  function findSeedPoint(imageData, positivePoint, guideMask, roi) {
    const width = imageData.width;
    const height = imageData.height;
    const startX = Math.max(0, Math.min(width - 1, Math.round(positivePoint?.x ?? (roi.left + roi.right) / 2)));
    const startY = Math.max(0, Math.min(height - 1, Math.round(positivePoint?.y ?? (roi.top + roi.bottom) / 2)));
    const maxRadius = Math.max(4, Math.ceil(Math.max(roi.right - roi.left, roi.bottom - roi.top) / 2));
    for (let radius = 0; radius <= maxRadius; radius += 3) {
      for (let y = Math.max(roi.top, startY - radius); y <= Math.min(roi.bottom, startY + radius); y += 1) {
        for (let x = Math.max(roi.left, startX - radius); x <= Math.min(roi.right, startX + radius); x += 1) {
          if (Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) continue;
          const index = (y * width + x) * 4;
          if (imageData.data[index + 3] > 8 && pointInGuide(guideMask, x, y)) {
            return { x, y };
          }
        }
      }
    }
    return { x: startX, y: startY };
  }

  function sampleAverage(imageData, points) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    points.forEach((point) => {
      const x = Math.max(0, Math.min(width - 1, Math.round(point.x)));
      const y = Math.max(0, Math.min(height - 1, Math.round(point.y)));
      const index = (y * width + x) * 4;
      if (data[index + 3] <= 8) return;
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      count += 1;
    });
    return count ? { r: r / count, g: g / count, b: b / count } : { r: 0, g: 0, b: 0 };
  }

  function distance(data, index, color) {
    const dr = data[index] - color.r;
    const dg = data[index + 1] - color.g;
    const db = data[index + 2] - color.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function scheduleChunk() {
    return new Promise((resolve) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(resolve, { timeout: 40 });
        return;
      }
      window.setTimeout(resolve, 0);
    });
  }

  async function segment({ imageData, points = [], positivePoint = null, bounds = null, guideMask = null, SelectionMask }) {
    if (!imageData || !SelectionMask) return null;
    const width = imageData.width;
    const height = imageData.height;
    const seedSource = positivePoint || points[0] || null;
    const roi = bounds
      ? {
        left: Math.max(0, Math.floor(Number(bounds.left || 0))),
        top: Math.max(0, Math.floor(Number(bounds.top || 0))),
        right: Math.min(width - 1, Math.ceil(Number(bounds.left || 0) + Number(bounds.width || 0))),
        bottom: Math.min(height - 1, Math.ceil(Number(bounds.top || 0) + Number(bounds.height || 0)))
      }
      : getRoi(points.length ? points : [seedSource || { x: width / 2, y: height / 2 }], width, height, Math.max(36, Math.round(Math.min(width, height) * 0.04)));
    const seed = findSeedPoint(imageData, seedSource, guideMask, roi);
    const color = sampleAverage(imageData, [seed]);
    const mask = new SelectionMask(width, height);
    const tolerance = 78;
    const queue = [seed];
    const visited = new Uint8Array(width * height);
    let processed = 0;
    while (queue.length) {
      const point = queue.shift();
      const x = point.x;
      const y = point.y;
      if (x < roi.left || y < roi.top || x > roi.right || y > roi.bottom) continue;
      const maskIndex = y * width + x;
      if (visited[maskIndex]) continue;
      visited[maskIndex] = 1;
      if (!pointInGuide(guideMask, x, y)) continue;
      const index = maskIndex * 4;
      if (imageData.data[index + 3] <= 8 || distance(imageData.data, index, color) > tolerance) continue;
      mask.data[maskIndex] = 255;
      queue.push({ x: x + 1, y });
      queue.push({ x: x - 1, y });
      queue.push({ x, y: y + 1 });
      queue.push({ x, y: y - 1 });
      processed += 1;
      if (processed % 14000 === 0) {
        await scheduleChunk();
      }
    }

    mask.roi = roi;
    return mask.isEmpty() ? null : mask;
  }

  window.ClipsegService = { segment };
})();
