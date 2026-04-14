import { speak as speakXTTS } from "./xttsClient.js";
import { exec } from "child_process";
import os from "os";
import fetch from "node-fetch";
import { buildSpeechPayload, sanitizeSpeechText } from "./speechFilter.js";

const XTTS_PORT = process.env.XTTS_PORT || 5005;
const XTTS_HEALTH_URL = `http://localhost:${XTTS_PORT}/health`;
const XTTS_STATUS_MAX_AGE_MS = 3000;
const XTTS_HEALTH_TIMEOUT_MS = 1500;

function toBase64PS(text) {
  return Buffer.from(text, "utf16le").toString("base64");
}

export default function createTTSService(context) {
  let enabled = true;
  const platform = os.platform();
  let xttsAvailable = false;
  let lastStatus = null;
  let lastCheckAt = 0;

  async function checkXTTS(reason = "periodic") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), XTTS_HEALTH_TIMEOUT_MS);

    try {
      const res = await fetch(XTTS_HEALTH_URL, {
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      clearTimeout(timeout);

      const newStatus = res.ok && data.status === "ok";
      lastCheckAt = Date.now();

      if (newStatus !== lastStatus) {
        console.log(`[TTS] XTTS status=${newStatus ? "ON" : "OFF"} reason=${reason}`);
        lastStatus = newStatus;
      }

      xttsAvailable = newStatus;
      return xttsAvailable;
    } catch (err) {
      clearTimeout(timeout);
      lastCheckAt = Date.now();

      if (lastStatus !== false) {
        console.log(`[TTS] XTTS status=OFF reason=${reason} error=${err.message}`);
        lastStatus = false;
      }

      xttsAvailable = false;
      return false;
    }
  }

  checkXTTS();
  setInterval(() => {
    void checkXTTS("interval");
  }, 10000);

  async function speak(text) {
    if (!enabled || !text) return;
    const speechPayload = buildSpeechPayload({
      uiText: text,
      speakText: text,
      source: "tts.service"
    });

    if (!speechPayload.shouldSpeak) {
      console.log(`[TTS] fala descartada reason=${speechPayload.reason}`);
      return;
    }

    const speechText = sanitizeSpeechText(speechPayload.text);
    if (!speechText) {
      return;
    }

    const now = Date.now();
    if (!xttsAvailable || now - lastCheckAt > XTTS_STATUS_MAX_AGE_MS) {
      await checkXTTS("speak");
    }

    if (xttsAvailable) {
      try {
        console.log("[TTS] usando XTTS reason=xtts_online mode=queue");
        await speakXTTS(speechText);
        return;
      } catch (err) {
        console.error(`[TTS] erro ao usar XTTS mode=classic error=${err.message}`);
        xttsAvailable = false;
        lastStatus = false;
      }
    }

    console.log(`[TTS] usando fallback reason=${xttsAvailable ? "xtts_failed" : "xtts_offline_or_loading"}`);

    return new Promise((resolve, reject) => {
      let command = "";

      if (platform === "win32") {
        const encodedText = toBase64PS(speechText);
        const psScript = `Add-Type -AssemblyName System.Speech; $text = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedText}')); (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($text);`;
        const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");
        command = `PowerShell -EncodedCommand ${encodedCommand}`;
      } else if (platform === "linux") {
        command = `espeak "${sanitize(speechText)}"`;
      } else if (platform === "darwin") {
        command = `say "${sanitize(speechText)}"`;
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

  function sanitize(text) {
    return text
      .replace(/'/g, "")
      .replace(/"/g, "")
      .replace(/`/g, "")
      .replace(/\*\*/g, "")
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
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
