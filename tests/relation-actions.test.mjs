import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceRelations, updateRelation, removeRelation } from "../lib/relation-actions.ts";
import { readCanvas, writeCanvas } from "../lib/canvas.ts";

const settings = { routes: {}, positions: { Cliente: { x: 80, y: 120 } }, lineWidth: 3, arrowScale: 1.8, labelSize: 16 };
const source = writeCanvas('classDiagram\nclass Cliente {\n  +String nombre\n}\nclass Pedido\nCliente "1" --> "0..*" Pedido : realiza %% referencia del curso\nCliente ..> Pedido : consulta\n%% Cliente -- Pedido : comentario\n', settings);
test("edits only the selected parallel relationship and preserves metadata and comments", () => {
  const relationships = sourceRelations(source);
  assert.equal(relationships.length, 2);
  const updated = updateRelation(source, relationships[0], { kind: "o--", label: "agrupa", fromCard: "1", toCard: "*" });
  assert.match(updated, /Cliente "1" o-- "\*" Pedido : agrupa %% referencia del curso/);
  assert.match(updated, /Cliente \.\.> Pedido : consulta/);
  assert.match(updated, /\+String nombre/);
  assert.deepEqual(readCanvas(updated), settings);
});
test("removing a selected relationship keeps its classes and other connections", () => {
  const updated = removeRelation(source, sourceRelations(source)[1]);
  assert.equal(sourceRelations(updated).length, 1);
  assert.match(updated, /class Pedido/);
  assert.match(updated, /realiza %% referencia/);
  assert.deepEqual(readCanvas(updated), settings);
});
test("stale selection and Mermaid injection cannot overwrite another statement", () => {
  const relation = sourceRelations(source)[0];
  assert.throws(() => removeRelation(source.replace("realiza", "compra"), relation), /cambió/);
  assert.throws(() => updateRelation(source, relation, { ...relation, label: "compra\nPedido -- Cliente" }), /una sola línea/);
  assert.throws(() => updateRelation(source, relation, { ...relation, fromCard: '1" --> X' }), /comillas/);
});
test("recognizes reversed and same-class connections without parsing class members as edges", () => {
  const records = sourceRelations('classDiagram\nclass A {\n  A -- B\n}\nA <|-- B\nA --> A : repite');
  assert.deepEqual(records.map(r => [r.from, r.kind, r.to]), [["A", "<|--", "B"], ["A", "-->", "A"]]);
});
