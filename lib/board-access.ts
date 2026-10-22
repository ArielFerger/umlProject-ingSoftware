export class StoreError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export type BoardRole = "owner" | "edit" | "view";
const PROJECT_MEMBER = (alias: string, table: string) => `EXISTS (SELECT 1 FROM project_members ${alias} WHERE ${alias}.owner = ${table}.owner AND ${alias}.project = ${table}.project AND ${alias}.user_id = ?`;
// A board is reachable by its owner, its own members, or members of its project.
export const ACCESS_SQL = `(d.owner = ? OR EXISTS (SELECT 1 FROM diagram_members m WHERE m.diagram_id = d.id AND m.user_id = ?) OR ${PROJECT_MEMBER("pm", "d")}))`;
export const EDIT_SQL = `(owner = ? OR EXISTS (SELECT 1 FROM diagram_members m WHERE m.diagram_id = diagrams.id AND m.user_id = ? AND m.role = 'edit') OR ${PROJECT_MEMBER("pm", "diagrams")} AND pm.role = 'edit'))`;
// Effective role: the strongest of board membership and project membership.
export const ROLE_SQL = `CASE WHEN d.owner = ? THEN 'owner' WHEN EXISTS (SELECT 1 FROM diagram_members m WHERE m.diagram_id = d.id AND m.user_id = ? AND m.role = 'edit') OR ${PROJECT_MEMBER("pe", "d")} AND pe.role = 'edit') THEN 'edit' ELSE 'view' END AS access, (SELECT pn.owner_name FROM project_members pn WHERE pn.owner = d.owner AND pn.project = d.project AND pn.user_id = ?) AS owner_name`;
/** The user id repeated for each placeholder: ROLE_SQL takes 4, ACCESS_SQL 3 and EDIT_SQL 3. */
export const asUser = (user: string, count: number) => Array<string>(count).fill(user);

