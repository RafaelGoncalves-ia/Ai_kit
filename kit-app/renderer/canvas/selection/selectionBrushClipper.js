(function () {
  function applyBrushLayer(targetCtx, strokeCanvas, clipCanvas, compositeOperation = "source-over") {
    const workCanvas = document.createElement("canvas");
    workCanvas.width = strokeCanvas.width;
    workCanvas.height = strokeCanvas.height;
    const workCtx = workCanvas.getContext("2d");
    workCtx.drawImage(strokeCanvas, 0, 0);
    if (clipCanvas) {
      workCtx.globalCompositeOperation = "destination-in";
      workCtx.drawImage(clipCanvas, 0, 0, workCanvas.width, workCanvas.height);
    }
    targetCtx.save();
    targetCtx.globalCompositeOperation = compositeOperation;
    targetCtx.globalAlpha = 1;
    targetCtx.drawImage(workCanvas, 0, 0);
    targetCtx.restore();
  }

  window.SelectionBrushClipper = { applyBrushLayer };
})();
