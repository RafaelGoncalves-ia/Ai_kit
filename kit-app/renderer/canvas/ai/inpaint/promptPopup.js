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
          this.onSubmit?.(this.input.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
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
  }

  window.PromptPopup = PromptPopup;
})();
