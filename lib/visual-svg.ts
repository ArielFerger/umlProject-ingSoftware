import type { DiagramType } from "./diagrams";

import type { CanvasModel, ClassGeometry } from "./svg-canvas";

import { visualNodes, visualRelations } from "./visual-diagrams.ts";

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

    const box = group.getBBox();

    const matrix = root.getCTM()?.inverse().multiply(group.getCTM()!);

    if (!matrix) return [];

    const center = new DOMPoint(isActor ? 0 : box.x + box.width / 2, isActor ? 0 : box.y + box.height / 2).matrixTransform(matrix);

    group.setAttribute("data-class", name); group.setAttribute("data-visual", type);

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
