import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "../lib/diagrams.ts";
import { readCanvas } from "../lib/canvas.ts";
import { chenLayout, derIdFromLabel, shapeBoundary, shapeExtent } from "../lib/der.ts";
import { visualNodes, visualRelations, setVisualNode, addVisualRelation, removeVisualNode, updateVisualRelation } from "../lib/visual-diagrams.ts";

const template = TEMPLATES.find(t => t.type === "der").source;

test("Chen template reads entities, relationships, keys and cardinalities", () => {
  const nodes = Object.fromEntries(visualNodes(template, "der").map(n => [n.id, n]));
  assert.equal(nodes.Cliente.kind, "entity");
  assert.equal(nodes.Realiza.kind, "relationship");
  assert.equal(nodes.Realiza.body, "1:N");
  assert.equal(nodes.SeCompone.label, "Se compone");
  assert.equal(nodes.Articulo_NumSerie.kind, "key");
  assert.equal(nodes.Articulo_NumSerie.label, "Núm Serie");
  assert.equal(nodes.SeCompone_Cantidad.kind, "attribute");
  const relations = visualRelations(template, "der");
  assert.deepEqual(relations.find(r => r.from === "Cliente" && r.to === "Realiza"), { line: relations.find(r => r.from === "Cliente" && r.to === "Realiza").line, from: "Cliente", to: "Realiza", kind: "---", label: "1" });
  assert.equal(relations.filter(r => !r.label).length, 4);
  assert.ok(readCanvas(template).positions.Articulo);
});

test("Chen elements keep their kind, ratio and canvas metadata when edited", () => {
  let source = setVisualNode(template, "der", { id: "Pago", label: "Pago", kind: "weak", body: "" }, true);
  source = setVisualNode(source, "der", { id: "Genera", label: "Genera", kind: "identifying", body: "1:N" }, true);
  source = addVisualRelation(source, "der", "Pedido", "Genera", "---", "1");
  source = addVisualRelation(source, "der", "Genera", "Pago", "===", "N");
  const nodes = Object.fromEntries(visualNodes(source, "der").map(n => [n.id, n]));
  assert.equal(nodes.Pago.kind, "weak");
  assert.equal(nodes.Genera.kind, "identifying");
  assert.equal(nodes.Genera.body, "1:N");
  assert.ok(source.includes('Genera ===|"N"| Pago'));
  assert.ok(readCanvas(source).positions.Cliente, "positions survive edits");

  source = setVisualNode(source, "der", { ...nodes.Genera, body: "1:1" });
  assert.equal(visualNodes(source, "der").find(n => n.id === "Genera").body, "1:1");
  assert.equal(source.match(/der-ratio Genera/g).length, 1);

  const edge = visualRelations(source, "der").find(r => r.from === "Genera" && r.to === "Pago");
  source = updateVisualRelation(source, "der", edge, { ...edge, kind: "---", label: "(1,N)" });
  assert.ok(source.includes('Genera ---|"(1,N)"| Pago'));
});

test("removing a Chen element drops its lines, including labelled ones, and its ratio", () => {
  const source = removeVisualNode(template, "der", "Realiza");
  assert.ok(!/\bRealiza\b/.test(source.replace(/%% uml-studio: .*/, "")));
  assert.ok(source.includes("Cliente --- Cliente_DNI"));
  assert.equal(readCanvas(source).positions.Realiza, undefined);
});

test("identifiers come from visible names", () => {
  assert.equal(derIdFromLabel("Núm Serie", []), "Num_Serie");
  assert.equal(derIdFromLabel("DNI", ["Cliente_DNI"], "Cliente"), "Cliente_DNI2");
  assert.equal(derIdFromLabel("1er pago", []), "E_1er_pago");
});

test("lines stop at the outline of diamonds and ellipses", () => {
  const diamond = { name: "R", x: 0, y: 0, width: 120, height: 60, shape: "diamond" };
  assert.ok(Math.abs(shapeExtent(diamond, 0) - 60) < 1e-6);
  assert.ok(Math.abs(shapeExtent(diamond, Math.PI / 2) - 30) < 1e-6);
  const edge = shapeBoundary({ name: "A", x: 0, y: 0, width: 100, height: 40, shape: "ellipse" }, { x: 0, y: 500 });
  assert.ok(Math.abs(edge.y - 20) < 1e-6 && Math.abs(edge.x) < 1e-6);
});

test("attributes are placed around their owner without overlapping the model", () => {
  const nodes = [
    { name: "Cliente", x: 0, y: 0, width: 110, height: 46, shape: "rect" },
    { name: "Realiza", x: 300, y: 0, width: 124, height: 70, shape: "diamond" },
    ...["DNI", "Nombre", "Email", "Telefono"].map((name, i) => ({ name, x: 150, y: i * 50, width: 90, height: 44, shape: "ellipse" })),
  ];
  const kinds = { Cliente: "entity", Realiza: "relationship", DNI: "key", Nombre: "attribute", Email: "attribute", Telefono: "multivalued" };
  const edges = [{ start: "Cliente", end: "Realiza" }, ...["DNI", "Nombre", "Email", "Telefono"].map(end => ({ start: "Cliente", end }))];
  const placed = chenLayout(nodes, kinds, edges);
  assert.deepEqual(Object.keys(placed).sort(), ["DNI", "Email", "Nombre", "Telefono"]);
  const boxes = nodes.map(n => ({ ...n, ...placed[n.name] }));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2, `${a.name} overlaps ${b.name}`);
  }
  // Nothing sits on the line toward the relationship (to the right of Cliente).
  for (const name of Object.keys(placed)) assert.ok(!(placed[name].x > 60 && Math.abs(placed[name].y) < 30), name);
});

test("attributes orbit the owner's current position and leave user-placed nodes alone", () => {
  const nodes = [
    { name: "Articulo", x: 500, y: 400, width: 110, height: 46, shape: "rect" },
    { name: "NumSerie", x: 380, y: 480, width: 100, height: 44, shape: "ellipse" },
    { name: "Codigo", x: 0, y: 0, width: 90, height: 44, shape: "ellipse" },
  ];
  const kinds = { Articulo: "entity", NumSerie: "key", Codigo: "key" };
  const edges = [{ start: "Articulo", end: "NumSerie" }, { start: "Articulo", end: "Codigo" }];
  const placed = chenLayout(nodes, kinds, edges, ["Articulo", "NumSerie"]);
  assert.deepEqual(Object.keys(placed), ["Codigo"]);
  assert.ok(Math.hypot(placed.Codigo.x - 500, placed.Codigo.y - 400) < 160, "next to Articulo, not at its Mermaid position");
});
