"use client";
/* eslint-disable @next/next/no-img-element -- Avatars are served by the online gateway behind the session cookie, or are local data URLs; next/image cannot optimize them. */
import { useEffect, useRef, useState } from "react";
import { Check, ImageUp, KeyRound, LoaderCircle, LogOut, Trash2, UserRound } from "lucide-react";
import Modal from "./modal";

export type AccountProfile = { id: string; username: string; displayName: string; bio: string; color: string; customColor: boolean; hasAvatar: boolean; version: number };
export const PROFILE_COLORS = ["#c2410c", "#7c3aed", "#0f766e", "#be123c", "#1d4ed8", "#a16207", "#15803d", "#9333ea"];
/** Avatar image served by the online gateway: the photo, or initials on the account color. */
export const avatarUrl = (userId: string, version?: number) => `/auth/avatar/${encodeURIComponent(userId)}${version ? `?v=${version}` : ""}`;

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo actualizar el perfil.");
  return result;
}

/** Square crop from the center, scaled to 256 px, as a compact data URL. */
async function squareAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Elegí una imagen.");
  if (file.size > 15_000_000) throw new Error("La imagen es demasiado grande (máximo 15 MB).");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height), canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  let url = canvas.toDataURL("image/webp", .86);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", .86);
  if (url.length > 330_000) url = canvas.toDataURL("image/jpeg", .7);
  return url;
}

