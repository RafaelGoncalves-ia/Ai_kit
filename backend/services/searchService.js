import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

config({ path: envPath });

import { tavily } from "@tavily/core";

// Pega a chave direto do ambiente, sem expor no código
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

export async function pesquisarMundoReal(query) {
    try {
        const response = await tvly.search(query, {
            searchDepth: "basic",
            maxResults: 3,
            includeAnswer: true 
        });

        // Retorna o resumo (answer) + o conteúdo das fontes
        const infoSintetizada = response.answer || "Não encontrei um resumo direto.";
        const detalhesFontes = response.results.map(r => `[${r.title}]: ${r.content}`).join('\n');

        return `RESUMO: ${infoSintetizada}\n\nFONTES:\n${detalhesFontes}`;
    } catch (error) {
        console.error("Erro na busca:", error);
        return "O sinal da internet no meu apê 3D tá oscilando, não consegui ver isso agora.";
    }
}