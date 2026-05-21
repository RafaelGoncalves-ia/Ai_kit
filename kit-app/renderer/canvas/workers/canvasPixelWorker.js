function makeMask(width, height) {
  return new Uint8ClampedArray(Math.max(1, width * height));
}

function floodFill(imageData, startX, startY, tolerance = 32) {
  const width = imageData.width;
  const height = imageData.height;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  const mask = makeMask(width, height);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return { width, height, data: mask };

  const data = imageData.data;
  const startOffset = (y0 * width + x0) * 4;
  const target = [data[startOffset], data[startOffset + 1], data[startOffset + 2], data[startOffset + 3]];
  const visited = new Uint8Array(width * height);
  const stack = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const index = y * width + x;
    if (visited[index]) continue;
    visited[index] = 1;
    const offset = index * 4;
    const distance = Math.max(
      Math.abs(data[offset] - target[0]),
      Math.abs(data[offset + 1] - target[1]),
      Math.abs(data[offset + 2] - target[2]),
      Math.abs(data[offset + 3] - target[3])
    );
    if (distance > tolerance) continue;
    mask[index] = 255;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { width, height, data: mask };
}

function strokeMask(width, height, points = []) {
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : null;
  if (!canvas || points.length < 2) {
    return { width, height, data: makeMask(width, height) };
  }
  const xs = points.map((point) => Number(point.x || 0));
  const ys = points.map((point) => Number(point.y || 0));
  const brushWidth = Math.max(24, Math.min(96, Math.round(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.18)));
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushWidth;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = makeMask(width, height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = imageData.data[index * 4 + 3] > 8 ? 255 : 0;
  }
  return { width, height, data: mask };
}

function countMask(maskData) {
  let count = 0;
  for (let index = 0; index < maskData.length; index += 1) {
    if (maskData[index] > 0) count += 1;
  }
  return count;
}

function featherImageData(imageData, radius = 6) {
  if (typeof OffscreenCanvas === "undefined") return imageData;
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const source = new OffscreenCanvas(imageData.width, imageData.height);
  source.getContext("2d").putImageData(imageData, 0, 0);
  const ctx = canvas.getContext("2d");
  ctx.filter = `blur(${Math.max(0, Math.round(radius))}px)`;
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, imageData.width, imageData.height);
}

function cropMaskToImageData(payload = {}) {
  const sourceWidth = Math.max(1, Math.round(Number(payload.width || 1)));
  const sourceHeight = Math.max(1, Math.round(Number(payload.height || 1)));
  const sx = Math.max(0, Math.round(Number(payload.sx || 0)));
  const sy = Math.max(0, Math.round(Number(payload.sy || 0)));
  const sw = Math.max(1, Math.round(Number(payload.sw || 1)));
  const sh = Math.max(1, Math.round(Number(payload.sh || 1)));
  const maskData = payload.maskData || new Uint8ClampedArray(sourceWidth * sourceHeight);
  const imageData = new ImageData(sw, sh);
  for (let y = 0; y < sh; y += 1) {
    const sourceY = sy + y;
    if (sourceY < 0 || sourceY >= sourceHeight) continue;
    for (let x = 0; x < sw; x += 1) {
      const sourceX = sx + x;
      if (sourceX < 0 || sourceX >= sourceWidth) continue;
      const alpha = maskData[sourceY * sourceWidth + sourceX] || 0;
      if (alpha <= 0) continue;
      const offset = (y * sw + x) * 4;
      imageData.data[offset] = 255;
      imageData.data[offset + 1] = 255;
      imageData.data[offset + 2] = 255;
      imageData.data[offset + 3] = alpha;
    }
  }
  return { imageData };
}

