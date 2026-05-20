(function () {
  function applySelection(manager, mask, mode = "replace") {
    manager?.apply?.(mask, mode);
    return manager?.getMask?.() || null;
  }

  window.SelectionOverlay = { applySelection };
})();
