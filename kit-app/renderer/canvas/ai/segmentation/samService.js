(function () {
  async function segment(context = {}) {
    if (!window.kitAPI?.segmentCanvasWithSAM2) return null;
    return window.kitAPI.segmentCanvasWithSAM2(context).catch(() => null);
  }

  window.SamService = { segment };
})();
