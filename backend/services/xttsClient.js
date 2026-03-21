import fetch from "node-fetch"

const XTTS_URL = process.env.XTTS_PORT ? `http://localhost:${process.env.XTTS_PORT}` : "http://localhost:5005"

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