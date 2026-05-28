import ConfirmationAudioPlayer from "./ConfirmationAudioPlayer.js";
import PassiveAudioState from "./PassiveAudioState.js";
import { matchWakeWord, stripWakeWordFromCommand } from "./WakeWordMatcher.js";

const ANALYZER_FFT_SIZE = 2048;
const ANALYZER_INTERVAL_MS = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDefaultLogger() {
  return () => {};
}

export default class WakeListeningService {
  constructor({
    sttUrl,
    chatUrl,
    wakeDetectedUrl = "",
    onWakeWordDetected = null,
    onNoiseTrigger = null,
    runtimeProvider = async () => ({}),
    logger = createDefaultLogger()
  } = {}) {
    this.sttUrl = sttUrl;
    this.chatUrl = chatUrl;
    this.wakeDetectedUrl = wakeDetectedUrl;
    this.onWakeWordDetected = typeof onWakeWordDetected === "function" ? onWakeWordDetected : null;
    this.onNoiseTrigger = typeof onNoiseTrigger === "function" ? onNoiseTrigger : null;
    this.runtimeProvider = runtimeProvider;
    this.logger = typeof logger === "function" ? logger : createDefaultLogger();

    this.config = null;
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.analysisBuffer = null;
    this.monitorTimer = null;
    this.cooldownTimer = null;
    this.passiveVoiceMs = 0;
    this.activeVoiceSeen = false;
    this.activeLastVoiceAt = 0;
    this.activeStartedAt = 0;
    this.mediaRecorder = null;
    this.mediaChunks = [];
    this.pendingOperation = false;

    this.confirmationAudioPlayer = new ConfirmationAudioPlayer({
      logger: (message) => this.log(message)
    });

    this.state = new PassiveAudioState({
      initialState: "disabled",
      onTransition: ({ nextState }) => {
        this.log(`[WAKE] state -> ${nextState}`);
      }
    });
  }

  async applyConfig(config = {}) {
    this.config = config && typeof config === "object" ? { ...config } : null;
    const shouldRun = Boolean(this.config?.enabled && this.config?.continuousListening);

    if (!shouldRun) {
      await this.stop();
      return;
    }

    if (!this.stream) {
      await this.start();
      return;
    }

    this.enterPassiveListening();
  }

