import type { CanvasSettings, Point } from "./canvas";

export type ClassGeometry = { name: string; x: number; y: number; width: number; height: number; domId: string; transform: string };
export type EdgeGeometry = { id: string; start?: string; end?: string; startLabelRight?: string; endLabelLeft?: string; points?: Point[]; labelPosition?: Point };
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

function border(node: ClassGeometry, toward: Point): Point {
  const dx = toward.x - node.x, dy = toward.y - node.y;
  const t = Math.min(node.width / 2 / (Math.abs(dx) || .001), node.height / 2 / (Math.abs(dy) || .001));
  return { x: node.x + dx * t, y: node.y + dy * t };
}
function normalize(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}
function markerGap(ref: string | null, scale: number) {
  if (!ref) return 0;
  return (/dependency/.test(ref) ? 6 : /lollipop/.test(ref) ? 13 : 18) * scale;
}

function route(a: ClassGeometry, b: ClassGeometry, startGap: number, endGap: number, offset: number) {
  if (a.name === b.name) {
    const sx = a.x + a.width / 2 + startGap, ex = a.x + a.width / 2 + endGap;
    const reach = a.x + a.width / 2 + 100 + offset;
    return { path: `M ${sx} ${a.y - 22} C ${reach} ${a.y - 90}, ${reach} ${a.y + 90}, ${ex} ${a.y + 22}`, label: { x: reach - 10, y: a.y }, start: { x: sx, y: a.y - 22 }, end: { x: ex, y: a.y + 22 } };
  }
  const origin = border(a, b), destination = border(b, a), dir = normalize(a, b);
  const s = { x: origin.x + dir.x * startGap, y: origin.y + dir.y * startGap };
  const e = { x: destination.x - dir.x * endGap, y: destination.y - dir.y * endGap };
  const horizontal = Math.abs(dir.x) * a.height > Math.abs(dir.y) * a.width;
  const pull = Math.max(35, Math.hypot(e.x - s.x, e.y - s.y) * .38);
  const c1 = { x: s.x + (horizontal ? Math.sign(dir.x) * pull : 0) - dir.y * offset, y: s.y + (horizontal ? 0 : Math.sign(dir.y) * pull) + dir.x * offset };
  const c2 = { x: e.x - (horizontal ? Math.sign(dir.x) * pull : 0) - dir.y * offset, y: e.y - (horizontal ? 0 : Math.sign(dir.y) * pull) + dir.x * offset };
  return { path: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`, label: { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 }, start: s, end: e };
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

function terminal(root: SVGElement, text: string, point: Point, other: Point, size: number, dark: boolean, start: boolean) {
  if (!text || text === "none") return;
  const direction = normalize(point, other), sign = start ? 1 : -1;
  const label = document.createElementNS(SVG_NS, "text");
  label.textContent = text;
  label.setAttribute("x", String(point.x + direction.x * 18 - direction.y * 17 * sign));
  label.setAttribute("y", String(point.y + direction.y * 18 + direction.x * 17 * sign));
  label.setAttribute("text-anchor", "middle"); label.setAttribute("dominant-baseline", "middle");
  label.style.cssText = `font-size:${size}px;fill:${dark ? "#e4ece7" : "#42574b"};stroke:${dark ? "#20252d" : "white"};stroke-width:5px;paint-order:stroke;font-family:Arial,sans-serif;pointer-events:none;`;
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
      el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); el.setAttribute("aria-label", "Clase " + node.name);
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
  const terminals = document.createElementNS(SVG_NS, "g"); terminals.setAttribute("class", "studio-terminals");
  root.querySelector(".edgeLabels")?.appendChild(terminals);
  const pairCounts = new Map<string, number>();
  for (const edge of model.edges) {
    const a = nodes.find(n => n.name === edge.start), b = nodes.find(n => n.name === edge.end);
    const path = Array.from(root.querySelectorAll<SVGPathElement>(".edgePaths path")).find(el => el.dataset.id === edge.id);
    if (!a || !b || !path) continue;
    const pair = [a.name, b.name].sort().join("|");
    const count = pairCounts.get(pair) || 0; pairCounts.set(pair, count + 1);
    const startGap = markerGap(path.getAttribute("marker-start"), settings.arrowScale), endGap = markerGap(path.getAttribute("marker-end"), settings.arrowScale);
    const originalA = model.nodes.find(n => n.name === a.name)!, originalB = model.nodes.find(n => n.name === b.name)!;
    const atLayout = Math.hypot(a.x - originalA.x, a.y - originalA.y, b.x - originalB.x, b.y - originalB.y) < .1;
    // Keep Mermaid's obstacle-aware layout until either endpoint is moved.
    const geometry = (atLayout ? layoutRoute(edge, startGap, endGap) : null) || route(a, b, startGap, endGap, count * 28);
    path.setAttribute("d", geometry.path);
    path.setAttribute("data-source", a.name); path.setAttribute("data-target", b.name);
    const label = Array.from(root.querySelectorAll<SVGGElement>(".edgeLabel")).find(el => el.querySelector("[data-id]")?.getAttribute("data-id") === edge.id);
    if (label) label.setAttribute("transform", `translate(${geometry.label.x}, ${geometry.label.y}) scale(${settings.labelSize / 14})`);
    terminal(terminals, edge.startLabelRight || "", geometry.start, geometry.end, settings.labelSize * .85, dark, true);
    terminal(terminals, edge.endLabelLeft || "", geometry.end, geometry.start, settings.labelSize * .85, dark, false);
  }
  return Object.fromEntries(nodes.map(n => [n.name, { x: n.x, y: n.y }]));
}

export function exportCanvas(root: SVGSVGElement) {
  const clone = root.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".connection-origin,.class-selected").forEach(el => el.classList.remove("connection-origin", "class-selected"));
  clone.querySelectorAll("[tabindex]").forEach(el => { el.removeAttribute("tabindex"); el.removeAttribute("role"); });
  const box = root.getBBox();
  const width = Math.max(1, box.width + 70), height = Math.max(1, box.height + 70);
  clone.setAttribute("viewBox", `${box.x - 35} ${box.y - 35} ${width} ${height}`);
  clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}
