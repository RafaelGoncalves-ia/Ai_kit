import fetch from "node-fetch"

const XTTS_URL = process.env.XTTS_PORT ? `http://localhost:${process.env.XTTS_PORT}` : "http://localhost:5005"

// 🔊 Fila de áudio para processamento sequencial
let audioQueue = []
let isProcessingAudio = false

export async function waitForXTTS(url = `${XTTS_URL}/health`, timeout = 60000) {
  const start = Date.now()

  while (true) {
    try {
      const res = await fetch(url)

      if (res.ok) {
        const data = await res.json()
        if (data.status === "ok") {
          console.log("[XTTS] pronto")
          return true
        }
      }
    } catch (e) {
      // ignora erro de conexão
    }

    if (Date.now() - start > timeout) {
      console.log("[XTTS] timeout aguardando servidor")
      return false
    }

    console.log("[XTTS] aguardando...")
    await new Promise(r => setTimeout(r, 2000))
  }
}

// ======================
// DIVIDIR TEXTO POR LINHAS
// ======================
export function splitIntoLines(text, maxChars = 150) {
  // Remove quebras múltiplas
  let normalized = text.replace(/\n\n+/g, "\n").trim()

  // Lista de divisores (mantém o contexto)
  const lines = []
  let current = ""

  // Primeiro, divide por pontuação forte
  const sentences = normalized.split(/([.!?]+)/).filter(Boolean)

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]

    // Se é pontuação, agrupa com a próxima
    if (/^[.!?]+$/.test(sentence)) {
      current += sentence
      if (current.length > maxChars || i === sentences.length - 1) {
        lines.push(current.trim())
        current = ""
      }
    } else {
      if ((current + sentence).length > maxChars && current) {
        lines.push(current.trim())
        current = sentence
      } else {
        current += sentence
      }
    }
  }

  if (current.trim()) {
    lines.push(current.trim())
  }

  // Filtra linhas vazias
  return lines.filter(line => line.length > 0)
}

// ======================
// PROCESSAR FILA DE ÁUDIO
// ======================
async function processAudioQueue() {
  if (isProcessingAudio || audioQueue.length === 0) return

  isProcessingAudio = true

  while (audioQueue.length > 0) {
    const audioItem = audioQueue.shift()

    try {
      console.log(`[XTTS QUEUE] Reproduzindo linha ${audioItem.index + 1}/${audioItem.total}: "${audioItem.text.substring(0, 50)}..."`)
      await speakLine(audioItem.text, audioItem.speaker, audioItem.language)
    } catch (err) {
      console.error(`[XTTS QUEUE] Erro na linha ${audioItem.index + 1}:`, err.message)
    }
  }

  isProcessingAudio = false
}

// ======================
// SPEAK LINE (requisição individual)
// ======================
async function speakLine(text, speaker = "Daisy Studious", language = "pt") {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${XTTS_URL}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speaker, language })
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      return await res.json()
    } catch (err) {
      console.log(`[XTTS] tentativa ${i + 1} falhou: ${err.message}`)
      await new Promise(r => setTimeout(r, 500))
    }
  }

  throw new Error("XTTS indisponível para esta linha após 3 tentativas")
}

// ======================
// SPEAK BY LINES (NOVO - OTIMIZADO)
// ======================
export async function speakByLines(text, speaker = "Daisy Studious", language = "pt", maxParallel = 2) {
  if (!text || text.trim().length === 0) return

  // 📝 Divide texto em linhas
  const lines = splitIntoLines(text, 150)

  if (lines.length === 1) {
    // Se só tem 1 linha, usa o speak normal
    console.log("[XTTS] Texto pequeno, usando speak clássico")
    return speak(text, speaker, language)
  }

  console.log(`[XTTS] Dividido em ${lines.length} linhas para processamento`)

  // 🔄 Gera as requisições em paralelo (pre-processing)
  // mas executa os áudios sequencialmente
  const linePromises = lines.map((line, index) => ({
    index,
    total: lines.length,
    text: line,
    speaker,
    language
  }))

  // Adiciona à fila
  audioQueue.push(...linePromises)

  // Inicia processamento
  processAudioQueue()

  // Retorna imediatamente (áudio toca em background)
  return {
    status: "queued",
    totalLines: lines.length,
    message: "Áudio enfileirado para reprodução"
  }
}

// ======================
// SPEAK CLÁSSICO (mantém compatibilidade)
// ======================
export async function speak(text, speaker = "Daisy Studious", language = "pt") {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${XTTS_URL}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speaker, language })
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      return await res.json()
    } catch (err) {
      console.log(`[XTTS] tentativa ${i + 1} falhou: ${err.message}`)
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  throw new Error("XTTS indisponível após 3 tentativas")
}