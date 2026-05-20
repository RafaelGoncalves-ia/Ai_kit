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

  async function segment({ imageData, points = [], SelectionMask }) {
    if (!imageData || !points.length || !SelectionMask) return null;
    const width = imageData.width;
    const height = imageData.height;
    const roi = getRoi(points, width, height, Math.max(36, Math.round(Math.min(width, height) * 0.04)));
    const color = sampleAverage(imageData, points);
    const mask = new SelectionMask(width, height);
    const tolerance = 72;
    let processed = 0;
    for (let y = roi.top; y <= roi.bottom; y += 1) {
      for (let x = roi.left; x <= roi.right; x += 1) {
        const index = (y * width + x) * 4;
        if (imageData.data[index + 3] <= 8) continue;
        if (distance(imageData.data, index, color) <= tolerance) {
          mask.data[y * width + x] = 255;
        }
        processed += 1;
        if (processed % 14000 === 0) {
          await scheduleChunk();
        }
      }
    }

    mask.roi = roi;
    return mask.isEmpty() ? null : mask;
  }

  window.ClipsegService = { segment };
})();
