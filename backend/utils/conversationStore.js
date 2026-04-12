import {
  deleteConversationGroup,
  getConversationMessages,
  listConversationGroups,
  saveConversationMessage
} from "../skills/memory/memory.repository.js";
import { initDB } from "../skills/memory/sqlite.js";

let currentConversationId = null;

function ensureReady() {
  initDB();
}

function buildConversationTitle(messages = [], fallbackId = "default") {
  const firstUserMessage = messages.find((message) => message.role === "user")?.text || "";
  const title = String(firstUserMessage || fallbackId).replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 60) : fallbackId;
}

export function initConversation() {
  ensureReady();
  const groups = listConversationGroups(1);
  if (groups.length > 0) {
    currentConversationId = groups[0].id;
  } else {
    currentConversationId = `chat-${Date.now()}`;
  }
  return currentConversationId;
}

export function listConversations() {
  ensureReady();
  return listConversationGroups(100).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.lastMessageAt,
    messageCount: conversation.messageCount,
    path: null
  }));
}

export function createNewConversation(title = "Novo Chat") {
  ensureReady();
  currentConversationId = `chat-${Date.now()}`;
  return {
    id: currentConversationId,
    title,
    messages: []
  };
}

export function addMessage(message) {
  ensureReady();

  if (!currentConversationId) {
    initConversation();
  }

  const groupId = message.groupId || message.sessionId || currentConversationId || "default";
  const text = message.text || message.content || "";
  const createdAt = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();

  if (!String(text || "").trim()) {
    return groupId;
  }

  saveConversationMessage({
    groupId,
    role: message.role || "user",
    content: text,
    createdAt
  });

  currentConversationId = groupId;
  return groupId;
}

export function loadConversationById(id) {
  ensureReady();
  const groupId = id || currentConversationId || initConversation();
  const messages = getConversationMessages({ groupId, limit: 500, newestFirst: false }).map((message) => ({
    id: `${message.id}`,
    role: message.role,
    text: message.content,
    timestamp: new Date(message.createdAt).toISOString()
  }));

  currentConversationId = groupId;
  return {
    id: groupId,
    title: buildConversationTitle(messages, groupId),
    messages
  };
}

export function getCurrentConversation() {
  const groupId = currentConversationId || initConversation();
  return loadConversationById(groupId);
}

export function deleteConversation(id) {
  ensureReady();
  const deleted = deleteConversationGroup(id);
  if (currentConversationId === id) {
    currentConversationId = null;
  }
  return deleted;
}
