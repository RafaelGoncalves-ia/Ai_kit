// backend/services/vision.js
// Este arquivo contém a implementação do serviço Vision.
import screenshot from "screenshot-desktop";
import fs from "fs";
import path from "path";

const OUTPUT = path.resolve("temp", "screen.png");

export async function captureScreen() {
  await screenshot({ filename: OUTPUT });

  const base64 = fs.readFileSync(OUTPUT, {
    encoding: "base64"
  });

  return base64;
}