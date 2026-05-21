(function () {
  class PromptPopup {
    constructor() {
      this.element = null;
      this.input = null;
      this.onSubmit = null;
      this.onCancel = null;
    }

    show({ x = 0, y = 0, value = "", onSubmit, onCancel } = {}) {
      this.destroy();
      this.onSubmit = onSubmit;
      this.onCancel = onCancel;
      const element = document.createElement("div");
      element.className = "ai-brush-prompt-popup";
      element.innerHTML = '<input type="text" placeholder="Descreva a edicao IA" aria-label="Prompt de edicao IA">';
      document.body.appendChild(element);
      this.element = element;
      this.input = element.querySelector("input");
      this.input.value = value;
      element.style.left = `${Math.round(x)}px`;
      element.style.top = `${Math.round(y)}px`;
      this.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          const value = String(this.input.value || "").trim();
          if (!value || this.input.disabled) {
            return;
          }
          this.input.disabled = true;
          this.element?.classList?.add?.("is-generating");
          this.onSubmit?.(value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (this.input.disabled) {
            return;
          }
          this.onCancel?.();
        }
      });
      requestAnimationFrame(() => this.input?.focus());
    }

    destroy() {
      this.element?.remove();
      this.element = null;
      this.input = null;
      this.onSubmit = null;
      this.onCancel = null;
    }

    setBusy(isBusy = false) {
      if (this.input) {
        this.input.disabled = Boolean(isBusy);
      }
      this.element?.classList?.toggle?.("is-generating", Boolean(isBusy));
    }
  }

  window.PromptPopup = PromptPopup;
})();
