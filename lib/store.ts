import { getBinding } from "@/db";
import { Diagram, DiagramInput, TEMPLATES } from "./diagrams";

import { boardAccess, ACCESS_SQL, EDIT_SQL, StoreError } from "./board-access";
export { StoreError } from "./board-access";

export function ownerFrom(request: Request) {
  if (process.env.NEXT_PUBLIC_UML_STORAGE === "browser") throw new StoreError("En esta versión los diagramas se guardan en el navegador. Exportá un proyecto JSON para compartirlo.", 501);
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) throw new StoreError("Inicia sesión para acceder a tus diagramas.", 401);
  return owner;
}

function fromRow(row: Record<string, unknown>): Diagram {
  return {
    id: row.id, name: row.name, type: row.type, project: row.project, source: row.source,
    theme: row.theme, notes: row.notes, access: row.access || "owner", revision: row.revision, updatedAt: row.updated_at,
  } as Diagram;
}

export async function listDiagrams(owner: string): Promise<Diagram[]> {
  const db = getBinding();
  let result = await db.prepare(`SELECT d.*, CASE WHEN d.owner = ? THEN 'owner' ELSE m.role END AS access FROM diagrams d LEFT JOIN diagram_members m ON m.diagram_id = d.id AND m.user_id = ? WHERE ${ACCESS_SQL} ORDER BY d.updated_at DESC`).bind(owner, owner, owner, owner).all();
  const initialized = await db.prepare("SELECT owner FROM workspaces WHERE owner = ?").bind(owner).first();
  if (!initialized) {
    const now = new Date().toISOString();
    await db.batch([...TEMPLATES.slice(0, 3).map((t, i) => db.prepare(
      "INSERT OR IGNORE INTO diagrams (id, owner, name, type, project, source, theme, notes, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(`${owner}-example-${i}`, owner, t.name, t.type, "Mi primer proyecto", t.source, "studio", "", 1, now)),
    db.prepare("INSERT OR IGNORE INTO workspaces (owner, initialized_at) VALUES (?, ?)").bind(owner, now)]);
    result = await db.prepare(`SELECT d.*, CASE WHEN d.owner = ? THEN 'owner' ELSE m.role END AS access FROM diagrams d LEFT JOIN diagram_members m ON m.diagram_id = d.id AND m.user_id = ? WHERE ${ACCESS_SQL} ORDER BY d.updated_at DESC`).bind(owner, owner, owner, owner).all();
  }
  return result.results.map(fromRow);
}

export async function getDiagram(owner: string, id: string): Promise<Diagram> {
  return fromRow(await boardAccess(getBinding(), owner, id));
}

export async function createDiagram(owner: string, data: DiagramInput) {
  const doc: Diagram = { ...data, id: crypto.randomUUID(), revision: 1, updatedAt: new Date().toISOString() };
  await getBinding().prepare("INSERT INTO diagrams (id, owner, name, type, project, source, theme, notes, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(doc.id, owner, doc.name, doc.type, doc.project, doc.source, doc.theme, doc.notes, doc.revision, doc.updatedAt).run();
  return doc;
}

export async function saveDiagram(owner: string, id: string, data: DiagramInput, expectedRevision: number) {
  const db = getBinding();
  await boardAccess(db, owner, id, "edit");
  const now = new Date().toISOString();
  // Archive only the revision this write owns; the update uses the same compare-and-swap condition.
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO revisions (id, diagram_id, revision, snapshot, created_at) SELECT id || '-' || revision, id, revision, json_object('id', id, 'name', name, 'type', type, 'project', project, 'source', source, 'theme', theme, 'notes', notes, 'revision', revision, 'updatedAt', updated_at), ? FROM diagrams WHERE id = ? AND ${EDIT_SQL} AND revision = ?`)
      .bind(now, id, owner, owner, expectedRevision),
    db.prepare(`UPDATE diagrams SET name = ?, type = ?, project = ?, source = ?, theme = ?, notes = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND ${EDIT_SQL} AND revision = ?`)
      .bind(data.name, data.type, data.project, data.source, data.theme, data.notes, now, id, owner, owner, expectedRevision),
  ]);
  if (results[1].meta.changes !== 1) throw new StoreError("El diagrama cambio en otra ventana o en el chat. Descarga tu copia y recarga para ver la última versión.", 409);
  return getDiagram(owner, id);
}

export async function deleteDiagram(owner: string, id: string, revision: number) {
  await boardAccess(getBinding(), owner, id, "owner");
  // Cascaded history deletions also count as changes; inspect the deleted row instead.
  const deleted = await getBinding().prepare("DELETE FROM diagrams WHERE id = ? AND owner = ? AND revision = ? RETURNING id").bind(id, owner, revision).first();
  if (!deleted) throw new StoreError("El diagrama cambio. Recarga antes de eliminarlo.", 409);
}

export async function getHistory(owner: string, id: string) {
  await getDiagram(owner, id);
  const result = await getBinding().prepare("SELECT revision, snapshot, created_at FROM revisions WHERE diagram_id = ? ORDER BY revision DESC LIMIT 30").bind(id).all();
  return result.results.map(row => ({ revision: row.revision, createdAt: row.created_at, diagram: JSON.parse(row.snapshot as string) }));
}
