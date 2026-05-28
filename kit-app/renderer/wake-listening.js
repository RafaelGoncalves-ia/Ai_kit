import WakeListeningService from "../../backend/core/audio/WakeListeningService.js";

const service = new WakeListeningService({
  sttUrl: "http://localhost:3001/stt",
  chatUrl: "http://localhost:3001/chat",
  wakeDetectedUrl: "http://localhost:3001/wakeword/detected",
  onNoiseTrigger: async () => {
    window.kitAPI?.startVoice?.();
  },
  runtimeProvider: async () => {
    if (!window.kitAPI?.getWakeListeningRuntime) {
      return {};
    }

    return window.kitAPI.getWakeListeningRuntime();
  },
  logger: (message) => {
    if (window.kitAPI?.wakeListeningLog) {
      window.kitAPI.wakeListeningLog(message);
    } else {
      console.log(message);
    }
  }
});

async function applyIncomingConfig(config) {
  try {
    if (navigator.permissions?.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" });
        window.kitAPI?.wakeListeningLog?.(
          `[WAKE] microphone permission: ${permissionStatus.state}`
        );
      } catch {}
    }

    await service.applyConfig(config);
  } catch (err) {
    window.kitAPI?.wakeListeningLog?.(`[WAKE] failed to apply config: ${err.message}`);
  }
}

async function init() {
  window.kitAPI?.wakeListeningLog?.("[WAKE] wake renderer init");
  const config = await window.kitAPI?.getWakeListeningConfig?.();
  await applyIncomingConfig(config || {});

  window.kitAPI?.onWakeListeningConfig?.((nextConfig) => {
    void applyIncomingConfig(nextConfig || {});
  });
}

window.addEventListener("beforeunload", () => {
  void service.destroy();
});

void init();
