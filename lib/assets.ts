import { boardAccess, StoreError } from "./board-access.ts";
import { decodeImage } from "./images.ts";

/** Stores a picture for a board the user can edit; returns its id. */
export async function storeAsset(db: D1Database, user: string, board: string, dataUrl: string) {
  await boardAccess(db, user, board, "edit");
  const image = decodeImage(dataUrl), id = crypto.randomUUID();
  await db.prepare("INSERT INTO board_assets (id, diagram_id, mime, data, bytes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, board, image.mime, image.bytes, image.bytes.length, user, new Date().toISOString()).run();
  return id;
}

/**
 * Reads a picture for someone who can see `board`, provided that board uses
 * it. Copies and shared boards keep their pictures without a second upload.
 */
export async function readAsset(db: D1Database, user: string, board: string, id: string) {
  await boardAccess(db, user, board);
  const row = await db.prepare("SELECT a.mime, a.data FROM board_assets a WHERE a.id = ? AND EXISTS (SELECT 1 FROM diagrams d WHERE d.id = ? AND instr(d.source, ?) > 0)").bind(id, board, id).first<{ mime: string; data: ArrayBuffer | ArrayLike<number> }>();
  if (!row) throw new StoreError("Imagen no encontrada.", 404);
  return { mime: row.mime, bytes: row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data) };
}
