/**
 * Estado global da kitIA
 * Fonte única de verdade do sistema
 */

export const kitState = {
  // NEEDS (base biológica)
  needs: {
    energy: 100,   // sono
    hunger: 0,     // fome
    mood: 100,     // felicidade/tédio
    aura: 50       // relação com usuário
  },

  // EMOÇÃO (estado atual)
  emotion: {
    type: "neutral",   // happy | sad | annoyed | etc
    intensity: 0.5,    // 0 a 1
    lastUpdate: Date.now()
  },

  // ROTINA (ação atual)
  routine: {
    currentAction: "idle",
    startedAt: Date.now(),
    duration: 0,
    forced: null,
    lockedUntil: 0
  },

  // CONTEXTO 3D (mesmo offline)
  world: {
    location: "room",   // room | bed | pc | kitchen | sofa | etc
    isMoving: false
  },

  // USUÁRIO
  user: {
    isActive: false,
    lastSeen: Date.now()
  },

  // ORQUESTRADOR (NOVO)
  orchestrator: {
    currentTask: null,   // tarefa longa atual
    queue: [],           // fila de respostas
    isProcessing: false  // controle de execução
  },

  // SISTEMA
  system: {
    lastTick: Date.now()
  }
};

export default kitState;