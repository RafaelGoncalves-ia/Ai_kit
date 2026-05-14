import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export class NodeRegistry {
  constructor() {
    this.nodes = new Map();
    this.loaded = false;
  }

  register(type, NodeClass) {
    if (!type || typeof NodeClass !== "function") {
      throw new Error("Registro de node invalido.");
    }
    this.nodes.set(type, NodeClass);
  }

  has(type) {
    return this.nodes.has(type);
  }

  create(definition = {}) {
    const NodeClass = this.nodes.get(definition.type);
    if (!NodeClass) {
      const available = Array.from(this.nodes.keys()).sort().join(", ") || "nenhum";
      throw new Error(`Node nao registrado: ${definition.type}. Disponiveis: ${available}`);
    }
    return new NodeClass(definition);
  }

  async loadFromDirectory(rootDir = path.resolve(process.cwd(), "backend", "nodes")) {
    if (this.loaded) {
      return;
    }
    const files = [];
    const walk = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          walk(fullPath);
        } else if (item.isFile() && item.name.endsWith(".js") && item.name !== "base_node.js") {
          files.push(fullPath);
        }
      }
    };
    walk(rootDir);
    for (const filePath of files) {
      const module = await import(pathToFileURL(filePath).href);
      if (typeof module.register === "function") {
        module.register(this);
      }
    }
    this.loaded = true;
  }
}

export const defaultNodeRegistry = new NodeRegistry();
