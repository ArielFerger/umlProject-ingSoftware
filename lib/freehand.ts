// Ink geometry for the board pencil: input smoothing, point simplification and
// a filled outline whose width follows pen pressure (or drawing speed) with
// tapered ends, so strokes look hand-drawn instead of a constant-width line.
import type { Point } from "./canvas.ts";

export type InkPoint = Point & { p?: number };
export type InkTool = "pen" | "marker";

const round = (n: number) => Math.round(n * 10) / 10;

/** Moves the new point part of the way toward the pointer to absorb hand jitter. */
export function streamline(previous: InkPoint, next: InkPoint, amount = .45): InkPoint {
  return { ...next, x: round(previous.x + (next.x - previous.x) * (1 - amount)), y: round(previous.y + (next.y - previous.y) * (1 - amount)) };
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Ramer–Douglas–Peucker: drops points that do not change the shape by more than `tolerance`. */
export function simplify(points: InkPoint[], tolerance: number): InkPoint[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let index = -1, max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const distance = segmentDistance(points[i], points[first], points[last]);
      // Pressure changes matter as much as position for variable-width ink.
      const pressure = points[i].p !== undefined && points[first].p !== undefined ? Math.abs(points[i].p! - (points[first].p! + points[last].p!) / 2) * tolerance * 6 : 0;
      if (distance + pressure > max) { max = distance + pressure; index = i; }
    }
    if (index > 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Pressure from the pen, or simulated from speed: fast strokes get thinner. */
function pressures(points: InkPoint[], size: number) {
  let simulated = .7;
  return points.map((point, i) => {
    if (point.p !== undefined) return point.p;
    const distance = i ? Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) : 0;
    simulated += (Math.max(.25, Math.min(1, 1 - distance / (size * 3.5))) - simulated) * .35;
    return simulated;
  });
}

/** Outline polygon of a stroke. A marker has constant width and no taper. */
export function strokeOutline(points: InkPoint[], size: number, tool: InkTool = "pen"): Point[] {
  const radius = size / 2;
  if (!points.length) return [];
  if (points.length === 1 || points.every(p => Math.hypot(p.x - points[0].x, p.y - points[0].y) < .5)) {
    const c = points[0];
    return Array.from({ length: 12 }, (_, i) => ({ x: c.x + Math.cos(i / 6 * Math.PI) * radius, y: c.y + Math.sin(i / 6 * Math.PI) * radius }));
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths.at(-1)!, taper = Math.min(total / 2, size * 2.6), pressure = pressures(points, size);
  const left: Point[] = [], right: Point[] = [];
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    let dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
    let r = radius;
    if (tool === "pen") {
      r *= 1 - .55 * (1 - pressure[i]);
      const ease = (t: number) => 1 - (1 - Math.min(1, t)) ** 2;
      if (taper > 0) r *= Math.max(.18, Math.min(ease(lengths[i] / taper), ease((total - lengths[i]) / taper)));
    }
    left.push({ x: point.x - dy * r, y: point.y + dx * r });
    right.push({ x: point.x + dy * r, y: point.y - dx * r });
  });
  // Round caps at both ends keep the ink closed and soft.
  const cap = (center: Point, from: Point, steps = 6) => {
    const start = Math.atan2(from.y - center.y, from.x - center.x), r = Math.hypot(from.x - center.x, from.y - center.y);
    return Array.from({ length: steps - 1 }, (_, i) => ({ x: center.x + Math.cos(start + (i + 1) / steps * Math.PI) * r, y: center.y + Math.sin(start + (i + 1) / steps * Math.PI) * r }));
  };
  return [...left, ...cap(points.at(-1)!, left.at(-1)!), ...right.reverse(), ...cap(points[0], right.at(-1)!)];
}

/** Closed SVG path through the outline midpoints, smoothed with quadratic curves. */
export function outlinePath(outline: Point[]): string {
  if (outline.length < 3) return "";
  const mid = (a: Point, b: Point) => `${round((a.x + b.x) / 2)} ${round((a.y + b.y) / 2)}`;
  let d = `M ${mid(outline.at(-1)!, outline[0])}`;
  for (let i = 0; i < outline.length; i++) d += ` Q ${round(outline[i].x)} ${round(outline[i].y)} ${mid(outline[i], outline[(i + 1) % outline.length])}`;
  return d + " Z";
}

/** Points of a straight line, used while Shift is held. */
export function straightLine(start: InkPoint, end: InkPoint): InkPoint[] {
  const steps = Math.max(2, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 12));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: round(start.x + (end.x - start.x) * i / steps), y: round(start.y + (end.y - start.y) * i / steps), ...(start.p !== undefined ? { p: start.p } : {}) }));
}
