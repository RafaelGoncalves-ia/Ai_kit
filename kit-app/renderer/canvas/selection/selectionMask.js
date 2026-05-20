(function () {
  class SelectionMask {
    constructor(width, height, options = {}) {
      this.width = Math.max(1, Math.round(Number(width || 1)));
      this.height = Math.max(1, Math.round(Number(height || 1)));
      this.offsetX = Math.round(Number(options.offsetX || 0));
      this.offsetY = Math.round(Number(options.offsetY || 0));
      this.data = options.data instanceof Uint8ClampedArray
        ? new Uint8ClampedArray(options.data)
        : new Uint8ClampedArray(this.width * this.height);
    }

    clone() {
      return new SelectionMask(this.width, this.height, {
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        data: this.data
      });
    }

    index(x, y) {
      return Math.round(y) * this.width + Math.round(x);
    }

    contains(x, y) {
      const px = Math.floor(Number(x) - this.offsetX);
      const py = Math.floor(Number(y) - this.offsetY);
      return px >= 0 && py >= 0 && px < this.width && py < this.height && this.data[this.index(px, py)] > 0;
    }

    set(x, y, value = 255) {
      const px = Math.floor(Number(x) - this.offsetX);
      const py = Math.floor(Number(y) - this.offsetY);
      if (px >= 0 && py >= 0 && px < this.width && py < this.height) {
        this.data[this.index(px, py)] = value > 0 ? 255 : 0;
      }
    }

    invert() {
      const output = this.clone();
      for (let index = 0; index < output.data.length; index += 1) {
        output.data[index] = output.data[index] > 0 ? 0 : 255;
      }
      return output;
    }

    isEmpty() {
      return !this.data.some((value) => value > 0);
    }

    countPixels() {
      let count = 0;
      for (let index = 0; index < this.data.length; index += 1) {
        if (this.data[index] > 0) count += 1;
      }
      return count;
    }

    getBounds() {
      let minX = this.width;
      let minY = this.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          if (!this.data[this.index(x, y)]) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) return null;
      return {
        left: minX + this.offsetX,
        top: minY + this.offsetY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    }

    toCanvas(options = {}) {
      const canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(this.width, this.height);
      const foreground = options.foreground || [255, 255, 255];
      const background = options.background || [0, 0, 0];
      const foregroundAlpha = options.foregroundAlpha == null ? 255 : Number(options.foregroundAlpha);
      const backgroundAlpha = options.backgroundAlpha == null ? 255 : Number(options.backgroundAlpha);
      for (let index = 0; index < this.data.length; index += 1) {
        const maskAlpha = this.data[index];
        const allowed = maskAlpha > 0;
        const out = index * 4;
        imageData.data[out] = allowed ? foreground[0] : background[0];
        imageData.data[out + 1] = allowed ? foreground[1] : background[1];
        imageData.data[out + 2] = allowed ? foreground[2] : background[2];
        imageData.data[out + 3] = allowed ? Math.round(foregroundAlpha * (maskAlpha / 255)) : backgroundAlpha;
      }
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }

    toImageData() {
      const canvas = this.toCanvas();
      return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    }

    toDataURL(type = "image/png") {
      return this.toCanvas().toDataURL(type);
    }

    static fromRect(width, height, rect, options = {}) {
      const mask = new SelectionMask(width, height, options);
      const left = Math.floor(Number(rect.left || 0));
      const top = Math.floor(Number(rect.top || 0));
      const right = Math.ceil(left + Number(rect.width || 0));
      const bottom = Math.ceil(top + Number(rect.height || 0));
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) mask.set(x, y, 255);
      }
      return mask;
    }

    static fromEllipse(width, height, rect, options = {}) {
      const mask = new SelectionMask(width, height, options);
      const cx = Number(rect.left || 0) + Number(rect.width || 0) / 2;
      const cy = Number(rect.top || 0) + Number(rect.height || 0) / 2;
      const rx = Math.max(0.5, Number(rect.width || 0) / 2);
      const ry = Math.max(0.5, Number(rect.height || 0) / 2);
      const left = Math.floor(cx - rx);
      const top = Math.floor(cy - ry);
      const right = Math.ceil(cx + rx);
      const bottom = Math.ceil(cy + ry);
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny <= 1) mask.set(x, y, 255);
        }
      }
      return mask;
    }

    static fromPolygon(width, height, points = [], options = {}) {
      const mask = new SelectionMask(width, height, options);
      if (!Array.isArray(points) || points.length < 3) return mask;
      const minX = Math.floor(Math.min(...points.map((point) => Number(point.x || 0))));
      const maxX = Math.ceil(Math.max(...points.map((point) => Number(point.x || 0))));
      const minY = Math.floor(Math.min(...points.map((point) => Number(point.y || 0))));
      const maxY = Math.ceil(Math.max(...points.map((point) => Number(point.y || 0))));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          let inside = false;
          for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
            const xi = Number(points[i].x || 0);
            const yi = Number(points[i].y || 0);
            const xj = Number(points[j].x || 0);
            const yj = Number(points[j].y || 0);
            const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi;
            if (intersects) inside = !inside;
          }
          if (inside) mask.set(x, y, 255);
        }
      }
      return mask;
    }
  }

  window.SelectionMask = SelectionMask;
})();
