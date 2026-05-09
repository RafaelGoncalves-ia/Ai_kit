const path = require("path");

const STUDIO_HTML_PATH = path.join(__dirname, "..", "renderer", "studio", "studio.html");

function createStudioWindow({
  existingWindow = null,
  createBaseWindow,
  screen,
  onClosed
} = {}) {
  if (existingWindow && !existingWindow.isDestroyed()) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.workArea;
  const windowWidth = Math.min(1520, Math.max(1240, width - 120));
  const windowHeight = Math.min(940, Math.max(760, height - 100));
  const windowX = x + Math.max(24, Math.floor((width - windowWidth) / 2));
  const windowY = y + Math.max(24, Math.floor((height - windowHeight) / 2));

  const studioWindow = createBaseWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    minWidth: 1180,
    minHeight: 720,
    frame: false,
    title: "KIT Studio",
    backgroundColor: "#10131a"
  });

  studioWindow.loadFile(STUDIO_HTML_PATH);

  studioWindow.on("closed", () => {
    onClosed?.();
  });

  studioWindow.once("ready-to-show", () => {
    studioWindow.show();
    studioWindow.focus();
  });

  return studioWindow;
}

module.exports = {
  STUDIO_HTML_PATH,
  createStudioWindow
};
