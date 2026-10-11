import type { CanvasSettings, Point } from "./canvas";
import { routeEdge, DEFAULT_ROUTE, nearestAnchor, anchorPoint } from "./edge-routing";

export type ClassGeometry = { name: string; x: number; y: number; width: number; height: number; domId: string; transform: string };
export type EdgeGeometry = { id: string; routeKey?: string; start?: string; end?: string; startLabelRight?: string; endLabelLeft?: string; points?: Point[]; labelPosition?: Point; label?: string };
export type CanvasModel = { nodes: ClassGeometry[]; edges: EdgeGeometry[] };
const SVG_NS = "http://www.w3.org/2000/svg";

export function measureClasses(root: SVGSVGElement): ClassGeometry[] {
  return Array.from(root.querySelectorAll<SVGGElement>("g.node")).flatMap(node => {
    const name = node.id.match(/classId-(.+)-\d+$/)?.[1];
    if (!name) return [];
    const box = node.getBBox();
    const transform = node.transform.baseVal.consolidate()?.matrix;
    if (!transform) return [];
    return [{ name, domId: node.id, x: transform.e + box.x + box.width / 2, y: transform.f + box.y + box.height / 2, width: box.width, height: box.height, transform: node.getAttribute("transform") || "" }];
  });
}

function normalize(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}
function markerGap(root: SVGSVGElement, ref: string | null, scale: number, start: boolean) {
  if (!ref) return 0;
  const id = ref.match(/#([^)'"\s]+)/)?.[1];
  const marker = id ? root.getElementById(id) as SVGMarkerElement | null : null;
  if (!marker) return 0;
  const boxes = Array.from(marker.children).flatMap(child => {
    try { return [(child as SVGGraphicsElement).getBBox()]; } catch { return []; }
  });
  if (!boxes.length) return 0;
  const min = Math.min(...boxes.map(b => b.x)), max = Math.max(...boxes.map(b => b.x + b.width));
  const refX = Number(marker.dataset.baseRefX || 0);
  // Place the actual marker tip on the class border, including margin variants.
  return (start ? refX - min : max - refX) * scale;
}

function layoutRoute(edge: EdgeGeometry, startGap: number, endGap: number) {
  const points = edge.points?.map(point => ({ ...point }));
  if (!points || points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  const from = normalize(first, points[1]), to = normalize(last, points[points.length - 2]);
  first.x += from.x * startGap; first.y += from.y * startGap;
  last.x += to.x * endGap; last.y += to.y * endGap;
  let path = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], current = points[i], next = points[i + 1];
    const radius = Math.min(12, Math.hypot(current.x - previous.x, current.y - previous.y) / 3, Math.hypot(next.x - current.x, next.y - current.y) / 3);
    const incoming = normalize(current, previous), outgoing = normalize(current, next);
    path += ` L ${current.x + incoming.x * radius} ${current.y + incoming.y * radius} Q ${current.x} ${current.y}, ${current.x + outgoing.x * radius} ${current.y + outgoing.y * radius}`;
  }
  path += ` L ${last.x} ${last.y}`;
  return { path, start: first, end: last, label: edge.labelPosition || points[Math.floor(points.length / 2)] };
}

function terminal(root: SVGElement, text: string, point: Point, other: Point, size: number, dark: boolean, start: boolean, edgeId: string) {
  if (!text || text === "none") return;
  const direction = normalize(point, other), sign = start ? 1 : -1;
  const label = document.createElementNS(SVG_NS, "text");
  label.textContent = text;
  label.setAttribute("data-edge-id", edgeId);
  label.setAttribute("x", String(point.x + direction.x * 18 - direction.y * 17 * sign));
  label.setAttribute("y", String(point.y + direction.y * 18 + direction.x * 17 * sign));
  label.setAttribute("text-anchor", "middle"); label.setAttribute("dominant-baseline", "middle");
  label.style.cssText = `font-size:${size}px;fill:${dark ? "#e4edf1" : "#314957"};stroke:${dark ? "#1d2c36" : "white"};stroke-width:5px;paint-order:stroke;font-family:'Source Sans 3 Variable',sans-serif;pointer-events:all;cursor:pointer;`;
  root.appendChild(label);
}

