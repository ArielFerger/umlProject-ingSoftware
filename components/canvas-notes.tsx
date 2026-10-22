"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Copy, StickyNote, Trash2, Type, X } from "lucide-react";
import type { CanvasSettings, Point } from "@/lib/canvas";
import { MAX_NOTES, NOTE_SIZES, STICKY_COLORS, TEXT_COLORS, newNote, type CanvasNote } from "@/lib/notes";
import { noteBox, renderNotes } from "@/lib/svg-notes";

type Props = {
  settings: CanvasSettings; renderKey: unknown; zoom: number; dark: boolean;
  /** Move tool active: notes can be selected and dragged. */
  active: boolean;
  /** Text or sticky tool: the next click on the board places a note. */
  placing: CanvasNote["kind"] | null;
  root: () => SVGSVGElement | null; viewport: () => HTMLElement | null; point: (x: number, y: number) => Point;
  commit?: (settings: CanvasSettings) => void; onPlaced: () => void; onSelect: () => void;
};
type Drag = { id: string; handle: "move" | "width"; start: Point; base: CanvasNote; next?: CanvasNote; pointer: number };

export default function CanvasNotes(props: Props) {
  const [chosen, setSelected] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  // Notes are only selectable with the move tool (or while one is being edited).
  const selected = props.active || editing ? chosen : "";
  const latest = useRef(props);
  const state = useRef({ selected, editing });
  useLayoutEffect(() => { latest.current = props; state.current = { selected, editing }; });
  const drag = useRef<Drag | null>(null);
  const created = useRef("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const editable = !!props.commit;
  const notes = props.settings.notes || {};
  const note = notes[selected];

  function draw(settings = latest.current.settings, override?: { id: string; note: CanvasNote }) {
    const svg = latest.current.root(); if (!svg) return;
    const next = override ? { ...settings, notes: { ...settings.notes, [override.id]: override.note } } : settings;
    renderNotes(svg, next, { selected: state.current.selected, editing: state.current.editing, editable: !!latest.current.commit && (latest.current.active || !!state.current.editing), dark: latest.current.dark, zoom: latest.current.zoom });
  }
  function save(id: string, value: CanvasNote | null) {
    const p = latest.current, next = { ...p.settings.notes };
    if (value) next[id] = value; else delete next[id];
    p.commit?.({ ...p.settings, notes: next });
  }
  function startEditing(id: string) {
    const target = latest.current.settings.notes?.[id]; if (!target) return;
    setSelected(id); setEditing(id); setDraft(target.text);
  }
  function finishEditing(keep = true) {
    const id = state.current.editing, target = latest.current.settings.notes?.[id];
    setEditing("");
    if (!target) return;
    const text = keep ? draft.slice(0, 1000) : target.text;
    // A new text with nothing typed is discarded; sticky notes may stay empty.
    if (!text.trim() && target.kind === "text") { save(id, null); setSelected(""); }
    else if (text !== target.text) save(id, { ...target, text });
    created.current = "";
  }

  useEffect(() => { draw(); });
  useEffect(() => { if (editing) requestAnimationFrame(() => { editor.current?.focus(); editor.current?.select(); }); }, [editing]);

  useEffect(() => {
    const view = props.viewport(); if (!view) return;
    const down = (event: PointerEvent) => {
      const p = latest.current, target = event.target as Element;
      if (event.button !== 0 || !p.commit || target.closest(".note-editor,.note-panel")) return;
      if (p.placing) {
        event.preventDefault(); event.stopPropagation();
        if (Object.keys(p.settings.notes || {}).length >= MAX_NOTES) { setMessage(`Podés agregar hasta ${MAX_NOTES} textos y notas por tablero.`); p.onPlaced(); return; }
        const id = crypto.randomUUID(), at = p.point(event.clientX, event.clientY), value = newNote(p.placing, at.x, at.y);
        p.commit({ ...p.settings, notes: { ...p.settings.notes, [id]: value } });
        created.current = id; p.onSelect(); p.onPlaced(); setMessage("");
        setSelected(id); setEditing(id); setDraft("");
        return;
      }
      const id = target.closest("[data-note-id]")?.getAttribute("data-note-id");
      if (!id || !p.active) { if (!target.closest("[data-note-id]")) setSelected(""); return; }
      event.preventDefault(); event.stopPropagation();
      p.onSelect(); setSelected(id);
      const handle = target.closest("[data-note-handle]") ? "width" : "move";
      drag.current = { id, handle, start: p.point(event.clientX, event.clientY), base: p.settings.notes![id], pointer: event.pointerId };
      try { view.setPointerCapture(event.pointerId); } catch { /* The pointer already ended. */ }
    };
    const move = (event: PointerEvent) => {
      const d = drag.current; if (!d) return;
      event.stopPropagation();
      const at = latest.current.point(event.clientX, event.clientY), dx = at.x - d.start.x, dy = at.y - d.start.y;
      if (!d.next && Math.hypot(dx, dy) < 2) return;
      d.next = d.handle === "width" ? { ...d.base, width: Math.max(60, Math.min(900, Math.round(d.base.width + dx))) }
        : { ...d.base, x: Math.max(-19000, Math.min(19000, Math.round((d.base.x + dx) * 10) / 10)), y: Math.max(-19000, Math.min(19000, Math.round((d.base.y + dy) * 10) / 10)) };
      draw(latest.current.settings, { id: d.id, note: d.next });
    };
    const up = (event: PointerEvent) => {
      const d = drag.current; if (!d) return;
      event.stopPropagation(); drag.current = null;
      if (view.hasPointerCapture(event.pointerId)) view.releasePointerCapture(event.pointerId);
      if (d.next) save(d.id, d.next);
    };
    const doubleClick = (event: MouseEvent) => {
      const id = (event.target as Element).closest("[data-note-id]")?.getAttribute("data-note-id");
      if (!id || !latest.current.commit) return;
      event.preventDefault(); event.stopPropagation(); startEditing(id);
    };
    view.addEventListener("pointerdown", down); view.addEventListener("pointermove", move); view.addEventListener("pointerup", up); view.addEventListener("dblclick", doubleClick);
    return () => { view.removeEventListener("pointerdown", down); view.removeEventListener("pointermove", move); view.removeEventListener("pointerup", up); view.removeEventListener("dblclick", doubleClick); };
  }, [props.renderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || editing) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if ((target instanceof Element && target.closest("input,textarea,select,[contenteditable=true],dialog")) || !latest.current.commit) return;
      const current = latest.current.settings.notes?.[selected]; if (!current) return;
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); save(selected, null); setSelected(""); }
      else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); startEditing(selected); }
      else if (event.key === "Escape") { event.stopPropagation(); setSelected(""); }
      else {
        const step = event.shiftKey ? 20 : 5, delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key];
        if (delta) { event.preventDefault(); event.stopPropagation(); save(selected, { ...current, x: current.x + delta[0], y: current.y + delta[1] }); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [selected, editing]);

  if (!editable) return null;
  const editingNote = notes[editing];
  let editorStyle: React.CSSProperties | undefined;
  if (editingNote) {
    const svg = props.root(), matrix = svg?.getScreenCTM();
    if (matrix) {
      const box = noteBox({ ...editingNote, text: draft }), scale = matrix.a;
      const corner = new DOMPoint(box.x, box.y).matrixTransform(matrix);
      editorStyle = {
        left: corner.x, top: corner.y, width: box.width * scale, minHeight: box.height * scale, padding: box.pad * scale,
        fontSize: editingNote.size * scale, lineHeight: 1.3, fontWeight: editingNote.bold ? 700 : 500,
        background: editingNote.kind === "sticky" ? editingNote.color : "transparent", color: editingNote.kind === "sticky" ? "#1f2937" : editingNote.color,
      };
    }
  }
  const palette = note?.kind === "sticky" ? STICKY_COLORS : TEXT_COLORS;
  return <>
    {message && <div className="frame-message" role="status">{message}</div>}
    {editingNote && editorStyle && <textarea ref={editor} className={"note-editor" + (editingNote.kind === "sticky" ? " is-sticky" : "")} style={editorStyle} value={draft} maxLength={1000}
      aria-label={editingNote.kind === "sticky" ? "Texto de la nota adhesiva" : "Texto"} placeholder={editingNote.kind === "sticky" ? "Escribí la nota…" : "Escribí un texto…"}
      onChange={e => setDraft(e.target.value)} onBlur={() => finishEditing()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); if (created.current === editing && !draft.trim()) finishEditing(); else finishEditing(false); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEditing(); } }} />}
    {note && !editing && props.active && <div className="node-selection note-panel" role="toolbar" aria-label={note.kind === "sticky" ? "Opciones de la nota adhesiva" : "Opciones del texto"} onPointerDown={e => e.stopPropagation()}>
      <strong>{note.kind === "sticky" ? <><StickyNote size={15} />Nota</> : <><Type size={15} />Texto</>}</strong><span className="board-control-divider" />
      <div className="note-swatches" role="group" aria-label="Color">{palette.map(([name, value]) => <button key={value} type="button" className="canvas-swatch" style={{ background: value }} title={name} aria-label={`Color ${name}`} aria-pressed={note.color === value} onClick={() => save(selected, { ...note, color: value })} />)}
        <label className="canvas-custom-color" title="Color personalizado"><input type="color" aria-label="Color personalizado" value={note.color} onChange={e => save(selected, { ...note, color: e.target.value })} /></label></div>
      <span className="board-control-divider" />
      <div className="segmented note-sizes" role="group" aria-label="Tamaño del texto">{NOTE_SIZES.map(size => <button key={size.value} type="button" className={note.size === size.value ? "active" : ""} aria-pressed={note.size === size.value} onClick={() => save(selected, { ...note, size: size.value })}>{size.label}</button>)}</div>
      <button type="button" className={"icon-btn" + (note.bold ? " active" : "")} title="Negrita" aria-label="Negrita" aria-pressed={note.bold} onClick={() => save(selected, { ...note, bold: !note.bold })}><Bold size={15} /></button>
      <button type="button" className="icon-btn" title={note.kind === "sticky" ? "Convertir en texto" : "Convertir en nota adhesiva"} aria-label={note.kind === "sticky" ? "Convertir en texto" : "Convertir en nota adhesiva"} onClick={() => save(selected, note.kind === "sticky" ? { ...note, kind: "text", color: TEXT_COLORS[0][1] } : { ...note, kind: "sticky", color: STICKY_COLORS[0][1], width: Math.max(160, note.width) })}>{note.kind === "sticky" ? <Type size={15} /> : <StickyNote size={15} />}</button>
      <button type="button" className="icon-btn" title="Duplicar" aria-label="Duplicar" disabled={Object.keys(notes).length >= MAX_NOTES} onClick={() => { const id = crypto.randomUUID(); latest.current.commit?.({ ...props.settings, notes: { ...props.settings.notes, [id]: { ...note, x: note.x + 24, y: note.y + 24 } } }); setSelected(id); }}><Copy size={15} /></button>
      <button type="button" className="icon-btn board-delete" title="Eliminar (Supr)" aria-label="Eliminar" onClick={() => { save(selected, null); setSelected(""); }}><Trash2 size={15} /></button>
      <button type="button" className="icon-btn" title="Deseleccionar (Esc)" aria-label="Deseleccionar" onClick={() => setSelected("")}><X size={15} /></button>
    </div>}
  </>;
}
