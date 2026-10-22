import { boardAccess } from "./board-access.ts";

/** A tab counts as connected while its heartbeats keep arriving. */
export const PRESENCE_TTL = 20_000;
export type PresenceEntry = { sessionId: string; userId: string; displayName: string; selection: string; color: string; lastSeen: number; self: boolean };

export async function heartbeat(db: D1Database, user: string, displayName: string, id: string, sessionId: string, selection: string, now = Date.now(), color = ""): Promise<PresenceEntry[]> {
  await boardAccess(db, user, id);
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "";
  // A session id belongs to the account that created it; another user cannot take it over.
  await db.batch([
    db.prepare("DELETE FROM board_presence WHERE last_seen < ?").bind(now - PRESENCE_TTL * 3),
    db.prepare("INSERT INTO board_presence (diagram_id, session_id, user_id, display_name, selection, color, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(diagram_id, session_id) DO UPDATE SET display_name = excluded.display_name, selection = excluded.selection, color = excluded.color, last_seen = excluded.last_seen WHERE board_presence.user_id = excluded.user_id")
      .bind(id, sessionId, user, displayName.slice(0, 80), selection.slice(0, 120), safeColor, now),
  ]);
  const rows = await db.prepare("SELECT session_id AS sessionId, user_id AS userId, display_name AS displayName, selection, color, last_seen AS lastSeen FROM board_presence WHERE diagram_id = ? AND last_seen >= ? ORDER BY last_seen DESC").bind(id, now - PRESENCE_TTL).all<Omit<PresenceEntry, "self">>();
  return rows.results.map(row => ({ ...row, lastSeen: Number(row.lastSeen), self: row.sessionId === sessionId }));
}

export async function leave(db: D1Database, user: string, id: string, sessionId: string) {
  await db.prepare("DELETE FROM board_presence WHERE diagram_id = ? AND session_id = ? AND user_id = ?").bind(id, sessionId, user).run();
}
