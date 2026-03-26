import { EventEmitter } from "events";

/**
 * EventBus global do sistema
 * Comunicação desacoplada entre módulos
 */

const eventBus = new EventEmitter();

// aumenta limite (evita warning futuro)
eventBus.setMaxListeners(50);

export { eventBus };