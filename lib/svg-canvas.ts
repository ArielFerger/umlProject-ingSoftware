import type { CanvasSettings, CanvasStroke, EdgeRoute, Point } from "./canvas";
import { renderFrames } from "./svg-frames";
import { colorClass, colorArrow, colorVisual } from "./svg-colors";
import { routeEdge, DEFAULT_ROUTE, nearestAnchor, anchorPoint, polylineMidpoint } from "./edge-routing";
import { shapeBoundary, type DerShape } from "./der";
import { outlinePath, strokeOutline } from "./freehand";

/** `cx`/`cy`: center in the node's own coordinates, the origin for size changes. */
export type ClassGeometry = { name: string; x: number; y: number; width: number; height: number; domId: string; transform: string; shape?: DerShape; cx?: number; cy?: number };
export type EdgeGeometry = { id: string; routeKey?: string; start?: string; end?: string; startLabelRight?: string; endLabelLeft?: string; points?: Point[]; labelPosition?: Point; label?: string; labelNear?: "start" | "end" };
export type CanvasModel = { nodes: ClassGeometry[]; edges: EdgeGeometry[] };
const SVG_NS = "http://www.w3.org/2000/svg";

type MarkerCache = {
  el: SVGMarkerElement;
  children: Element[];
  baseRefX: number;
  baseRefY: number;
  min: number;
  max: number;
};

type CachedEdgeEntry = {
  edge: EdgeGeometry;
  path: SVGPathElement;
  coloredMarkers: SVGMarkerElement[];
  hit: SVGPathElement;
  anchor: SVGCircleElement;
  label: SVGGElement | null;
  startTerminal: SVGTextElement | null;
  endTerminal: SVGTextElement | null;
  parallelOffset: number;
  actorEdge: boolean;
  /** Chen shapes: straight lines that stop at the diamond or ellipse outline. */
  shaped: boolean;
  /** Inner stroke that turns a thick Mermaid link into a total-participation double line. */
  double: SVGPathElement | null;
  lastKey: string;
};

type CanvasDomCache = {
  nodeEls: Map<string, SVGGElement>;
  modelNodes: Map<string, ClassGeometry>;
  appliedNodePos: Map<string, Point & { s: number }>;
  placedNodes: Map<string, ClassGeometry>;
  markers: Map<string, MarkerCache>;
  allPaths: SVGPathElement[];
  edges: CachedEdgeEntry[];
  edgesByNode: Map<string, CachedEdgeEntry[]>;
  edgesById: Map<string, CachedEdgeEntry>;
  arrowScale: number;
  lineWidth: number;
  strokesRef: CanvasStroke[] | undefined;
};

const domCache = new WeakMap<SVGSVGElement, CanvasDomCache>();

export function measureClasses(root: SVGSVGElement): ClassGeometry[] {
  return Array.from(root.querySelectorAll<SVGGElement>("g.node")).flatMap(node => {
    const name = node.id.match(/classId-(.+)-\d+$/)?.[1];
    if (!name) return [];
    const box = node.getBBox();
    const transform = node.transform.baseVal.consolidate()?.matrix;
    if (!transform) return [];
    return [{ name, domId: node.id, x: transform.e + box.x + box.width / 2, y: transform.f + box.y + box.height / 2, width: box.width, height: box.height, transform: node.getAttribute("transform") || "", cx: box.x + box.width / 2, cy: box.y + box.height / 2 }];
  });
}