export default function ProfileDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (profile: AccountProfile) => void }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [color, setColor] = useState("");
  // undefined keeps the saved photo, null removes it, a data URL replaces it.
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [passwordBusy, setPasswordBusy] = useState(false), [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    send<AccountProfile>("/auth/profile", "GET").then(result => { if (!active) return; setProfile(result); setDisplayName(result.displayName); setBio(result.bio); setColor(result.customColor ? result.color : ""); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);

  const shownColor = color || profile?.color || PROFILE_COLORS[0];
  const showsPhoto = avatar === undefined ? profile?.hasAvatar : Boolean(avatar);
  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0].toUpperCase()).join("") || "?";
  const changed = !!profile && (displayName.trim() !== profile.displayName || bio.trim() !== profile.bio || color !== (profile.customColor ? profile.color : "") || avatar !== undefined);

  async function save() {
    if (!profile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await send<AccountProfile>("/auth/profile", "POST", { displayName, bio, color, ...(avatar !== undefined ? { avatar } : {}) });
      setProfile(result); setAvatar(undefined); setColor(result.customColor ? result.color : ""); setDisplayName(result.displayName); setBio(result.bio);
      setNotice("Perfil guardado. Los demás lo verán en sus tableros en menos de un minuto."); onSaved(result);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function changePassword() {
    setPasswordMessage(null);
    if (password.next !== password.confirm) { setPasswordMessage({ ok: false, text: "La nueva contraseña y su confirmación no coinciden." }); return; }
    if (password.next.length < 12) { setPasswordMessage({ ok: false, text: "La nueva contraseña debe tener al menos 12 caracteres." }); return; }
    setPasswordBusy(true);
    try {
      const result = await send<{ closedSessions: number }>("/auth/password", "POST", { current: password.current, next: password.next });
      setPassword({ current: "", next: "", confirm: "" });
      setPasswordMessage({ ok: true, text: result.closedSessions ? `Contraseña cambiada. Se cerró la sesión en ${result.closedSessions === 1 ? "otro dispositivo" : result.closedSessions + " dispositivos"}.` : "Contraseña cambiada." });
    } catch (e) { setPasswordMessage({ ok: false, text: (e as Error).message }); } finally { setPasswordBusy(false); }
  }

  return <Modal title="Mi perfil" onClose={onClose}><div className="modal-body profile-panel">
    {!profile ? <div className="profile-loading">{error ? <p className="form-error" role="alert">{error}</p> : <LoaderCircle className="spin" size={22} />}</div> : <>
      <section className="profile-identity">
        <div className="profile-avatar" style={{ background: shownColor }} aria-hidden="true">
          {showsPhoto ? <img alt="" src={typeof avatar === "string" ? avatar : avatarUrl(profile.id, profile.version)} /> : <span>{initials}</span>}
        </div>
        <div className="profile-avatar-actions">
          <strong>{displayName.trim() || "Sin nombre"}</strong><span>@{profile.username}</span>
          <div>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()} disabled={busy}><ImageUp size={15} />{showsPhoto ? "Cambiar foto" : "Subir foto"}</button>
            {showsPhoto && <button type="button" className="btn" onClick={() => setAvatar(null)} disabled={busy}><Trash2 size={15} />Quitar</button>}
          </div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="file-input" onChange={async e => { const file = e.target.files?.[0]; e.currentTarget.value = ""; if (!file) return; setError(""); try { setAvatar(await squareAvatar(file)); } catch (err) { setError((err as Error).message); } }} />
        </div>
      </section>
      <fieldset className="profile-colors" disabled={busy}><legend>Color {showsPhoto ? "de tu marco en los tableros" : "de tu avatar"}</legend>
        <div className="profile-swatches" role="radiogroup" aria-label="Color del perfil">
          <button type="button" role="radio" aria-checked={!color} className={"profile-auto" + (!color ? " active" : "")} onClick={() => setColor("")} title="Automático">Auto</button>
          {PROFILE_COLORS.map(value => <button key={value} type="button" role="radio" aria-checked={color === value} aria-label={`Color ${value}`} className={color === value ? "active" : ""} style={{ background: value }} onClick={() => setColor(value)}>{color === value && <Check size={14} />}</button>)}
          <label className="profile-custom" title="Otro color"><input type="color" aria-label="Otro color" value={shownColor} onChange={e => setColor(e.target.value.toLowerCase())} /></label>
        </div>
      </fieldset>
      <label>Nombre visible<input required maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)} disabled={busy} /></label>
      <label><span className="profile-label-row">Descripción breve<small className="profile-counter">{bio.length}/160</small></span><textarea rows={2} maxLength={160} value={bio} placeholder="Por ejemplo: Estudiante de Ingeniería en Sistemas" onChange={e => setBio(e.target.value)} disabled={busy} /></label>
      <p className="form-hint">Tu nombre, foto y color se muestran a quienes comparten tableros con vos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="profile-notice" role="status"><Check size={15} />{notice}</p>}
      <div className="profile-save"><button className="btn primary" onClick={() => void save()} disabled={busy || !changed || !displayName.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Guardar perfil</button></div>

      <details className="profile-password">
        <summary><KeyRound size={16} />Cambiar contraseña</summary>
        <form onSubmit={e => { e.preventDefault(); void changePassword(); }}>
          <input type="text" autoComplete="username" value={profile.username} readOnly hidden />
          <label>Contraseña actual<input type="password" autoComplete="current-password" required value={password.current} onChange={e => setPassword({ ...password, current: e.target.value })} /></label>
          <label>Nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} value={password.next} onChange={e => setPassword({ ...password, next: e.target.value })} /></label>
          <label>Repetir nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} value={password.confirm} onChange={e => setPassword({ ...password, confirm: e.target.value })} /></label>
          <p className="form-hint">Al menos 12 caracteres. Se cerrará la sesión en tus otros dispositivos.</p>
          {passwordMessage && <p className={passwordMessage.ok ? "profile-notice" : "form-error"} role={passwordMessage.ok ? "status" : "alert"}>{passwordMessage.text}</p>}
          <button className="btn" disabled={passwordBusy}>{passwordBusy ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}Cambiar contraseña</button>
        </form>
      </details>
    </>}
  </div><div className="modal-footer profile-footer">
    <form method="post" action="/auth/logout"><button className="btn"><LogOut size={16} />Cerrar sesión</button></form>
    <button className="btn primary" onClick={onClose}><UserRound size={16} />Listo</button>
  </div></Modal>;
}
