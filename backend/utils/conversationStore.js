import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve("conversations");
let currentConversationId = null;

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
}

// ======================
// INICIALIZA CONVERSA ATIVA
// ======================
export function initConversation() {
  ensureDir();
  const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith(".json"));
  if (files.length) {
    currentConversationId = files[files.length - 1]; // pega última conversa existente
  } else {
    const conv = createNewConversation("Chat Inicial");
    currentConversationId = conv.id;
  }
  return currentConversationId;
}

// ======================
// LISTAR CONVERSAS
// ======================
export function listConversations() {
  ensureDir();
  const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith(".json"));

  return files.map(f => {
    const conv = JSON.parse(fs.readFileSync(path.join(BASE_DIR, f), "utf-8"));
    return {
      id: f,
      title: conv.title || f.replace(".json", ""),
      path: path.join(BASE_DIR, f)
    };
  });
}

// ======================
// CRIAR NOVA CONVERSA
// ======================
export function createNewConversation(title = "Novo Chat") {
  ensureDir();
  const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith(".json"));

  const next = files.length ? files.length + 1 : 1;
  const fileName = `chat-${next}.json`;
  const filePath = path.join(BASE_DIR, fileName);

  const conv = { id: fileName, title, messages: [] };
  fs.writeFileSync(filePath, JSON.stringify(conv, null, 2));

  currentConversationId = fileName; // define nova conversa como ativa
  return conv;
}

// ======================
// ADICIONAR MENSAGEM
// ======================
export function addMessage(message) {
  if (!currentConversationId) initConversation();

  const filePath = path.join(BASE_DIR, currentConversationId);
  const conv = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  conv.messages.push({
    id: Date.now() + "-" + Math.random(),
    ...message,
    timestamp: new Date().toISOString()
  });

  fs.writeFileSync(filePath, JSON.stringify(conv, null, 2));
  return currentConversationId;
}

// ======================
// CARREGAR CONVERSA POR ID
// ======================
export function loadConversationById(id) {
  const filePath = path.join(BASE_DIR, id);
  if (!fs.existsSync(filePath)) return null;
  currentConversationId = id;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ======================
// RETORNA CONVERSA ATUAL
// ======================
export function getCurrentConversation() {
  if (!currentConversationId) initConversation();
  const filePath = path.join(BASE_DIR, currentConversationId);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ======================
// DELETAR CONVERSA
// ======================
export function deleteConversation(id) {
  const filePath = path.join(BASE_DIR, id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  if (currentConversationId === id) currentConversationId = null;
}