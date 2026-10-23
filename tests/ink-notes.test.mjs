import assert from "node:assert/strict";
import { test } from "node:test";
import { outlinePath, simplify, straightLine, streamline, strokeOutline } from "../lib/freehand.ts";
import { newNote, wrapText } from "../lib/notes.ts";
import { readCanvas, writeCanvas } from "../lib/canvas.ts";
import { mergeSharedDiagram } from "../lib/shared-sync.ts";

const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 8) * 20 }));

test("simplification keeps the shape with far fewer points", () => {
  const dense = Array.from({ length: 200 }, (_, i) => ({ x: i, y: i % 2 ? .1 : 0 }));
  const simple = simplify(dense, .5);
  assert.ok(simple.length <= 3);
  assert.deepEqual(simple[0], dense[0]); assert.deepEqual(simple.at(-1), dense.at(-1));
  assert.ok(simplify(line, .5).length < line.length && simplify(line, .5).length > 4);
});

test("pen ink tapers at the ends while the marker keeps a constant width", () => {
  const width = (outline, i, n) => Math.hypot(outline[i].x - outline[2 * n + 6 - i].x, outline[i].y - outline[2 * n + 6 - i].y);
  const pen = strokeOutline(line, 8, "pen"), marker = strokeOutline(line, 8, "marker");
  const n = line.length - 1;
  assert.ok(width(pen, 0, n) < width(pen, 25, n), "pen starts thinner than its middle");
  assert.ok(Math.abs(width(marker, 0, n) - 8) < .01 && Math.abs(width(marker, 25, n) - 8) < .5, "marker is 8 wide");
  assert.match(outlinePath(pen), /^M [-\d.]+ [-\d.]+ Q .* Z$/);
  assert.equal(strokeOutline([{ x: 5, y: 5 }], 10).length, 12, "a tap draws a dot");
  const pressed = strokeOutline(line.map((p, i) => ({ ...p, p: i < 25 ? .1 : 1 })), 8, "pen");
  assert.ok(width(pressed, 15, n) < width(pressed, 35, n), "light pressure draws thinner");
});

test("smoothing and straight lines", () => {
  assert.deepEqual(streamline({ x: 0, y: 0 }, { x: 10, y: 0 }, .5), { x: 5, y: 0 });
  const straight = straightLine({ x: 0, y: 0 }, { x: 120, y: 0 });
  assert.ok(straight.every(p => p.y === 0)); assert.deepEqual(straight.at(-1), { x: 120, y: 0 });
});

test("text wraps by words, keeps line breaks and cuts long words", () => {
  const measure = text => text.length * 10;
  assert.deepEqual(wrapText("hola mundo cruel", 100, measure), ["hola mundo", "cruel"]);
  assert.deepEqual(wrapText("a\nb", 100, measure), ["a", "b"]);
  assert.deepEqual(wrapText("abcdefghijklmnop", 50, measure), ["abcde", "fghij", "klmno", "p"]);
});

test("notes and ink round-trip through canvas metadata and merge between editors", () => {
  const base = { id: "d", name: "D", type: "class", project: "P", theme: "studio", notes: "", revision: 1, updatedAt: "", source: writeCanvas("classDiagram\nclass A", { positions: {}, routes: {}, lineWidth: 2, arrowScale: 1.4, labelSize: 14 }) };
  const withNote = (source, id, note) => writeCanvas(source, { ...readCanvas(source), notes: { ...readCanvas(source).notes, [id]: note } });
  const local = { ...base, source: withNote(base.source, "n1", { ...newNote("sticky", 100, 100), text: "Revisar cardinalidad" }) };
  const remote = { ...base, revision: 2, source: withNote(base.source, "n2", { ...newNote("text", 0, 0), text: "Hola" }) };
  const merged = mergeSharedDiagram(base, local, remote);
  assert.deepEqual(Object.keys(readCanvas(merged.source).notes).sort(), ["n1", "n2"]);
  const ink = writeCanvas(base.source, { ...readCanvas(base.source), strokes: [{ points: [{ x: 1, y: 2, p: .4 }, { x: 3, y: 4 }], color: "#1f2937", width: 3.5, tool: "pen" }] });
  assert.equal(readCanvas(ink).strokes[0].points[0].p, .4);
  assert.equal(readCanvas(ink).strokes[0].tool, "pen");
});

test("inverting a relation keeps its multiplicities, route and color with the swapped key", async () => {
  const { invertRelation, sourceRelations } = await import("../lib/relation-actions.ts");
  const base = writeCanvas('classDiagram\nCliente "1" --> "0..*" Pedido : realiza\nCliente --> Pedido', { positions: {}, routes: { [JSON.stringify(["Cliente", "Pedido", 0])]: { shape: "orthogonal", points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], from: { side: "right", offset: .5 } } }, edgeColors: { [JSON.stringify(["Cliente", "Pedido", 1])]: "#dc2626" }, lineWidth: 2, arrowScale: 1.4, labelSize: 14 });
  const first = sourceRelations(base)[0];
  const { source, routeKey } = invertRelation(base, first);
  assert.ok(source.includes('Pedido "0..*" --> "1" Cliente : realiza'));
  assert.equal(routeKey, JSON.stringify(["Pedido", "Cliente", 0]));
  const settings = readCanvas(source);
  assert.deepEqual(settings.routes[routeKey].points, [{ x: 9, y: 9 }, { x: 1, y: 1 }]);
  assert.equal(settings.routes[routeKey].to.side, "right");
  // The other relation between the pair keeps its color under its new occurrence number.
  assert.equal(settings.edgeColors[JSON.stringify(["Cliente", "Pedido", 0])], "#dc2626");
});

test("element sizes are stored, validated and merged per element", () => {
  const base = { id: "d", name: "D", type: "class", project: "P", theme: "studio", notes: "", revision: 1, updatedAt: "", source: writeCanvas("classDiagram\nclass A\nclass B", { positions: {}, routes: {}, lineWidth: 2, arrowScale: 1.4, labelSize: 14 }) };
  const scaled = (source, scales) => writeCanvas(source, { ...readCanvas(source), nodeScales: scales });
  assert.equal(readCanvas(scaled(base.source, { A: 1.5 })).nodeScales.A, 1.5);
  const withScale = value => "classDiagram\nclass A\n%% uml-studio: " + JSON.stringify({ positions: {}, routes: {}, nodeScales: { A: value } });
  assert.equal(readCanvas(withScale(2)).nodeScales.A, 2, "a valid size is read back");
  assert.deepEqual(readCanvas(withScale(9)).positions, {}, "an out-of-range size makes the metadata fall back to defaults");
  assert.equal(readCanvas(withScale(9)).nodeScales, undefined);
  const merged = mergeSharedDiagram(base, { ...base, source: scaled(base.source, { A: 1.5 }) }, { ...base, revision: 2, source: scaled(base.source, { B: .8 }) });
  assert.deepEqual(readCanvas(merged.source).nodeScales, { A: 1.5, B: .8 });
});
