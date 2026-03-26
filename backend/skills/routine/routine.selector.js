/**
 * Seleciona a melhor ação baseada em score
 */

import { actions } from "./routine.actions.js";

/**
 * Calcula score de todas ações
 */
function evaluateActions(state) {
  return actions.map((action) => {
    let score = 0;

    try {
      score = action.score(state);
    } catch (err) {
      console.error(`Erro ao calcular score de ${action.name}`, err);
    }

    return {
      ...action,
      scoreValue: score,
    };
  });
}

/**
 * Seleciona melhor ação
 */
export function selectBestAction(state) {
  const evaluated = evaluateActions(state);

  // ordena por score
  evaluated.sort((a, b) => b.scoreValue - a.scoreValue);

  return evaluated[0];
}