(function () {
  function exportMaskDataUrl(mask, options = {}) {
    if (!mask) return "";
    const canvas = window.MaskRefiner?.featherCanvas?.(mask, {
      featherRadius: options.featherRadius ?? 6
    }) || mask.toCanvas();
    return canvas.toDataURL("image/png");
  }

  window.MaskExporter = { exportMaskDataUrl };
})();
