// Account profiles for the online gateway: display name, short bio, avatar
// photo or color, and password changes. Accounts live in the gateway database;
// the Worker only receives the resulting identity headers.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PROFILE_COLORS = ["#c2410c", "#7c3aed", "#0f766e", "#be123c", "#1d4ed8", "#a16207", "#15803d", "#9333ea"];
const MAX_AVATAR_BYTES = 256 * 1024;
const MAX_JSON_BYTES = 400 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Same palette and hash as the client, so an account keeps its color everywhere. */
export function defaultColor(id) {
  let value = 0;
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) | 0;
  return PROFILE_COLORS[Math.abs(value) % PROFILE_COLORS.length];
}
export const profileColor = account => account.color || defaultColor(account.id);
export const initials = name => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0].toUpperCase()).join("") || "?";

/** Adds the profile columns to databases created before profiles existed. */
export function ensureProfileColumns(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(accounts)").all().map(column => column.name));
  for (const [name, definition] of [["bio", "TEXT NOT NULL DEFAULT ''"], ["color", "TEXT NOT NULL DEFAULT ''"], ["avatar", "BLOB"], ["avatar_type", "TEXT NOT NULL DEFAULT ''"], ["profile_updated_at", "INTEGER NOT NULL DEFAULT 0"]]) {
    if (!columns.has(name)) db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${definition}`);
  }
}

/** Only real PNG, JPEG or WebP data is accepted, whatever the data URL claims. */
export function decodeAvatar(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new ProfileError("La foto debe ser PNG, JPEG o WebP.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw new ProfileError("La foto debe pesar menos de 256 KB.");
  const type = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp" : "";
  if (!type) throw new ProfileError("El archivo no es una imagen válida.");
  return { bytes, type };
}

export class ProfileError extends Error {}

async function jsonBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_JSON_BYTES) throw new ProfileError("Los datos del perfil son demasiado grandes."); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new ProfileError("Los datos del perfil no son válidos."); }
}

function publicProfile(account) {
  return { id: account.id, username: account.username, displayName: account.display_name, bio: account.bio || "", color: profileColor(account), customColor: Boolean(account.color), hasAvatar: Boolean(account.avatar_type), version: account.profile_updated_at || 0 };
}

function avatarSvg(account) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${escapeXml(profileColor(account))}"/><text x="64" y="64" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="50" font-weight="700" fill="#fff">${escapeXml(initials(account.display_name))}</text></svg>`;
}

/**
 * Serves /auth/profile, /auth/password and /auth/avatar/<id> for signed-in
 * accounts. Returns false for other paths so the gateway keeps routing.
 */
export async function handleProfile({ request, response, url, account, db, derive, rawToken, json }) {
  if (!url.pathname.startsWith("/auth/profile") && !url.pathname.startsWith("/auth/password") && !url.pathname.startsWith("/auth/avatar/")) return false;
  if (!account) { json(401, { error: "Ingresá con tu cuenta para ver tu perfil." }); return true; }
  try {
    const avatar = /^\/auth\/avatar\/(vps_[0-9a-f-]{36})$/.exec(url.pathname);
    if (avatar && request.method === "GET") {
      const target = db.prepare("SELECT id, display_name, color, avatar, avatar_type FROM accounts WHERE id = ?").get(avatar[1]);
      if (!target) { json(404, { error: "Cuenta no encontrada." }); return true; }
      const photo = target.avatar_type && target.avatar;
      response.writeHead(200, { "Content-Type": photo ? target.avatar_type : "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=60", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" });
      response.end(photo ? Buffer.from(target.avatar) : avatarSvg(target));
      return true;
    }
    const current = () => db.prepare("SELECT id, username, display_name, bio, color, avatar_type, profile_updated_at FROM accounts WHERE id = ?").get(account.id);
    if (url.pathname === "/auth/profile" && request.method === "GET") { json(200, publicProfile(current())); return true; }
    if (url.pathname === "/auth/profile" && request.method === "POST") {
      const body = await jsonBody(request);
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      const bio = typeof body.bio === "string" ? body.bio.trim() : "";
      const color = typeof body.color === "string" ? body.color.toLowerCase() : "";
      if (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new ProfileError("El nombre debe tener entre 1 y 80 caracteres.");
      if (bio.length > 160 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(bio)) throw new ProfileError("La descripción admite hasta 160 caracteres.");
      if (color && !/^#[0-9a-f]{6}$/.test(color)) throw new ProfileError("Elegí un color válido.");
      const now = Date.now();
      db.prepare("UPDATE accounts SET display_name = ?, bio = ?, color = ?, profile_updated_at = ? WHERE id = ?").run(displayName, bio, color, now, account.id);
      // undefined keeps the photo, null removes it, a data URL replaces it.
      if (body.avatar === null) db.prepare("UPDATE accounts SET avatar = NULL, avatar_type = '' WHERE id = ?").run(account.id);
      else if (body.avatar !== undefined) { const image = decodeAvatar(String(body.avatar)); db.prepare("UPDATE accounts SET avatar = ?, avatar_type = ? WHERE id = ?").run(image.bytes, image.type, account.id); }
      json(200, publicProfile(current())); return true;
    }
    if (url.pathname === "/auth/password" && request.method === "POST") {
      const body = await jsonBody(request);
      const currentPassword = typeof body.current === "string" ? body.current : "", next = typeof body.next === "string" ? body.next : "";
      if (next.length < 12 || next.length > 256) throw new ProfileError("La nueva contraseña debe tener entre 12 y 256 caracteres.");
      const stored = db.prepare("SELECT password_hash, salt FROM accounts WHERE id = ?").get(account.id);
      const candidate = await derive(currentPassword, stored.salt);
      if (!currentPassword || !timingSafeEqual(candidate, Buffer.from(stored.password_hash, "hex"))) { json(403, { error: "La contraseña actual no es correcta." }); return true; }
      const salt = randomBytes(24).toString("hex"), passwordHash = (await derive(next, salt)).toString("hex");
      db.prepare("UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?").run(passwordHash, salt, account.id);
      // Other devices must sign in again with the new password; this one stays signed in.
      const removed = db.prepare("DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?").run(account.id, hash(rawToken));
      json(200, { ok: true, closedSessions: Number(removed.changes) }); return true;
    }
    json(405, { error: "Operación no disponible." }); return true;
  } catch (error) {
    if (error instanceof ProfileError) { json(400, { error: error.message }); return true; }
    if (error?.message === "Intentá de nuevo en unos segundos.") { json(429, { error: error.message }); return true; }
    throw error;
  }
}