function normalize(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

function cachedMarkerGap(markers: Map<string, MarkerCache>, ref: string | null, scale: number, start: boolean) {
  if (!ref) return 0;
  const startIdx = ref.indexOf("#");
  if (startIdx < 0) return 0;
  let endIdx = startIdx + 1;
  while (endIdx < ref.length && ref[endIdx] !== ")" && ref[endIdx] !== "'" && ref[endIdx] !== '"' && ref[endIdx] !== " ") endIdx++;
  const info = markers.get(ref.slice(startIdx + 1, endIdx));
  if (!info) return 0;
  return (start ? info.baseRefX - info.min : info.max - info.baseRefX) * scale;
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
  const midpoint = polylineMidpoint(points);
  return { path, knots: points, start: first, end: last, midpoint, label: edge.labelPosition || midpoint };
}

function svgOf(element: SVGElement) { return element.ownerSVGElement || element; }

function shapedRoute(a: ClassGeometry, b: ClassGeometry) {
  const start = shapeBoundary(a, b), end = shapeBoundary(b, a);
  return { path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, knots: [start, end], start, end, midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

/** Cardinality sits beside the entity end of a line, clear of the stroke. */
function nearEnd(knots: Point[], side: "start" | "end"): Point {
  const points = side === "start" ? knots : [...knots].reverse();
  const [from, to] = [points[0], points[1] || points[0]];
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1, along = Math.min(26, length * .35);
  const ux = (to.x - from.x) / length, uy = (to.y - from.y) / length;
  return { x: from.x + ux * along - uy * 13, y: from.y + uy * along + ux * 13 };
}

function updateTerminal(el: SVGTextElement | null, point: Point, other: Point, size: number, dark: boolean, start: boolean) {
  if (!el) return;
  const direction = normalize(point, other), sign = start ? 1 : -1;
  el.setAttribute("x", String(point.x + direction.x * 18 - direction.y * 17 * sign));
  el.setAttribute("y", String(point.y + direction.y * 18 + direction.x * 17 * sign));
  el.style.fontSize = `${size}px`;
  el.style.fill = dark ? "#e4edf1" : "#314957";
  el.style.stroke = dark ? "#1d2c36" : "white";
}

function createTerminal(root: SVGElement, text: string, edgeId: string): SVGTextElement | null {
  if (!text || text === "none") return null;
  const label = document.createElementNS(SVG_NS, "text");
  label.textContent = text;
  label.setAttribute("data-edge-id", edgeId);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  label.style.cssText = "stroke-width:5px;paint-order:stroke;font-family:'Source Sans 3 Variable',sans-serif;pointer-events:all;cursor:pointer;";
  root.appendChild(label);
  return label;
}

function routeSignature(route: EdgeRoute | undefined): string {
  if (!route) return "";
  const f = route.from ? `${route.from.side}:${route.from.offset}` : "";
  const t = route.to ? `${route.to.side}:${route.to.offset}` : "";
  const pts = route.points.length ? route.points.map(p => `${p.x},${p.y}`).join(";") : "";
  return `${route.shape}|${f}|${t}|${pts}`;
}

function buildDomCache(root: SVGSVGElement, model: CanvasModel): CanvasDomCache {
  const nodeEls = new Map<string, SVGGElement>();
  const modelNodes = new Map<string, ClassGeometry>();
  const appliedNodePos = new Map<string, Point & { s: number }>();
  const placedNodes = new Map<string, ClassGeometry>();

  for (const node of model.nodes) {
    modelNodes.set(node.name, node);
    placedNodes.set(node.name, node);
    const el = root.getElementById(node.domId) as SVGGElement | null;
    if (el) {
      nodeEls.set(node.name, el);
      el.setAttribute("data-class", node.name);
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", (el.hasAttribute("data-visual") ? "Elemento " : "Clase ") + node.name);
    }
  }

  const markers = new Map<string, MarkerCache>();
  for (const marker of root.querySelectorAll<SVGMarkerElement>("marker")) {
    if (!marker.dataset.baseRefX) {
      marker.dataset.baseRefX = marker.getAttribute("refX") || "0";
      marker.dataset.baseRefY = marker.getAttribute("refY") || "0";
    }
    const children = Array.from(marker.children);
    let min = Infinity, max = -Infinity;
    for (const child of children) {
      try {
        const b = (child as SVGGraphicsElement).getBBox();
        if (b.x < min) min = b.x;
        if (b.x + b.width > max) max = b.x + b.width;
      } catch { /* ignore non-geometric children */ }
    }
    marker.setAttribute("markerWidth", "100");
    marker.setAttribute("markerHeight", "100");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    marker.removeAttribute("viewBox");
    marker.style.overflow = "visible";
    if (marker.id && Number.isFinite(min) && Number.isFinite(max)) {
      markers.set(marker.id, {
        el: marker,
        children,
        baseRefX: Number(marker.dataset.baseRefX || 0),
        baseRefY: Number(marker.dataset.baseRefY || 0),
        min,
        max,
      });
    }
  }

  const allPaths = Array.from(root.querySelectorAll<SVGPathElement>(".edgePaths path:not(.der-double-inner)"));
  const pathById = new Map<string, SVGPathElement>();
  for (const p of allPaths) {
    if (p.dataset.id) pathById.set(p.dataset.id, p);
  }

  const labelById = new Map<string, SVGGElement>();
  for (const l of root.querySelectorAll<SVGGElement>(".edgeLabel")) {
    const id = l.querySelector("[data-id]")?.getAttribute("data-id");
    if (id) labelById.set(id, l);
  }

  root.querySelectorAll(".edgeTerminals,.studio-terminals").forEach(el => el.remove());
  root.querySelector(".studio-edge-hitareas")?.remove();
  const hitareas = document.createElementNS(SVG_NS, "g");
  hitareas.setAttribute("class", "studio-edge-hitareas");
  root.querySelector(".edgePaths")?.appendChild(hitareas);
  const terminals = document.createElementNS(SVG_NS, "g");
  terminals.setAttribute("class", "studio-terminals");
  root.querySelector(".edgeLabels")?.appendChild(terminals);

  const edges: CachedEdgeEntry[] = [];
  const edgesByNode = new Map<string, CachedEdgeEntry[]>();
  const edgesById = new Map<string, CachedEdgeEntry>();
  const pairCounts = new Map<string, number>();

  for (const edge of model.edges) {
    if (!edge.start || !edge.end) continue;
    const a = modelNodes.get(edge.start), b = modelNodes.get(edge.end);
    const path = pathById.get(edge.id);
    if (!a || !b || !path) continue;
    const pair = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
    const count = pairCounts.get(pair) || 0;
    pairCounts.set(pair, count + 1);
    const actorEdge = !!(nodeEls.get(a.name)?.hasAttribute("data-uml-actor") || nodeEls.get(b.name)?.hasAttribute("data-uml-actor"));
    const shaped = !!(a.shape || b.shape);
    let double: SVGPathElement | null = null;
    if (shaped && path.classList.contains("edge-thickness-thick")) {
      double = document.createElementNS(SVG_NS, "path");
      double.setAttribute("class", "der-double-inner");
      double.setAttribute("data-edge-id", edge.id);
      double.style.cssText = "fill:none;pointer-events:none;stroke-linecap:butt;";
      path.parentNode?.insertBefore(double, path.nextSibling);
    }

    path.setAttribute("data-source", a.name);
    path.setAttribute("data-target", b.name);
    path.setAttribute("data-edge-id", edge.id);
    path.classList.add("studio-edge-line");

    const hit = document.createElementNS(SVG_NS, "path");
    hit.setAttribute("class", "studio-edge-hit");
    const target = document.createElementNS(SVG_NS, "g");
    target.setAttribute("class", "studio-edge-target");
    target.setAttribute("data-edge-id", edge.id);
    target.setAttribute("tabindex", "0");
    target.setAttribute("role", "button");
    target.setAttribute("aria-label", `Relación ${a.name} con ${b.name}${edge.label ? `: ${edge.label}` : ""}`);
    target.setAttribute("aria-pressed", "false");
    target.appendChild(hit);

    const anchor = document.createElementNS(SVG_NS, "circle");
    anchor.setAttribute("r", "1");
    anchor.setAttribute("fill", "transparent");
    anchor.style.pointerEvents = "none";
    target.appendChild(anchor);
    hitareas.appendChild(target);

    const label = labelById.get(edge.id) || null;
    if (label) {
      label.setAttribute("data-edge-id", edge.id);
      label.style.pointerEvents = "all";
      label.style.cursor = "pointer";
    }

    const startTerminal = createTerminal(terminals, edge.startLabelRight || "", edge.id);
    const endTerminal = createTerminal(terminals, edge.endLabelLeft || "", edge.id);

    // Mermaid shares marker definitions. Give each connection its own tips so
    // recoloring one arrow cannot change the other connections.
    const coloredMarkers: SVGMarkerElement[] = [];
    for (const end of ["start", "end"]) {
      const ref = path.getAttribute(`marker-${end}`);
      const id = ref?.match(/#([^)'"\s]+)/)?.[1];
      const original = id ? markers.get(id) : undefined;
      if (!original) continue;
      const marker = original.el.cloneNode(true) as SVGMarkerElement;
      marker.id = `${original.el.id}-studio-${edges.length}-${end}`;
      original.el.parentNode!.appendChild(marker);
      markers.set(marker.id, { ...original, el: marker, children: Array.from(marker.children) });
      path.setAttribute(`marker-${end}`, `url(#${marker.id})`);
      coloredMarkers.push(marker);
    }
    const entry: CachedEdgeEntry = {
      edge,
      path,
      coloredMarkers,
      hit,
      anchor,
      label,
      startTerminal,
      endTerminal,
      parallelOffset: count * 28,
      actorEdge,
      shaped,
      double,
      lastKey: "",
    };
    edges.push(entry);
    edgesById.set(edge.id, entry);
    const listA = edgesByNode.get(a.name) || [];
    listA.push(entry);
    edgesByNode.set(a.name, listA);
    if (b.name !== a.name) {
      const listB = edgesByNode.get(b.name) || [];
      listB.push(entry);
      edgesByNode.set(b.name, listB);
    }
  }

  const cache: CanvasDomCache = {
    nodeEls,
    modelNodes,
    appliedNodePos,
    placedNodes,
    markers,
    allPaths,
    edges,
    edgesByNode,
    edgesById,
    arrowScale: NaN,
    lineWidth: NaN,
    strokesRef: undefined,
  };
  domCache.set(root, cache);
  return cache;
}

function updateEdgeEntry(entry: CachedEdgeEntry, cache: CanvasDomCache, settings: CanvasSettings, dark: boolean) {
  const { edge, path, hit, anchor, label, startTerminal, endTerminal, parallelOffset, actorEdge } = entry;
  const a = cache.placedNodes.get(edge.start!), b = cache.placedNodes.get(edge.end!);
  const originalA = cache.modelNodes.get(edge.start!), originalB = cache.modelNodes.get(edge.end!);
  if (!a || !b || !originalA || !originalB) return;
  const custom = edge.routeKey ? settings.routes[edge.routeKey] : undefined;
  const color = edge.routeKey ? settings.edgeColors?.[edge.routeKey] : undefined;
  const key = `${color || ""}|${a.x},${a.y},${a.width}|${b.x},${b.y},${b.width}|${settings.arrowScale}|${settings.labelSize}|${dark ? 1 : 0}|${routeSignature(custom)}`;
  if (entry.lastKey === key) return;
  entry.lastKey = key;
  colorArrow(path, entry.coloredMarkers, color);

  const startGap = cachedMarkerGap(cache.markers, path.getAttribute("marker-start"), settings.arrowScale, true);
  const endGap = cachedMarkerGap(cache.markers, path.getAttribute("marker-end"), settings.arrowScale, false);
  const atLayout = Math.abs(a.x - originalA.x) < .1 && Math.abs(a.y - originalA.y) < .1 && Math.abs(b.x - originalB.x) < .1 && Math.abs(b.y - originalB.y) < .1 && a.width === originalA.width && b.width === originalB.width;
  const geometry = (entry.shaped && !custom?.points.length && !custom?.from && !custom?.to ? shapedRoute(a, b) : null)
    || (!custom && atLayout && !actorEdge ? layoutRoute(edge, startGap, endGap) : null) || routeEdge(a, b, custom || DEFAULT_ROUTE, startGap, endGap, parallelOffset);
  path.setAttribute("d", geometry.path);
  hit.setAttribute("d", geometry.path);
  if (entry.double) {
    entry.double.setAttribute("d", geometry.path);
    entry.double.style.stroke = getComputedStyle(svgOf(path)).getPropertyValue("--canvas").trim() || (dark ? "#1d2c36" : "#ffffff");
    entry.double.style.strokeWidth = `${settings.lineWidth}px`;
    path.style.strokeWidth = `${settings.lineWidth * 3}px`;
  }
  const midpoint = "midpoint" in geometry && geometry.midpoint ? geometry.midpoint : polylineMidpoint(geometry.knots);
  anchor.setAttribute("cx", String(midpoint.x));
  anchor.setAttribute("cy", String(midpoint.y));
  if (label) {
    const at = edge.labelNear ? nearEnd(geometry.knots, edge.labelNear) : midpoint;
    label.setAttribute("transform", `translate(${at.x}, ${at.y}) scale(${settings.labelSize / 14})`);
  }
  const labelSize = settings.labelSize * .85;
  updateTerminal(startTerminal, geometry.start, "startToward" in geometry ? geometry.startToward as Point : geometry.end, labelSize, dark, true);
  updateTerminal(endTerminal, geometry.end, "endToward" in geometry ? geometry.endToward as Point : geometry.start, labelSize, dark, false);
}

/** Places a node at its saved position and size; returns the geometry edges route to. */
function placeNode(cache: CanvasDomCache, base: ClassGeometry, settings: CanvasSettings) {
  const saved = Object.hasOwn(settings.positions, base.name) ? settings.positions[base.name] : undefined;
  const scale = settings.nodeScales && Object.hasOwn(settings.nodeScales, base.name) ? settings.nodeScales[base.name] : 1;
  const placed = { ...base, ...saved, width: base.width * scale, height: base.height * scale };
  cache.placedNodes.set(base.name, placed);
  const prev = cache.appliedNodePos.get(base.name);
  if (!prev || prev.x !== placed.x || prev.y !== placed.y || prev.s !== scale) {
    cache.appliedNodePos.set(base.name, { x: placed.x, y: placed.y, s: scale });
    const cx = base.cx ?? 0, cy = base.cy ?? 0;
    const resize = scale !== 1 ? ` translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})` : "";
    cache.nodeEls.get(base.name)?.setAttribute("transform", `translate(${placed.x - base.x}, ${placed.y - base.y}) ${base.transform}${resize}`);
  }
  return placed;
}

export function applyCanvas(root: SVGSVGElement, model: CanvasModel, settings: CanvasSettings, dark: boolean, dirtyNode?: string, dirtyEdgeId?: string) {
  root.dataset.framesDark = String(dark);
  let cache = domCache.get(root);
  if (!cache || cache.modelNodes.size !== model.nodes.length) {
    cache = buildDomCache(root, model);
  }

  if (dirtyNode) {
    const base = cache.modelNodes.get(dirtyNode);
    if (base) {
      placeNode(cache, base, settings);
      const incident = cache.edgesByNode.get(dirtyNode);
      if (incident) {
        for (const entry of incident) updateEdgeEntry(entry, cache, settings, dark);
      }
    }
    renderFrames(root, settings, model.nodes);
    const result: Record<string, Point> = {};
    for (const [name, node] of cache.placedNodes) result[name] = { x: node.x, y: node.y };
    return result;
  }

  if (dirtyEdgeId) {
    const entry = cache.edgesById.get(dirtyEdgeId);
    if (entry) updateEdgeEntry(entry, cache, settings, dark);
    renderFrames(root, settings, model.nodes);
    const result: Record<string, Point> = {};
    for (const [name, node] of cache.placedNodes) result[name] = { x: node.x, y: node.y };
    return result;
  }

  for (const [name, el] of cache.nodeEls) {
    const color = settings.nodeColors && Object.hasOwn(settings.nodeColors, name) ? settings.nodeColors[name] : undefined;
    const visual = el.getAttribute("data-visual");
    if (!visual) colorClass(el, color);
    else if (visual !== "sequence") colorVisual(el, color);
  }

  const result: Record<string, Point> = {};
  for (const node of model.nodes) {
    const placed = placeNode(cache, node, settings);
    result[node.name] = { x: placed.x, y: placed.y };
  }

  if (cache.arrowScale !== settings.arrowScale) {
    cache.arrowScale = settings.arrowScale;
    for (const m of cache.markers.values()) {
      m.el.setAttribute("refX", String(m.baseRefX * settings.arrowScale));
      m.el.setAttribute("refY", String(m.baseRefY * settings.arrowScale));
      for (const child of m.children) child.setAttribute("transform", `scale(${settings.arrowScale})`);
    }
  }

  if (cache.lineWidth !== settings.lineWidth) {
    cache.lineWidth = settings.lineWidth;
    const widthStr = String(settings.lineWidth);
    for (const path of cache.allPaths) path.style.strokeWidth = widthStr;
    for (const entry of cache.edges) { if (entry.double) entry.lastKey = ""; }
  }

  for (const entry of cache.edges) {
    updateEdgeEntry(entry, cache, settings, dark);
  }

  if (cache.strokesRef !== settings.strokes) {
    cache.strokesRef = settings.strokes;
    renderStrokes(root, settings.strokes);
  }

  renderFrames(root, settings, model.nodes);
  return result;
}

export function strokePath(points: Point[]): string {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + .1} ${points[0].y + .1}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  return d + ` L ${last.x} ${last.y}`;
}

/** Ink strokes are filled outlines; strokes saved before the ink renderer stay centerlines. */
function paintStroke(path: SVGPathElement, stroke: CanvasStroke) {
  if (stroke.tool) {
    path.setAttribute("d", outlinePath(strokeOutline(stroke.points, stroke.width || 2.5, stroke.tool)));
    path.setAttribute("fill", stroke.color || "#1a647b");
    path.setAttribute("fill-opacity", stroke.tool === "marker" ? ".38" : "1");
    path.setAttribute("stroke", "none");
    path.removeAttribute("stroke-width");
  } else {
    path.setAttribute("d", strokePath(stroke.points));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke.color || "#1a647b");
    path.setAttribute("stroke-width", String(stroke.width || 2.5));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
  }
}

export function renderStrokes(root: SVGSVGElement, strokes: CanvasStroke[] = [], activeStroke?: CanvasStroke | null) {
  let group = root.querySelector<SVGGElement>(".studio-drawings");
  if (activeStroke && group && group.dataset.baseCount === String(strokes.length)) {
    let activePath = group.querySelector<SVGPathElement>('path[data-active-stroke="true"]');
    if (!activePath) {
      activePath = document.createElementNS(SVG_NS, "path");
      activePath.setAttribute("class", "studio-stroke-line");
      activePath.setAttribute("data-active-stroke", "true");
      group.appendChild(activePath);
    }
    paintStroke(activePath, activeStroke);
    return;
  }

  group?.remove();
  const list = activeStroke ? [...strokes, activeStroke] : strokes;
  if (!list.length) return;
  group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "studio-drawings");
  // Strokes are hit-tested geometrically; letting clicks through keeps elements underneath selectable.
  group.style.pointerEvents = "none";
  group.dataset.baseCount = String(strokes.length);
  for (let i = 0; i < list.length; i++) {
    const stroke = list[i];
    if (!stroke.points.length) continue;
    const path = document.createElementNS(SVG_NS, "path");
    paintStroke(path, stroke);
    path.setAttribute("class", "studio-stroke-line");
    path.setAttribute("data-stroke-index", String(i));
    if (activeStroke && i === list.length - 1) path.setAttribute("data-active-stroke", "true");
    group.appendChild(path);
  }
  (root.querySelector("g.root") || root).appendChild(group);
}

/** Dashed box around the selected pencil stroke; never exported. */
export function renderStrokeSelection(root: SVGSVGElement, stroke: CanvasStroke | null, zoom = 1) {
  root.querySelector(".studio-stroke-selection")?.remove();
  if (!stroke?.points.length) return;
  const pad = (stroke.width || 2.5) / 2 + 6 / zoom;
  const xs = stroke.points.map(p => p.x), ys = stroke.points.map(p => p.y);
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("class", "studio-stroke-selection");
  rect.setAttribute("x", String(Math.min(...xs) - pad)); rect.setAttribute("y", String(Math.min(...ys) - pad));
  rect.setAttribute("width", String(Math.max(...xs) - Math.min(...xs) + pad * 2)); rect.setAttribute("height", String(Math.max(...ys) - Math.min(...ys) + pad * 2));
  rect.setAttribute("rx", String(4 / zoom));
  rect.style.cssText = `fill:none;stroke:var(--accent,#1a647b);stroke-width:${1.5 / zoom}px;stroke-dasharray:${6 / zoom} ${4 / zoom};pointer-events:none`;
  (root.querySelector("g.root") || root).appendChild(rect);
}

export function exportCanvas(root: SVGSVGElement) {
  const clone = root.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".studio-edge-hitareas,.studio-edge-controls,.studio-stroke-hit,.studio-frame-controls,.studio-frame-hit,.studio-frame-link-hit,.studio-remote-selection,.studio-stroke-selection,.studio-note-controls,.studio-resize-handle").forEach(el => el.remove());
  clone.querySelectorAll(".edge-selected,.edge-hovered").forEach(el => el.classList.remove("edge-selected", "edge-hovered"));
  clone.querySelectorAll(".connection-origin,.class-selected").forEach(el => el.classList.remove("connection-origin", "class-selected"));
  clone.querySelectorAll("[tabindex]").forEach(el => { el.removeAttribute("tabindex"); el.removeAttribute("role"); });
  const box = root.getBBox();
  const width = Math.max(1, box.width + 70), height = Math.max(1, box.height + 70);
  clone.setAttribute("viewBox", `${box.x - 35} ${box.y - 35} ${width} ${height}`);
  clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export function lazyExportCanvas(root: SVGSVGElement) {
  let cached: { svg: string; width: number; height: number } | null = null;
  const compute = () => (cached ??= exportCanvas(root));
  return {
    get svg() { return compute().svg; },
    get width() { return compute().width; },
    get height() { return compute().height; },
  };
}

export function scaleEdgeControls(root: SVGSVGElement, zoom: number) {
  const controls = root.querySelector(".studio-edge-controls");
  if (!controls) return;
  const inv = 1 / Math.max(0.1, zoom);
  for (const handle of controls.querySelectorAll<SVGGElement>(".edge-handle")) {
    const x = handle.getAttribute("data-x") || "0";
    const y = handle.getAttribute("data-y") || "0";
    handle.setAttribute("transform", `translate(${x},${y}) scale(${inv})`);
  }
}

export function edgeControls(root: SVGSVGElement, model: CanvasModel, settings: CanvasSettings, edgeId: string, zoom: number, editable: boolean) {
  const focused = root.contains(document.activeElement) ? (document.activeElement as SVGElement)?.getAttribute("data-handle") : null;
  root.querySelector(".studio-edge-controls")?.remove();
  if (!editable || !edgeId) return;
  const cache = domCache.get(root);
  const edge = cache?.edgesById.get(edgeId)?.edge || model.edges.find(e => e.id === edgeId);
  if (!edge?.routeKey) return;
  const a = cache?.modelNodes.get(edge.start || "") || model.nodes.find(n => n.name === edge.start);
  const b = cache?.modelNodes.get(edge.end || "") || model.nodes.find(n => n.name === edge.end);
  const path = cache?.edgesById.get(edgeId)?.path || Array.from(root.querySelectorAll<SVGPathElement>(".studio-edge-line")).find(p => p.dataset.id === edgeId);
  if (!a || !b || !path) return;
  const placedA = { ...a, ...settings.positions[a.name] }, placedB = { ...b, ...settings.positions[b.name] };
  const custom = settings.routes[edge.routeKey];
  const route = custom || DEFAULT_ROUTE;
  const geometry = routeEdge(placedA, placedB, route);
  const atLayout = !custom && Math.abs(placedA.x - a.x) < .1 && Math.abs(placedA.y - a.y) < .1 && Math.abs(placedB.x - b.x) < .1 && Math.abs(placedB.y - b.y) < .1 && !!edge.points && edge.points.length >= 2;
  const activePoints = atLayout ? edge.points! : geometry.knots;
  const first = activePoints[0] || geometry.start;
  const last = activePoints[activePoints.length - 1] || geometry.end;
  const origin = route.from ? geometry.origin : anchorPoint(placedA, nearestAnchor(placedA, first));
  const destination = route.to ? geometry.destination : anchorPoint(placedB, nearestAnchor(placedB, last));
  const group = document.createElementNS(SVG_NS, "g"); group.setAttribute("class", "studio-edge-controls");
  const handles = [{ point: origin, kind: "from", label: `Mover origen en ${a.name}` }, { point: destination, kind: "to", label: `Mover destino en ${b.name}` },
    ...geometry.points.map((point, i) => ({ point, kind: String(i), label: `Mover punto ${i + 1} de la relación` }))];
  if (!route.points.length) { const middle = polylineMidpoint(activePoints); handles.push({ point: middle, kind: "new", label: "Doblar relación" }); }
  const inv = 1 / Math.max(0.1, zoom);
  for (const { point, kind, label } of handles) {
    const handle = document.createElementNS(SVG_NS, "g");
    handle.setAttribute("class", "edge-handle"); handle.setAttribute("data-edge-id", edgeId); handle.setAttribute("data-handle", kind);
    handle.setAttribute("data-x", String(point.x)); handle.setAttribute("data-y", String(point.y));
    handle.setAttribute("role", "button"); handle.setAttribute("tabindex", "0"); handle.setAttribute("aria-label", label);
    handle.setAttribute("transform", `translate(${point.x},${point.y}) scale(${inv})`);
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

