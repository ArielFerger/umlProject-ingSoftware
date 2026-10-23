import { cleanSource, readCanvas, writeCanvas, RELATIONS } from "./canvas.ts";
import { relationRouteKey, reverseRoute, routeKeys } from "./edge-routing.ts";
import type { CanvasSettings } from "./canvas.ts";

/**
 * Moves route and color settings to the keys relations have after an edit, by
 * source order. The relation at `flipped` now runs the other way, so its route
 * is reversed too.
 */
export function remapRelationSettings(settings: CanvasSettings, before: { from: string; to: string }[], after: { from: string; to: string }[], flipped = -1): CanvasSettings {
  const oldKeys = routeKeys(before), newKeys = routeKeys(after);
  const routes: CanvasSettings["routes"] = {}, edgeColors: Record<string, string> = {};
  oldKeys.forEach((key, i) => {
    if (!newKeys[i]) return;
    const route = settings.routes[key], color = settings.edgeColors?.[key];
    if (route) routes[newKeys[i]] = i === flipped ? reverseRoute(route) : route;
    if (color) edgeColors[newKeys[i]] = color;
  });
  return { ...settings, routes, edgeColors };
}

export type SourceRelation = { line: number; raw: string; from: string; to: string; kind: string; fromCard: string; toCard: string; label: string; indent: string; comment: string };
const relationLine = /^([ \t]*)([A-Za-z_][\w-]*)(?:[ \t]+"([^"\r\n]*)")?[ \t]+([<>|o*().-]+)[ \t]+(?:"([^"\r\n]*)"[ \t]+)?([A-Za-z_][\w-]*)(?:[ \t]*:[ \t]*(.*?))?([ \t]*(?:%%.*)?)$/;
export function sourceRelations(source: string): SourceRelation[] {
  const found: SourceRelation[] = [];
  let inClass = false;
  cleanSource(source).split(/\r?\n/).forEach((raw, line) => {
    if (inClass) { if (raw.includes("}")) inClass = false; return; }
    if (/^\s*class\s+.*\{/.test(raw)) { inClass = !raw.includes("}"); return; }
    const match = relationLine.exec(raw);
    if (!match || !/--|\.\./.test(match[4])) return;
    found.push({ line, raw, indent: match[1], from: match[2], fromCard: match[3] || "", kind: match[4], toCard: match[5] || "", to: match[6], label: (match[7] || "").trim(), comment: match[8] || "" });
  });
  return found;
}
function currentLines(source: string, relation: SourceRelation) {
  const lines = cleanSource(source).split(/\r?\n/);
  if (lines[relation.line] !== relation.raw) throw new Error("La relación cambió. Volvé a seleccionarla antes de editar.");
  return lines;
}
export function updateRelation(source: string, relation: SourceRelation, patch: { kind: string; label: string; fromCard: string; toCard: string }) {
  if (patch.kind !== relation.kind && !RELATIONS.some(r => r.value === patch.kind)) throw new Error("Elegí un tipo de relación válido.");
  if (/[\r\n"{};]/.test(patch.fromCard + patch.toCard) || /[\r\n{};]/.test(patch.label) || patch.label.includes("%%")) throw new Error("Usá una etiqueta y multiplicidades de una sola línea, sin comillas ni instrucciones Mermaid.");
  const lines = currentLines(source, relation);
  const from = patch.fromCard.trim(), to = patch.toCard.trim(), label = patch.label.trim();
  lines[relation.line] = `${relation.indent}${relation.from}${from ? ` "${from}"` : ""} ${patch.kind} ${to ? `"${to}" ` : ""}${relation.to}${label ? ` : ${label}` : ""}${relation.comment}`;
  return writeCanvas(lines.join("\n"), readCanvas(source));
}
/** Swaps both ends of a class relation; each multiplicity stays with its class. */
export function invertRelation(source: string, relation: SourceRelation) {
  const lines = currentLines(source, relation), before = sourceRelations(source);
  const index = before.findIndex(item => item.line === relation.line);
  const { indent, from, to, fromCard, toCard, kind, label, comment } = relation;
  lines[relation.line] = `${indent}${to}${toCard ? ` "${toCard}"` : ""} ${kind} ${fromCard ? `"${fromCard}" ` : ""}${from}${label ? ` : ${label}` : ""}${comment}`;
  const content = lines.join("\n"), after = sourceRelations(content);
  return { source: writeCanvas(content, remapRelationSettings(readCanvas(source), before, after, index)), routeKey: routeKeys(after)[index] };
}
export function removeRelation(source: string, relation: SourceRelation) {
  const lines = currentLines(source, relation);
  const settings = readCanvas(source), counts = new Map<string, number>();
  const routes: typeof settings.routes = {};
  const edgeColors: Record<string, string> = {};
  const nextCounts = new Map<string, number>();
  for (const item of sourceRelations(source)) {
    const pair = JSON.stringify([item.from, item.to]);
    const previous = counts.get(pair) || 0; counts.set(pair, previous + 1);
    if (item.line === relation.line) continue;
    const next = nextCounts.get(pair) || 0; nextCounts.set(pair, next + 1);
    const route = settings.routes[relationRouteKey(item.from, item.to, previous)];
    if (route) routes[relationRouteKey(item.from, item.to, next)] = route;
    const color = settings.edgeColors?.[relationRouteKey(item.from, item.to, previous)];
    if (color) edgeColors[relationRouteKey(item.from, item.to, next)] = color;
  }
  lines.splice(relation.line, 1);
  return writeCanvas(lines.join("\n"), { ...settings, routes, edgeColors });
}
