import type { DiagramType } from "./diagrams";

import type { CanvasModel, ClassGeometry } from "./svg-canvas";

import { visualNodes, visualRelations } from "./visual-diagrams.ts";

import { derInfo, type DerShape } from "./der.ts";

const NS = "http://www.w3.org/2000/svg";

type RenderNode = { id: string; domId?: string; label?: string; isGroup?: boolean };



export function prepareVisualSource(source: string, type: DiagramType) {

  if (type !== "usecase") return source;

  let prepared = source;

  for (const node of visualNodes(source, type).filter(n => n.kind === "actor")) {

    const pattern = new RegExp(`\\b${node.id}\\["?[^\\]\\n]*?"?\\](?::::umlActor)?`, "g");

    // Reserve real layout space for the head, body, legs and caption.

    prepared = prepared.replace(pattern, `${node.id}["${node.label.replaceAll('"', '#quot;')}<br/>.<br/>.<br/>.<br/>."]:::umlActor`);

  }

  return prepared;

}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>) {

  const element = document.createElementNS(NS, tag);

  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));

  return element;

}

/**
 * Replaces Mermaid's node outline with the Chen shape for the element kind and
 * returns the outline geometry in the node's own coordinates. Styles are inline
 * so SVG and PNG exports keep the notation without the app stylesheet.
 */
