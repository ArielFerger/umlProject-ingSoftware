export class StoreError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export type BoardRole = "owner" | "edit" | "view";
export const ACCESS_SQL = "(d.owner = ? OR EXISTS (SELECT 1 FROM diagram_members m WHERE m.diagram_id = d.id AND m.user_id = ?))";
export const EDIT_SQL = "(owner = ? OR EXISTS (SELECT 1 FROM diagram_members m WHERE m.diagram_id = diagrams.id AND m.user_id = ? AND m.role = 'edit'))";

export async function boardAccess(db: D1Database, user: string, id: string, minimum: BoardRole = "view") {
  const row = await db.prepare(`SELECT d.*, CASE WHEN d.owner = ? THEN 'owner' ELSE m.role END AS access FROM diagrams d LEFT JOIN diagram_members m ON m.diagram_id = d.id AND m.user_id = ? WHERE d.id = ? AND ${ACCESS_SQL}`)
    .bind(user, user, id, user, user).first<Record<string, unknown>>();
  if (!row) throw new StoreError("No tenés acceso a este tablero.", 404);
  if ((minimum === "owner" && row.access !== "owner") || (minimum === "edit" && row.access === "view")) throw new StoreError("No tenés permiso para realizar este cambio.", 403);
  return row;
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
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
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const invite = { id: crypto.randomUUID(), role, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  await db.prepare("INSERT INTO diagram_invites (id, diagram_id, token_hash, role, expires_at, created_at) SELECT ?, id, ?, ?, ?, ? FROM diagrams WHERE id = ? AND owner = ?")
    .bind(invite.id, await hashToken(token), role, invite.expiresAt, new Date().toISOString(), id, user).run();
  return { ...invite, token };
}
export async function acceptInvite(db: D1Database, user: string, displayName: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new StoreError("El enlace no es válido o venció.", 404);
  const hash = await hashToken(token), now = new Date().toISOString();
  const invite = await db.prepare("SELECT i.diagram_id, i.role, d.owner FROM diagram_invites i JOIN diagrams d ON d.id = i.diagram_id WHERE i.token_hash = ? AND i.expires_at > ?").bind(hash, now).first<{ diagram_id: string; role: string; owner: string }>();
  if (!invite) throw new StoreError("El enlace no es válido o venció.", 404);
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
