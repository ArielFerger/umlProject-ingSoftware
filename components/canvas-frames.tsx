"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Link2, Trash2, X } from "lucide-react";
import type { CanvasSettings, Point } from "@/lib/canvas";
import { enclosingFrame, frameNodes, removeFrame, transformFrame, type CanvasFrame, type FrameNode, type FrameLink } from "@/lib/frames";
import { renderFrames } from "@/lib/svg-frames";
import CanvasColors from "./canvas-colors";

function Field({ value, label, commit, numeric }: { value: string | number; label: string; numeric?: boolean; commit: (value: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  const cancelBlur = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label}<input aria-label={label} type={numeric ? "number" : "text"} value={draft} maxLength={numeric ? undefined : 120} onChange={e => setDraft(e.target.value)} onBlur={() => { if (cancelBlur.current) { cancelBlur.current = false; return; } setDraft(String(value)); if (draft !== String(value)) commit(draft); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelBlur.current = true; setDraft(String(value)); e.currentTarget.blur(); } }} /></label>;
}
type Props = {
  settings: CanvasSettings; renderKey: unknown; addRequest: number; zoom: number; active: boolean; otherSelection: string;
  root: () => SVGSVGElement | null; nodes: () => FrameNode[]; point: (x: number, y: number) => Point;
  preview: (settings: CanvasSettings) => void; commit?: (settings: CanvasSettings) => void; select: () => void;
};
export default function CanvasFrames(props: Props) {
  const [selected, setSelected] = useState("");
  const [selectedLink, setSelectedLink] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const latest = useRef(props); latest.current = props;
  const lastAdd = useRef(props.addRequest);
  const dragging = useRef<{ id: string; handle: string; start: Point; base: CanvasSettings; next?: CanvasSettings; pointer: number } | null>(null);
  const frame = props.settings.frames?.[selected];
  const link = props.settings.frameLinks?.[selectedLink];
  const editable = !!props.commit;
  function commit(next: CanvasSettings) { latest.current.commit?.(next); }
  function patch(patch: Partial<CanvasFrame>) {
    if (frame) commit({ ...props.settings, frames: { ...props.settings.frames, [selected]: { ...frame, ...patch } } });
  }
  function patchLink(patch: Partial<FrameLink>) {
    if (link) commit({ ...props.settings, frameLinks: { ...props.settings.frameLinks, [selectedLink]: { ...link, ...patch } } });
  }
  useEffect(() => {
    if (lastAdd.current === props.addRequest) return;
    lastAdd.current = props.addRequest;
    if (!props.commit) return;
    const count = Object.keys(props.settings.frames || {}).length;
    if (count >= 40) { setMessage("Podés crear hasta 40 marcos por tablero."); return; }
    const id = crypto.randomUUID();
    const frame = enclosingFrame(frameNodes(props.nodes(), props.settings), count * 24);
    props.commit({ ...props.settings, frames: { ...props.settings.frames, [id]: frame } });
    props.select(); setSelected(id); setSelectedLink(""); setMessage("");
  }, [props.addRequest]); // A request is a single undoable creation gesture.
  useEffect(() => {
    if (props.otherSelection || !props.active) { setSelected(""); setSelectedLink(""); }
  }, [props.otherSelection, props.active]);
  useEffect(() => {
    const svg = props.root(); if (!svg) return;
    svg.dataset.framesEditable = String(editable && props.active);
    svg.dataset.selectedFrame = selected;
    svg.dataset.frameZoom = String(props.zoom);
    renderFrames(svg, props.settings, props.nodes());
  }, [props.settings, props.renderKey, selected, selectedLink, props.zoom, editable, props.active]);
  useEffect(() => {
    const svg = props.root(); if (!svg) return;
    const down = (event: PointerEvent) => {
      const p = latest.current, target = event.target as Element;
      if (!p.commit || !p.active || event.button !== 0) return;
      const frameId = target.closest("[data-frame-id]")?.getAttribute("data-frame-id");
      const linkId = target.closest("[data-frame-link]")?.getAttribute("data-frame-link");
      if (!frameId && !linkId) { setSelected(""); setSelectedLink(""); return; }
      event.preventDefault(); event.stopPropagation(); p.select();
      if (linkId) { setSelectedLink(linkId); setSelected(""); return; }
      setSelected(frameId!); setSelectedLink(""); setMessage("");
      const handle = target.closest("[data-frame-handle]")?.getAttribute("data-frame-handle") || "move";
      dragging.current = { id: frameId!, handle, start: p.point(event.clientX, event.clientY), base: p.settings, pointer: event.pointerId };
      svg.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const d = dragging.current, p = latest.current; if (!d) return;
      event.stopPropagation();
      if (!p.commit) { dragging.current = null; p.preview(p.settings); return; }
      const point = p.point(event.clientX, event.clientY);
      if (Math.hypot(point.x - d.start.x, point.y - d.start.y) < 2 && !d.next) return;
      d.next = transformFrame(d.base, d.id, d.handle, { x: point.x - d.start.x, y: point.y - d.start.y }, p.nodes());
      p.preview(d.next);
    };
    const up = (event: PointerEvent) => {
      const d = dragging.current; if (!d) return;
      event.stopPropagation(); dragging.current = null;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (d.next) latest.current.commit?.(d.next);
    };
    const cancel = () => { if (dragging.current) { dragging.current = null; latest.current.preview(latest.current.settings); } };
    const key = (event: KeyboardEvent) => {
      const target = event.target as Element;
      const id = target.closest("[data-frame-id]")?.getAttribute("data-frame-id");
      const linkId = target.closest("[data-frame-link]")?.getAttribute("data-frame-link");
      const p = latest.current;
      if (!p.commit || !p.active || (!id && !linkId)) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); p.select(); setSelected(id || ""); setSelectedLink(linkId || ""); }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault(); event.stopPropagation();
        if (id) p.commit(removeFrame(p.settings, id));
        else { const links = { ...p.settings.frameLinks }; delete links[linkId!]; p.commit({ ...p.settings, frameLinks: links }); }
      }
      const delta: Record<string, Point> = { ArrowLeft: {x:-1,y:0}, ArrowRight:{x:1,y:0}, ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1} };
      if (id && delta[event.key]) {
        event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 20 : 5;
        const handle = target.getAttribute("data-frame-handle") || "move";
        p.commit(transformFrame(p.settings, id, handle, {x:delta[event.key].x*step,y:delta[event.key].y*step},p.nodes()));
        requestAnimationFrame(() => svg.querySelector<SVGElement>(`[data-frame-id="${CSS.escape(id)}"] [data-frame-handle="${handle}"]`)?.focus());
      }
    };
    svg.addEventListener("pointerdown", down); svg.addEventListener("pointermove", move); svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", cancel); svg.addEventListener("keydown", key);
    return () => { cancel(); svg.removeEventListener("pointerdown", down); svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", cancel); svg.removeEventListener("keydown", key); };
  }, [props.renderKey]);
  if (!editable || !props.active) return null;
  const border = (value: CanvasFrame["border"], change: (border: CanvasFrame["border"]) => void) => <label>Borde<select aria-label="Estilo del borde" value={value} onChange={e => change(e.target.value as CanvasFrame["border"])}><option value="solid">Continuo</option><option value="dashed">Discontinuo</option><option value="dotted">Punteado</option></select></label>;
  return <>
    {message && <div className="frame-message" role="status">{message}</div>}
    {frame && <div className="frame-panel" role="region" aria-label="Editar marco" onPointerDown={e => e.stopPropagation()}>
      <div className="frame-panel-row"><strong>Marco</strong><Field label="Título del marco" value={frame.title} commit={title => patch({title:title.slice(0,120)})} /><button className="icon-btn" aria-label="Cerrar opciones del marco" onClick={() => setSelected("")}><X size={16}/></button></div>
      <CanvasColors label="Color del marco" value={frame.color} onChange={color => patch({color:color || "#2563eb"})} />
      <div className="frame-panel-row">{border(frame.border, border => patch({border}))}<Field label="Ancho del marco" numeric value={Math.round(frame.width)} commit={value => {if(value.trim() && Number.isFinite(Number(value)))patch({width:Math.max(160,Math.min(8000,Number(value)))});}}/><Field label="Alto del marco" numeric value={Math.round(frame.height)} commit={value => {if(value.trim() && Number.isFinite(Number(value)))patch({height:Math.max(100,Math.min(8000,Number(value)))});}}/></div>
      <label className="frame-move-contents"><input type="checkbox" checked={frame.moveContents} onChange={e => patch({moveContents:e.target.checked})}/>Mover también las clases que contiene</label>
      <div className="frame-panel-row"><button className="btn" aria-label="Duplicar marco" disabled={Object.keys(props.settings.frames || {}).length >= 40} onClick={() => {const id=crypto.randomUUID();commit({...props.settings,frames:{...props.settings.frames,[id]:{...frame,title:frame.title.slice(0,110)+" · copia",x:Math.min(19000,frame.x+40),y:Math.min(19000,frame.y+40)}}});setSelected(id);}}><Copy size={14}/>Duplicar</button><button className="btn" aria-label="Eliminar marco" onClick={() => {commit(removeFrame(props.settings,selected));setSelected("");}}><Trash2 size={14}/>Eliminar marco</button></div>
      <div className="frame-panel-row"><label>Conectar con<select aria-label="Destino de la flecha del marco" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Elegí un destino</option><optgroup label="Marcos">{Object.entries(props.settings.frames || {}).filter(([id])=>id!==selected).map(([id,f])=><option key={id} value={JSON.stringify({kind:"frame",id})}>{f.title || "Sin título"}</option>)}</optgroup><optgroup label="Clases">{props.nodes().map(n=><option key={n.name} value={JSON.stringify({kind:"class",id:n.name})}>{n.name}</option>)}</optgroup></select></label><button className="btn" disabled={!destination || Object.keys(props.settings.frameLinks || {}).length>=100} onClick={()=>{const to=JSON.parse(destination) as FrameLink["to"];if(to.kind==="frame" && (to.id===selected || !props.settings.frames?.[to.id]))return;const id=crypto.randomUUID();commit({...props.settings,frameLinks:{...props.settings.frameLinks,[id]:{from:{kind:"frame",id:selected},to,label:"",color:frame.color,border:"solid"}}});setSelected("");setSelectedLink(id);setDestination("");}}><Link2 size={14}/>Conectar</button></div>
      <p>Arrastrá el título para moverlo y los tiradores para cambiar su tamaño. Eliminar el marco conserva las clases.</p>
    </div>}
    {link && <div className="frame-panel" role="region" aria-label="Editar flecha del marco" onPointerDown={e=>e.stopPropagation()}><div className="frame-panel-row"><strong>Flecha del marco</strong><button className="icon-btn" aria-label="Cerrar opciones de flecha del marco" onClick={()=>setSelectedLink("")}><X size={16}/></button></div><Field label="Etiqueta de la flecha del marco" value={link.label} commit={label=>patchLink({label:label.slice(0,120)})}/><CanvasColors label="Color de flecha del marco" value={link.color} onChange={color=>patchLink({color:color || "#2563eb"})}/>{border(link.border,border=>patchLink({border}))}<button className="btn" onClick={()=>patchLink({from:link.to,to:link.from})}>Invertir dirección</button><button className="btn" aria-label="Eliminar flecha del marco" onClick={()=>{const links={...props.settings.frameLinks};delete links[selectedLink];commit({...props.settings,frameLinks:links});setSelectedLink("");}}><Trash2 size={14}/>Eliminar flecha</button></div>}
  </>;
}