function drawDerNode(group: SVGGElement, kind: string, ratio: string): { cx: number; cy: number; width: number; height: number; shape: DerShape } {

  const info = derInfo(kind);

  const outline = Array.from(group.children).find(child => !child.classList.contains("label") && child.tagName !== "text") as SVGGraphicsElement | undefined;

  const shapeStyle = outline ? getComputedStyle(outline.matches("rect,polygon,path,circle,ellipse") ? outline : outline.querySelector("rect,polygon,path,circle,ellipse") || outline) : null;

  const textElement = group.querySelector<SVGTextElement>("text");

  const ink = textElement ? getComputedStyle(textElement).fill : "#243c48";

  const fill = shapeStyle && shapeStyle.fill && shapeStyle.fill !== "none" ? shapeStyle.fill : "#ffffff";

  const stroke = shapeStyle && shapeStyle.stroke && shapeStyle.stroke !== "none" ? shapeStyle.stroke : ink;

  for (const child of Array.from(group.children)) if (!child.classList.contains("label") && child.tagName !== "text") child.remove();

  const text = group.getBBox();

  const cx = text.x + text.width / 2, cy = text.y + text.height / 2;

  const style = (dashed = false, filled = true) => `fill:${filled ? fill : "none"};stroke:${stroke};stroke-width:1.6px;${dashed ? "stroke-dasharray:6 4;" : ""}`;

  const shapes: SVGElement[] = [];

  let width: number, height: number;

  if (info.shape === "rect") {

    width = Math.max(104, text.width + 40); height = Math.max(46, text.height + 24);

    shapes.push(svgElement("rect", { x: cx - width / 2, y: cy - height / 2, width, height, style: style() }));

    if (kind === "weak") shapes.push(svgElement("rect", { x: cx - width / 2 + 5, y: cy - height / 2 + 5, width: width - 10, height: height - 10, style: style(false, false) }));

  } else if (info.shape === "diamond") {

    width = Math.max(124, text.width * 1.55 + 48); height = Math.max(70, text.height * 1.6 + 40);

    const diamond = (w: number, h: number) => `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;

    shapes.push(svgElement("polygon", { points: diamond(width, height), style: style() }));

    if (kind === "identifying") shapes.push(svgElement("polygon", { points: diamond(width - 18, height - 11), style: style(false, false) }));

  } else {

    const rx = Math.max(42, text.width / 2 + 20) + (kind === "multivalued" ? 5 : 0), ry = Math.max(22, text.height / 2 + 12) + (kind === "multivalued" ? 5 : 0);

    width = rx * 2; height = ry * 2;

    shapes.push(svgElement("ellipse", { cx, cy, rx, ry, style: style(kind === "derived") }));

    if (kind === "multivalued") shapes.push(svgElement("ellipse", { cx, cy, rx: rx - 5, ry: ry - 5, style: style(false, false) }));

    if (kind === "key" || kind === "partialKey") {

      const y = text.y + text.height - 2;

      shapes.push(svgElement("line", { x1: text.x, x2: text.x + text.width, y1: y, y2: y, class: "der-key-underline", style: `stroke:${ink};stroke-width:1.3px;${kind === "partialKey" ? "stroke-dasharray:4 3;" : ""}` }));

    }

  }

  for (const shape of shapes.reverse()) { shape.classList.add("der-shape"); group.insertBefore(shape, group.firstChild); }

  if (ratio) {

    // Upper-right edge of the diamond: clear of lines that reach its top vertex.
    const label = svgElement("text", { x: cx + width / 4 + 8, y: cy - height / 4 - 8, "text-anchor": "start", class: "der-ratio", style: `fill:${ink};font-size:14px;font-weight:600;font-family:'Source Sans 3 Variable',sans-serif` });

    label.textContent = ratio; group.appendChild(label);

  }

  return { cx, cy, width, height, shape: info.shape };

}

export function measureVisualNodes(root: SVGSVGElement, data: RenderNode[], source: string, type: DiagramType): ClassGeometry[] {

  const definitions = visualNodes(source, type);

  const groups = type === "sequence" ? Array.from(root.querySelectorAll<SVGGElement>('g[data-et="participant"]')).filter((g, i, a) => a.findIndex(n => n.getAttribute("data-id") === g.getAttribute("data-id")) === i) : Array.from(root.querySelectorAll<SVGGElement>("g.node"));

  return groups.flatMap((group, i) => {

    const definition = data.find(n => group.id.endsWith(n.domId || n.id));

    const name = type === "sequence" ? group.getAttribute("data-id") : type === "er" ? definitions.find(n => definition?.id.match(/^entity-(.*)-\d+$/)?.[1] === n.id)?.id : definition?.id;

    if (!name || definition?.isGroup || /_(start|end)$/.test(name)) return [];

    const original = group.getAttribute("transform") || "";

    const isActor = type === "usecase" && definitions.find(n => n.id === name)?.kind === "actor";
    if (isActor) {

      const label = definitions.find(n => n.id === name)!.label;

      const ink = getComputedStyle(group.querySelector("text") || group).fill;

      const box = group.getBBox();
      group.setAttribute("data-uml-actor", "true");

      group.replaceChildren();

      const hit = document.createElementNS(NS, "rect");

      hit.setAttribute("x", String(box.x)); hit.setAttribute("y", String(box.y)); hit.setAttribute("width", String(box.width)); hit.setAttribute("height", String(box.height)); hit.setAttribute("class", "uml-actor-hit"); hit.style.cssText = "fill:transparent!important;stroke:none!important;pointer-events:all";

      const actor = document.createElementNS(NS, "g"); actor.setAttribute("class", "uml-actor-figure");

      actor.setAttribute("fill", "none"); actor.setAttribute("stroke", ink === "none" ? "#243c48" : ink); actor.setAttribute("stroke-width", "2"); actor.setAttribute("stroke-linecap", "round");

      const head = document.createElementNS(NS, "circle"); head.setAttribute("cx", "0"); head.setAttribute("cy", "-32"); head.setAttribute("r", "10");

      const body = document.createElementNS(NS, "path"); body.setAttribute("d", "M 0 -22 L 0 8 M -21 -8 L 21 -8 M 0 8 L -17 31 M 0 8 L 17 31");
      head.style.cssText = body.style.cssText = "fill:none;stroke:inherit;stroke-width:inherit";

      actor.appendChild(head); actor.appendChild(body); group.appendChild(hit); group.appendChild(actor);

      const text = document.createElementNS(NS, "text"); text.setAttribute("x", "0"); text.setAttribute("y", "52"); text.setAttribute("text-anchor", "middle"); text.setAttribute("class", "uml-actor-caption"); text.setAttribute("fill", ink); text.setAttribute("font-size", "15"); text.textContent = label; group.appendChild(text);

    }

    if (!group.id) group.id = "studio-participant-" + i;

    const der = type === "der" ? drawDerNode(group, definitions.find(n => n.id === name)?.kind || "entity", definitions.find(n => n.id === name)?.body || "") : null;

    const box = group.getBBox();

    const matrix = root.getCTM()?.inverse().multiply(group.getCTM()!);

    if (!matrix) return [];

    const center = new DOMPoint(der ? der.cx : isActor ? 0 : box.x + box.width / 2, der ? der.cy : isActor ? 0 : box.y + box.height / 2).matrixTransform(matrix);

    group.setAttribute("data-class", name); group.setAttribute("data-visual", type);

    if (der) { group.setAttribute("data-der-shape", der.shape); return [{ name, domId: group.id, x: center.x, y: center.y, width: der.width, height: der.height, transform: original, shape: der.shape }]; }

    return [{ name, domId: group.id, x: center.x, y: center.y, width: isActor ? 44 : box.width, height: isActor ? 84 : box.height, transform: original }];

  });

}

export function sequenceModel(root: SVGSVGElement, source: string): CanvasModel["edges"] {

  const relations = visualRelations(source, "sequence"), messages = Array.from(root.querySelectorAll<SVGGraphicsElement>('[data-et="message"]'));

  const labels = Array.from(root.querySelectorAll<SVGTextElement>("text.messageText"));

  return messages.map((line, i) => {

    const id = "studio-message-" + i;

    line.setAttribute("data-edge-id", id); line.setAttribute("tabindex", "0"); line.setAttribute("role", "button"); line.setAttribute("aria-label", "Mensaje: " + (relations[i]?.label || i + 1));

    labels[i]?.setAttribute("data-edge-id", id);

    return { id, start: line.getAttribute("data-from") || "", end: line.getAttribute("data-to") || "", label: relations[i]?.label || "" };

  });

}

export function reorderSequence(source: string, id: string, before: string | undefined): string {

  if (/^\s*box\b/m.test(source)) throw new Error("Los participantes de un grupo se reordenan desde Código para conservar sus límites.");

  const lines = source.split("\n"), slots = lines.flatMap((line, index) => /^\s*(actor|participant)\s+[\w-]+/.test(line) ? [index] : []);

  const declarations = slots.map(index => lines[index]), current = declarations.findIndex(line => new RegExp(`^\\s*(actor|participant)\\s+${id}(?:\\s|$)`).test(line));

  if (current < 0) throw new Error("Declaralo primero como actor o participante desde Código.");

  const [moved] = declarations.splice(current, 1), target = before ? declarations.findIndex(line => new RegExp(`^\\s*(actor|participant)\\s+${before}(?:\\s|$)`).test(line)) : -1;

  declarations.splice(target < 0 ? declarations.length : target, 0, moved);

  slots.forEach((slot, index) => { lines[slot] = declarations[index]; });

  return lines.join("\n");

}
