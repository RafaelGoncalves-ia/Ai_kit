import { pesquisarMundoReal } from "../../services/searchService.js";

export default {
  name: "web-update",

  async init(context) {
    const { scheduler } = context.core;
    const config = context.config;

    if (!scheduler) return;

    let lastUpdate = null;

    scheduler.register({
      name: "web-update-daily",
      priority: 2,
      enabled: true,
      async execute(ctx) {
        const now = Date.now();
        const updateFrequency = (config?.assuntosWeb?.updateFrequencyHours || 24) * 60 * 60 * 1000;

        // Verifica se já passou o tempo de atualização
        if (lastUpdate && (now - lastUpdate) < updateFrequency) return;

        // Verifica se web-update está habilitado
        if (config?.assuntosWeb?.enabled === false) return;

        const topics = config?.assuntosWeb?.topics || [];
        if (!topics || topics.length === 0) return;

        lastUpdate = now;

        try {
          const randomTopic = topics[Math.floor(Math.random() * topics.length)];
          console.log(`[WEB-UPDATE] Pesquisando sobre: ${randomTopic}`);

          const searchResult = await pesquisarMundoReal(randomTopic);

          // Salva na memória
          const memorySkill = ctx.core.skillManager.get("memory");
          if (memorySkill) {
            await memorySkill.processAIResponse(`[Web Update] Sobre ${randomTopic}:\n${searchResult}`);
          }

          console.log(`[WEB-UPDATE] Atualização concluída para: ${randomTopic}`);
        } catch (err) {
          console.error("[WEB-UPDATE] Erro na atualização:", err);
        }
      }
    });

    console.log("Web-Update skill inicializada");
  }
};
