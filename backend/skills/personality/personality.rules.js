import { resolveResponseTypeFromConfig } from "../../core/personalityConfig.js";

export function resolveResponseType(input) {
  return resolveResponseTypeFromConfig(input || {});
}
