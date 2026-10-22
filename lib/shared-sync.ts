import { SOURCE_LIMIT, type Diagram } from "./diagrams.ts";
import { canvasSettings, cleanSource, readCanvas, writeCanvas } from "./canvas.ts";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const CONFLICT = Symbol("conflict");
function value<T>(base: T, local: T, remote: T): T | typeof CONFLICT {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  return CONFLICT;
}
function record<T>(base: Record<string,T>, local: Record<string,T>, remote: Record<string,T>) {
  const merged: Record<string,T> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const next = value(base[key], local[key], remote[key]);
    if (next === CONFLICT) return null;
    if (next !== undefined) merged[key] = next;
  }
  return merged;
}
function change(base: string, next: string) {
  let start = 0, tail = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start++;
  while (tail < base.length - start && tail < next.length - start && base[base.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  return { from: start, to: base.length - tail, text: next.slice(start, next.length - tail) };
}
export function mergeText(base: string, local: string, remote: string): string | null {
  const simple = value(base, local, remote);
  if (simple !== CONFLICT) return simple;
  const a = change(base, local), b = change(base, remote);
  // Same-position inserts and overlapping edits need a human decision.
  if (!(a.to <= b.from || b.to <= a.from) || a.from === b.from) return null;
  const [first, second] = [a,b].sort((x,y) => x.from - y.from);
  return base.slice(0, first.from) + first.text + base.slice(first.to, second.from) + second.text + base.slice(second.to);
}
function validMetadata(source: string) {
  const lines = source.split(/\r?\n/).filter(l => l.trimStart().startsWith("%% uml-studio: "));
  if (!lines.length) return true;
  if (lines.length !== 1) return false;
  try { return canvasSettings.safeParse(JSON.parse(lines[0].trimStart().slice(15))).success; } catch { return false; }
}
export function mergeSharedDiagram(base: Diagram, local: Diagram, remote: Diagram): Diagram | null {
  if (base.id !== local.id || base.id !== remote.id || remote.access === "view") return null;
  const result = { ...remote };
  for (const key of ["name", "type", "project", "theme", "notes"] as const) {
    const next = value(base[key], local[key], remote[key]);
    if (next === CONFLICT) return null;
    Object.assign(result, { [key]: next });
  }
  const simple = value(base.source, local.source, remote.source);
  if (simple !== CONFLICT) return { ...result, source: simple };
  if (![base.source,local.source,remote.source].every(validMetadata)) return null;
  const source = mergeText(cleanSource(base.source), cleanSource(local.source), cleanSource(remote.source));
  if (source === null) return null;
  const b = readCanvas(base.source), l = readCanvas(local.source), r = readCanvas(remote.source);
  const positions = record(b.positions, l.positions, r.positions), routes = record(b.routes, l.routes, r.routes);
  if (!positions || !routes) return null;
  const merged = { ...r, positions, routes };
  for (const key of ["nodeColors", "edgeColors"] as const) {
    const colors = record(b[key] || {}, l[key] || {}, r[key] || {});
    if (!colors) return null;
    merged[key] = colors;
  }
  const frames = record(b.frames || {}, l.frames || {}, r.frames || {});
  const frameLinks = record(b.frameLinks || {}, l.frameLinks || {}, r.frameLinks || {});
  if (!frames || !frameLinks) return null;
  merged.frames = frames; merged.frameLinks = frameLinks;
  const notes = record(b.notes || {}, l.notes || {}, r.notes || {});
  if (!notes) return null;
  merged.notes = notes;
  for (const link of Object.values(frameLinks)) {
    if ([link.from, link.to].some(end => end.kind === "frame" && !Object.hasOwn(frames, end.id))) return null;
  }
  for (const key of ["lineWidth", "arrowScale", "labelSize"] as const) {
    const next = value(b[key], l[key], r[key]);
    if (next === CONFLICT) return null;
    merged[key] = next;
  }
  const strokes = value(b.strokes, l.strokes, r.strokes);
  if (strokes === CONFLICT) {
    const original = b.strokes || [], localStrokes = l.strokes || [], remoteStrokes = r.strokes || [];
    if (!same(original, localStrokes.slice(0, original.length)) || !same(original, remoteStrokes.slice(0, original.length))) return null;
    const added = localStrokes.slice(original.length).filter(stroke => !remoteStrokes.some(other => same(other, stroke)));
    if (remoteStrokes.length + added.length > 300) return null;
    merged.strokes = [...remoteStrokes, ...added];
  } else merged.strokes = strokes;
  const combined = writeCanvas(source, merged);
  return combined.length <= SOURCE_LIMIT ? { ...result, source: combined } : null;
}
