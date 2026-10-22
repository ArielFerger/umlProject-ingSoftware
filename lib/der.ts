// Entity-relationship diagrams in Chen notation, written as Mermaid flowcharts.
// Each element carries a `:::der*` class so the source stays valid Mermaid while
// UML Studio redraws the classic shapes: rectangles, diamonds and ellipses.
import type { Point } from "./canvas.ts";

export type DerKind = "entity" | "weak" | "relationship" | "identifying" | "attribute" | "key" | "partialKey" | "multivalued" | "derived";
export type DerShape = "rect" | "diamond" | "ellipse";

export const DER_KINDS: { value: DerKind; label: string; className: string; open: string; close: string; shape: DerShape }[] = [
  { value: "entity", label: "Entidad", className: "derEntity", open: "[", close: "]", shape: "rect" },
  { value: "weak", label: "Entidad débil", className: "derWeak", open: "[", close: "]", shape: "rect" },
  { value: "relationship", label: "Relación", className: "derRelation", open: "{", close: "}", shape: "diamond" },
  { value: "identifying", label: "Relación identificadora", className: "derIdentifying", open: "{", close: "}", shape: "diamond" },
  { value: "attribute", label: "Atributo", className: "derAttribute", open: "([", close: "])", shape: "ellipse" },
  { value: "key", label: "Atributo clave", className: "derKey", open: "([", close: "])", shape: "ellipse" },
  { value: "partialKey", label: "Clave parcial (entidad débil)", className: "derPartialKey", open: "([", close: "])", shape: "ellipse" },
  { value: "multivalued", label: "Atributo multivaluado", className: "derMulti", open: "([", close: "])", shape: "ellipse" },
  { value: "derived", label: "Atributo derivado", className: "derDerived", open: "([", close: "])", shape: "ellipse" },
];

export const DER_RELATIONS = [
  { value: "---", name: "Participación parcial (línea simple)" },
  { value: "===", name: "Participación total (línea doble)" },
];

const CORE = new Set<DerKind>(["entity", "weak", "relationship", "identifying"]);
export const isDerRelationship = (kind?: string) => kind === "relationship" || kind === "identifying";
export const isDerCore = (kind?: string) => CORE.has(kind as DerKind);
export const derInfo = (kind: string) => DER_KINDS.find(k => k.value === kind) || DER_KINDS[0];

/** Kind for a parsed Mermaid node: its `:::der*` class wins over the bracket shape. */
export function derKindFor(className: string | undefined, bracket: string): DerKind {
  const byClass = DER_KINDS.find(k => k.className === className);
  if (byClass) return byClass.value;
  if (bracket.startsWith("([") || bracket.startsWith("(")) return "attribute";
  if (bracket.startsWith("{")) return "relationship";
  return "entity";
}

export function derDeclaration(id: string, label: string, kind: string) {
  const info = derInfo(kind);
  return `${id}${info.open}"${label}"${info.close}:::${info.className}`;
}

const RATIO = /^\s*%%\s*der-ratio\s+([A-Za-z_][\w-]*)\s+(.+?)\s*$/;
export function derRatios(content: string) {
  const ratios = new Map<string, string>();
  for (const line of content.split("\n")) { const m = line.match(RATIO); if (m) ratios.set(m[1], m[2]); }
  return ratios;
}
export function validRatio(ratio: string) {
  if (!/^[\w:.,*()\s/-]{0,20}$/.test(ratio)) throw new Error("La cardinalidad de la relación admite valores como 1:N, N:M o 1:1.");
  return ratio.trim();
}
/** Replace the ratio comment of a relationship, keeping it next to its declaration. */
export function setDerRatio(content: string, id: string, ratio: string) {
  const lines = content.split("\n").filter(line => line.match(RATIO)?.[1] !== id);
  const value = validRatio(ratio);
  if (!value) return lines.join("\n");
  const at = lines.findIndex(line => new RegExp(`^\\s*${id}\\s*\\{`).test(line));
  lines.splice(at < 0 ? lines.length : at + 1, 0, `%% der-ratio ${id} ${value}`);
  return lines.join("\n");
}
export function removeDerRatio(content: string, id: string) {
  return content.split("\n").filter(line => line.match(RATIO)?.[1] !== id).join("\n");
}

/** A readable identifier from a visible name: "Núm Serie" → "Num_Serie". */
export function derIdFromLabel(label: string, taken: string[], owner = "") {
  const ascii = label.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let base = (owner && ascii ? owner + "_" : "") + (ascii || "Elemento");
  if (!/^[A-Za-z_]/.test(base)) base = "E_" + base;
  let id = base, count = 2;
  while (taken.includes(id)) id = `${base}${count++}`;
  return id;
}

