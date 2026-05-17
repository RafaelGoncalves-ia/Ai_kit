import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { loadComfyConfig } from "./comfyConfig.js";

const ROOT_DIR = path.resolve(process.cwd());
const MAP_DIR = path.join(ROOT_DIR, "backend", "config", "comfy-workflows");
const MODEL_MAP_DIR = path.join(ROOT_DIR, "models", "Workflow", "configs");

function readJson(filePath = "") {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath = "", data = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeWorkflowId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.json$/i, "")
    .replace(/[^a-z0-9_.-]+/g, "-") || "wan2.2";
}

function findNode(workflow = {}, nodeId) {
  const id = String(nodeId);
  return (workflow.nodes || []).find((node) => String(node.id) === id) || null;
}

function findSubgraphNode(workflow = {}, subgraphNodeId) {
  const id = String(subgraphNodeId);
  for (const subgraph of workflow.definitions?.subgraphs || []) {
    const node = (subgraph.nodes || []).find((item) => String(item.id) === id);
    if (node) return node;
  }
  return null;
}

function getWidgetValue(node = {}, mapping = {}) {
  if (!node) return undefined;
  if (mapping.widgetName && node.widgets_values && !Array.isArray(node.widgets_values)) {
    return node.widgets_values[mapping.widgetName];
  }
  const index = Number(mapping.widgetIndex ?? 0);
  return Array.isArray(node.widgets_values) ? node.widgets_values[index] : undefined;
}

function setWidgetValue(node = {}, mapping = {}, value) {
  if (!node) {
    throw new Error(`Node nao encontrado: ${mapping.nodeId || mapping.subgraphNodeId}`);
  }
  if (mapping.widgetName) {
    if (!node.widgets_values || Array.isArray(node.widgets_values)) {
      throw new Error(`Node ${node.id} nao possui widgets nomeados.`);
    }
    if (!(mapping.widgetName in node.widgets_values)) {
      throw new Error(`Widget ${mapping.widgetName} nao encontrado no node ${node.id}.`);
    }
    node.widgets_values[mapping.widgetName] = value;
    return;
  }
  const index = Number(mapping.widgetIndex ?? 0);
  if (!Array.isArray(node.widgets_values) || index < 0 || index >= node.widgets_values.length) {
    throw new Error(`Widget index ${index} invalido no node ${node.id}.`);
  }
  node.widgets_values[index] = value;
}

function coerceValue(field = {}, value) {
  if (field.type === "number" || field.type === "range") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (field.type === "select") {
    return value;
  }
  return value;
}

function applyField(workflow = {}, field = {}, value) {
  const targetNode = field.subgraphNodeId
    ? findSubgraphNode(workflow, field.subgraphNodeId)
    : findNode(workflow, field.nodeId);
  setWidgetValue(targetNode, field, coerceValue(field, value));
}

function mutateApiNodeInput(apiPrompt = {}, nodeId, inputName = "", value) {
  const node = apiPrompt[String(nodeId)];
  if (!node) return;
  node.inputs = node.inputs || {};
  node.inputs[inputName] = value;
}

function widgetInputsForNode(node = {}) {
  return (node.inputs || []).filter((input) => input?.widget?.name);
}

function widgetValueForInput(node = {}, input = {}, widgetCursor = { index: 0 }) {
  if (node.widgets_values && !Array.isArray(node.widgets_values)) {
    return node.widgets_values[input.widget.name];
  }
  if (/ksampler/i.test(String(node.type || ""))) {
    const known = {
      seed: 0,
      steps: 2,
      cfg: 3,
      sampler_name: 4,
      scheduler: 5,
      denoise: 6,
      preview_method: 7,
      vae_decode: 8
    };
    if (Object.prototype.hasOwnProperty.call(known, input.widget.name)) {
      return node.widgets_values?.[known[input.widget.name]];
    }
  }
  const value = Array.isArray(node.widgets_values) ? node.widgets_values[widgetCursor.index] : undefined;
  widgetCursor.index += 1;
  return value;
}

export function convertUiWorkflowToApiPrompt(workflow = {}) {
  if (!Array.isArray(workflow.nodes)) {
    return workflow;
  }

  const links = new Map((workflow.links || []).map((link) => [String(link[0]), link]));
  const prompt = {};
  for (const node of workflow.nodes || []) {
    if (node.mode === 4 || node.flags?.bypassed) continue;
    const inputs = {};
    const cursor = { index: 0 };
    const widgetInputs = new Set(widgetInputsForNode(node).map((input) => input.name));

    for (const input of node.inputs || []) {
      if (input.link != null) {
        const link = links.get(String(input.link));
        if (link) inputs[input.name] = [String(link[1]), Number(link[2])];
        continue;
      }
      if (input.widget?.name) {
        const value = widgetValueForInput(node, input, cursor);
        if (value !== undefined) inputs[input.name] = value;
      }
    }

    prompt[String(node.id)] = {
      class_type: node.type,
      inputs,
      _meta: {
        title: node.title || node.type || String(node.id)
      }
    };
  }
  return prompt;
}

