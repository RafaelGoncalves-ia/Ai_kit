function toFileUrl(rawPath = "") {
  const normalized = String(rawPath || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized) || /^file:\/\//i.test(normalized)) {
    return normalized;
  }

  const windowsPath = normalized.replace(/\\/g, "/");
  return encodeURI(`file:///${windowsPath.replace(/^\/+/, "")}`);
}

function waitForAudio(audio) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };

    const handleEnded = () => {
      cleanup();
      resolve(true);
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Falha ao reproduzir audio: ${audio.currentSrc || audio.src || "sem-src"}`));
    };

    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
  });
}

export default class ConfirmationAudioPlayer {
  constructor({ logger = () => {} } = {}) {
    this.logger = logger;
  }

  async play(config = {}) {
    const mode = String(config.confirmationMode || "voice").toLowerCase();
    if (mode === "silent") {
      return { played: false, mode: "silent", source: null };
    }

    if (mode === "beep") {
      return this.playFile(config.fallbackAudio, "fallback");
    }

    try {
      return await this.playFile(config.confirmationAudio, "confirmation");
    } catch (err) {
      this.logger(`[WAKE] confirmation audio failed, fallback pending: ${err.message}`);
      try {
        return await this.playFile(config.fallbackAudio, "fallback");
      } catch (fallbackErr) {
        this.logger(`[WAKE] confirmation fallback failed: ${fallbackErr.message}`);
        return {
          played: false,
          mode,
          source: null,
          error: fallbackErr.message
        };
      }
    }
  }

  async playFile(filePath, source = "confirmation") {
    const playableUrl = toFileUrl(filePath);
    if (!playableUrl) {
      throw new Error(`Arquivo de audio ${source} ausente`);
    }

    const audio = new Audio(playableUrl);
    audio.preload = "auto";

    const waitPromise = waitForAudio(audio);
    const playResult = audio.play();
    if (playResult && typeof playResult.then === "function") {
      await playResult;
    }
    await waitPromise;

    return {
      played: true,
      source,
      filePath
    };
  }
}
