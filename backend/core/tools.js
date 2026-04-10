import fs from "fs/promises";
import path from "path";

function normalizeSafeName(value, fallback) {
  const normalized = String(value || fallback || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-");

  return normalized || fallback;
}

function ensureWorkspacePath(targetPath) {
  const resolved = path.resolve(targetPath);
  const workspaceRoot = path.resolve(process.cwd());

  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error("Caminho fora do workspace não permitido");
  }

  return resolved;
}

export default function createTools(context) {
  return {
    async generate_text(input = {}) {
      const prompt = input.prompt || input.goal;

      if (!prompt) {
        return {
          status: "need_input",
          question: "Qual texto ou briefing eu devo usar?",
          key: "prompt",
          default: "Criar um conteúdo curto e objetivo."
        };
      }

      const llm = typeof context.llm === "function"
        ? context.llm
        : async (message, options = {}) => context.services?.ai?.chat?.(message, options);

      const result = await llm(prompt, input.options || {});
      const text = typeof result === "string" ? result : result?.text;

      return {
        status: "ok",
        data: {
          text: text || "Sem conteúdo gerado."
        }
      };
    },

    async generate_audio(input = {}) {
      const text = input.text || input.prompt;

      if (!text) {
        return {
          status: "need_input",
          question: "Qual texto eu devo transformar em áudio?",
          key: "text",
          default: "Mensagem padrão da KIT IA."
        };
      }

      if (!input.voice) {
        return {
          status: "need_input",
          question: "Qual voz usar?",
          key: "voice",
          default: "marcio"
        };
      }

      if (context.services?.tts?.speak) {
        await context.services.tts.speak(text);
      }

      return {
        status: "ok",
        data: {
          text,
          voice: input.voice,
          generated: true
        }
      };
    },

    async analyze_image(input = {}) {
      return {
        status: "ok",
        data: {
          summary: input.imagePath
            ? `Mock: imagem ${input.imagePath} analisada.`
            : `Mock: análise de imagem baseada no objetivo "${input.goal || "sem objetivo"}".`
        }
      };
    },

    async save_file(input = {}) {
      const folderPath = input.folderPath || path.join(process.cwd(), "agent-output");
      const safeFolderPath = ensureWorkspacePath(folderPath);
      const safeFileName = normalizeSafeName(input.fileName, "resultado.txt");
      const targetPath = ensureWorkspacePath(path.join(safeFolderPath, safeFileName));
      const content = input.content || input.text || "";

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, "utf8");

      return {
        status: "ok",
        data: {
          path: targetPath,
          bytes: Buffer.byteLength(content, "utf8")
        }
      };
    },

    async create_folder(input = {}) {
      const folderName = normalizeSafeName(input.folderName, "agent-output");
      const basePath = input.basePath || process.cwd();
      const targetPath = ensureWorkspacePath(path.join(basePath, folderName));

      await fs.mkdir(targetPath, { recursive: true });

      return {
        status: "ok",
        data: {
          path: targetPath
        }
      };
    }
  };
}
