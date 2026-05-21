(function () {
  function compose(base, incoming, mode = "replace") {
    if (!incoming && mode !== "clear") return base ? base.clone() : null;
    if (mode === "clear") return null;
    if (mode === "replace") return incoming.clone();
    if (!base) return mode === "add" ? incoming.clone() : null;

    const output = base.clone();
    const sameSpace = base.width === incoming.width
      && base.height === incoming.height
      && base.offsetX === incoming.offsetX
      && base.offsetY === incoming.offsetY;
    if (!sameSpace) return incoming.clone();

    for (let index = 0; index < output.data.length; index += 1) {
      const a = base.data[index] || 0;
      const b = incoming.data[index] || 0;
      output.data[index] = mode === "add"
        ? Math.max(a, b)
        : mode === "subtract"
          ? Math.max(0, a - b)
          : mode === "intersect"
            ? Math.min(a, b)
            : incoming.data[index];
    }
    return output.isEmpty() ? null : output;
  }

  window.SelectionOps = {
    compose,
    invert(mask) {
      return mask ? mask.invert() : null;
    }
  };
})();
