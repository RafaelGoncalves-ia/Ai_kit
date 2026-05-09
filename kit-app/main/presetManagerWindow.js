const path = require("path");

const PRESET_MANAGER_HTML_PATH = path.join(__dirname, "..", "renderer", "windows", "preset-manager", "preset-manager.html");

function createPresetManagerWindow({
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
  const windowWidth = Math.min(1580, Math.max(1280, width - 90));
  const windowHeight = Math.min(980, Math.max(760, height - 90));
  const windowX = x + Math.max(16, Math.floor((width - windowWidth) / 2));
  const windowY = y + Math.max(16, Math.floor((height - windowHeight) / 2));

  const windowRef = createBaseWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    minWidth: 1180,
    minHeight: 720,
    title: "Gerenciador de Presets",
    backgroundColor: "#11161f"
  });

  windowRef.loadFile(PRESET_MANAGER_HTML_PATH);
  windowRef.on("closed", () => {
    onClosed?.();
  });

  windowRef.once("ready-to-show", () => {
    windowRef.show();
    windowRef.focus();
  });

  return windowRef;
}

module.exports = {
  PRESET_MANAGER_HTML_PATH,
  createPresetManagerWindow
};
