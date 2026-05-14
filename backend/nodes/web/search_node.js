import BaseNode from "../base_node.js";
import { pesquisarMundoReal } from "../../services/searchService.js";

export class WebSearchNode extends BaseNode {
  async execute({ nodeInputs }) {
    const query = nodeInputs.query || nodeInputs.text || "";
    const text = await pesquisarMundoReal(String(query || ""));
    return { text, query };
  }
}

export function register(registry) {
  registry.register("web.search", WebSearchNode);
}
