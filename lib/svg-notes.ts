import type { CanvasSettings } from "./canvas.ts";
import { wrapText, type CanvasNote } from "./notes.ts";
import { colorInk } from "./svg-colors.ts";

const NS = "http://www.w3.org/2000/svg";
const FONT = "'Source Sans 3 Variable', 'Source Sans 3', sans-serif";
let measureContext: CanvasRenderingContext2D | null = null;
function measure(note: CanvasNote) {
  measureContext ||= document.createElement("canvas").getContext("2d");
  const context = measureContext!;
  context.font = `${note.bold ? 700 : 500} ${note.size}px ${FONT}`;
  return (value: string) => context.measureText(value).width;
}
function element<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  parent.appendChild(el); return el;
}

export const STICKY_PADDING = 16;
/** Box of a note on the board, used for hit testing, selection and the inline editor. */
export function noteBox(note: CanvasNote) {
  const pad = note.kind === "sticky" ? STICKY_PADDING : 4;
  const lines = wrapText(note.text || " ", note.width - pad * 2, measure(note));
  const lineHeight = note.size * 1.3;
  const height = Math.max(note.kind === "sticky" ? note.width * .62 : lineHeight, lines.length * lineHeight) + pad * 2;
  return { x: note.x, y: note.y, width: note.width, height, lines, lineHeight, pad };
}

/**
 * Draws notes above the diagram. `editing` is hidden while its text is edited in
 * place; selection controls carry .studio-note-controls so exports drop them.
 */
export function renderNotes(svg: SVGSVGElement, settings: CanvasSettings, options: { selected?: string; editing?: string; editable?: boolean; dark?: boolean; zoom?: number }) {
  svg.querySelector(".studio-notes")?.remove();
  const notes = settings.notes || {};
  if (!Object.keys(notes).length) return;
  const parent = svg.querySelector("g.root") || svg;
  const layer = element("g", { class: "studio-notes" }, parent);
  const zoom = Math.max(.1, options.zoom || 1);
  for (const [id, note] of Object.entries(notes)) {
    if (id === options.editing) continue;
    const box = noteBox(note);
    const group = element("g", { "data-note-id": id, ...(options.editable ? { tabindex: 0, role: "button", "aria-label": `${note.kind === "sticky" ? "Nota adhesiva" : "Texto"}: ${note.text.slice(0, 60) || "vacío"}` } : {}), style: `cursor:${options.editable ? "move" : "default"}` }, layer);
    let ink = note.color;
    if (note.kind === "sticky") {
      element("rect", { x: box.x + 2, y: box.y + 4, width: box.width, height: box.height, rx: 6, fill: "#0f172a", "fill-opacity": .12, style: "pointer-events:none" }, group);
      element("rect", { x: box.x, y: box.y, width: box.width, height: box.height, rx: 6, fill: note.color, stroke: "#0f172a", "stroke-opacity": .08 }, group);
      ink = colorInk(note.color) === "#ffffff" ? "#ffffff" : "#1f2937";
    } else {
      element("rect", { x: box.x - 4, y: box.y, width: box.width + 8, height: box.height, fill: "transparent" }, group);
      if (options.dark && colorInk(note.color) === "#ffffff") ink = "#e4edf1";
    }
    const text = element("text", { x: box.x + box.pad, y: box.y + box.pad, fill: ink, "font-family": FONT, "font-size": note.size, "font-weight": note.bold ? 700 : 500, style: "pointer-events:none;white-space:pre" }, group);
    box.lines.forEach((line, i) => {
      const span = element("tspan", { x: box.x + box.pad, dy: i ? box.lineHeight : note.size * 1.05 }, text);
      span.textContent = line || " ";
    });
    if (!note.text && note.kind === "text") { text.setAttribute("fill-opacity", ".45"); text.firstElementChild!.textContent = "Texto"; }
    if (options.editable && options.selected === id) {
      const controls = element("g", { class: "studio-note-controls" }, group);
      element("rect", { x: box.x - 6 / zoom, y: box.y - 6 / zoom, width: box.width + 12 / zoom, height: box.height + 12 / zoom, rx: 6 / zoom, fill: "none", stroke: "#1a647b", "stroke-width": 1.5 / zoom, "stroke-dasharray": `${6 / zoom} ${4 / zoom}`, style: "pointer-events:none" }, controls);
      element("rect", { x: box.x + box.width + 6 / zoom - 5 / zoom, y: box.y + box.height / 2 - 9 / zoom, width: 10 / zoom, height: 18 / zoom, rx: 3 / zoom, fill: "#fff", stroke: "#1a647b", "stroke-width": 1.5 / zoom, "data-note-handle": "width", style: "cursor:ew-resize" }, controls);
    }
  }
}
