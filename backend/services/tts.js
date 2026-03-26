import { speak as speakXTTS } from "./xttsClient.js";
import { exec } from "child_process";
import os from "os";
import fetch from "node-fetch";

export default function createTTSService(context) {
  let enabled = true;
  const platform = os.platform();

  // 🔥 estado real do XTTS
  let xttsAvailable = false;
  let lastStatus = null; // 👈 controle de mudança

  // ======================
  // CHECK XTTS
  // ======================
  async function checkXTTS() {
    try {
      const res = await fetch("http://localhost:5005/health");
      const data = await res.json();

      const newStatus = data.status === "ok";

      // 🔥 loga apenas se mudou
      if (newStatus !== lastStatus) {
        console.log("[TTS] XTTS status:", newStatus ? "ON" : "OFF");
        lastStatus = newStatus;
      }

      xttsAvailable = newStatus;

    } catch (err) {
      if (lastStatus !== false) {
        console.log("[TTS] XTTS OFF");
        lastStatus = false;
      }

      xttsAvailable = false;
    }
  }

  // inicia verificação
  checkXTTS();

  // revalida a cada 10s
  setInterval(checkXTTS, 10000);

  // ======================
  // SPEAK
  // ======================
  async function speak(text) {
    if (!enabled || !text) return;

    // 🔥 PRIORIDADE: XTTS
    if (xttsAvailable) {
      try {
        console.log("[TTS] usando XTTS...");
        await speakXTTS(text);
        return;
      } catch (err) {
        console.error("[TTS] XTTS falhou:", err.message);
      }
    }

    // 🔁 FALLBACK
    console.log("[TTS] usando fallback (sistema)");

    return new Promise((resolve, reject) => {
      let command = "";

      if (platform === "win32") {
        command = `PowerShell -Command "Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${sanitize(text)}');"`;
      } else if (platform === "linux") {
        command = `espeak "${sanitize(text)}"`;
      } else if (platform === "darwin") {
        command = `say "${sanitize(text)}"`;
      }

      if (!command) return resolve();

      exec(command, (error) => {
        if (error) {
          console.error("[TTS] erro fallback:", error);
          return reject(error);
        }
        resolve();
      });
    });
  }

  // ======================
  // UTILS
  // ======================
  function sanitize(text) {
    return text.replace(/'/g, "").replace(/"/g, "");
  }

  function enable() {
    enabled = true;
  }

  function disable() {
    enabled = false;
  }

  function isEnabled() {
    return enabled;
  }

  return {
    speak,
    enable,
    disable,
    isEnabled
  };
}