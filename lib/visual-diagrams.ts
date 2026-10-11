import { cleanSource, readCanvas, writeCanvas } from "./canvas.ts";

import type { DiagramType } from "./diagrams.ts";



export type VisualNode = { id: string; label: string; kind: string; body: string };

export type VisualRelation = { line: number; from: string; to: string; kind: string; label: string };

export const NODE_KINDS: Record<string, { value: string; label: string }[]> = {

  usecase: [{ value: "actor", label: "Actor" }, { value: "usecase", label: "Caso de uso" }],

  activity: [{ value: "activity", label: "Actividad" }, { value: "decision", label: "Decisión" }, { value: "terminal", label: "Inicio / fin" }],

  component: [{ value: "component", label: "Componente" }, { value: "database", label: "Base de datos" }],

  state: [{ value: "state", label: "Estado" }],

  sequence: [{ value: "participant", label: "Participante" }, { value: "actor", label: "Actor" }],

  er: [{ value: "entity", label: "Entidad" }],

};

export const VISUAL_RELATIONS: Record<string, { value: string; name: string }[]> = {

  usecase: [{ value: "---", name: "Asociación" }, { value: "include", name: "«include»" }, { value: "extend", name: "«extend»" }, { value: "-->", name: "Conexión dirigida" }],

  activity: [{ value: "-->", name: "Flujo" }, { value: "-.->", name: "Flujo discontinuo" }],

  component: [{ value: "-->", name: "Conexión" }, { value: "-.->", name: "Dependencia" }, { value: "---", name: "Vínculo" }],

  state: [{ value: "-->", name: "Transición" }],

  sequence: [{ value: "->>", name: "Mensaje" }, { value: "-->>", name: "Respuesta" }, { value: "-)", name: "Mensaje asíncrono" }, { value: "--)", name: "Respuesta asíncrona" }, { value: "-x", name: "Mensaje perdido" }],

  er: [{ value: "||--||", name: "Uno a uno" }, { value: "||--o{", name: "Uno a cero o muchos" }, { value: "||--|{", name: "Uno a uno o muchos" }, { value: "}o--o{", name: "Muchos a muchos" }, { value: "||..o{", name: "Uno a muchos, no identificadora" }],

};

const idPattern = "[A-Za-z_][\\w-]*";

const flowNode = new RegExp(`\\b(${idPattern})(\\(\\[([^\\n]*?)\\]\\)|\\[\\(([^\\n]*?)\\)\\]|\\[\\[([^\\n]*?)\\]\\]|\\[([^\\n]*?)\\]|\\{([^\\n]*?)\\}|\\(([^\\n]*?)\\))(:::([\\w-]+))?`, "g");

const unquote = (s: string) => s.trim().replace(/^"|"$/g, "");

const quote = (s: string) => s.trim().replaceAll('"', "#quot;").replace(/[\r\n]/g, " ");

function validId(id: string) { if (!/^[A-Za-z_][\w-]*$/.test(id)) throw new Error("Usá un identificador sin espacios: letras, números, guion o guion bajo."); }

function preserve(source: string, content: string) { return writeCanvas(content, readCanvas(source)); }



export function visualNodes(source: string, type: DiagramType): VisualNode[] {

  if (type === "class") return [];

  const content = cleanSource(source), nodes = new Map<string, VisualNode>();

  if (type === "sequence") for (const m of content.matchAll(/^\s*(participant|actor)\s+([\w-]+)(?:\s+as\s+(.+))?\s*$/gm)) nodes.set(m[2], { id: m[2], label: m[3] || m[2], kind: m[1], body: "" });

  else if (type === "er") for (const m of content.matchAll(/^\s*([\w-]+)\s*\{([^}]*?)\}/gm)) nodes.set(m[1], { id: m[1], label: m[1], kind: "entity", body: m[2].trim() });

  else if (type === "state") for (const m of content.matchAll(/^\s*state\s+"([^"]+)"\s+as\s+([\w-]+)\s*$/gm)) nodes.set(m[2], { id: m[2], label: m[1], kind: "state", body: "" });

  else for (const m of content.matchAll(flowNode)) {

    const prefix = content.slice(0, m.index).split("\n").at(-1) || "";

    if (/^\s*subgraph\b/.test(prefix)) continue;

    const label = unquote(m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? m[8] ?? m[1]);

    const scope = content.slice(0, m.index).split("\n").reduce((depth, line) => /^\s*subgraph\b/.test(line) ? depth + 1 : /^\s*end\s*$/.test(line) ? Math.max(0, depth - 1) : depth, 0);

    const actor = m[10] === "umlActor" || (type === "usecase" && scope === 0 && m[2].startsWith("[") && !m[2].startsWith("[("));

    nodes.set(m[1], { id: m[1], label, kind: actor ? "actor" : m[3] != null ? (type === "usecase" ? "usecase" : "terminal") : m[4] != null ? "database" : m[7] != null ? "decision" : type === "component" ? "component" : "activity", body: "" });

  }

  for (const edge of visualRelations(source, type)) for (const id of [edge.from, edge.to]) if (id !== "[*]" && !nodes.has(id)) nodes.set(id, { id, label: id, kind: NODE_KINDS[type]?.[0]?.value || "state", body: "" });

  return [...nodes.values()];

}

