(function () {
  class MarchingAntsRenderer {
    constructor(fabricCanvas) {
      this.canvas = fabricCanvas;
      this.overlay = null;
      this.timer = null;
      this.dashOffset = 0;
    }

    setOverlay(overlay) {
      this.overlay = overlay;
      this.start();
    }

    clear() {
      this.overlay = null;
      this.stop();
    }

    start() {
      if (this.timer || !this.overlay) return;
      this.timer = window.setInterval(() => {
        if (!this.overlay) return;
        this.dashOffset = (this.dashOffset + 1) % 16;
        this.overlay.set?.("strokeDashOffset", -this.dashOffset);
        this.canvas?.requestRenderAll?.();
      }, 90);
    }

    stop() {
      if (this.timer) window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  window.MarchingAntsRenderer = MarchingAntsRenderer;
})();