  async start() {
    if (!this.config?.enabled || !this.config?.continuousListening) {
      await this.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.log("[WAKE] getUserMedia indisponivel");
      throw new Error("getUserMedia indisponivel");
    }

    if (!this.stream) {
      try {
        this.log("[WAKE] requesting microphone stream");
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (err) {
        this.log(`[WAKE] microphone request failed: ${err.message}`);
        throw err;
      }

      this.stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          this.log("[WAKE] microphone track ended");
          this.stream = null;
          if (this.config?.enabled && this.config?.continuousListening) {
            window.setTimeout(() => {
              void this.start().catch((restartErr) => {
                this.log(`[WAKE] microphone restart failed: ${restartErr.message}`);
              });
            }, 500);
          }
        });
      });
    }

    if (!this.audioContext) {
      const AudioContextRef = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextRef();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = ANALYZER_FFT_SIZE;
      source.connect(this.analyser);
      this.analysisBuffer = new Uint8Array(this.analyser.frequencyBinCount);
    }

    if (this.audioContext?.state === "suspended") {
      this.log("[WAKE] resuming audio context");
      await this.audioContext.resume();
    }

    this.enterPassiveListening();
    this.log("[WAKE] passive listening started");
  }

  async stop() {
    this.clearMonitor();
    this.clearCooldown();
    this.pendingOperation = false;
    this.passiveVoiceMs = 0;
    this.activeVoiceSeen = false;
    this.activeLastVoiceAt = 0;
    this.activeStartedAt = 0;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.mediaChunks = [];

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.analysisBuffer = null;
    this.state.transition("disabled");
    this.log("[WAKE] passive listening disabled");
  }

  destroy() {
    return this.stop();
  }

  enterPassiveListening() {
    this.clearCooldown();
    this.clearMonitor();
    this.pendingOperation = false;
    this.passiveVoiceMs = 0;
    this.activeVoiceSeen = false;
    this.activeLastVoiceAt = 0;
    this.activeStartedAt = 0;
    this.state.transition("passive_listening");
    this.startMonitorLoop();
  }

  startMonitorLoop() {
    this.clearMonitor();
    this.monitorTimer = window.setInterval(() => {
      void this.handleMonitorTick();
    }, ANALYZER_INTERVAL_MS);
  }

  clearMonitor() {
    if (this.monitorTimer) {
      window.clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  clearCooldown() {
    if (this.cooldownTimer) {
      window.clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  async handleMonitorTick() {
    if (!this.analyser || this.pendingOperation) {
      return;
    }

    if (!this.config?.enabled || !this.config?.continuousListening) {
      await this.stop();
      return;
    }

    if (this.state.is("cooldown") || this.state.is("processing") || this.state.is("wake_check") || this.state.is("confirmation")) {
      return;
    }

    const level = this.readInputLevel();

    if (this.state.is("passive_listening")) {
      await this.handlePassiveTick(level);
      return;
    }

    if (this.state.is("active_listening")) {
      this.handleActiveTick(level);
    }
  }

  async handlePassiveTick(level) {
    const threshold = Number(this.config?.voiceActivityThreshold || 0.045);
    if (level >= threshold) {
      this.passiveVoiceMs += ANALYZER_INTERVAL_MS;
    } else {
      this.passiveVoiceMs = 0;
    }

    if (this.passiveVoiceMs < Number(this.config?.minVoiceDurationMs || 250)) {
      return;
    }

    this.passiveVoiceMs = 0;

    const runtime = await this.runtimeProviderSafe();
    if (this.config?.ignoreWhileTts && runtime.ttsBusy) {
      this.log("[WAKE] voice activity ignored while TTS is busy");
      return;
    }

    this.pendingOperation = true;
    this.clearMonitor();

    try {
      this.log("[WAKE] voice activity detected");
      let match = null;
      if (this.config?.bypassWakeWordOnNoise) {
        this.log("[WAKE] bypassWakeWordOnNoise enabled, forwarding to widget");
        await this.forwardNoiseTrigger();
        this.startCooldown();
        return;
      } else {
        this.state.transition("wake_check");
        const blob = await this.captureFixedClip(this.config.passiveCaptureMs);
        const transcript = await this.transcribeBlob(blob);
        this.log(`[WAKE] wake check transcript: "${transcript}"`);

        match = matchWakeWord(transcript, this.config);
        if (!match.matched) {
          this.enterPassiveListening();
          return;
        }

        const matchDetail = match.matchType ? ` (${match.matchType}${match.distance !== undefined ? `:${match.distance}` : ""})` : "";
        this.log(`[WAKE] wake word matched${matchDetail} score=${match.score ?? 0} confirmed=${match.confirmed === true}`);
        await this.emitWakeWordDetected(match);
      }

      this.state.transition("confirmation");
      const playback = await this.confirmationAudioPlayer.play(this.config);

      if (playback.played && playback.source === "confirmation") {
        this.log(`[WAKE] confirmation audio played: ${this.extractFileName(playback.filePath)}`);
      } else if (playback.played && playback.source === "fallback") {
        this.log(`[WAKE] fallback audio used: ${this.extractFileName(playback.filePath)}`);
      } else if (playback.error) {
        this.log(`[WAKE] confirmation audio skipped: ${playback.error}`);
      }

      await this.captureActiveCommand(match);
    } catch (err) {
      this.log(`[WAKE] erro: ${err.message}`);
      this.startCooldown();
    } finally {
      this.pendingOperation = false;
    }
  }

  async forwardNoiseTrigger() {
    if (!this.onNoiseTrigger) {
      throw new Error("Noise trigger handler ausente");
    }

    await this.onNoiseTrigger();
  }

  handleActiveTick(level) {
    const threshold = Number(this.config?.activeVoiceThreshold || this.config?.voiceActivityThreshold || 0.035);
    const now = Date.now();

    if (level >= threshold) {
      this.activeVoiceSeen = true;
      this.activeLastVoiceAt = now;
      return;
    }

    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      return;
    }

    const elapsed = now - this.activeStartedAt;
    const maxDuration = Number(this.config?.activeMaxDurationMs || 12000);
    const maxInitialSilenceMs = Number(this.config?.maxInitialSilenceMs || 4000);
    const silenceTimeoutMs = Number(this.config?.silenceTimeoutMs || 1000);

    if (elapsed >= maxDuration) {
      this.mediaRecorder.stop();
      return;
    }

    if (!this.activeVoiceSeen && elapsed >= maxInitialSilenceMs) {
      this.mediaRecorder.stop();
      return;
    }

    if (this.activeVoiceSeen && now - this.activeLastVoiceAt >= silenceTimeoutMs) {
      this.mediaRecorder.stop();
    }
  }

  async captureActiveCommand(match) {
    this.state.transition("active_listening");
    this.log("[WAKE] active listening started");

    const blob = await this.captureActiveClip();
    this.state.transition("processing");

    const transcript = await this.transcribeBlob(blob);
    let finalCommand = transcript;

    if (this.config?.stripWakeWordFromCommand) {
      finalCommand = stripWakeWordFromCommand(transcript, this.config) || transcript;
    }

    if (!finalCommand.trim()) {
      this.log("[WAKE] command captured: \"\"");
      this.startCooldown();
      return;
    }

    this.log(`[WAKE] command captured: "${finalCommand}"`);
    await this.submitCommand(finalCommand, match);
    this.startCooldown();
  }

  captureFixedClip(durationMs) {
    return new Promise((resolve, reject) => {
      try {
        const recorder = this.createRecorder();
        const chunks = [];

        recorder.ondataavailable = (event) => {
          if (event.data?.size) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          reject(new Error(event.error?.message || "Falha ao capturar audio passivo"));
        };

        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };

        recorder.start();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, Math.max(250, Number(durationMs || 1800)));
      } catch (err) {
        reject(err);
      }
    });
  }

  captureActiveClip() {
    return new Promise((resolve, reject) => {
      try {
        this.mediaRecorder = this.createRecorder();
        this.mediaChunks = [];
        this.activeVoiceSeen = false;
        this.activeLastVoiceAt = Date.now();
        this.activeStartedAt = Date.now();

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data?.size) {
            this.mediaChunks.push(event.data);
          }
        };

        this.mediaRecorder.onerror = (event) => {
          reject(new Error(event.error?.message || "Falha ao capturar audio ativo"));
        };

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.mediaChunks, {
            type: this.mediaRecorder?.mimeType || "audio/webm"
          });
          this.mediaRecorder = null;
          this.mediaChunks = [];
          resolve(blob);
        };

        this.mediaRecorder.start();
        this.startMonitorLoop();
      } catch (err) {
        reject(err);
      }
    });
  }

  createRecorder() {
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm"
    ];

    const selectedMimeType = typeof MediaRecorder.isTypeSupported === "function"
      ? preferredTypes.find((type) => MediaRecorder.isTypeSupported(type))
      : null;
    return new MediaRecorder(this.stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
  }

  async transcribeBlob(blob) {
    if (!blob || blob.size === 0) {
      return "";
    }

    const formData = new FormData();
    formData.append("audio", blob, "wake-audio.webm");

    const response = await fetch(this.sttUrl, {
      method: "POST",
      body: formData
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Falha ao transcrever audio");
    }

    return String(data?.text || "").trim();
  }

  async submitCommand(text, match) {
    const runtime = await this.runtimeProviderSafe();
    const sessionId = runtime.sessionId || "default";
    const response = await fetch(this.chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sessionId
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || "Falha ao enviar comando para o chat");
    }

    return {
      sessionId,
      text,
      wakeMatch: match?.match || null
    };
  }

  async emitWakeWordDetected(match = {}) {
    const payload = {
      label: match.label || match.match || null,
      matchedAlias: match.matchedAlias || match.match || null,
      score: Number(match.score || 0),
      confirmed: match.confirmed === true
    };

    if (this.onWakeWordDetected) {
      await this.onWakeWordDetected(payload);
      return payload;
    }

    if (this.wakeDetectedUrl) {
      await fetch(this.wakeDetectedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch((err) => {
        this.log(`[WAKE] wakeword.detected emit failed: ${err.message}`);
      });
    }

    return payload;
  }

  async runtimeProviderSafe() {
    try {
      const runtime = await this.runtimeProvider();
      return runtime && typeof runtime === "object" ? runtime : {};
    } catch (err) {
      this.log(`[WAKE] runtime provider failed: ${err.message}`);
      return {};
    }
  }

  startCooldown() {
    this.clearMonitor();
    this.clearCooldown();
    this.state.transition("cooldown");
    this.log("[WAKE] cooldown started");
    this.cooldownTimer = window.setTimeout(() => {
      this.enterPassiveListening();
    }, Number(this.config?.cooldownMs || 1500));
  }

  readInputLevel() {
    if (!this.analyser || !this.analysisBuffer) {
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.analysisBuffer);

    let sum = 0;
    for (let i = 0; i < this.analysisBuffer.length; i += 1) {
      const centered = (this.analysisBuffer[i] - 128) / 128;
      sum += centered * centered;
    }

    return Math.sqrt(sum / this.analysisBuffer.length);
  }

  extractFileName(filePath = "") {
    const normalized = String(filePath || "").trim().replace(/\\/g, "/");
    return normalized.split("/").pop() || normalized;
  }

  log(message) {
    if (this.config?.debugLogs === false && String(message).startsWith("[WAKE]")) {
      return;
    }
    this.logger(message);
  }
}