export async function boardAccess(db: D1Database, user: string, id: string, minimum: BoardRole = "view") {
  const row = await db.prepare(`SELECT d.*, ${ROLE_SQL} FROM diagrams d WHERE d.id = ? AND ${ACCESS_SQL}`)
    .bind(...asUser(user, 4), id, ...asUser(user, 3)).first<Record<string, unknown>>();
  if (!row) throw new StoreError("No tenés acceso a este tablero.", 404);
  if ((minimum === "owner" && row.access !== "owner") || (minimum === "edit" && row.access === "view")) throw new StoreError("No tenés permiso para realizar este cambio.", 403);
  return row;
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
export async function listSharing(db: D1Database, user: string, id: string) {
  await boardAccess(db, user, id, "owner");
  const [members, invites] = await Promise.all([
    db.prepare("SELECT user_id AS userId, display_name AS displayName, role, joined_at AS joinedAt FROM diagram_members WHERE diagram_id = ? ORDER BY joined_at").bind(id).all(),
    db.prepare("SELECT id, role, expires_at AS expiresAt FROM diagram_invites WHERE diagram_id = ? AND expires_at > ? ORDER BY created_at DESC").bind(id, new Date().toISOString()).all(),
  ]);
  return { members: members.results, invites: invites.results };
}
export async function createInvite(db: D1Database, user: string, id: string, role: "view" | "edit") {
  await boardAccess(db, user, id, "owner");
  const token = newToken();
  const invite = { id: crypto.randomUUID(), role, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  await db.prepare("INSERT INTO diagram_invites (id, diagram_id, token_hash, role, expires_at, created_at) SELECT ?, id, ?, ?, ?, ? FROM diagrams WHERE id = ? AND owner = ?")
    .bind(invite.id, await hashToken(token), role, invite.expiresAt, new Date().toISOString(), id, user).run();
  return { ...invite, token };
}
export async function acceptInvite(db: D1Database, user: string, displayName: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new StoreError("El enlace no es válido o venció.", 404);
  const hash = await hashToken(token), now = new Date().toISOString();
  const invite = await db.prepare("SELECT i.diagram_id, i.role, d.owner FROM diagram_invites i JOIN diagrams d ON d.id = i.diagram_id WHERE i.token_hash = ? AND i.expires_at > ?").bind(hash, now).first<{ diagram_id: string; role: string; owner: string }>();
  if (!invite) return acceptProjectInvite(db, user, displayName, hash, now);
  if (invite.owner !== user) {
    // The INSERT rechecks expiry/revocation. A read link cannot downgrade an editor.
    const joined = await db.prepare("INSERT INTO diagram_members (diagram_id, user_id, display_name, role, joined_at) SELECT diagram_id, ?, ?, role, ? FROM diagram_invites WHERE token_hash = ? AND expires_at > ? ON CONFLICT(diagram_id, user_id) DO UPDATE SET display_name = excluded.display_name, role = CASE WHEN diagram_members.role = 'edit' THEN 'edit' ELSE excluded.role END RETURNING diagram_id")
      .bind(user, displayName.slice(0, 80), now, hash, now).first();
    if (!joined) throw new StoreError("El enlace no es válido o venció.", 404);
  }
  await boardAccess(db, user, invite.diagram_id);
  return { id: invite.diagram_id };
}
export async function changeMember(db: D1Database, user: string, id: string, member: string, role: "view" | "edit") {
  await boardAccess(db, user, id, "owner");
  await db.prepare("UPDATE diagram_members SET role = ? WHERE diagram_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM diagrams d WHERE d.id = diagram_id AND d.owner = ?)").bind(role, id, member, user).run();
}
export async function revokeAccess(db: D1Database, user: string, id: string, target: { member?: string; invite?: string }) {
  await boardAccess(db, user, id, "owner");
  if (target.member) await db.prepare("DELETE FROM diagram_members WHERE diagram_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM diagrams d WHERE d.id = diagram_id AND d.owner = ?)").bind(id, target.member, user).run();
  if (target.invite) await db.prepare("DELETE FROM diagram_invites WHERE diagram_id = ? AND id = ? AND EXISTS (SELECT 1 FROM diagrams d WHERE d.id = diagram_id AND d.owner = ?)").bind(id, target.invite, user).run();
}

// Projects are owned implicitly: a user owns the project names used by their diagrams.
async function ownedProject(db: D1Database, user: string, project: string) {
  const row = await db.prepare("SELECT count(*) AS total FROM diagrams WHERE owner = ? AND project = ?").bind(user, project).first<{ total: number }>();
  if (!row || !Number(row.total)) throw new StoreError("Sólo el propietario de los diagramas puede compartir este proyecto.", 403);
  return Number(row.total);
}
export async function projectRole(db: D1Database, user: string, owner: string, project: string): Promise<BoardRole | null> {
  if (user === owner) return "owner";
  const row = await db.prepare("SELECT role FROM project_members WHERE owner = ? AND project = ? AND user_id = ?").bind(owner, project, user).first<{ role: string }>();
  return row ? row.role === "edit" ? "edit" : "view" : null;
}
export async function listProjectSharing(db: D1Database, user: string, project: string) {
  const diagrams = await ownedProject(db, user, project);
  const [members, invites] = await Promise.all([
    db.prepare("SELECT user_id AS userId, display_name AS displayName, role, joined_at AS joinedAt FROM project_members WHERE owner = ? AND project = ? ORDER BY joined_at").bind(user, project).all(),
    db.prepare("SELECT id, role, expires_at AS expiresAt FROM project_invites WHERE owner = ? AND project = ? AND expires_at > ? ORDER BY created_at DESC").bind(user, project, new Date().toISOString()).all(),
  ]);
  return { members: members.results, invites: invites.results, diagrams };
}
export async function createProjectInvite(db: D1Database, user: string, ownerName: string, project: string, role: "view" | "edit") {
  await ownedProject(db, user, project);
  const token = newToken();
  const invite = { id: crypto.randomUUID(), role, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  await db.prepare("INSERT INTO project_invites (id, owner, project, owner_name, token_hash, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(invite.id, user, project, ownerName.slice(0, 80), await hashToken(token), role, invite.expiresAt, new Date().toISOString()).run();
  return { ...invite, token };
}
async function acceptProjectInvite(db: D1Database, user: string, displayName: string, hash: string, now: string) {
  const invite = await db.prepare("SELECT owner, project FROM project_invites WHERE token_hash = ? AND expires_at > ?").bind(hash, now).first<{ owner: string; project: string }>();
  if (!invite) throw new StoreError("El enlace no es válido o venció.", 404);
  if (invite.owner !== user) {
    const joined = await db.prepare("INSERT INTO project_members (owner, project, owner_name, user_id, display_name, role, joined_at) SELECT owner, project, owner_name, ?, ?, role, ? FROM project_invites WHERE token_hash = ? AND expires_at > ? ON CONFLICT(owner, project, user_id) DO UPDATE SET display_name = excluded.display_name, owner_name = excluded.owner_name, role = CASE WHEN project_members.role = 'edit' THEN 'edit' ELSE excluded.role END RETURNING project")
      .bind(user, displayName.slice(0, 80), now, hash, now).first();
    if (!joined) throw new StoreError("El enlace no es válido o venció.", 404);
  }
  const first = await db.prepare("SELECT id FROM diagrams WHERE owner = ? AND project = ? ORDER BY updated_at DESC LIMIT 1").bind(invite.owner, invite.project).first<{ id: string }>();
  return { id: first?.id || "", project: invite.project };
}
export async function changeProjectMember(db: D1Database, user: string, project: string, member: string, role: "view" | "edit") {
  await ownedProject(db, user, project);
  await db.prepare("UPDATE project_members SET role = ? WHERE owner = ? AND project = ? AND user_id = ?").bind(role, user, project, member).run();
}
export async function revokeProjectAccess(db: D1Database, user: string, project: string, target: { member?: string; invite?: string }) {
  await ownedProject(db, user, project);
  if (target.member) await db.prepare("DELETE FROM project_members WHERE owner = ? AND project = ? AND user_id = ?").bind(user, project, target.member).run();
  if (target.invite) await db.prepare("DELETE FROM project_invites WHERE owner = ? AND project = ? AND id = ?").bind(user, project, target.invite).run();
}
