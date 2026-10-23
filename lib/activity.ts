// UML activity nodes on top of Mermaid flowcharts. Control nodes carry an
// `:::act*` class so the source stays valid Mermaid; UML Studio redraws them
// (filled initial circle, bull's-eye final node, fork/join bars).
import type { Point } from "./canvas.ts";

export type ActivityKind = "activity" | "decision" | "merge" | "fork" | "join" | "start" | "end" | "flowEnd" | "terminal";

export const ACTIVITY_KINDS: { value: ActivityKind; label: string; className?: string; defaultLabel?: string }[] = [
  { value: "activity", label: "Acción" },
  { value: "decision", label: "Decisión" },
  { value: "merge", label: "Fusión (merge)", className: "actMerge", defaultLabel: "Fusión" },
  { value: "fork", label: "Bifurcación (fork)", className: "actFork", defaultLabel: "Fork" },
  { value: "join", label: "Unión (join)", className: "actJoin", defaultLabel: "Join" },
  { value: "start", label: "Nodo inicial", className: "actStart", defaultLabel: "Inicio" },
  { value: "end", label: "Nodo final", className: "actEnd", defaultLabel: "Fin" },
  { value: "flowEnd", label: "Fin de flujo", className: "actFlowEnd", defaultLabel: "Fin de flujo" },
  { value: "terminal", label: "Inicio / fin con texto" },
];
/** Control nodes are drawn without their text; the label stays in the source as a name. */
export const isControlNode = (kind?: string) => !!ACTIVITY_KINDS.find(k => k.value === kind)?.className;
export const activityKindForClass = (className?: string) => ACTIVITY_KINDS.find(k => k.className && k.className === className)?.value;

export function activityDeclaration(id: string, label: string, kind: string) {
  if (kind === "start" || kind === "end" || kind === "flowEnd") return `${id}(("${label}")):::${ACTIVITY_KINDS.find(k => k.value === kind)!.className}`;
  if (kind === "fork" || kind === "join") return `${id}["${label}"]:::${kind === "fork" ? "actFork" : "actJoin"}`;
  if (kind === "merge") return `${id}{"${label}"}:::actMerge`;
  if (kind === "decision") return `${id}{"${label}"}`;
  if (kind === "terminal") return `${id}(["${label}"])`;
  // UML actions are rounded rectangles.
  return `${id}("${label}")`;
}

/** Fork and join bars lie across the flow: horizontal in top-down charts, vertical in left-right ones. */
export function flowDirection(source: string): "vertical" | "horizontal" {
  const header = source.match(/^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/m)?.[1] || "TD";
  return header === "LR" || header === "RL" ? "horizontal" : "vertical";
}

/**
 * Text Mermaid lays out for a control node: nothing visible, but sized so the
 * layout reserves room for the bar or circle that replaces it.
 */
export function controlLayoutLabel(kind: string, direction: "vertical" | "horizontal") {
  if (kind === "fork" || kind === "join") return direction === "vertical" ? " ".repeat(34) : Array(6).fill(" ").join("<br/>");
  return " ";
}

type Shape = { x: number; y: number; width: number; height: number; shape?: "rect" | "diamond" | "ellipse" };
/** Whether a point lies inside the real outline of a node. */
export function insideShape(node: Shape, p: Point) {
  const dx = Math.abs(p.x - node.x) / (node.width / 2 || 1), dy = Math.abs(p.y - node.y) / (node.height / 2 || 1);
  if (node.shape === "diamond") return dx + dy <= 1;
  if (node.shape === "ellipse") return dx * dx + dy * dy <= 1;
  return dx <= 1 && dy <= 1;
}

/**
 * Moves the end of a polyline onto the node outline: Mermaid aims edges at a
 * node's bounding box, which leaves a gap before diamonds and circles.
 * `points` runs toward the node; the returned copy ends exactly on its border.
 */
export function clipToOutline(points: Point[], node: Shape): Point[] {
  if (points.length < 2 || !node.shape || node.shape === "rect") return points;
  const previous = points[points.length - 2];
  return entry(points, previous, points[points.length - 1], node) || entry(points, previous, node, node) || points;
}
function entry(points: Point[], previous: Point, toward: Point, node: Shape): Point[] | null {
  const dx = toward.x - previous.x, dy = toward.y - previous.y, length = Math.hypot(dx, dy) || 1;
  // Walk from the previous point along the final segment, past the bounding box, until entering the shape.
  const reach = length + Math.max(node.width, node.height);
  let outside = 0, inside = -1;
  for (let t = 0; t <= reach; t += 2) {
    const p = { x: previous.x + dx / length * t, y: previous.y + dy / length * t };
    if (insideShape(node, p)) { inside = t; break; }
    outside = t;
  }
  if (inside < 0) return null;
  for (let i = 0; i < 20; i++) {
    const mid = (outside + inside) / 2, p = { x: previous.x + dx / length * mid, y: previous.y + dy / length * mid };
    if (insideShape(node, p)) inside = mid; else outside = mid;
  }
  const t = (outside + inside) / 2;
  return [...points.slice(0, -1), { x: previous.x + dx / length * t, y: previous.y + dy / length * t }];
}