export function visualRelations(source: string, type: DiagramType): VisualRelation[] {

  const result: VisualRelation[] = [];

  const endpoint = `(${idPattern}?|\\[\\*\\])`;

  const op = type === "er" ? "([|o}{]+(?:--|\\.\\.)[|o}{]+)" : type === "sequence" ? "(--?>>|--?\\)|--?x|--?>)" : "(-->|---|--|-\\.[^\\n]*?\\.->|-.->)";

  const re = new RegExp(`^\\s*${endpoint}\\s*${op}\\s*${endpoint}\\s*(?::\\s*(.*))?$`);

  const flow = new RegExp(`^\\s*${endpoint}\\s*(-->|---|-.->)(?:\\|([^|]*)\\|)?\\s*${endpoint}\\s*$`);

  cleanSource(source).split(/\r?\n/).forEach((text, line) => {

    const normalized = ["activity", "component", "usecase"].includes(type) ? text.replace(flowNode, (_, id) => id) : text;

    const m = normalized.match(re), f = normalized.match(flow);

    if (m) result.push({ line, from: m[1], kind: m[2], to: m[3], label: unquote(m[4] || "") });

    else if (f) result.push({ line, from: f[1], kind: f[2], to: f[4], label: unquote(f[3] || "") });

  });

  return result;

}

