(function () {
  function refine(mask, options = {}) {
    if (!mask || !window.SelectionMask) return mask;
    const radius = Math.max(0, Math.round(Number(options.smoothRadius ?? 3)));
    if (radius <= 0) return mask.clone();

    const source = mask.toCanvas();
    const blur = document.createElement("canvas");
    blur.width = source.width;
    blur.height = source.height;
    const blurCtx = blur.getContext("2d");
    blurCtx.filter = `blur(${radius}px)`;
    blurCtx.drawImage(source, 0, 0);

    const data = blurCtx.getImageData(0, 0, blur.width, blur.height);
    const output = new window.SelectionMask(mask.width, mask.height, {
      offsetX: mask.offsetX,
      offsetY: mask.offsetY
    });
    const threshold = Math.max(1, Math.min(254, Number(options.threshold ?? 96)));
    for (let index = 0; index < output.data.length; index += 1) {
      output.data[index] = data.data[index * 4] >= threshold ? 255 : 0;
    }
    return output.isEmpty() ? mask.clone() : output;
  }

  function featherCanvas(mask, options = {}) {
    if (!mask) return null;
    const radius = Math.max(0, Math.round(Number(options.featherRadius ?? 6)));
    const canvas = mask.toCanvas();
    if (radius <= 0) return canvas;
    const feather = document.createElement("canvas");
    feather.width = canvas.width;
    feather.height = canvas.height;
    const ctx = feather.getContext("2d");
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(canvas, 0, 0);
    return feather;
  }

  window.MaskRefiner = { refine, featherCanvas };
})();