function transformMask(maskData, width, height, expandPx = 0) {
  const radius = Math.abs(Math.round(Number(expandPx || 0)));
  if (!radius) return maskData;
  const output = makeMask(width, height);
  const expand = Number(expandPx || 0) > 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = expand ? 0 : 255;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
          const sample = maskData[yy * width + xx] || 0;
          value = expand ? Math.max(value, sample) : Math.min(value, sample);
        }
      }
      output[y * width + x] = value;
    }
  }
  return output;
}

function makeImageDataFromMask(maskData, width, height) {
  const imageData = new ImageData(width, height);
  for (let index = 0; index < maskData.length; index += 1) {
    const alpha = maskData[index] || 0;
    if (alpha <= 0) continue;
    const offset = index * 4;
    imageData.data[offset] = 255;
    imageData.data[offset + 1] = 255;
    imageData.data[offset + 2] = 255;
    imageData.data[offset + 3] = alpha;
  }
  return imageData;
}

function softMaskToImageData(payload = {}) {
  const sourceWidth = Math.max(1, Math.round(Number(payload.width || 1)));
  const sourceHeight = Math.max(1, Math.round(Number(payload.height || 1)));
  const sx = Math.max(0, Math.round(Number(payload.sx || 0)));
  const sy = Math.max(0, Math.round(Number(payload.sy || 0)));
  const sw = Math.max(1, Math.round(Number(payload.sw || sourceWidth)));
  const sh = Math.max(1, Math.round(Number(payload.sh || sourceHeight)));
  const featherPx = Math.max(0, Math.round(Number(payload.featherPx || 0)));
  const expandPx = Math.round(Number(payload.expandPx || 0));
  let maskData = payload.maskData || new Uint8ClampedArray(sourceWidth * sourceHeight);
  maskData = transformMask(maskData, sourceWidth, sourceHeight, expandPx);

  let sourceImageData = makeImageDataFromMask(maskData, sourceWidth, sourceHeight);
  if (featherPx > 0 && typeof OffscreenCanvas !== "undefined") {
    const source = new OffscreenCanvas(sourceWidth, sourceHeight);
    source.getContext("2d").putImageData(sourceImageData, 0, 0);
    const blurred = new OffscreenCanvas(sourceWidth, sourceHeight);
    const ctx = blurred.getContext("2d");
    ctx.filter = `blur(${featherPx}px)`;
    ctx.drawImage(source, 0, 0);
    sourceImageData = ctx.getImageData(0, 0, sourceWidth, sourceHeight);
  }

  const cropped = new ImageData(sw, sh);
  for (let y = 0; y < sh; y += 1) {
    const sourceY = sy + y;
    if (sourceY < 0 || sourceY >= sourceHeight) continue;
    for (let x = 0; x < sw; x += 1) {
      const sourceX = sx + x;
      if (sourceX < 0 || sourceX >= sourceWidth) continue;
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (y * sw + x) * 4;
      cropped.data[targetOffset] = sourceImageData.data[sourceOffset];
      cropped.data[targetOffset + 1] = sourceImageData.data[sourceOffset + 1];
      cropped.data[targetOffset + 2] = sourceImageData.data[sourceOffset + 2];
      cropped.data[targetOffset + 3] = sourceImageData.data[sourceOffset + 3];
    }
  }
  return { imageData: cropped };
}

self.onmessage = (event) => {
  const { id, type, payload = {} } = event.data || {};
  try {
    let result = null;
    if (type === "floodFill") {
      result = floodFill(payload.imageData, payload.x, payload.y, payload.tolerance);
    } else if (type === "strokeMask") {
      result = strokeMask(payload.width, payload.height, payload.points || []);
    } else if (type === "countMask") {
      result = countMask(payload.maskData || new Uint8ClampedArray());
    } else if (type === "featherImageData") {
      result = featherImageData(payload.imageData, payload.radius || 6);
    } else if (type === "cropMaskToImageData") {
      result = cropMaskToImageData(payload);
    } else if (type === "softMaskToImageData") {
      result = softMaskToImageData(payload);
    } else {
      throw new Error(`Operacao desconhecida: ${type}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
