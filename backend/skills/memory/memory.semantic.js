import { saveMemory, getRecentMemory, getMemoryByType } from "./memory.repository.js";

/**
 * Extração inteligente usando IA
 */
export async function extractMemory(text, context) {
  try {
    // Prompt para extrair memórias
    const prompt = `
Analise o texto do usuário e extraia informações relevantes para memória.
Retorne apenas um JSON válido com a estrutura:
{
  "memories": [
    {
      "type": "user|preference|vocabulary|fact|emotion|topic",
      "key": "chave opcional",
      "value": "conteúdo extraído",
      "relevance": 0.0-1.0 (peso baseado em importância e certeza)
    }
  ]
}

Tipos:
- user: informações sobre o usuário (nome, idade, etc.)
- preference: gostos, preferências
- vocabulary: definições, significados
- fact: fatos mencionados
- emotion: sentimentos expressos
- topic: tópicos discutidos

Seja conservador: só extraia se for claro e relevante. Relevância alta para fatos pessoais, baixa para conversação casual.

Texto: "${text}"
`;

    const aiResponse = await context.services.ai.chat(prompt, {});
    const responseText = aiResponse.text || "{}";

    // Tentar parsear JSON
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.warn("[Memory] Falha ao parsear resposta da IA:", responseText);
      return;
    }

    if (parsed.memories && Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        if (mem.type && mem.value) {
          saveMemory({
            type: mem.type,
            key: mem.key || null,
            value: mem.value,
            relevance: Math.min(1.0, Math.max(0.0, mem.relevance || 0.5))
          });
        }
      }
    }

    // Sempre salva o histórico da conversa
    saveMemory({
      type: "conversation",
      value: `user: ${text}`,
      relevance: 0.3
    });

  } catch (err) {
    console.error("[Memory] Erro na extração:", err);
    // Fallback para regras simples se IA falhar
    fallbackExtract(text);
  }
}

/**
 * Fallback para extração simples (se IA falhar)
 */
function fallbackExtract(text) {
  const lower = text.toLowerCase();

  if (lower.includes("meu nome é")) {
    const name = text.split("é").pop().trim();
    if (name.length > 1) {
      saveMemory({
        type: "user",
        key: "nome",
        value: name,
        relevance: 1
      });
    }
  }

  if (lower.includes("eu gosto de")) {
    const value = text.split("de").pop().trim();
    saveMemory({
      type: "preference",
      key: "gosto",
      value,
      relevance: 0.7
    });
  }

  if (lower.includes("significa")) {
    saveMemory({
      type: "vocabulary",
      value: text,
      relevance: 0.5
    });
  }

  saveMemory({
    type: "conversation",
    value: `user: ${text}`,
    relevance: 0.3
  });
}

/**
 * Extração de memórias da IA (opiniões e preferências)
 */
export async function extractAIMemory(text, context) {
  // Validação: rejeita respostas vazias
  if (!text || text.trim() === "") {
    return;
  }

  try {
    // Prompt para extrair opiniões da IA
    const prompt = `
Analise a resposta da IA e extraia suas opiniões, preferências ou escolhas expressas.
Retorne apenas um JSON válido com a estrutura:
{
  "memories": [
    {
      "type": "ai_opinion",
      "key": "assunto",
      "value": "opinião expressa",
      "relevance": 0.0-1.0 (baixo para opiniões mutáveis, alto para convicções fortes)
    }
  ]
}

Exemplos:
- "Eu gosto de azul" → {"type": "ai_opinion", "key": "cor_favorita", "value": "azul", "relevance": 0.4}
- "O roxo é muito melhor agora" → mudança de opinião, relevância baixa
- "Eu odeio esperar" → opinião forte, relevância alta

Seja conservador: só extraia opiniões claras e pessoais da IA.

Texto da IA: "${text}"
`;

    const aiResponse = await context.services.ai.chat(prompt, {});
    const responseText = aiResponse.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.warn("[AI Memory] Falha ao parsear resposta da IA:", responseText);
      return;
    }

    if (parsed.memories && Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        if (mem.type && mem.value) {
          // Para opiniões da IA, relevância sempre baixa (0.2-0.6) para permitir mudanças
          const relevance = Math.min(0.6, Math.max(0.2, mem.relevance || 0.4));
          saveMemory({
            type: mem.type,
            key: mem.key || null,
            value: mem.value,
            relevance
          });
        }
      }
    }

  } catch (err) {
    console.error("[AI Memory] Erro na extração:", err);
  }
}

/**
 * Contexto inteligente com pesos
 */
export async function buildContext() {
  const recent = getRecentMemory(20); // mais para filtrar
  const userData = getMemoryByType("user", 5);
  const preferences = getMemoryByType("preference", 5);
  const vocab = getMemoryByType("vocabulary", 5);
  const facts = getMemoryByType("fact", 5);
  const emotions = getMemoryByType("emotion", 3);
  const topics = getMemoryByType("topic", 5);
  const aiOpinions = getMemoryByType("ai_opinion", 5);

  let context = "";

  // Usuário - alta prioridade
  if (userData.length) {
    context += `Informações sobre o usuário (baseado em conversas anteriores, pode não ser 100% preciso):\n`;
    userData.forEach(mem => {
      context += `- ${mem.content} (confiança: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Preferências
  if (preferences.length) {
    context += `Preferências mencionadas (sujeito a mudanças):\n`;
    preferences.forEach(mem => {
      context += `- ${mem.content} (confiança: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Fatos relevantes
  if (facts.length) {
    context += `Fatos mencionados:\n`;
    facts.forEach(mem => {
      context += `- ${mem.content} (relevância: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Emoções recentes
  if (emotions.length) {
    context += `Estado emocional recente:\n`;
    emotions.forEach(mem => {
      context += `- ${mem.content} (relevância: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Opiniões da IA (mutáveis)
  if (aiOpinions.length) {
    context += `Minhas opiniões atuais (posso mudar de ideia):\n`;
    aiOpinions.forEach(mem => {
      context += `- ${mem.content} (convicção: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Tópicos
  if (topics.length) {
    context += `Tópicos discutidos:\n`;
    topics.forEach(mem => {
      context += `- ${mem.content} (relevância: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Vocabulário
  if (vocab.length) {
    context += `Vocabulário e definições:\n`;
    vocab.forEach(mem => {
      context += `- ${mem.content} (relevância: ${(mem.relevance * 100).toFixed(0)}%)\n`;
    });
    context += "\n";
  }

  // Histórico recente (filtrado por relevância > 0.3)
  const relevantRecent = recent.filter(r => r.relevance > 0.3).slice(0, 8);
  if (relevantRecent.length) {
    context += `Histórico recente relevante:\n`;
    relevantRecent.reverse().forEach(r => {
      context += `- ${r.content}\n`;
    });
  }

  return context.trim();
}