function replacePromptRefs(prompt = {}, fromNodeId = "", outputIndex = null, toRef = null) {
  const from = String(fromNodeId);
  for (const node of Object.values(prompt)) {
    for (const [inputName, value] of Object.entries(node.inputs || {})) {
      if (!Array.isArray(value) || String(value[0]) !== from) continue;
      if (outputIndex != null && Number(value[1]) !== Number(outputIndex)) continue;
      node.inputs[inputName] = toRef;
    }
  }
}

function removePromptNodes(prompt = {}, ids = []) {
  for (const id of ids) {
    delete prompt[String(id)];
  }
}

function lowerWan22UiSubgraphs(prompt = {}, values = {}) {
  const modeValue = String(values.mode || "").toLowerCase();
  const isI2v = modeValue === "2" || modeValue === "i2v" || modeValue === "image_to_video" || modeValue === "image-to-video";
  const fps = Math.max(1, Math.round(Number(values.videoFps || values.fps || 16)));
  const seconds = Math.max(1, Math.round(Number(values.seconds || 5)));
  const length = Math.max(1, seconds * fps + 1);
  const width = Math.max(64, Math.round(Number(values.width || 512)));
  const height = Math.max(64, Math.round(Number(values.height || 512)));

  if (prompt["59"]) {
    replacePromptRefs(prompt, "59", 0, [isI2v ? "50" : "40", 0]);
    removePromptNodes(prompt, ["59"]);
  }

  if (prompt["74"]) {
    if (isI2v) {
      prompt["kit_wan_clip_vision"] = {
        class_type: "CLIPVisionLoader",
        inputs: { clip_name: values.clipVision || "D\\clip_vision_h.safetensors" },
        _meta: { title: "KIT Wan CLIP Vision" }
      };
      prompt["kit_wan_clip_vision_encode"] = {
        class_type: "CLIPVisionEncode",
        inputs: {
          clip_vision: ["kit_wan_clip_vision", 0],
          image: ["85", 0],
          crop: "center"
        },
        _meta: { title: "KIT Wan CLIP Vision Encode" }
      };
      prompt["kit_wan_i2v"] = {
        class_type: "WanImageToVideo",
        inputs: {
          positive: ["12", 0],
          negative: ["127", 0],
          vae: ["6", 0],
          clip_vision_output: ["kit_wan_clip_vision_encode", 0],
          start_image: ["85", 0],
          width,
          height,
          length,
          batch_size: 1
        },
        _meta: { title: "KIT Wan I2V" }
      };
      replacePromptRefs(prompt, "74", 1, ["kit_wan_i2v", 0]);
      replacePromptRefs(prompt, "74", 2, ["kit_wan_i2v", 1]);
      replacePromptRefs(prompt, "74", 3, ["kit_wan_i2v", 2]);
    } else {
      prompt["kit_wan_t2v_latent"] = {
        class_type: "EmptyHunyuanVideo15Latent",
        inputs: { width, height, length, batch_size: 1 },
        _meta: { title: "KIT Wan T2V Latent" }
      };
      replacePromptRefs(prompt, "74", 0, ["kit_wan_t2v_latent", 0]);
    }
    replacePromptRefs(prompt, "74", 4, length);
    removePromptNodes(prompt, ["74"]);
  }

  if (prompt["138"]) {
    replacePromptRefs(prompt, "138", 0, Math.max(0, length - 1));
    removePromptNodes(prompt, ["138"]);
  }

  if (prompt["83"]?.inputs) {
    prompt["83"].inputs.skip_first_images = Math.max(0, length - 1);
  }
  if (prompt["115"]?.inputs) {
    prompt["115"].inputs.frame_rate = fps;
  }
  for (const [nodeId, node] of Object.entries(prompt)) {
    if (["MarkdownNote", "GetNode", "SetNode", "Fast Groups Muter (rgthree)"].includes(node.class_type)) {
      delete prompt[nodeId];
    }
  }
  return prompt;
}

