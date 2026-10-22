"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Folder, Link2, LoaderCircle, Trash2, Users } from "lucide-react";
import Modal from "./modal";
import type { Diagram } from "@/lib/diagrams";
import type { PresenceEntry } from "@/lib/presence";
type Scope = "board" | "project";
type Sharing = { members: { userId: string; displayName: string; role: "view"|"edit" }[]; invites: { id: string; role: "view"|"edit"; expiresAt: string }[]; diagrams?: number };
async function request<T = { token: string; id: string }>(method: string, data?: unknown, query = "") {
  const response = await fetch("/api/sharing" + query, { method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json() as T & {error?: string};
  if (!response.ok) throw new Error(result.error || "No se pudo cambiar el acceso.");
  return result as T;
}
export default function SharingDialog({ diagram, onClose, presence = [], initialScope = "board" }: { diagram: Diagram; onClose: () => void; presence?: PresenceEntry[]; initialScope?: Scope }) {
  const [scope,setScope] = useState<Scope>(initialScope);
  const [data,setData] = useState<Sharing>({ members:[], invites:[] });
  const [role,setRole] = useState<"view"|"edit">("view");
  const [link,setLink] = useState("");
  const [linkId,setLinkId] = useState("");
  const [busy,setBusy] = useState(true), [error,setError] = useState("");
  const [copied,setCopied] = useState(false);
  const owner = !diagram.access || diagram.access === "owner";
  const target = scope === "project" ? { project: diagram.project } : { id: diagram.id };
  const query = scope === "project" ? "?project=" + encodeURIComponent(diagram.project) : "?id=" + encodeURIComponent(diagram.id);
  const online = new Set(presence.filter(p => !p.self).map(p => p.userId));
  async function reload() { if (owner) setData(await request<Sharing>("GET", undefined, query)); }
  useEffect(() => { let active=true; setBusy(true); setError(""); setLink(""); setCopied(false); setData({ members:[], invites:[] }); void (async()=>{try { if(owner) { const result=await request<Sharing>("GET",undefined,query);if(active)setData(result); }}catch(e){if(active)setError((e as Error).message);}finally{if(active)setBusy(false);}})();return()=>{active=false;}; },[query,owner]);
  async function mutate(method:string, body:object) { setBusy(true);setError("");try { await request(method,{...target,...body});if(method==="DELETE"&&(body as {invite?:string}).invite===linkId){setLink("");setCopied(false);}await reload(); } catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  async function create() { setBusy(true);setError("");setCopied(false);try { const result=await request("POST",{...target,role});setLink(`${location.origin}/join#${result.token}`);setLinkId(result.id);await reload(); }catch(e){setError((e as Error).message);}finally{setBusy(false);} }
  const others = presence.filter(p => !p.self);
  return <Modal title={scope === "project" ? "Compartir proyecto" : "Compartir tablero"} onClose={onClose}><div className="modal-body share-panel">
    {owner && <div className="segmented share-scope" role="tablist" aria-label="Qué compartir">
      <button role="tab" aria-selected={scope==="board"} className={scope==="board"?"active":""} onClick={()=>setScope("board")}><Users size={15}/>Este tablero</button>
      <button role="tab" aria-selected={scope==="project"} className={scope==="project"?"active":""} onClick={()=>setScope("project")}><Folder size={15}/>Proyecto completo</button>
    </div>}
    <div className="share-heading">{scope === "project" ? <Folder size={24}/> : <Users size={24}/>}<div><strong>{scope === "project" ? diagram.project : diagram.name}</strong><p>{scope === "project" ? `Incluye ${data.diagrams ?? "todos los"} diagramas del proyecto y los que agregues después.` : "El mismo tablero, desde cualquier dispositivo."}</p></div></div>
    <section className="share-online" aria-live="polite"><h3>Conectados ahora</h3>
      {others.length ? <ul>{others.map(p => <li key={p.sessionId}><span className="presence-dot" />{p.displayName}{p.selection && <small>· en {p.selection}</small>}</li>)}</ul> : <p className="form-hint">Sólo vos tenés abierto este tablero en este momento.</p>}
    </section>
    {owner ? <>
      <label>Permiso del enlace<select value={role} onChange={e=>{setRole(e.target.value as "view"|"edit");setLink("");setCopied(false);}} disabled={busy}><option value="view">Puede ver</option><option value="edit">Puede editar</option></select></label>
      <p className="form-hint">{scope === "project" ? "Quien tenga el enlace verá todos los diagramas del proyecto con su cuenta. Con permiso de edición también puede agregar diagramas al proyecto." : "Quien tenga el enlace podrá unirse con su cuenta."} El enlace vence en 7 días; los participantes conservan su acceso hasta que lo quites.</p>
      <button className="btn primary" onClick={()=>void create()} disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Link2 size={16}/>}Crear enlace de invitación</button>
      {link && <div className="share-copy"><input aria-label="Enlace de invitación" readOnly value={link} onFocus={e=>e.target.select()}/><button className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError("Seleccioná y copiá el enlace del campo.");}}}>{copied?<Check size={15}/>:<Copy size={15}/>}Copiar</button></div>}
      <section><h3>Personas con acceso {scope === "project" ? "al proyecto" : "a este tablero"}</h3><div className="share-member"><span>Vos</span><strong>Propietario</strong></div>{data.members.map(member=><div className="share-member" key={member.userId}><span>{online.has(member.userId) && <span className="presence-dot" title="Conectado ahora" />}{member.displayName}</span><select aria-label={`Permiso de ${member.displayName}`} disabled={busy} value={member.role} onChange={e=>void mutate("PATCH",{member:member.userId,role:e.target.value})}><option value="view">Puede ver</option><option value="edit">Puede editar</option></select><button className="icon-btn" aria-label={`Quitar acceso de ${member.displayName}`} disabled={busy} onClick={()=>void mutate("DELETE",{member:member.userId})}><Trash2 size={15}/></button></div>)}{!busy&&!data.members.length&&<p className="form-hint">Todavía no se unió nadie. Compartí una invitación para empezar.</p>}</section>
      {data.invites.length>0&&<section><h3>Invitaciones activas</h3>{data.invites.map(invite=><div className="share-member" key={invite.id}><span>{invite.role==="edit"?"Edición":"Lectura"}<small>Vence {new Date(invite.expiresAt).toLocaleDateString("es-AR")}</small></span><button className="btn" disabled={busy} onClick={()=>void mutate("DELETE",{invite:invite.id})}>Revocar enlace</button></div>)}<p className="form-hint">Para quitar un acceso por completo, quitá a la persona y revocá los enlaces de invitación que conserve.</p></section>}
    </> : <p>Tenés permiso de {diagram.access==="view"?"lectura":"edición"}{diagram.sharedProject ? <> en el proyecto <strong>{diagram.project}</strong>{diagram.ownerName ? <> de {diagram.ownerName}</> : null}</> : null}. El propietario administra las invitaciones y los permisos.</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div><div className="modal-footer"><button className="btn primary" onClick={onClose}>Listo</button></div></Modal>;
}
