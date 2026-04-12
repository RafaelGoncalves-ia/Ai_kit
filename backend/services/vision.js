import screenshot from "screenshot-desktop";
import fs from "fs";
import path from "path";

const OUTPUT = path.resolve("temp", "screen.png");

export async function captureScreen(options = {}) {
  const outputPath = path.resolve(options.outputPath || OUTPUT);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await screenshot({ filename: outputPath });

  const base64 = fs.readFileSync(outputPath, {
    encoding: "base64"
  });

  return {
    path: outputPath,
    base64
  };
}