function declaration(node: VisualNode, type: DiagramType) {

  validId(node.id); const label = quote(node.label || node.id);

  if (type === "sequence") return `${node.kind === "actor" ? "actor" : "participant"} ${node.id} as ${label}`;

  if (type === "state") return `state "${label}" as ${node.id}`;

  if (type === "er") {

    const body = node.body.trim();

    if (/[{}]/.test(body) || body.split(/\r?\n/).some(line => line.trim() && !/^\s*[\w\[\]-]+\s+[\w-]+(?:\s+(?:PK|FK|UK)(?:,\s*(?:PK|FK|UK))*)?(?:\s+"[^"\n]*")?\s*$/.test(line))) throw new Error('Cada atributo debe tener tipo y nombre; por ejemplo: int id PK o string nombre.');

    return `${node.id} {\n${body.split(/\r?\n/).filter(Boolean).map(l => "  " + l.trim()).join("\n")}\n}`;

  }

  if (node.kind === "actor") return `${node.id}["${label}"]:::umlActor`;

  if (["terminal", "usecase"].includes(node.kind)) return `${node.id}(["${label}"])`;

  if (node.kind === "decision") return `${node.id}{"${label}"}`;

  if (node.kind === "database") return `${node.id}[("${label}")]`;

  if (node.kind === "component") return `${node.id}[["${label}"]]`;

  return `${node.id}["${label}"]`;

}

export function setVisualNode(source: string, type: DiagramType, node: VisualNode, adding = false): string {

  validId(node.id); const nodes = visualNodes(source, type), text = declaration(node, type);

  if (adding && nodes.some(n => n.id === node.id)) throw new Error("Ya existe un elemento con ese identificador.");

  let content = cleanSource(source), replaced = false;

  if (type === "er") content = content.replace(new RegExp(`^\\s*${node.id}\\s*\\{[^}]*\\}`, "m"), () => { replaced = true; return text; });

  else if (type === "sequence") content = content.replace(new RegExp(`^\\s*(?:participant|actor)\\s+${node.id}(?:\\s+as\\s+[^\\n]*)?\\s*$`, "m"), () => { replaced = true; return text; });

  else if (type === "state") content = content.replace(new RegExp(`^\\s*state\\s+"[^"\\n]*"\\s+as\\s+${node.id}\\s*$`, "m"), () => { replaced = true; return text; });

  else content = content.replace(flowNode, (match, id) => { if (id !== node.id) return match; replaced = true; return text; });

  if (!replaced) {

    const lines = content.split("\n");

    // Participants must precede messages to retain their intended order.

    if (type === "sequence") { let index = 1; while (index < lines.length && /^\s*(?:autonumber|actor|participant|%%)/.test(lines[index])) index++; lines.splice(index, 0, text); }

    else lines.splice(1, 0, text);

    content = lines.join("\n");

  }

  return preserve(source, content);

}

export function addVisualRelation(source: string, type: DiagramType, from: string, to: string, kind: string, label: string) {
  if (/[\r\n{};]/.test(label) || label.includes("%%")) throw new Error("Usá una etiqueta de una sola línea, sin instrucciones Mermaid.");

  const ids = visualNodes(source, type).map(n => n.id);

  for (const id of [from, to]) if (!ids.includes(id) && !(type === "state" && id === "[*]")) throw new Error("Elegí elementos que existan en el diagrama.");

  if (!VISUAL_RELATIONS[type]?.some(r => r.value === kind)) throw new Error("Ese tipo de conexión no corresponde al diagrama.");

  const safe = quote(label).replaceAll("|", "#124;"); let text: string;

  if (type === "er") text = `${from} ${kind} ${to} : "${safe || "relación"}"`;
  else if (type === "sequence") text = `${from} ${kind} ${to} : ${safe || "relación"}`;

  else if (type === "state") text = `${from} --> ${to}${safe ? " : " + safe : ""}`;

  else if (["include", "extend"].includes(kind)) text = `${from} -. "«${kind}»" .-> ${to}`;

  else text = `${from} ${kind}${safe ? `|"${safe}"|` : ""} ${to}`;

  return preserve(source, cleanSource(source) + "\n" + text);

}

export function updateVisualRelation(source: string, type: DiagramType, old: VisualRelation, patch: VisualRelation) {

  const lines = cleanSource(source).split("\n"), current = visualRelations(source, type).find(r => r.line === old.line);

  if (!current || current.from !== old.from || current.to !== old.to) throw new Error("La conexión cambió. Volvé a seleccionarla.");

  const kind = patch.kind.includes("include") ? "include" : patch.kind.includes("extend") ? "extend" : patch.kind;

  const built = cleanSource(addVisualRelation(source, type, patch.from, patch.to, kind, patch.label)).split("\n").at(-1)!;

  const declarations = [...lines[old.line].matchAll(flowNode)].map(m => m[0]);

  lines[old.line] = [...declarations, built].join("\n"); return preserve(source, lines.join("\n"));

}

export function removeVisualRelation(source: string, type: DiagramType, edge: VisualRelation) {

  const current = visualRelations(source, type).find(r => r.line === edge.line);

  if (!current || current.from !== edge.from || current.to !== edge.to) throw new Error("La conexión cambió. Volvé a seleccionarla.");

  return preserve(source, cleanSource(source).split("\n").flatMap((line, i) => i !== edge.line ? [line] : [...line.matchAll(flowNode)].map(m => m[0])).join("\n"));

}

export function removeVisualNode(source: string, type: DiagramType, id: string) {

  validId(id); let content = cleanSource(source);

  if (type === "er") content = content.replace(new RegExp(`^\\s*${id}\\s*\\{[^}]*\\}\\s*`, "m"), "");

  const token = new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`);

  const lines = content.split("\n").filter(line => {

    const syntax = line.replace(/"[^"\n]*"/g, '""').split(/\s:\s|\|/)[0];

    if (!token.test(syntax) || /^\s*%%/.test(line)) return true;

    // Complex inline chains, notes and composite states need source editing.

    if ((line.match(/-->|---|-.->/g) || []).length > 1 || /^\s*(note|subgraph|classDef|class |style|click|state .*\{)/.test(line)) throw new Error("Este elemento participa en una declaración compuesta. Separala en líneas desde Código antes de eliminarlo.");

    return false;

  });

  const settings = readCanvas(source); delete settings.positions[id];

  return writeCanvas(lines.join("\n"), settings);

}
