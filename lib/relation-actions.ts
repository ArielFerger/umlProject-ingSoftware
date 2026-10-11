import { cleanSource, readCanvas, writeCanvas, RELATIONS } from "./canvas.ts";

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
export function removeRelation(source: string, relation: SourceRelation) {
  const lines = currentLines(source, relation);
  lines.splice(relation.line, 1);
  return writeCanvas(lines.join("\n"), readCanvas(source));
}
