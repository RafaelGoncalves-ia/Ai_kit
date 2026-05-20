(function () {
  function compose(base, incoming, mode = "replace") {
    if (!incoming && mode !== "clear") return base ? base.clone() : null;
    if (mode === "clear") return null;
    if (!base || mode === "replace") return incoming.clone();

    const output = base.clone();
    const sameSpace = base.width === incoming.width
      && base.height === incoming.height
      && base.offsetX === incoming.offsetX
      && base.offsetY === incoming.offsetY;
    if (!sameSpace) return incoming.clone();

    for (let index = 0; index < output.data.length; index += 1) {
      const a = base.data[index] > 0;
      const b = incoming.data[index] > 0;
      output.data[index] = mode === "add"
        ? (a || b ? 255 : 0)
        : mode === "subtract"
          ? (a && !b ? 255 : 0)
          : mode === "intersect"
            ? (a && b ? 255 : 0)
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
