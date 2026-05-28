(function () {
  function applySelection(manager, mask, mode = "add") {
    manager?.apply?.(mask, mode);
    return manager?.getMask?.() || null;
  }

  window.SelectionOverlay = { applySelection };
})();
