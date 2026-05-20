(function () {
  const COLORS = {
    blue: "#00AFFF",
    purple: "#8A2CFF",
    glow: "#DCCBFF"
  };

  class AiSelectionEffectsRenderer {
    constructor(fabricCanvas, options = {}) {
      this.canvas = fabricCanvas;
      this.host = options.host || document.body;
      this.element = document.createElement("canvas");
      this.element.className = "ai-selection-effects-canvas";
      this.element.style.position = "fixed";
      this.element.style.pointerEvents = "none";
      this.element.style.zIndex = "30";
      this.element.hidden = true;
      this.ctx = this.element.getContext("2d");
      this.mode = "idle";
      this.points = [];
      this.mask = null;
      this.maskCanvas = null;
      this.bounds = null;
      this.statusText = "Editando com IA...";
      this.particles = [];
      this.raf = null;
      this.lastTime = 0;
      this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      this.paused = false;
      this.visibilityHandler = () => {
        this.paused = document.hidden || !document.hasFocus();
        if (!this.paused && this.mode !== "idle") this.start();
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
      window.addEventListener("blur", this.visibilityHandler);
      window.addEventListener("focus", this.visibilityHandler);
      this.host.appendChild(this.element);
    }

    sceneToViewport(point) {
      const transform = this.canvas?.viewportTransform || [1, 0, 0, 1, 0, 0];
      const rect = this.canvas?.upperCanvasEl?.getBoundingClientRect?.() || this.canvas?.lowerCanvasEl?.getBoundingClientRect?.();
      return {
        x: (rect?.left || 0) + point.x * transform[0] + transform[4],
        y: (rect?.top || 0) + point.y * transform[3] + transform[5]
      };
    }

    setViewportBox(bounds) {
      const pad = 42;
      const tl = this.sceneToViewport({ x: bounds.left, y: bounds.top });
      const br = this.sceneToViewport({ x: bounds.left + bounds.width, y: bounds.top + bounds.height });
      const left = Math.floor(Math.min(tl.x, br.x) - pad);
      const top = Math.floor(Math.min(tl.y, br.y) - pad);
      const width = Math.ceil(Math.abs(br.x - tl.x) + pad * 2);
      const height = Math.ceil(Math.abs(br.y - tl.y) + pad * 2);
      const nextWidth = Math.max(1, width);
      const nextHeight = Math.max(1, height);
      const nextLeft = `${left}px`;
      const nextTop = `${top}px`;
      const nextCssWidth = `${nextWidth}px`;
      const nextCssHeight = `${nextHeight}px`;
      if (this.element.style.left !== nextLeft) this.element.style.left = nextLeft;
      if (this.element.style.top !== nextTop) this.element.style.top = nextTop;
      if (this.element.style.width !== nextCssWidth) this.element.style.width = nextCssWidth;
      if (this.element.style.height !== nextCssHeight) this.element.style.height = nextCssHeight;
      if (this.element.width !== nextWidth) this.element.width = nextWidth;
      if (this.element.height !== nextHeight) this.element.height = nextHeight;
      this.localOffset = { x: left, y: top };
      this.element.hidden = false;
    }

    syncToCanvas() {
      if (this.mode === "idle" || !this.bounds) return;
      this.setViewportBox(this.bounds);
    }

    startGesture(point) {
      console.info("[AI_EFFECTS] start drawing");
      this.mode = "gesture";
      this.points = [point];
      this.bounds = { left: point.x, top: point.y, width: 1, height: 1 };
      this.particles = [];
      this.setViewportBox(this.bounds);
      this.start();
    }

    setState(state = "idle") {
      this.mode = state === "drawing" ? "gesture" : state;
      if (this.mode === "idle" || this.mode === "cancelled" || this.mode === "error") {
        this.clear();
        return;
      }
      this.start();
    }

    setStrokePoints(points = []) {
      this.points = points.slice();
      if (this.points.length) {
        const xs = this.points.map((item) => item.x);
        const ys = this.points.map((item) => item.y);
        this.bounds = {
          left: Math.min(...xs),
          top: Math.min(...ys),
          width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
          height: Math.max(1, Math.max(...ys) - Math.min(...ys))
        };
        this.setViewportBox(this.bounds);
      }
    }

    setMask(mask) {
      this.showSelection(mask);
    }

    updateGesture(point) {
      if (this.mode !== "gesture") return;
      console.info("[AI_EFFECTS] update stroke");
      this.points.push(point);
      const xs = this.points.map((item) => item.x);
      const ys = this.points.map((item) => item.y);
      this.bounds = {
        left: Math.min(...xs),
        top: Math.min(...ys),
        width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        height: Math.max(1, Math.max(...ys) - Math.min(...ys))
      };
      this.setViewportBox(this.bounds);
      if (!this.reducedMotion) {
        const viewport = this.sceneToViewport(point);
        this.particles.push({
          x: viewport.x - this.localOffset.x,
          y: viewport.y - this.localOffset.y,
          life: 1,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -Math.random() * 0.8
        });
      }
    }

    showSelection(mask) {
      this.mode = "selection";
      this.mask = mask;
      this.maskCanvas = mask?.toCanvas?.({
        foreground: [0, 175, 255],
        background: [0, 0, 0],
        foregroundAlpha: 255,
        backgroundAlpha: 0
      }) || null;
      console.info("[AI_EFFECTS] set mask");
      this.bounds = mask?.getBounds?.();
      if (!this.bounds) return;
      this.setViewportBox(this.bounds);
      this.start();
    }

    showGenerating(mask) {
      this.mode = "generating";
      this.mask = mask;
      this.maskCanvas = mask?.toCanvas?.({
        foreground: [0, 175, 255],
        background: [0, 0, 0],
        foregroundAlpha: 255,
        backgroundAlpha: 0
      }) || null;
      this.bounds = mask?.getBounds?.() || this.bounds;
      if (!this.bounds) return;
      this.setViewportBox(this.bounds);
      this.start();
    }

    setStatus(text = "") {
      if (text) {
        this.statusText = text;
      }
      if (this.mode !== "idle") {
        this.start();
      }
    }

    completeFlash(mask) {
      this.mode = "complete";
      this.mask = mask;
      this.maskCanvas = mask?.toCanvas?.({
        foreground: [0, 175, 255],
        background: [0, 0, 0],
        foregroundAlpha: 255,
        backgroundAlpha: 0
      }) || null;
      this.bounds = mask?.getBounds?.() || this.bounds;
      if (!this.bounds) return;
      this.setViewportBox(this.bounds);
      this.start();
      window.setTimeout(() => this.clear(), 520);
    }

    start() {
      if (this.raf || this.paused) return;
      const tick = (time) => {
        this.raf = null;
        if (this.paused || this.mode === "idle") return;
        this.draw(time || performance.now());
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }

    draw(time) {
      if (this.mode !== "idle") {
        console.debug?.("[AI_EFFECTS] render frame");
      }
      const ctx = this.ctx;
      const width = this.element.width;
      const height = this.element.height;
      ctx.clearRect(0, 0, width, height);
      const phase = time / 1000;

      if (this.mode === "gesture" || this.mode === "segmenting") this.drawGesture(ctx);
      if (this.mode === "selection" || this.mode === "generating" || this.mode === "complete") this.drawMaskGlow(ctx, phase);
      if (this.mode === "generating") this.drawGenerating(ctx, phase);
      if (this.mode === "complete") this.drawComplete(ctx);
      this.drawParticles(ctx);
    }

    renderFrame() {
      this.draw(performance.now());
    }

    stop() {
      this.clear();
    }

    drawGesture(ctx) {
      if (this.points.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const gradient = ctx.createLinearGradient(0, 0, this.element.width, this.element.height);
      gradient.addColorStop(0, COLORS.blue);
      gradient.addColorStop(1, COLORS.purple);
      ctx.strokeStyle = gradient;
      ctx.shadowColor = COLORS.purple;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 5;
      ctx.beginPath();
      this.points.forEach((point, index) => {
        const viewport = this.sceneToViewport(point);
        const x = viewport.x - this.localOffset.x;
        const y = viewport.y - this.localOffset.y;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    drawMaskGlow(ctx, phase) {
      if (!this.bounds) return;
      const tl = this.sceneToViewport({ x: this.bounds.left, y: this.bounds.top });
      const br = this.sceneToViewport({ x: this.bounds.left + this.bounds.width, y: this.bounds.top + this.bounds.height });
      const x = tl.x - this.localOffset.x;
      const y = tl.y - this.localOffset.y;
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      if (this.maskCanvas) {
        const maskBounds = this.mask.getBounds();
        const sx = Math.max(0, Math.round(maskBounds.left - this.mask.offsetX));
        const sy = Math.max(0, Math.round(maskBounds.top - this.mask.offsetY));
        const sw = Math.max(1, Math.round(maskBounds.width));
        const sh = Math.max(1, Math.round(maskBounds.height));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.mode === "generating" ? 0.34 : 0.24;
        ctx.shadowColor = COLORS.purple;
        ctx.shadowBlur = this.mode === "generating" ? 28 : 18;
        ctx.drawImage(this.maskCanvas, sx, sy, sw, sh, x, y, w, h);
        ctx.globalAlpha = 0.18;
        ctx.shadowColor = COLORS.blue;
        ctx.shadowBlur = 14;
        ctx.drawImage(this.maskCanvas, sx, sy, sw, sh, x, y, w, h);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = phase % 1 > 0.5 ? COLORS.blue : COLORS.purple;
      ctx.shadowColor = COLORS.glow;
      ctx.shadowBlur = 20;
      ctx.lineWidth = this.mode === "generating" ? 3 : 2;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -phase * 20;
      ctx.restore();
      if (this.reducedMotion || !this.maskCanvas) return;
      for (let i = 0; i < 8; i += 1) {
        const angle = phase * 1.4 + i * Math.PI * 2 / 8;
        ctx.fillStyle = i % 2 ? COLORS.blue : COLORS.purple;
        ctx.beginPath();
        ctx.arc(x + w / 2 + Math.cos(angle) * w / 2, y + h / 2 + Math.sin(angle) * h / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawGenerating(ctx, phase) {
      console.debug?.("[AI_EFFECTS] generating shimmer");
      ctx.save();
      const gradient = ctx.createLinearGradient(0, 0, this.element.width, 0);
      gradient.addColorStop(0, "rgba(0,175,255,0)");
      gradient.addColorStop(0.5, "rgba(220,203,255,0.22)");
      gradient.addColorStop(1, "rgba(138,44,255,0)");
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = gradient;
      const stripeX = (phase * 140) % (this.element.width + 120) - 120;
      ctx.fillRect(stripeX, 0, 120, this.element.height);
      ctx.fillStyle = COLORS.glow;
      ctx.font = "600 12px Segoe UI, sans-serif";
      ctx.fillText(this.statusText || "Editando com IA...", 18, Math.min(this.element.height - 18, 28));
      ctx.restore();
    }

    drawComplete(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(220,203,255,0.2)";
      ctx.fillRect(0, 0, this.element.width, this.element.height);
      ctx.restore();
    }

    drawParticles(ctx) {
      if (this.reducedMotion) return;
      this.particles = this.particles.filter((particle) => particle.life > 0);
      this.particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.025;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = COLORS.glow;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    clear() {
      if (this.mode !== "idle") {
        console.info("[AI_EFFECTS] stop");
      }
      this.mode = "idle";
      this.points = [];
      this.mask = null;
      this.maskCanvas = null;
      this.particles = [];
      this.element.hidden = true;
      this.ctx.clearRect(0, 0, this.element.width, this.element.height);
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    destroy() {
      this.clear();
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      window.removeEventListener("blur", this.visibilityHandler);
      window.removeEventListener("focus", this.visibilityHandler);
      this.element.remove();
    }
  }

  window.AiSelectionEffectsRenderer = AiSelectionEffectsRenderer;
})();
