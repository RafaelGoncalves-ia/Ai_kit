import fs from "fs";
import path from "path";

export function resolveProjectVideoAssetDir(projectFilePath = "", fallbackRoot = "") {
  if (!projectFilePath) {
    return path.join(fallbackRoot || process.cwd(), "projects", "studio", "assets", "video");
  }

  const parsed = path.parse(projectFilePath);
  return path.join(parsed.dir, `${parsed.name}.assets`, "video");
}

export function resolveVideoPaths({ projectFilePath = "", assetDir = "", fallbackRoot = "", sceneId = "scene", jobId = "", ratio = "9:16" } = {}) {
  const targetAssetDir = assetDir || resolveProjectVideoAssetDir(projectFilePath, fallbackRoot);
  fs.mkdirSync(targetAssetDir, { recursive: true });
  const safeSceneId = String(sceneId || "scene").replace(/[^a-zA-Z0-9-_]+/g, "-");
  return {
    assetDir: targetAssetDir,
    outputPath: path.join(targetAssetDir, `${safeSceneId}-${jobId}.mp4`),
    thumbnailPath: path.join(targetAssetDir, `${safeSceneId}-${jobId}.png`),
    lastFramePath: path.join(targetAssetDir, `${safeSceneId}-${jobId}-last-frame.png`),
    ratio: String(ratio || "9:16").trim() || "9:16"
  };
}