export function applyCanvas(root: SVGSVGElement, model: CanvasModel, settings: CanvasSettings, dark: boolean) {
  const nodes = model.nodes.map(node => {
    const saved = Object.hasOwn(settings.positions, node.name) ? settings.positions[node.name] : undefined;
    const placed = saved ? { ...node, ...saved } : node;
    const el = root.getElementById(node.domId) as SVGGElement | null;
    if (el) {
      el.setAttribute("transform", `translate(${placed.x - node.x}, ${placed.y - node.y}) ${node.transform}`);
      el.setAttribute("data-class", node.name);
      el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); el.setAttribute("aria-label", (el.hasAttribute("data-visual") ? "Elemento " : "Clase ") + node.name);
    }
    return placed;
  });
  for (const marker of root.querySelectorAll<SVGMarkerElement>("marker")) {
    if (!marker.dataset.baseRefX) {
      marker.dataset.baseRefX = marker.getAttribute("refX") || "0";
      marker.dataset.baseRefY = marker.getAttribute("refY") || "0";
    }
    marker.setAttribute("refX", String(Number(marker.dataset.baseRefX) * settings.arrowScale));
    marker.setAttribute("refY", String(Number(marker.dataset.baseRefY) * settings.arrowScale));
    marker.setAttribute("markerWidth", "100"); marker.setAttribute("markerHeight", "100");
    marker.setAttribute("markerUnits", "userSpaceOnUse"); marker.removeAttribute("viewBox"); marker.style.overflow = "visible";
    for (const child of marker.children) child.setAttribute("transform", `scale(${settings.arrowScale})`);
  }
  for (const path of root.querySelectorAll<SVGPathElement>(".edgePaths path")) path.style.strokeWidth = String(settings.lineWidth);
  root.querySelectorAll(".edgeTerminals,.studio-terminals").forEach(el => el.remove());
  root.querySelector(".studio-edge-hitareas")?.remove();
  const hitareas = document.createElementNS(SVG_NS, "g");
  hitareas.setAttribute("class", "studio-edge-hitareas");
  root.querySelector(".edgePaths")?.appendChild(hitareas);
  const terminals = document.createElementNS(SVG_NS, "g"); terminals.setAttribute("class", "studio-terminals");
  root.querySelector(".edgeLabels")?.appendChild(terminals);
  const pairCounts = new Map<string, number>();
  for (const edge of model.edges) {
    const a = nodes.find(n => n.name === edge.start), b = nodes.find(n => n.name === edge.end);
    const path = Array.from(root.querySelectorAll<SVGPathElement>(".edgePaths path")).find(el => el.dataset.id === edge.id);
    if (!a || !b || !path) continue;
    const pair = [a.name, b.name].sort().join("|");
    const count = pairCounts.get(pair) || 0; pairCounts.set(pair, count + 1);
    const startGap = markerGap(root, path.getAttribute("marker-start"), settings.arrowScale, true), endGap = markerGap(root, path.getAttribute("marker-end"), settings.arrowScale, false);
    const originalA = model.nodes.find(n => n.name === a.name)!, originalB = model.nodes.find(n => n.name === b.name)!;
    const atLayout = Math.hypot(a.x - originalA.x, a.y - originalA.y, b.x - originalB.x, b.y - originalB.y) < .1;
    // Keep Mermaid's obstacle-aware layout until either endpoint is moved.
    const custom = edge.routeKey ? settings.routes[edge.routeKey] : undefined;
    const actorEdge = root.getElementById(a.domId)?.hasAttribute("data-uml-actor") || root.getElementById(b.domId)?.hasAttribute("data-uml-actor");
    const geometry = (!custom && atLayout && !actorEdge ? layoutRoute(edge, startGap, endGap) : null) || routeEdge(a, b, custom || DEFAULT_ROUTE, startGap, endGap, count * 28);
    path.setAttribute("d", geometry.path);
    path.setAttribute("data-source", a.name); path.setAttribute("data-target", b.name);
    path.setAttribute("data-edge-id", edge.id); path.classList.add("studio-edge-line");
    const hit = document.createElementNS(SVG_NS, "path");
    hit.setAttribute("d", geometry.path); hit.setAttribute("class", "studio-edge-hit");
    const target = document.createElementNS(SVG_NS, "g");
    target.setAttribute("class", "studio-edge-target"); target.setAttribute("data-edge-id", edge.id);
    target.setAttribute("tabindex", "0"); target.setAttribute("role", "button");
    target.setAttribute("aria-label", `Relación ${a.name} con ${b.name}${edge.label ? `: ${edge.label}` : ""}`);
    target.setAttribute("aria-pressed", "false"); target.appendChild(hit);
    // Horizontal and vertical paths have a zero-height/width geometric box.
    // Give the focusable group a real box without altering the visible line.
    const anchor = document.createElementNS(SVG_NS, "circle");
    const middle = path.getPointAtLength(path.getTotalLength() / 2);
    anchor.setAttribute("cx", String(middle.x)); anchor.setAttribute("cy", String(middle.y));
    anchor.setAttribute("r", "1"); anchor.setAttribute("fill", "transparent"); anchor.style.pointerEvents = "none";
    target.appendChild(anchor); hitareas.appendChild(target);
    const label = Array.from(root.querySelectorAll<SVGGElement>(".edgeLabel")).find(el => el.querySelector("[data-id]")?.getAttribute("data-id") === edge.id);
    const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
    if (label) { geometry.label = midpoint; label.setAttribute("transform", `translate(${geometry.label.x}, ${geometry.label.y}) scale(${settings.labelSize / 14})`); label.setAttribute("data-edge-id", edge.id); label.style.pointerEvents = "all"; label.style.cursor = "pointer"; }
    terminal(terminals, edge.startLabelRight || "", geometry.start, "startToward" in geometry ? geometry.startToward as Point : geometry.end, settings.labelSize * .85, dark, true, edge.id);
    terminal(terminals, edge.endLabelLeft || "", geometry.end, "endToward" in geometry ? geometry.endToward as Point : geometry.start, settings.labelSize * .85, dark, false, edge.id);
  }
  return Object.fromEntries(nodes.map(n => [n.name, { x: n.x, y: n.y }]));
}

