(function () {
  async function segment(context = {}) {
    if (!window.kitAPI?.segmentCanvasWithMobileSAM) return null;
    return window.kitAPI.segmentCanvasWithMobileSAM(context).catch(() => null);
  }

  window.MobileSamService = { segment };
})();
