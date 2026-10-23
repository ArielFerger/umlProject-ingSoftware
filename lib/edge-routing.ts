import type { Point, EdgeAnchor, EdgeRoute } from "./canvas.ts";

export type RectNode = Point & { name: string; width: number; height: number };
export const DEFAULT_ROUTE: EdgeRoute = { shape: "curved", points: [] };
const normals = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const plus = (p: Point, n: Point, length: number) => ({ x: p.x + n.x * length, y: p.y + n.y * length });
const unit = (a: Point, b: Point) => { const length = distance(a, b) || 1; return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }; };

export function anchorPoint(node: RectNode, anchor: EdgeAnchor): Point {
  const vertical = anchor.side === "left" || anchor.side === "right";
  return vertical ? { x: node.x + normals[anchor.side].x * node.width / 2, y: node.y + (anchor.offset - .5) * node.height }
    : { x: node.x + (anchor.offset - .5) * node.width, y: node.y + normals[anchor.side].y * node.height / 2 };
}
// Project onto the nearest side, retaining any position along that side.
export function nearestAnchor(node: RectNode, cursor: Point): EdgeAnchor {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const candidates: EdgeAnchor[] = [
    { side: "top", offset: clamp((cursor.x - node.x) / node.width + .5) },
    { side: "right", offset: clamp((cursor.y - node.y) / node.height + .5) },
    { side: "bottom", offset: clamp((cursor.x - node.x) / node.width + .5) },
    { side: "left", offset: clamp((cursor.y - node.y) / node.height + .5) },
  ];
  return candidates.reduce((best, candidate) => distance(anchorPoint(node, candidate), cursor) < distance(anchorPoint(node, best), cursor) ? candidate : best);
}
function automaticAnchor(node: RectNode, toward: Point): EdgeAnchor {
  const dx = toward.x - node.x, dy = toward.y - node.y;
  const t = Math.min(node.width / 2 / (Math.abs(dx) || .001), node.height / 2 / (Math.abs(dy) || .001));
  return nearestAnchor(node, { x: node.x + dx * t, y: node.y + dy * t });
}
export function outsidePoint(point: Point, nodes: RectNode[]): Point {
  let result = { ...point };
  for (let pass = 0; pass < 8; pass++) {
    const inside = nodes.find(n => Math.abs(result.x - n.x) < n.width / 2 && Math.abs(result.y - n.y) < n.height / 2);
    if (!inside) break;
    const anchor = nearestAnchor(inside, result);
    result = plus(anchorPoint(inside, anchor), normals[anchor.side], 24);
  }
  return result;
}
export function segmentClear(p: Point, q: Point, nodes: RectNode[]): boolean {
  return !nodes.some(node => {
    let lo = 0, hi = 1;
    for (const axis of ["x", "y"] as const) {
      const half = (axis === "x" ? node.width : node.height) / 2;
      const min = node[axis] - half + .01, max = node[axis] + half - .01, delta = q[axis] - p[axis];
      if (Math.abs(delta) < .00001) { if (p[axis] <= min || p[axis] >= max) return false; }
      else { const a = (min - p[axis]) / delta, b = (max - p[axis]) / delta; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    }
    return lo <= hi;
  });
}
// A small visibility grid finds an exterior path around the two endpoint boxes.
// User waypoints stay mandatory; only clearance corners are added automatically.
function exteriorPath(p: Point, q: Point, nodes: RectNode[], square: boolean, startNormal?: Point, endNormal?: Point): Point[] {
  const departure = !startNormal || (q.x - p.x) * startNormal.x + (q.y - p.y) * startNormal.y >= 0;
  const arrival = !endNormal || (q.x - p.x) * endNormal.x + (q.y - p.y) * endNormal.y <= 0;
  if (departure && arrival && segmentClear(p, q, nodes) && (!square || p.x === q.x || p.y === q.y)) return [p, q];
  const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const xs = unique([p.x, q.x, ...nodes.flatMap(n => [n.x - n.width / 2 - 24, n.x + n.width / 2 + 24])]);
  const ys = unique([p.y, q.y, ...nodes.flatMap(n => [n.y - n.height / 2 - 24, n.y + n.height / 2 + 24])]);
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const start = points.findIndex(v => v.x === p.x && v.y === p.y), goal = points.findIndex(v => v.x === q.x && v.y === q.y);
  const scores = points.map(() => Infinity), previous = points.map(() => -1), open = new Set([start]);
  scores[start] = 0;
  while (open.size) {
    const current = [...open].reduce((best, index) => scores[index] + Math.abs(points[index].x - q.x) + Math.abs(points[index].y - q.y) < scores[best] + Math.abs(points[best].x - q.x) + Math.abs(points[best].y - q.y) ? index : best);
    if (current === goal) {
      const path: Point[] = []; let i = goal;
      while (i !== -1) { path.unshift(points[i]); i = previous[i]; }
      return path;
    }
    open.delete(current);
    const column = current % xs.length, row = Math.floor(current / xs.length);
    const adjacent = [column > 0 ? current - 1 : -1, column < xs.length - 1 ? current + 1 : -1, row > 0 ? current - xs.length : -1, row < ys.length - 1 ? current + xs.length : -1];
    for (const next of adjacent) {
      if (next < 0 || !segmentClear(points[current], points[next], nodes)) continue;
      if (current === start && startNormal && (points[next].x - p.x) * startNormal.x + (points[next].y - p.y) * startNormal.y < 0) continue;
      if (next === goal && endNormal && (q.x - points[current].x) * endNormal.x + (q.y - points[current].y) * endNormal.y > 0) continue;
      const score = scores[current] + distance(points[current], points[next]);
      if (score < scores[next]) { scores[next] = score; previous[next] = current; open.add(next); }
    }
  }
  // Overlapping boxes can make an attachment inaccessible; retain finite geometry.
  return [p, q];
}
function smoothPath(points: Point[], nodes: RectNode[]) {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], before = points[i - 1], after = points[i + 1];
    const clearance = Math.min(...nodes.map(n => Math.hypot(Math.max(0, Math.abs(p.x - n.x) - n.width / 2), Math.max(0, Math.abs(p.y - n.y) - n.height / 2))));
    const radius = Math.min(24, distance(before, p) / 3, distance(p, after) / 3, clearance * .8);
    const incoming = plus(p, unit(p, before), radius), outgoing = plus(p, unit(p, after), radius);
    path += ` L ${incoming.x} ${incoming.y} Q ${p.x} ${p.y}, ${outgoing.x} ${outgoing.y}`;
  }
  const last = points.at(-1)!; return path + ` L ${last.x} ${last.y}`;
}
export function routeEdge(a: RectNode, b: RectNode, route: EdgeRoute, startGap = 0, endGap = 0, parallel = 0) {
  const nodes = a.name === b.name ? [a] : [a, b], self = a.name === b.name;
  const from = route.from || (self ? { side: "right" as const, offset: .25 } : automaticAnchor(a, route.points[0] || b));
  const to = route.to || (self ? { side: "right" as const, offset: .75 } : automaticAnchor(b, route.points.at(-1) || a));
  const origin = anchorPoint(a, from), destination = anchorPoint(b, to), sn = normals[from.side], en = normals[to.side];
  const start = plus(origin, sn, startGap), end = plus(destination, en, endGap);
  const reach = Math.max(36, Math.min(60, distance(origin, destination) / 3));
  const s = plus(origin, sn, Math.max(startGap + 16, reach)), e = plus(destination, en, Math.max(endGap + 16, reach));
  const bends = route.points.map(p => outsidePoint(p, nodes));
  const automatic = self && !bends.length ? [{ x: a.x + a.width / 2 + 100 + parallel, y: a.y - 65 }, { x: a.x + a.width / 2 + 100 + parallel, y: a.y + 65 }]
    : parallel && !bends.length ? [outsidePoint({ x: (s.x + e.x) / 2 + parallel, y: (s.y + e.y) / 2 + parallel }, nodes)] : [];
  const stops = [s, ...bends, ...automatic, e], knots: Point[] = [start, s];
  for (let i = 1; i < stops.length; i++) knots.push(...exteriorPath(stops[i - 1], stops[i], nodes, route.shape === "orthogonal", i === 1 ? sn : undefined, i === stops.length - 1 ? en : undefined).slice(1));
  knots.push(end);
  const compact = knots.filter((p, i) => !i || distance(p, knots[i - 1]) > .001);
  const path = route.shape === "curved" ? smoothPath(compact, nodes) : compact.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  return { path, start, end, origin, destination, from, to, knots: compact, points: bends, label: compact[Math.floor(compact.length / 2)], startToward: plus(start, sn, 30), endToward: plus(end, en, 30) };
}

export function relationRouteKey(from: string, to: string, occurrence: number) { return JSON.stringify([from, to, occurrence]); }
/** Route keys in source order: the nth relation between the same pair gets occurrence n. */
export function routeKeys(relations: { from: string; to: string }[]) {
  const counts = new Map<string, number>();
  return relations.map(r => { const pair = JSON.stringify([r.from, r.to]); const n = counts.get(pair) || 0; counts.set(pair, n + 1); return relationRouteKey(r.from, r.to, n); });
}
/** The same drawn path, walked from the other end. */
export function reverseRoute(route: EdgeRoute): EdgeRoute { return { ...route, from: route.to, to: route.from, points: [...route.points].reverse() }; }

export function polylineMidpoint(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  if (total <= 0.001) return points[Math.floor(points.length / 2)];
  const half = total / 2;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = distance(a, b);
    if (acc + seg >= half && seg > 0) {
      const t = (half - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return points[Math.floor(points.length / 2)];
}

