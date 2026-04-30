import { createWebNavigationEngine } from "./webNavigationEngine.js";

function wrapOk(data = {}) {
  return {
    status: "ok",
    data
  };
}

function wrapError(message, data = {}) {
  return {
    status: "error",
    error: message,
    data
  };
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferIntent(query = "", explicitIntent = "") {
  const normalizedExplicit = normalizeComparableText(explicitIntent);
  if (["price", "news", "media", "cinema", "anime", "local_service", "debug", "general"].includes(normalizedExplicit)) {
    return normalizedExplicit;
  }

  const text = normalizeComparableText(query);
  if (!text) {
    return "general";
  }

  if (
    /\b(preco|preco atual|valor|custa|quanto custa|comparar preco|comparacao|mais barato|pc gamer|notebook|celular)\b/.test(text)
  ) {
    return "price";
  }

  if (
    /\b(noticia|noticias|hoje|agora|ultima|ultimo|mais recente|recentes|lancamento)\b/.test(text)
  ) {
    return "news";
  }

  if (
    /\b(filmes?|cinema|cartaz|programacao|sessao|sessoes)\b/.test(text) &&
    /\b(cartaz|programacao|sessao|sessoes|cinema|hoje|agora)\b/.test(text)
  ) {
    return "cinema";
  }

  if (
    /\b(empresas?|imobiliarias?|lojas?|restaurantes?|servicos?|lava\s*jatos?|lavajatos?|lavagem|estetica automotiva|borracharias?|oficinas?|mecanicas?|barbearias?|saloes?|academias?|clinicas?)\b/.test(text) &&
    /\b(santa luzia|belo horizonte|bh|contagem|betim|nova lima|mg|minas gerais|perto|proximo|endereco|telefone|contato|lista|monte|encontre)\b/.test(text)
  ) {
    return "local_service";
  }

  if (
    /\b(anime|animes|manga|mangas|crunchyroll|anilist|myanimelist|my anime list|temporada de anime|episodio|episodios)\b/.test(text)
  ) {
    return "anime";
  }

  if (
    /\b(personagem|filme|serie|temporada|episodio|episodio|imdb|fandom)\b/.test(text)
  ) {
    return "media";
  }

  if (
    /\b(erro|bug|stack|traceback|exception|typeerror|referenceerror|docs|documentacao|api|stackoverflow|github|mdn)\b/.test(text)
  ) {
    return "debug";
  }

  return "general";
}

function refineQueryForIntent(query = "", intent = "general") {
  const normalizedQuery = String(query || "").trim();
  const text = normalizeComparableText(normalizedQuery);

  if (intent === "anime") {
    const animeTerms = "anime MyAnimeList AniList Crunchyroll Anime News Network LiveChart";
    const currentTerms = /\b(hoje|agora|atual|atuais|lancamento|lancamentos|temporada|temporada atual|episodio|episodios|cartaz|em alta)\b/.test(text)
      ? "season airing currently latest"
      : "";

    return `${normalizedQuery} ${animeTerms} ${currentTerms}`.trim();
  }

  if (intent === "local_service") {
    const localTerms = "endereco telefone contato Google Maps";
    return `${normalizedQuery} ${localTerms}`.trim();
  }

  if (intent !== "cinema") {
    return normalizedQuery;
  }

  const hasLocation = /\b(santa luzia|belo horizonte|bh|contagem|betim|nova lima|mg|minas gerais|sao paulo|rio de janeiro)\b/.test(text);
  const locationHint = hasLocation ? "" : " Brasil";
  const cinemaTerms = "cinema em cartaz hoje programacao sessoes filmes";

  if (text.includes("cinema") || text.includes("cartaz") || text.includes("programacao")) {
    return `${normalizedQuery}${locationHint} ${cinemaTerms}`.trim();
  }

  return `${normalizedQuery}${locationHint} ${cinemaTerms}`.trim();
}

export function createWebSearchTool(context = {}) {
  const engine = createWebNavigationEngine(context);

  return async function webSearchTool(input = {}) {
    const query = String(input.query || input.text || input.prompt || "").trim();
    if (!query) {
      return {
        status: "need_input",
        question: "O que voce quer pesquisar?",
        key: "query",
        default: null
      };
    }

    try {
      const intent = inferIntent(query, input.intent);
      const refinedQuery = refineQueryForIntent(query, intent);
      const result = await engine.runSearch({
        ...input,
        intent,
        query: refinedQuery,
        originalQuery: query
      });

      if (!result.success) {
        return wrapError(result.error || "Falha na pesquisa web.", {
          ...(result.data || {}),
          code: result.code || "WEB_SEARCH_ERROR",
          query
        });
      }

      return wrapOk(result.data);
    } catch (err) {
      return wrapError(`Pesquisa web indisponivel: ${err.message}`, {
        code: "WEB_SEARCH_UNAVAILABLE",
        query
      });
    }
  };
}
