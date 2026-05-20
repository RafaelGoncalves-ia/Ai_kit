(function () {
  function colorDistance(data, offset, r, g, b, a) {
    return Math.max(
      Math.abs(data[offset] - r),
      Math.abs(data[offset + 1] - g),
      Math.abs(data[offset + 2] - b),
      Math.abs(data[offset + 3] - a)
    );
  }

  function floodFillSelection(imageData, startX, startY, tolerance = 32) {
    const width = imageData.width;
    const height = imageData.height;
    const x0 = Math.floor(startX);
    const y0 = Math.floor(startY);
    const mask = new window.SelectionMask(width, height);
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return mask;

    const data = imageData.data;
    const startOffset = (y0 * width + x0) * 4;
    const r = data[startOffset];
    const g = data[startOffset + 1];
    const b = data[startOffset + 2];
    const a = data[startOffset + 3];
    const visited = new Uint8Array(width * height);
    const stack = [[x0, y0]];

    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = y * width + x;
      if (visited[index]) continue;
      visited[index] = 1;
      if (colorDistance(data, index * 4, r, g, b, a) > tolerance) continue;
      mask.data[index] = 255;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return mask;
  }

  window.floodFillSelection = floodFillSelection;
})();