type LayoutNode = Point & { name: string; width: number; height: number };

/** Distance from the center to the border of a shape along a direction. */
export function shapeExtent(node: { width: number; height: number; shape?: DerShape }, angle: number) {
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle)), w = node.width / 2, h = node.height / 2;
  if (node.shape === "ellipse") return (w * h) / Math.sqrt((h * c) ** 2 + (w * s) ** 2 || 1);
  if (node.shape === "diamond") return 1 / (c / (w || 1) + s / (h || 1));
  return Math.min(c > 1e-6 ? w / c : Infinity, s > 1e-6 ? h / s : Infinity);
}

/** Point where the segment from a node's center toward `toward` leaves its shape. */
export function shapeBoundary(node: LayoutNode & { shape?: DerShape }, toward: Point): Point {
  const angle = Math.atan2(toward.y - node.y, toward.x - node.x), r = shapeExtent(node, angle);
  return { x: node.x + Math.cos(angle) * r, y: node.y + Math.sin(angle) * r };
}

const angleGap = (a: number, b: number) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
const overlaps = (a: LayoutNode, b: LayoutNode, pad: number) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad;

/**
 * Places attributes around their entity or relationship, away from the lines
 * that join it to the rest of the model. Entities and relationships keep the
 * Mermaid layout. Nodes in `fixed` (placed by the user) stay where they are and
 * act as obstacles. Returns positions only for the attributes it moved.
 */
export function chenLayout(nodes: (LayoutNode & { shape?: DerShape })[], kinds: Record<string, string>, edges: { start?: string; end?: string }[], fixed: Iterable<string> = []): Record<string, Point> {
  const byName = new Map(nodes.map(n => [n.name, { ...n }]));
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.start || !edge.end || edge.start === edge.end || !byName.has(edge.start) || !byName.has(edge.end)) continue;
    neighbors.set(edge.start, [...(neighbors.get(edge.start) || []), edge.end]);
    neighbors.set(edge.end, [...(neighbors.get(edge.end) || []), edge.start]);
  }
  const pinned = new Set(fixed);
  const placed = new Set(nodes.filter(n => isDerCore(kinds[n.name]) || pinned.has(n.name)).map(n => n.name));
  const result: Record<string, Point> = {};
  const queue = [...placed];
  const candidates = Array.from({ length: 24 }, (_, i) => -Math.PI / 2 + i * Math.PI / 12);
  while (queue.length) {
    const ownerName = queue.shift()!, owner = byName.get(ownerName)!;
    const children = (neighbors.get(ownerName) || []).filter(name => !placed.has(name) && !isDerCore(kinds[name]));
    if (!children.length) continue;
    const occupied = (neighbors.get(ownerName) || []).filter(name => placed.has(name)).map(name => { const n = byName.get(name)!; return Math.atan2(n.y - owner.y, n.x - owner.x); });
    for (const childName of children) {
      const child = byName.get(childName)!;
      const ranked = candidates
        .map(angle => ({ angle, score: Math.min(Math.PI, ...occupied.map(o => angleGap(angle, o))) + Math.abs(Math.sin(angle)) * .05 }))
        .sort((a, b) => b.score - a.score);
      let chosen: (Point & { angle: number }) | null = null;
      for (let ring = 0; ring < 4 && !chosen; ring++) {
        for (const { angle } of ranked.slice(0, 12)) {
          const distance = shapeExtent(owner, angle) + shapeExtent(child, angle) + 34 + ring * 36;
          const spot = { ...child, x: owner.x + Math.cos(angle) * distance, y: owner.y + Math.sin(angle) * distance };
          if ([...placed].every(name => name === ownerName || !overlaps(spot, byName.get(name)!, 10))) { chosen = { x: spot.x, y: spot.y, angle }; break; }
        }
      }
      if (!chosen) { const angle = ranked[0].angle, distance = shapeExtent(owner, angle) + shapeExtent(child, angle) + 34; chosen = { x: owner.x + Math.cos(angle) * distance, y: owner.y + Math.sin(angle) * distance, angle }; }
      child.x = Math.round(chosen.x * 10) / 10; child.y = Math.round(chosen.y * 10) / 10;
      occupied.push(chosen.angle); placed.add(childName); queue.push(childName);
      result[childName] = { x: child.x, y: child.y };
    }
  }
  return result;
}
