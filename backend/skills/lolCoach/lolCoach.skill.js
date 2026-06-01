import service from "./lolCoachService.js";
import { analyze, isLolCoachText, isUpdateCommand } from "./lolCoachAnalyzer.js";

function buildUpdateMessage(result) {
  if (result?.status === "updated" || result?.status === "success") {
    return `Base do LoL atualizada para o patch ${result.patch || result.manifest?.patch}.`;
  }

  if (result?.status === "already_updated") {
    return `Base do LoL já está atualizada. Patch atual: ${result.patch || result.manifest?.patch}.`;
  }

  if (result?.hasValidLocalBase) {
    return `Não consegui atualizar agora. Mantive a última base local válida: ${result.patch}.`;
  }

  return "Não consegui atualizar a base do LoL e ainda não existe uma base local válida.";
}

const lolCoachSkill = {
  name: "lolCoach",
  description: "Contexto tecnico local de League of Legends baseado em Riot Data Dragon offline.",
  commands: [
    "lol",
    "league of legends",
    "campeão",
    "champion",
    "item contra",
    "build contra",
    "counter",
    "runa",
    "build",
    "partida nova",
    "estou de",
    "time inimigo",
    "inimigos sao",
    "atualizar dados do lol",
    "atualizar base do lol",
    "atualizar campeões e itens do lol"
  ],

  async init() {
    await service.reloadCache();
  },

  parseCommand(text) {
    if (!isLolCoachText(text)) return null;
    return {
      type: "lolCoach",
      action: isUpdateCommand(text) ? "update" : "context",
      text
    };
  },

  async execute({ input }) {
    const text = input?.text || input?.query || "";
    const action = input?.action || (isUpdateCommand(text) ? "update" : "context");

    if (action === "status") {
      return {
        success: service.isReady(),
        ...service.getStatus()
      };
    }

    if (action === "update") {
      const result = await service.updateData();
      return {
        success: ["updated", "already_updated", "success"].includes(result?.status),
        type: "status",
        status: result?.status || "error",
        patch: result?.patch || result?.manifest?.patch || null,
        message: buildUpdateMessage(result),
        warning: result?.warning || null,
        error: result?.error || null
      };
    }

    if (!service.isReady()) {
      return {
        success: false,
        type: "status",
        message: "Base do LoL ainda não existe. Use: Kit, atualizar dados do LoL."
      };
    }

    const queryMeta = analyze(text, {
      championAliases: service.flash.championAliases,
      itemAliases: service.flash.itemAliases
    });
    const runtimeContext = await service.buildRuntimeContext(queryMeta);

    return {
      success: true,
      type: "runtimeContext",
      queryMeta,
      runtimeContext
    };
  },

  service,
  analyze
};

export default lolCoachSkill;