export function listComfyWorkflowMaps() {
  const items = [];
  for (const dir of [MAP_DIR, MODEL_MAP_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      try {
        const map = readJson(filePath);
        items.push({ ...map, mapPath: filePath });
      } catch {
        // ignore broken maps in listing
      }
    }
  }
  return items;
}

export function resolveComfyWorkflowMap(workflowId = process.env.WAN_WORKFLOW || "wan2.2") {
  const id = normalizeWorkflowId(workflowId);
  const candidates = [
    path.join(MAP_DIR, `${id}.json`),
    path.join(MAP_DIR, `${id}.map.json`),
    path.join(MODEL_MAP_DIR, `${id}.json`),
    path.join(MODEL_MAP_DIR, `${id}.map.json`),
    path.join(MODEL_MAP_DIR, "WAN2.2.map.json")
  ];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error(`Mapa de workflow ComfyUI nao encontrado para ${id}.`);
  }
  return { ...readJson(filePath), mapPath: filePath };
}

export function listComfyWorkflowFiles() {
  const dirs = [path.join(ROOT_DIR, "models", "Workflow")];
  const seen = new Set();
  return dirs.flatMap((dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name) && !/\.map\.json$/i.test(entry.name))
      .map((entry) => {
        const filePath = path.join(dir, entry.name);
        const key = path.resolve(filePath).toLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        const base = entry.name.replace(/\.json$/i, "");
        const map = listComfyWorkflowMaps().find((item) => (
          normalizeWorkflowId(item.id || item.name) === normalizeWorkflowId(base) ||
          path.resolve(item.workflowPath || "").toLowerCase() === key
        ));
        return {
          id: normalizeWorkflowId(map?.id || base),
          name: map?.name || base,
          workflowPath: filePath,
          hasMap: Boolean(map),
          mapPath: map?.mapPath || ""
        };
      })
      .filter(Boolean);
  });
}

export function getWorkflowUiFields(workflowId = "wan2.2") {
  const map = resolveComfyWorkflowMap(workflowId);
  const workflow = readJson(map.workflowPath);
  const fields = (map.uiFields || []).map((field) => {
    const node = field.subgraphNodeId ? findSubgraphNode(workflow, field.subgraphNodeId) : findNode(workflow, field.nodeId);
    return {
      ...field,
      defaultValue: getWidgetValue(node, field)
    };
  });
  return { ...map, uiFields: fields };
}

export function buildParameterizedWorkflow({ workflowId = "wan2.2", values = {}, jobId = randomUUID() } = {}) {
  const config = loadComfyConfig();
  const map = resolveComfyWorkflowMap(workflowId);
  const workflow = readJson(map.workflowPath);
  const applied = {};
  const fields = map.uiFields || Object.entries(map.nodes || {}).map(([key, value]) => ({ key, ...value }));

  for (const field of fields) {
    const hasValue = Object.prototype.hasOwnProperty.call(values, field.key);
    if (!hasValue) continue;
    applyField(workflow, field, values[field.key]);
    applied[field.key] = values[field.key];
  }

  const apiPrompt = lowerWan22UiSubgraphs(convertUiWorkflowToApiPrompt(workflow), values);
  for (const field of fields) {
    if (!field.subgraphNodeId || !Object.prototype.hasOwnProperty.call(values, field.key)) continue;
    const hostNode = apiPrompt[String(field.nodeId)];
    if (!hostNode) continue;
    hostNode.inputs = hostNode.inputs || {};
    const aliases = {
      width: "Width",
      height: "Height",
      fps: "FPS",
      seconds: "Seconds",
      mode: "value"
    };
    hostNode.inputs[aliases[field.key] || field.key] = coerceValue(field, values[field.key]);
  }
  if (values.filenamePrefix) {
    mutateApiNodeInput(apiPrompt, map.nodes?.filenamePrefix?.nodeId || 104, "value", values.filenamePrefix);
    mutateApiNodeInput(apiPrompt, 115, "filename_prefix", values.filenamePrefix);
  }
  if (values.fps || values.videoFps) {
    mutateApiNodeInput(apiPrompt, map.nodes?.videoFps?.nodeId || 115, "frame_rate", Number(values.videoFps || values.fps));
  }

  const tempPath = path.join(config.tempDir, `${normalizeWorkflowId(map.id)}-${jobId}.json`);
  const apiPath = path.join(config.tempDir, `${normalizeWorkflowId(map.id)}-${jobId}.api.json`);
  writeJson(tempPath, workflow);
  writeJson(apiPath, apiPrompt);
  return {
    map,
    workflow,
    apiPrompt,
    tempPath,
    apiPath,
    applied
  };
}
