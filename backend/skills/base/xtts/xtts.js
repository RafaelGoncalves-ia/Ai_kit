import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = process.env.XTTS_PORT || 5005
const PYTHON = process.env.XTTS_PYTHON || "python"
const VENV_PATH = process.env.XTTS_VENV || "C:\\GitHub\\XTTS\\venv\\Scripts\\activate.bat"

const XTTS_URL = `http://localhost:${PORT}`
const SCRIPT = path.resolve(__dirname, "../../services/xtts_server.py")

let serverProcess = null

function startServer() {
    if (serverProcess) {
        console.log("[XTTS] Servidor já está sendo iniciado")
        return
    }

    console.log("[XTTS] iniciando servidor...")
    console.log("[XTTS] VENV:", VENV_PATH)
    console.log("[XTTS] PYTHON:", PYTHON)
    console.log("[XTTS] SCRIPT:", SCRIPT)

    // Ativa venv e roda o script
    const command = `"${VENV_PATH}" && ${PYTHON} "${SCRIPT}"`

    serverProcess = spawn("cmd", ["/c", command], {
        // detached: true,
        stdio: "inherit",
        shell: true
    })

    serverProcess.on('error', (err) => {
        console.error("[XTTS] Erro ao iniciar servidor:", err)
        serverProcess = null
    })

    // serverProcess.unref()
}

async function ensureRunning() {
    try {
        const res = await fetch(`${XTTS_URL}/health`)
        if (res.ok) {
            const data = await res.json()
            if (data.status === "ok") {
                console.log("[XTTS] Servidor já está rodando e pronto")
                return true
            } else {
                console.log("[XTTS] Servidor rodando mas carregando...")
            }
        } else {
            console.log("[XTTS] Servidor respondeu mas não ok:", res.status)
        }
    } catch (e) {
        console.log("[XTTS] Servidor não responde, iniciando...")
    }

    // Inicia se não estiver rodando
    startServer()
    return false
}

export { ensureRunning }