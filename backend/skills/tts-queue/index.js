/**
 * TTS QUEUE SKILL
 * 
 * Responsabilidades:
 * - Fila sequencial de TTS (rota curta apenas)
 * - Divisão inteligente de texto
 * - Cancelamento de fila
 * - Integração com serviço TTS existente
 * 
 * NÃO DUPLICA LÓGICA:
 * - Apenas orquestra execução de TTS
 * - Usa tool audio_play para execucao de TTS
 * - Emite eventos via eventBus
 */

export default {
  name: "tts-queue",
  description: "Gerencia fila sequencial de TTS para rota curta",
  dependsOn: [], // Não depende de outras skills
  
  // ==========================================
  // ESTADO INTERNO
  // ==========================================
  _queue: [],
  _isProcessing: false,
  _currentAbortController: null,
  _context: null,

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================
  async init(context) {
    this._context = context;
    console.log("[TTS-QUEUE] Skill inicializada");
    
    // Limpa fila ao iniciar
    this._queue = [];
    this._isProcessing = false;
  },

  // ==========================================
  // ENCAPSULAMENTO: DIVIDIR TEXTO EM CHUNKS
  // ==========================================
  /**
   * Divide texto respeitando regras de prioridade
   * 
   * Prioridade:
   * 1. Frases completas (., !, ?)
   * 2. Vírgulas
   * 3. Limite de tamanho (maxChars)
   */
  _splitText(text, maxChars = 180) {
    if (!text || text.length === 0) return [];

    const chunks = [];
    let current = "";

    // Remove quebras múltiplas
    const normalized = text.replace(/\n\n+/g, "\n").trim();

    // Divisor primário: frases (., !, ?)
    const sentences = normalized.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if (!sentence.trim()) continue;

      // Se a frase já excede o limite, subdivide por vírgulas
      if (sentence.length > maxChars) {
        // Salva o que tem acumulado
        if (current.trim()) {
          chunks.push(current.trim());
          current = "";
        }

        // Subdivide por vírgulas
        const parts = sentence.split(/(?<=,)\s+/);
        
        for (const part of parts) {
          if (!part.trim()) continue;

          // Se parte continua grande, divide por espaço
          if (part.length > maxChars && current) {
            chunks.push(current.trim());
            current = "";
          }

          if ((current + " " + part).length > maxChars && current) {
            chunks.push(current.trim());
            current = part.trim();
          } else {
            current = current 
              ? `${current} ${part.trim()}` 
              : part.trim();
          }
        }
      } else {
        // Frase cabe dentro do limite
        if ((current + " " + sentence).length > maxChars && current) {
          chunks.push(current.trim());
          current = sentence.trim();
        } else {
          current = current
            ? `${current} ${sentence.trim()}`
            : sentence.trim();
        }
      }
    }

    // Adiciona resto
    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.filter(c => c.length > 0);
  },

  // ==========================================
  // ENFILEIRAR TEXTO PARA TTS
  // ==========================================
  /**
   * Enfileira um texto completo para processamento
   * 
   * Dispara processamento automático se não estiver rodando
   * Permite múltiplas enfileiragens
   */
  async enqueueText(text, priority = 0) {
    if (!text || typeof text !== "string") {
      console.warn("[TTS-QUEUE] Texto inválido para fila");
      return { queued: false };
    }

    const chunks = this._splitText(text);
    if (chunks.length === 0) {
      console.warn("[TTS-QUEUE] Nenhum chunk gerado para:", text.substring(0, 50));
      return { queued: false };
    }

    const queueId = Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    // Enfileira cada chunk
    for (let i = 0; i < chunks.length; i++) {
      this._queue.push({
        queueId,
        index: i,
        total: chunks.length,
        text: chunks[i],
        priority,
        createdAt: Date.now()
      });
    }

    // Reordena por prioridade (maior primeiro)
    this._queue.sort((a, b) => b.priority - a.priority);

    console.log(`[TTS-QUEUE] ${chunks.length} chunks enfileirados (ID: ${queueId})`);

    // Emite evento de enfileiramento
    if (this._context?.core?.eventBus) {
      this._context.core.eventBus.emit("tts:enqueued", {
        queueId,
        chunkCount: chunks.length,
        totalInQueue: this._queue.length
      });
    }

    // Inicia processamento se não estiver rodando
    this._processQueue();

    return { 
      queued: true, 
      queueId, 
      chunkCount: chunks.length 
    };
  },

  // ==========================================
  // PROCESSAR FILA
  // ==========================================
  /**
   * Processa filasequencialmente
   * Um chunk por vez, esperando conclusão antes de ir ao próximo
   */
  async _processQueue() {
    if (this._isProcessing) return;
    if (this._queue.length === 0) return;

    this._isProcessing = true;

    try {
      while (this._queue.length > 0) {
        const item = this._queue.shift();
        if (!item) break;

        // Emite início de processamento
        if (this._context?.core?.eventBus) {
          this._context.core.eventBus.emit("tts:processing", {
            queueId: item.queueId,
            index: item.index,
            total: item.total,
            text: item.text
          });
        }

        try {
          // Executa TTS via serviço existente
          console.log(`[TTS-QUEUE] Processando chunk ${item.index + 1}/${item.total}`);
          
          if (this._context?.invokeTool) {
            await this._context.invokeTool("audio_play", { text: item.text });
          } else {
            console.warn("[TTS-QUEUE] Serviço TTS não disponível");
          }

          // Emite conclusão de chunk
          if (this._context?.core?.eventBus) {
            this._context.core.eventBus.emit("tts:chunk-completed", {
              queueId: item.queueId,
              index: item.index,
              total: item.total
            });
          }

        } catch (err) {
          console.error(`[TTS-QUEUE] Erro no chunk ${item.index}:`, err.message);
          
          // Emite erro mas continua
          if (this._context?.core?.eventBus) {
            this._context.core.eventBus.emit("tts:chunk-error", {
              queueId: item.queueId,
              index: item.index,
              error: err.message
            });
          }
        }
      }
    } finally {
      this._isProcessing = false;

      // Emite conclusão de fila
      if (this._context?.core?.eventBus && this._queue.length === 0) {
        this._context.core.eventBus.emit("tts:completed", {
          timestamp: Date.now()
        });
      }
    }
  },

  // ==========================================
  // CANCELAR FILA
  // ==========================================
  /**
   * Cancela toda a fila e interrompe processamento atual
   * Útil quando usuário envia nova mensagem
   */
  cancelQueue() {
    const itemsRemoved = this._queue.length;
    this._queue = [];

    console.log(`[TTS-QUEUE] Fila cancelada (${itemsRemoved} items removidos)`);

    // Emite evento de cancelamento
    if (this._context?.core?.eventBus) {
      this._context.core.eventBus.emit("tts:cancelled", {
        itemsRemoved,
        timestamp: Date.now()
      });
    }

    return { cancelled: true, itemsRemoved };
  },

  // ==========================================
  // QUERY FILA
  // ==========================================
  /**
   * Retorna estado atual da fila
   */
  getQueueStatus() {
    return {
      isProcessing: this._isProcessing,
      queueLength: this._queue.length,
      queue: this._queue.map(item => ({
        queueId: item.queueId,
        index: item.index,
        total: item.total,
        textPreview: item.text.substring(0, 50) + (item.text.length > 50 ? "..." : "")
      }))
    };
  },

  /**
   * Retorna se há algo em processamento
   */
  isBusy() {
    return this._isProcessing || this._queue.length > 0;
  },

  // ==========================================
  // SKILL INTERFACE (EXECUTE PADRÃO)
  // ==========================================
  async execute({ input, context }) {
    // Skill não tem execute padrão
    // É chamada via métodos específicos do responseQueue
    console.warn("[TTS-QUEUE] Execute chamado diretamente (não é o fluxo esperado)");
    return { error: "Use métodos específicos de tts-queue" };
  },

  // ==========================================
  // SHUTDOWN
  // ==========================================
  async shutdown(context) {
    console.log("[TTS-QUEUE] Skill desligando...");
    this._queue = [];
    this._isProcessing = false;
  }
};



