import { speak as speakXTTS, speakByLines as speakXTTSByLines } from "./xttsClient.js";
import { exec } from "child_process";
import os from "os";
import fetch from "node-fetch";

/**
 * Converte texto para Base64 (UTF-16LE - compatível com PowerShell)
 */
function toBase64PS(text) {
  return Buffer.from(text, "utf16le").toString("base64");
}

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

    // 🔥 PRIORIDADE: XTTS COM FILA POR LINHA
    if (xttsAvailable) {
      try {
        console.log("[TTS] usando XTTS com fila por linhas...");
        // ✅ NOVO: Usa processamento por linhas (mais rápido)
        await speakXTTSByLines(text);
        return;
      } catch (err) {
        console.error("[TTS] XTTS por linhas falhou, tentando clássico:", err.message);
        // Fallback para o método clássico
        try {
          await speakXTTS(text);
          return;
        } catch (err2) {
          console.error("[TTS] XTTS clássico também falhou:", err2.message);
        }
      }
    }

    // 🔁 FALLBACK SISTEMA
    console.log("[TTS] usando fallback (sistema)");

    return new Promise((resolve, reject) => {
      let command = "";

      if (platform === "win32") {
        // 🔐 Usa Base64 + UTF-16LE para evitar quebra com textos grandes e caracteres especiais
        const encodedText = toBase64PS(text);
        const psScript = `Add-Type -AssemblyName System.Speech; $text = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedText}')); (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($text);`;
        const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");
        command = `PowerShell -EncodedCommand ${encodedCommand}`;
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
    return text
      .replace(/'/g, "")
      .replace(/"/g, "")
      .replace(/`/g, "")
      .replace(/\*\*/g, "")
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") // emojis
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
      .replace(/[\u{2600}-\u{26FF}]/gu, "")
      .replace(/[\u{2700}-\u{27BF}]/gu, "");
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