export function exportCanvas(root: SVGSVGElement) {
  const clone = root.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".studio-edge-hitareas,.studio-edge-controls").forEach(el => el.remove());
  clone.querySelectorAll(".edge-selected,.edge-hovered").forEach(el => el.classList.remove("edge-selected", "edge-hovered"));
  clone.querySelectorAll(".connection-origin,.class-selected").forEach(el => el.classList.remove("connection-origin", "class-selected"));
  clone.querySelectorAll("[tabindex]").forEach(el => { el.removeAttribute("tabindex"); el.removeAttribute("role"); });
  const box = root.getBBox();
  const width = Math.max(1, box.width + 70), height = Math.max(1, box.height + 70);
  clone.setAttribute("viewBox", `${box.x - 35} ${box.y - 35} ${width} ${height}`);
  clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export function edgeControls(root: SVGSVGElement, model: CanvasModel, settings: CanvasSettings, edgeId: string, zoom: number, editable: boolean) {
  const focused = root.contains(document.activeElement) ? (document.activeElement as SVGElement)?.getAttribute("data-handle") : null;
  root.querySelector(".studio-edge-controls")?.remove();
  if (!editable || !edgeId) return;
  const edge = model.edges.find(e => e.id === edgeId);
  if (!edge?.routeKey) return;
  const a = model.nodes.find(n => n.name === edge.start), b = model.nodes.find(n => n.name === edge.end);
  const path = Array.from(root.querySelectorAll<SVGPathElement>(".studio-edge-line")).find(p => p.dataset.id === edgeId);
  if (!a || !b || !path) return;
  const placedA = { ...a, ...settings.positions[a.name] }, placedB = { ...b, ...settings.positions[b.name] };
  const route = settings.routes[edge.routeKey] || DEFAULT_ROUTE;
  const geometry = routeEdge(placedA, placedB, route);
  const first = path.getPointAtLength(0), last = path.getPointAtLength(path.getTotalLength());
  const origin = route.from ? geometry.origin : anchorPoint(placedA, nearestAnchor(placedA, first));
  const destination = route.to ? geometry.destination : anchorPoint(placedB, nearestAnchor(placedB, last));
  const group = document.createElementNS(SVG_NS, "g"); group.setAttribute("class", "studio-edge-controls");
  const handles = [{ point: origin, kind: "from", label: `Mover origen en ${a.name}` }, { point: destination, kind: "to", label: `Mover destino en ${b.name}` },
    ...geometry.points.map((point, i) => ({ point, kind: String(i), label: `Mover punto ${i + 1} de la relación` }))];
  if (!route.points.length) { const middle = path.getPointAtLength(path.getTotalLength() / 2); handles.push({ point: middle, kind: "new", label: "Doblar relación" }); }
  for (const { point, kind, label } of handles) {
    const handle = document.createElementNS(SVG_NS, "g");
    handle.setAttribute("class", "edge-handle"); handle.setAttribute("data-edge-id", edgeId); handle.setAttribute("data-handle", kind);
    handle.setAttribute("data-x", String(point.x)); handle.setAttribute("data-y", String(point.y));
    handle.setAttribute("role", "button"); handle.setAttribute("tabindex", "0"); handle.setAttribute("aria-label", label);
    handle.setAttribute("transform", `translate(${point.x},${point.y}) scale(${1 / zoom})`);
    const hit = document.createElementNS(SVG_NS, "circle"); hit.setAttribute("r", "14"); hit.setAttribute("fill", "transparent"); hit.style.pointerEvents = "all";
    const visible = document.createElementNS(SVG_NS, kind === "from" || kind === "to" ? "rect" : "circle");
    if (visible.tagName === "rect") { visible.setAttribute("x", "-5"); visible.setAttribute("y", "-5"); visible.setAttribute("width", "10"); visible.setAttribute("height", "10"); visible.setAttribute("rx", "2"); }
    else visible.setAttribute("r", "5");
    visible.setAttribute("class", "edge-handle-dot");
    handle.appendChild(hit); handle.appendChild(visible); group.appendChild(handle);
  }
  (root.querySelector("g.root") || root).appendChild(group);
  if (focused) Array.from(group.querySelectorAll<SVGElement>("[data-handle]")).find(el => el.dataset.handle === focused)?.focus({ preventScroll: true });
}
