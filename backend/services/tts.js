// Serviço de TTS (Text-to-Speech)
// Versão base (local, leve)
// - Usa engine nativa do sistema operacional
// - Futuramente pode ser substituído por XTTS via Skill
import { speak as speakXTTS } from "./xttsClient.js";
import { exec } from "child_process"
import os from "os"

export default function createTTSService(context) {
  let enabled = true

  // ======================
  // DETECTAR SO
  // ======================
  const platform = os.platform()

  // ======================
  // FALAR TEXTO
  // ======================
  function speak(text) {
    return new Promise((resolve, reject) => {
        
    if (!enabled || !text) return resolve()

      let command = ""

      // Windows (PowerShell)
      if (platform === "win32") {
        command = `PowerShell -Command "Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${sanitize(text)}');"`
      }

      // Linux (espeak)
      else if (platform === "linux") {
        command = `espeak "${sanitize(text)}"`
      }

      // MacOS (say)
      else if (platform === "darwin") {
        command = `say "${sanitize(text)}"`
      }

      if (!command) {
        console.warn("TTS não suportado neste sistema")
        return resolve()
      }

      exec(command, (error) => {
        if (error) {
          console.error("Erro no TTS:", error)
          return reject(error)
        }
        resolve()
      })
    })
  }

  // ======================
  // SANITIZA TEXTO
  // ======================
  function sanitize(text) {
    return text.replace(/'/g, "").replace(/"/g, "")
  }

  // ======================
  // CONTROLE
  // ======================
  function enable() {
    enabled = true
  }

  function disable() {
    enabled = false
  }

  function isEnabled() {
    return enabled
  }

  return {
    speak,
    enable,
    disable,
    isEnabled
  }
}