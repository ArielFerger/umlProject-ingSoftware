import type { CanvasSettings } from "./canvas.ts";
import { frameLinkRoute, frameNodes, type FrameNode } from "./frames.ts";
const NS = "http://www.w3.org/2000/svg";
function element<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  parent.appendChild(el); return el;
}
const dash = { solid: "none", dashed: "10 7", dotted: "2 7" };
export function renderFrames(svg: SVGSVGElement, settings: CanvasSettings, nodes: FrameNode[]) {
  svg.querySelector(".studio-frames")?.remove();
  const frames = settings.frames || {}, links = settings.frameLinks || {};
  if (!Object.keys(frames).length && !Object.keys(links).length) return;
  const parent = svg.querySelector("g.root") || svg;
  const layer = element("g", { class: "studio-frames" }, parent);
  parent.insertBefore(layer, parent.firstChild);
  const editable = svg.dataset.framesEditable === "true";
  const selected = svg.dataset.selectedFrame;
  const scale = Math.max(.1, Number(svg.dataset.frameZoom) || 1);
  for (const [id, frame] of Object.entries(frames)) {
    const group = element("g", { "data-frame-id": id }, layer);
    element("rect", { x: frame.x, y: frame.y, width: frame.width, height: frame.height, rx: 8, fill: frame.color, "fill-opacity": .055, stroke: frame.color, "stroke-width": 2, "stroke-dasharray": dash[frame.border], "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, group);
    if (editable) element("rect", { class: "studio-frame-hit", x: frame.x, y: frame.y, width: frame.width, height: frame.height, rx: 8, fill: "none", stroke: "transparent", "stroke-width": 16 / scale, "pointer-events": "stroke", "data-frame-handle": "move" }, group);
    const header = element("g", { "data-frame-handle": "move", ...(editable ? { role: "button", tabindex: 0, "aria-label": `Marco ${frame.title || "Sin título"}` } : {}), style: `cursor:${editable ? "grab" : "default"};pointer-events:${editable ? "all" : "none"}` }, group);
    element("rect", { x: frame.x + 1, y: frame.y + 1, width: frame.width - 2, height: 34, rx: 7, fill: frame.color, "fill-opacity": .13 }, header);
    const title = element("text", { x: frame.x + 14, y: frame.y + 23, fill: frame.color, "font-size": 16, "font-family": "sans-serif", "font-weight": 650 }, header);
    title.style.setProperty("fill", svg.dataset.framesDark === "true" ? "#e4edf1" : "#243c48", "important");
    title.textContent = frame.title.length > Math.floor((frame.width - 24) / 9) ? frame.title.slice(0, Math.max(1, Math.floor((frame.width - 24) / 9) - 1)) + "…" : frame.title || "Sin título";
    if (editable && selected === id) {
      const controls = element("g", { class: "studio-frame-controls" }, group);
      for (const [handle, x, y] of [["nw",0,0],["n",.5,0],["ne",1,0],["e",1,.5],["se",1,1],["s",.5,1],["sw",0,1],["w",0,.5]] as const) {
        element("rect", { x: frame.x + frame.width * x - 5 / scale, y: frame.y + frame.height * y - 5 / scale, width: 10 / scale, height: 10 / scale, fill: "white", stroke: frame.color, "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", "data-frame-handle": handle, tabindex: 0, role: "button", "aria-label": `Redimensionar marco ${handle}`, style: `cursor:${handle}-resize;pointer-events:all` }, controls);
      }
    }
  }
  for (const [id, link] of Object.entries(links)) {
    const route = frameLinkRoute(link, frames, frameNodes(nodes, settings));
    if (!route) continue;
    const points = route.points, b = points[points.length - 1], previous = points[points.length - 2];
    const group = element("g", { "data-frame-link": id }, layer);
    const d = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
    element("path", { d, fill: "none", stroke: link.color, "stroke-width": 2, "stroke-dasharray": dash[link.border], "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, group);
    const angle = Math.atan2(b.y - previous.y, b.x - previous.x), size = 12;
    element("path", { d: `M${b.x - Math.cos(angle - .45) * size},${b.y - Math.sin(angle - .45) * size} L${b.x},${b.y} L${b.x - Math.cos(angle + .45) * size},${b.y - Math.sin(angle + .45) * size}`, fill: "none", stroke: link.color, "stroke-width": 2.5, "vector-effect": "non-scaling-stroke", "pointer-events": "none" }, group);
    if (link.label) {
      const text = element("text", { x: route.label.x, y: route.label.y, fill: link.color, "text-anchor": "middle", "font-size": 14, "font-family": "sans-serif", style: "paint-order:stroke;stroke:var(--paper,#fff);stroke-width:4px;stroke-linejoin:round;pointer-events:none" }, group);
      text.textContent = link.label;
    }
    if (editable) element("path", { class: "studio-frame-link-hit", d, stroke: "transparent", "stroke-width": 18 / scale, fill: "none", "pointer-events": "stroke", tabindex: 0, role: "button", "aria-label": `Conexión de marco${link.label ? ": " + link.label : ""}` }, group);
  }
}
