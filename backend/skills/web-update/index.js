import { isSafeDiagnosticMode } from "../../utils/runtimeGuards.js";

export default {
  name: "web-update",

  async init(context) {
    const { scheduler } = context.core;
    const config = context.config;

    if (!scheduler) return;
    if (scheduler.hasJob?.("web-update-daily")) {
      console.log("[WEB-UPDATE] Job web-update-daily ja registrado");
      return;
    }

    let lastUpdate = null;

    scheduler.register({
      name: "web-update-daily",
      priority: 2,
      enabled: false,
      async execute(ctx) {
        const explicitlyEnabled =
          ctx?.config?.system?.enableAutonomousWebUpdate === true ||
          process.env.ENABLE_AUTONOMOUS_WEB_UPDATE === "true";

        if (!explicitlyEnabled || isSafeDiagnosticMode(ctx)) {
          return;
        }

        const now = Date.now();
        const configuredHours = Number(config?.assuntosWeb?.updateFrequencyHours || 24);
        const updateFrequency = configuredHours * 60 * 60 * 1000;

        if (lastUpdate && (now - lastUpdate) < updateFrequency) return;
      }
    });

    console.log("Web-Update skill inicializada");
  }
};
