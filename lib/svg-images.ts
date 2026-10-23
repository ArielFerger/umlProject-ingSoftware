import type { CanvasSettings } from "./canvas.ts";

const NS = "http://www.w3.org/2000/svg";
function element<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  parent.appendChild(el); return el;
}

/**
 * Draws board pictures in two layers: behind the diagram and in front of it
 * (below notes). `sources` maps each image id to a loaded data URL, so exports
 * embed the picture. Selection controls carry .studio-image-controls.
 */
export function renderImages(svg: SVGSVGElement, settings: CanvasSettings, sources: Map<string, string>, options: { selected?: string; editable?: boolean; zoom?: number }) {
  svg.querySelectorAll(".studio-images").forEach(layer => layer.remove());
  const images = settings.images || {};
  if (!Object.keys(images).length) return;
  const parent = svg.querySelector("g.root") || svg, zoom = Math.max(.1, options.zoom || 1);
  const back = document.createElementNS(NS, "g"), front = document.createElementNS(NS, "g");
  back.setAttribute("class", "studio-images studio-images-back"); front.setAttribute("class", "studio-images studio-images-front");
  parent.insertBefore(back, parent.firstChild);
  parent.insertBefore(front, parent.querySelector(":scope > .studio-notes"));
  for (const [id, image] of Object.entries(images)) {
    const group = element("g", { "data-image-id": id, ...(options.editable ? { tabindex: 0, role: "button", "aria-label": `Imagen ${image.name || ""}`.trim() } : {}), style: `cursor:${options.editable ? "move" : "default"}` }, image.layer === "back" ? back : front);
    const href = sources.get(id);
    if (href) element("image", { href, x: image.x, y: image.y, width: image.width, height: image.height, preserveAspectRatio: "none" }, group);
    else {
      // Placeholder while the picture loads (or if it is no longer available).
      element("rect", { x: image.x, y: image.y, width: image.width, height: image.height, rx: 6, fill: "#94a3b8", "fill-opacity": .12, stroke: "#94a3b8", "stroke-dasharray": "6 5" }, group);
    }
    if (options.editable && options.selected === id) {
      const controls = element("g", { class: "studio-image-controls" }, group);
      element("rect", { x: image.x - 4 / zoom, y: image.y - 4 / zoom, width: image.width + 8 / zoom, height: image.height + 8 / zoom, fill: "none", stroke: "#1a647b", "stroke-width": 1.5 / zoom, "stroke-dasharray": `${6 / zoom} ${4 / zoom}`, style: "pointer-events:none" }, controls);
      const size = 12 / zoom;
      element("rect", { x: image.x + image.width - size / 2, y: image.y + image.height - size / 2, width: size, height: size, rx: size / 4, fill: "#fff", stroke: "#1a647b", "stroke-width": 1.6 / zoom, "data-image-handle": "resize", style: "cursor:nwse-resize" }, controls);
    }
  }
}
