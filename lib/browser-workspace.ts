import { z } from "zod";
import { diagramInput, TEMPLATES, type Diagram } from "./diagrams.ts";

const savedDiagram = diagramInput.extend({ id: z.string().min(1).max(300), revision: z.number().int().positive(), updatedAt: z.string().datetime() });
const revisionSchema = z.object({ revision: z.number().int().positive(), createdAt: z.string().datetime(), diagram: savedDiagram });
const workspaceSchema = z.object({ version: z.literal(1), documents: z.array(savedDiagram), history: z.record(z.array(revisionSchema).max(30)) });
export type BrowserWorkspace = z.infer<typeof workspaceSchema>;
export class WorkspaceError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function initialWorkspace(): BrowserWorkspace {
  const now = new Date().toISOString();
  return { version: 1, documents: TEMPLATES.slice(0, 3).map(t => ({ name: t.name, type: t.type, source: t.source, project: "Mi primer proyecto", theme: "studio", notes: "", id: crypto.randomUUID(), revision: 1, updatedAt: now })), history: {} };
}
export function readWorkspace(value: unknown): BrowserWorkspace {
  if (value === undefined) return initialWorkspace();
  const parsed = workspaceSchema.safeParse(value);
  if (!parsed.success) throw new WorkspaceError("El espacio guardado no se puede leer. Conservamos los datos: recuperá una copia JSON antes de continuar.", 503);
  return parsed.data;
}
// A single IndexedDB transaction owns revision comparison and the write.
export function workspaceOperation(state: BrowserWorkspace, method: string, query: URLSearchParams, body?: unknown): { state: BrowserWorkspace; result: unknown; status: number } {
  if (method === "GET") {
    const id = query.get("id");
    if (!id) return { state, result: [...state.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), status: 200 };
    const doc = state.documents.find(d => d.id === id);
    if (!doc) throw new WorkspaceError("No se encontró el diagrama.", 404);
    return { state, result: query.has("history") ? state.history[id] || [] : doc, status: 200 };
  }
  if (method === "POST") {
    const doc: Diagram = { ...diagramInput.parse(body), id: crypto.randomUUID(), revision: 1, updatedAt: new Date().toISOString() };
    return { state: { ...state, documents: [...state.documents, doc] }, result: doc, status: 201 };
  }
  if (method !== "PUT" && method !== "DELETE") throw new WorkspaceError("Método no permitido.", 405);
  const ref = z.object({ id: z.string().min(1).max(300), revision: z.number().int().positive() }).parse(body);
  const old = state.documents.find(d => d.id === ref.id);
  if (!old) throw new WorkspaceError("No se encontró el diagrama.", 404);
  if (old.revision !== ref.revision) throw new WorkspaceError("El diagrama cambió en otra ventana. Descargá tu copia y recargá para ver la última versión.", 409);
  if (method === "DELETE") {
    const history = { ...state.history }; delete history[ref.id];
    return { state: { ...state, documents: state.documents.filter(d => d.id !== ref.id), history }, result: { ok: true }, status: 200 };
  }
  const doc: Diagram = { ...diagramInput.parse(body), id: old.id, revision: old.revision + 1, updatedAt: new Date().toISOString() };
  const entry = { revision: old.revision, createdAt: doc.updatedAt, diagram: old };
  return { state: { ...state, documents: state.documents.map(d => d.id === old.id ? doc : d), history: { ...state.history, [old.id]: [entry, ...(state.history[old.id] || [])].slice(0, 30) } }, result: doc, status: 200 };
}
