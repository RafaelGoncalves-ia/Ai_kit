(function () {
  class SelectionManager {
    constructor(options = {}) {
      this.mask = null;
      this.listeners = new Set();
      this.width = Math.max(1, Number(options.width || 1));
      this.height = Math.max(1, Number(options.height || 1));
      this.offsetX = Number(options.offsetX || 0);
      this.offsetY = Number(options.offsetY || 0);
      this.maskCanvasCache = null;
      this.maskCanvasCacheKey = "";
    }

    setGeometry(width, height, offsetX = 0, offsetY = 0) {
      this.width = Math.max(1, Math.round(Number(width || 1)));
      this.height = Math.max(1, Math.round(Number(height || 1)));
      this.offsetX = Math.round(Number(offsetX || 0));
      this.offsetY = Math.round(Number(offsetY || 0));
      this.maskCanvasCache = null;
      this.maskCanvasCacheKey = "";
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      this.listeners.forEach((listener) => listener(this));
    }

    apply(mask, options = "replace") {
      const mode = typeof options === "string" ? options : (options?.mode || "replace");
      console.info(`[SELECTION] apply mask ${mode}`);
      if (mode === "invert") {
        const base = this.mask || new window.SelectionMask(this.width, this.height, {
          offsetX: this.offsetX,
          offsetY: this.offsetY
        });
        this.mask = base.invert();
      } else {
        this.mask = window.SelectionOps.compose(this.mask, mask, mode);
      }
      if (this.mask?.isEmpty?.()) {
        this.mask = null;
      }
      if (!this.mask && mode === "subtract") {
        console.info("[SELECTION] mask empty after subtract");
      }
      this.maskCanvasCache = null;
      this.maskCanvasCacheKey = "";
      if (this.mask) {
        console.info("[SELECTION] mask set");
        console.info("[SELECTION] mask bounds", this.getSelectionBounds());
        console.info("[SELECTION] mask pixels count", this.mask.countPixels?.() ?? 0);
      } else {
        console.info("[SELECTION] cleared");
      }
      this.emit();
      return this.mask;
    }

    applyMask(mask, options = {}) { return this.apply(mask, options); }
    setMask(mask, options = {}) { return this.apply(mask, options.mode || "replace"); }
    replace(mask) { return this.apply(mask, "replace"); }
    add(mask) { return this.apply(mask, "add"); }
    subtract(mask) { return this.apply(mask, "subtract"); }
    intersect(mask) { return this.apply(mask, "intersect"); }
    invert() { return this.apply(null, "invert"); }
    clear() { return this.apply(null, "clear"); }
    hasSelection() { return Boolean(this.mask && !this.mask.isEmpty()); }
    getActiveMask() { return this.getMask(); }
    getMask() { return this.hasSelection() ? this.mask : null; }
    getBounds() { return this.getSelectionBounds(); }
    getSelectionBounds() { return this.getMask()?.getBounds() || null; }
    getMaskBounds() { return this.getSelectionBounds(); }
    getMaskCanvas() {
      const mask = this.getActiveMask();
      if (!mask) return null;
      const key = `${mask.width}x${mask.height}:${mask.offsetX},${mask.offsetY}`;
      if (this.maskCanvasCache && this.maskCanvasCacheKey === key) {
        return this.maskCanvasCache;
      }
      this.maskCanvasCache = mask.toCanvas({
        foreground: [255, 255, 255],
        background: [0, 0, 0],
        foregroundAlpha: 255,
        backgroundAlpha: 0
      });
      this.maskCanvasCacheKey = key;
      return this.maskCanvasCache;
    }
    isPixelSelected(x, y) { return !this.hasSelection() || this.mask.contains(x, y); }
    allowsScenePoint(x, y) { return this.isPixelSelected(x, y); }
    applyMaskToImageData(imageData, bounds = {}) {
      const mask = this.getActiveMask();
      if (!mask || !imageData) return imageData;
      const left = Math.round(Number(bounds.left || 0));
      const top = Math.round(Number(bounds.top || 0));
      for (let y = 0; y < imageData.height; y += 1) {
        for (let x = 0; x < imageData.width; x += 1) {
          if (!mask.contains(left + x, top + y)) {
            imageData.data[(y * imageData.width + x) * 4 + 3] = 0;
          }
        }
      }
      return imageData;
    }
    copyMaskedPixels(sourceImageData, bounds = {}) {
      const output = new ImageData(sourceImageData.width, sourceImageData.height);
      output.data.set(sourceImageData.data);
      return this.applyMaskToImageData(output, bounds);
    }
    cutMaskedPixels(targetImageData, bounds = {}) {
      const mask = this.getActiveMask();
      if (!mask || !targetImageData) return targetImageData;
      const left = Math.round(Number(bounds.left || 0));
      const top = Math.round(Number(bounds.top || 0));
      for (let y = 0; y < targetImageData.height; y += 1) {
        for (let x = 0; x < targetImageData.width; x += 1) {
          if (mask.contains(left + x, top + y)) {
            targetImageData.data[(y * targetImageData.width + x) * 4 + 3] = 0;
          }
        }
      }
      return targetImageData;
    }
    exportMaskPng(bounds = null) {
      const mask = this.getActiveMask();
      if (!mask) return "";
      if (!bounds) return mask.toDataURL("image/png");
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(Number(bounds.width || 1)));
      canvas.height = Math.max(1, Math.round(Number(bounds.height || 1)));
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const selected = mask.contains(Number(bounds.left || 0) + x, Number(bounds.top || 0) + y);
          const index = (y * canvas.width + x) * 4;
          imageData.data[index] = selected ? 255 : 0;
          imageData.data[index + 1] = selected ? 255 : 0;
          imageData.data[index + 2] = selected ? 255 : 0;
          imageData.data[index + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL("image/png");
    }
    exportBlackWhiteCanvas() {
      return this.hasSelection()
        ? this.mask.toCanvas()
        : new window.SelectionMask(this.width, this.height, { offsetX: this.offsetX, offsetY: this.offsetY }).toCanvas();
    }
  }

  window.CanvasSelectionManager = SelectionManager;
})();
