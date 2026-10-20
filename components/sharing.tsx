"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, Trash2, Users } from "lucide-react";
import Modal from "./modal";
import type { Diagram } from "@/lib/diagrams";
type Sharing = { members: { userId: string; displayName: string; role: "view"|"edit" }[]; invites: { id: string; role: "view"|"edit"; expiresAt: string }[] };
async function request<T = { token: string; id: string }>(method: string, data?: unknown, id?: string) {
  const response = await fetch("/api/sharing" + (id ? "?id=" + encodeURIComponent(id) : ""), { method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json() as T & {error?: string};
  if (!response.ok) throw new Error(result.error || "No se pudo cambiar el acceso.");
  return result as T;
}
export default function SharingDialog({ diagram, onClose }: { diagram: Diagram; onClose: () => void }) {
  const [data,setData] = useState<Sharing>({ members:[], invites:[] });
  const [role,setRole] = useState<"view"|"edit">("view");
  const [link,setLink] = useState("");
  const [linkId,setLinkId] = useState("");
  const [busy,setBusy] = useState(true), [error,setError] = useState("");
  const [copied,setCopied] = useState(false);
  const owner = !diagram.access || diagram.access === "owner";
  async function reload() { if (owner) setData(await request<Sharing>("GET", undefined, diagram.id)); }
  useEffect(() => { let active=true; void (async()=>{try { if(owner) { const result=await request<Sharing>("GET",undefined,diagram.id);if(active)setData(result); }}catch(e){if(active)setError((e as Error).message);}finally{if(active)setBusy(false);}})();return()=>{active=false;}; },[diagram.id,owner]);
  async function mutate(method:string, body:unknown) { setBusy(true);setError("");try { await request(method,body);if(method==="DELETE"&&(body as {invite?:string}).invite===linkId){setLink("");setCopied(false);}await reload(); } catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function create() { setBusy(true);setError("");setCopied(false);try { const result=await request("POST",{id:diagram.id,role});setLink(`${location.origin}/join#${result.token}`);setLinkId(result.id);await reload(); }catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  return <Modal title="Compartir tablero" onClose={onClose}><div className="modal-body share-panel">
    <div className="share-heading"><Users size={24}/><div><strong>{diagram.name}</strong><p>El mismo tablero, desde cualquier dispositivo.</p></div></div>
    {owner ? <>
      <label>Permiso del enlace<select value={role} onChange={e=>{setRole(e.target.value as "view"|"edit");setLink("");setCopied(false);}} disabled={busy}><option value="view">Puede ver</option><option value="edit">Puede editar</option></select></label>
      <p className="form-hint">Quien tenga el enlace podrá unirse con su cuenta. El enlace vence en 7 días; los participantes conservan su acceso hasta que lo quites.</p>
      <button className="btn primary" onClick={()=>void create()} disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Link2 size={16}/>}Crear enlace de invitación</button>
      {link && <div className="share-copy"><input aria-label="Enlace de invitación" readOnly value={link} onFocus={e=>e.target.select()}/><button className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError("Seleccioná y copiá el enlace del campo.");}}}>{copied?<Check size={15}/>:<Copy size={15}/>}Copiar</button></div>}
      <section><h3>Personas con acceso</h3><div className="share-member"><span>Vos</span><strong>Propietario</strong></div>{data.members.map(member=><div className="share-member" key={member.userId}><span>{member.displayName}</span><select aria-label={`Permiso de ${member.displayName}`} disabled={busy} value={member.role} onChange={e=>void mutate("PATCH",{id:diagram.id,member:member.userId,role:e.target.value})}><option value="view">Puede ver</option><option value="edit">Puede editar</option></select><button className="icon-btn" aria-label={`Quitar acceso de ${member.displayName}`} disabled={busy} onClick={()=>void mutate("DELETE",{id:diagram.id,member:member.userId})}><Trash2 size={15}/></button></div>)}{!busy&&!data.members.length&&<p className="form-hint">Todavía no se unió nadie. Compartí una invitación para empezar.</p>}</section>
      {data.invites.length>0&&<section><h3>Invitaciones activas</h3>{data.invites.map(invite=><div className="share-member" key={invite.id}><span>{invite.role==="edit"?"Edición":"Lectura"}<small>Vence {new Date(invite.expiresAt).toLocaleDateString("es-AR")}</small></span><button className="btn" disabled={busy} onClick={()=>void mutate("DELETE",{id:diagram.id,invite:invite.id})}>Revocar enlace</button></div>)}<p className="form-hint">Para quitar un acceso por completo, quitá a la persona y revocá los enlaces de invitación que conserve.</p></section>}
    </> : <p>Tenés permiso de {diagram.access==="view"?"lectura":"edición"}. El propietario administra las invitaciones y los permisos.</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Listo</button></div></Modal>;
}
