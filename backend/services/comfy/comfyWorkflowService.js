import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { loadComfyConfig } from "./comfyConfig.js";

const ROOT_DIR = path.resolve(process.cwd());
const MAP_DIR = path.join(ROOT_DIR, "backend", "config", "comfy-workflows");
const MODEL_MAP_DIR = path.join(ROOT_DIR, "models", "Workflow", "configs");
const ADVANCED_PARAM_GROUPS = Object.freeze({
  "Aderencia da imagem": new Set([
    "denoise",
    "strength",
    "image_strength",
    "reference_strength",
    "image_weight",
    "ref_strength",
    "init_image_strength"
  ]),
  "Guidance / condicionamento": new Set(["guidance", "guidance_scale"]),
  "Forca do prompt": new Set(["cfg", "cfg_scale"]),
  Movimento: new Set(["motion_strength", "motion_scale", "motion_bucket_id", "motion"])
});
const LOCKED_ADVANCED_INPUTS = new Set(["steps"]);

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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function logAdvancedParam(logger = console.log, message = "") {
  const line = `[COMFYUI][ADV_PARAMS] ${message}`;
  logger(line);
  return line;
}

function normalizeAdvancedInputName(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getAdvancedParamGroup(inputName = "") {
  const normalized = normalizeAdvancedInputName(inputName);
  for (const [group, names] of Object.entries(ADVANCED_PARAM_GROUPS)) {
    if (names.has(normalized)) {
      return group;
    }
  }
  return "";
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

function randomComfySeed() {
  return Math.floor(Math.random() * 2147483648);
}

function normalizeComfySeed(value) {
  if (value == null || value === "" || String(value).trim().toLowerCase() === "random") {
    return randomComfySeed();
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return randomComfySeed();
  }
  return Math.max(0, Math.min(2147483647, Math.trunc(numeric)));
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
  applyUseEverywhereLinks(workflow, prompt);
  return prompt;
}

function applyUseEverywhereLinks(workflow = {}, prompt = {}) {
  const nodesById = new Map((workflow.nodes || []).map((node) => [String(node.id), node]));
  for (const link of workflow.extra?.ue_links || []) {
    const downstreamId = String(link.downstream ?? "");
    const upstreamId = String(link.upstream ?? "");
    const downstream = nodesById.get(downstreamId);
    const input = downstream?.inputs?.[Number(link.downstream_slot)];
    if (!downstream || !input?.name || !prompt[downstreamId] || !prompt[upstreamId]) continue;
    prompt[downstreamId].inputs = prompt[downstreamId].inputs || {};
    prompt[downstreamId].inputs[input.name] = [upstreamId, Number(link.upstream_slot || 0)];
  }
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
      replacePromptRefs(prompt, "74", 0, ["kit_wan_i2v", 2]);
    } else {
      prompt["kit_wan_t2v_latent"] = {
        class_type: "EmptyHunyuanVideo15Latent",
        inputs: { width, height, length, batch_size: 1 },
        _meta: { title: "KIT Wan T2V Latent" }
      };
      replacePromptRefs(prompt, "74", 0, ["kit_wan_t2v_latent", 0]);
      replacePromptRefs(prompt, "74", 1, ["12", 0]);
      replacePromptRefs(prompt, "74", 2, ["127", 0]);
      replacePromptRefs(prompt, "74", 3, ["kit_wan_t2v_latent", 0]);
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

export class ComfyWorkflowValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ComfyWorkflowValidationError";
    this.code = "COMFY_WORKFLOW_VALIDATION_FAILED";
    this.phase = "workflow_validation_failed";
    this.details = details;
  }
}

function nodeLabel(nodeId, node = {}) {
  return `${node._meta?.title || node.class_type || "node"} ${nodeId}`;
}

function isNodeRef(value) {
  return Array.isArray(value) && value.length >= 2 && value[0] != null;
}

function hasValidRef(prompt = {}, value) {
  return isNodeRef(value) && Boolean(prompt[String(value[0])]);
}

function upstreamContains(prompt = {}, ref, matcher, seen = new Set()) {
  if (!hasValidRef(prompt, ref)) return false;
  const nodeId = String(ref[0]);
  if (seen.has(nodeId)) return false;
  seen.add(nodeId);
  const node = prompt[nodeId];
  if (matcher(node, nodeId)) return true;
  return Object.values(node.inputs || {}).some((value) => upstreamContains(prompt, value, matcher, seen));
}

function requireInput(prompt = {}, details = [], nodeId = "", inputName = "") {
  const node = prompt[String(nodeId)];
  const value = node?.inputs?.[inputName];
  if (!node || value == null || value === "" || (isNodeRef(value) && !hasValidRef(prompt, value))) {
    details.push(`${nodeLabel(nodeId, node)}: input obrigatorio ausente: ${inputName}`);
    return null;
  }
  return value;
}

function sanitizePromptSeeds(prompt = {}) {
  for (const node of Object.values(prompt)) {
    if (!/ksampler/i.test(String(node.class_type || ""))) continue;
    node.inputs = node.inputs || {};
    node.inputs.seed = normalizeComfySeed(node.inputs.seed);
  }
}

function catalogAdvancedWorkflowParams(apiPrompt = {}, logger = console.log) {
  const params = [];
  let sawSteps = false;
  for (const [nodeId, node] of Object.entries(apiPrompt || {})) {
    const classType = String(node?.class_type || "");
    for (const [inputName, value] of Object.entries(node?.inputs || {})) {
      const normalized = normalizeAdvancedInputName(inputName);
      if (LOCKED_ADVANCED_INPUTS.has(normalized)) {
        sawSteps = true;
        continue;
      }
      const group = getAdvancedParamGroup(inputName);
      if (!group) continue;
      const entry = {
        id: `${nodeId}:${inputName}`,
        group,
        nodeId: String(nodeId),
        class_type: classType,
        inputName,
        value
      };
      params.push(entry);
      logAdvancedParam(logger, `found group=${group} nodeId=${nodeId} class_type=${classType} input=${inputName} value=${JSON.stringify(value)}`);
    }
  }
  logAdvancedParam(logger, sawSteps ? "steps ignored/locked" : "steps ignored/locked");
  return params;
}

function coerceAdvancedValue(originalValue, editedValue) {
  if (typeof originalValue === "number") {
    const numeric = Number(editedValue);
    return Number.isFinite(numeric) ? numeric : originalValue;
  }
  if (typeof originalValue === "boolean") {
    return editedValue === true || String(editedValue).toLowerCase() === "true";
  }
  return editedValue;
}

function applyAdvancedWorkflowOverrides(apiPrompt = {}, overrides = [], logger = console.log) {
  const clonedPrompt = cloneJson(apiPrompt || {});
  const items = Array.isArray(overrides) ? overrides : [];
  for (const item of items) {
    const nodeId = String(item?.nodeId || "");
    const inputName = String(item?.inputName || "");
    if (!nodeId || !inputName) continue;
    if (LOCKED_ADVANCED_INPUTS.has(normalizeAdvancedInputName(inputName))) {
      logAdvancedParam(logger, "steps ignored/locked");
      continue;
    }
    const node = clonedPrompt[nodeId];
    if (!node?.inputs || !Object.prototype.hasOwnProperty.call(node.inputs, inputName)) continue;
    if (!getAdvancedParamGroup(inputName)) continue;
    const from = node.inputs[inputName];
    const to = coerceAdvancedValue(from, item.value);
    if (Object.is(from, to)) continue;
    node.inputs[inputName] = to;
    logAdvancedParam(logger, `override nodeId=${nodeId} input=${inputName} from=${JSON.stringify(from)} to=${JSON.stringify(to)}`);
  }
  return clonedPrompt;
}

export function validateComfyApiPrompt(apiPrompt = {}, { mode = "t2v", outputType = "video" } = {}) {
  const details = [];
  const isVideo = String(outputType || "").toLowerCase() === "video";
  const isI2v = ["2", "i2v", "image_to_video", "image-to-video"].includes(String(mode || "").toLowerCase());

  for (const [nodeId, node] of Object.entries(apiPrompt || {})) {
    for (const [inputName, value] of Object.entries(node.inputs || {})) {
      if (isNodeRef(value) && !hasValidRef(apiPrompt, value)) {
        details.push(`${nodeLabel(nodeId, node)}: input ${inputName} referencia node inexistente ${value[0]}`);
      }
    }
  }

  const samplers = Object.entries(apiPrompt || {}).filter(([, node]) => /ksampler/i.test(String(node.class_type || "")));
  if (!samplers.length) {
    details.push("Workflow invalido: nenhum sampler foi encontrado.");
  }
  for (const [nodeId, node] of samplers) {
    const seed = Number(node.inputs?.seed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
      details.push(`${nodeLabel(nodeId, node)}: seed invalido (${node.inputs?.seed}); use 0..2147483647`);
    }
    const modelRef = requireInput(apiPrompt, details, nodeId, "model");
    requireInput(apiPrompt, details, nodeId, "positive");
    requireInput(apiPrompt, details, nodeId, "negative");
    requireInput(apiPrompt, details, nodeId, "latent_image");
    if (modelRef && !upstreamContains(apiPrompt, modelRef, (item) => /loader|unet|checkpoint|model/i.test(String(item.class_type || "")))) {
      details.push(`${nodeLabel(nodeId, node)}: model nao possui cadeia ate loader/modelo.`);
    }
  }

  if (isVideo) {
    const videoCombines = Object.entries(apiPrompt || {}).filter(([, node]) => String(node.class_type || "") === "VHS_VideoCombine");
    if (!videoCombines.length) {
      details.push("Workflow de video invalido: node VHS_VideoCombine ausente.");
    }
    for (const [nodeId, node] of videoCombines) {
      const imagesRef = requireInput(apiPrompt, details, nodeId, "images");
      if (imagesRef && !upstreamContains(apiPrompt, imagesRef, (item) => /ksampler/i.test(String(item.class_type || "")))) {
        details.push(`${nodeLabel(nodeId, node)}: images nao possui cadeia ate sampler.`);
      }
    }

    for (const [nodeId, node] of Object.entries(apiPrompt || {}).filter(([, item]) => String(item.class_type || "") === "VHS_SelectEveryNthImage")) {
      requireInput(apiPrompt, details, nodeId, "images");
    }
  }

  if (isI2v) {
    const loadImages = Object.entries(apiPrompt || {}).filter(([, node]) => String(node.class_type || "") === "LoadImage");
    if (!loadImages.some(([, node]) => String(node.inputs?.image || "").trim())) {
      details.push("Workflow I2V invalido: LoadImage nao recebeu imagem inicial.");
    }
    const i2vNodes = Object.entries(apiPrompt || {}).filter(([, node]) => String(node.class_type || "") === "WanImageToVideo");
    if (!i2vNodes.length) {
      details.push("Workflow I2V invalido: node WanImageToVideo ausente.");
    }
    for (const [nodeId, node] of i2vNodes) {
      const startRef = requireInput(apiPrompt, details, nodeId, "start_image");
      if (startRef && !upstreamContains(apiPrompt, startRef, (item) => String(item.class_type || "") === "LoadImage")) {
        details.push(`${nodeLabel(nodeId, node)}: start_image nao possui cadeia ate LoadImage.`);
      }
    }
  }

  if (details.length) {
    throw new ComfyWorkflowValidationError(
      `Workflow invalido no ComfyUI: o grafo nao executaria porque ha conexoes obrigatorias ausentes. ${details.slice(0, 6).join("; ")}`,
      details
    );
  }

  return { ok: true };
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
    const workflowDir = path.join(ROOT_DIR, "models", "Workflow");
    const workflowFile = fs.existsSync(workflowDir)
      ? fs.readdirSync(workflowDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.json$/i.test(entry.name) && !/\.map\.json$/i.test(entry.name))
        .map((entry) => path.join(workflowDir, entry.name))
        .find((candidate) => normalizeWorkflowId(path.basename(candidate, ".json")) === id)
      : "";
    if (workflowFile) {
      return {
        id,
        name: path.basename(workflowFile, ".json"),
        workflowPath: workflowFile,
        outputType: "video",
        engine: "comfyui",
        nodes: {},
        uiFields: [],
        mapPath: ""
      };
    }
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
  logAdvancedParam(console.log, `workflow loaded=${map.workflowPath}`);
  const fields = (map.uiFields || []).map((field) => {
    const node = field.subgraphNodeId ? findSubgraphNode(workflow, field.subgraphNodeId) : findNode(workflow, field.nodeId);
    return {
      ...field,
      defaultValue: getWidgetValue(node, field)
    };
  });
  const apiPrompt = lowerWan22UiSubgraphs(convertUiWorkflowToApiPrompt(cloneJson(workflow)), {});
  const advancedParams = catalogAdvancedWorkflowParams(apiPrompt, console.log);
  return { ...map, uiFields: fields, advancedParams };
}

export function buildParameterizedWorkflow({ workflowId = "wan2.2", values = {}, jobId = randomUUID(), logger = console.log } = {}) {
  const config = loadComfyConfig();
  const map = resolveComfyWorkflowMap(workflowId);
  const originalWorkflowText = fs.readFileSync(map.workflowPath, "utf8");
  const workflow = JSON.parse(originalWorkflowText);
  logAdvancedParam(logger, `workflow loaded=${map.workflowPath}`);
  const applied = {};
  const fields = map.uiFields || Object.entries(map.nodes || {}).map(([key, value]) => ({ key, ...value }));

  for (const field of fields) {
    const hasValue = Object.prototype.hasOwnProperty.call(values, field.key);
    if (!hasValue) continue;
    applyField(workflow, field, values[field.key]);
    applied[field.key] = values[field.key];
  }

  let apiPrompt = lowerWan22UiSubgraphs(convertUiWorkflowToApiPrompt(workflow), values);
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
  catalogAdvancedWorkflowParams(apiPrompt, logger);
  apiPrompt = applyAdvancedWorkflowOverrides(apiPrompt, values.workflowAdvancedParams, logger);
  sanitizePromptSeeds(apiPrompt);
  validateComfyApiPrompt(apiPrompt, { mode: values.mode, outputType: map.outputType || "video" });
  logAdvancedParam(logger, `original workflow unchanged=${fs.readFileSync(map.workflowPath, "utf8") === originalWorkflowText}`);

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
