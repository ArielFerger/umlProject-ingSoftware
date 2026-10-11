import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "../lib/diagrams.ts";
import { readCanvas, writeCanvas, DEFAULT_CANVAS } from "../lib/canvas.ts";
import { visualNodes, visualRelations, setVisualNode, addVisualRelation, updateVisualRelation, removeVisualRelation, removeVisualNode } from "../lib/visual-diagrams.ts";
import { reorderSequence } from "../lib/visual-svg.ts";

test("sequence responses keep participant IDs and message order", () => {
  const source = TEMPLATES.find(t => t.type === "sequence").source;
  assert.deepEqual(visualNodes(source, "sequence").map(n => n.id), ["Usuario", "App", "API", "DB"]);
  assert.equal(visualRelations(source, "sequence")[3].kind, "-->>");
  const reordered = reorderSequence(source, "DB", "App");
  assert.deepEqual(visualNodes(reordered, "sequence").map(n => n.id), ["Usuario", "DB", "App", "API"]);
  assert.deepEqual(visualRelations(reordered, "sequence").map(r => [r.from,r.kind,r.to,r.label]), visualRelations(source, "sequence").map(r => [r.from,r.kind,r.to,r.label]));
});
test("all six non-class families add editable nodes and valid connection syntax", () => {
  for (const type of ["usecase", "activity", "component", "state", "sequence", "er"]) {
    const initial = TEMPLATES.find(t => t.type === type).source;
    const source = writeCanvas(initial, { ...DEFAULT_CANVAS, positions: { Keep: { x: 10, y: 20 } } });
    const kind = { usecase:"actor", activity:"decision", component:"database", state:"state", sequence:"actor", er:"entity" }[type];
    const result = setVisualNode(source, type, { id:"Nuevo", label:"Elemento nuevo", kind, body:"int id PK\nstring nombre" }, true);
    assert.ok(visualNodes(result,type).some(n=>n.id==="Nuevo"), type);
    assert.deepEqual(readCanvas(result).positions, readCanvas(source).positions);
    assert.throws(()=>setVisualNode(result,type,{id:"Nuevo",label:"",kind,body:""},true),/Ya existe/);
    const from = visualNodes(initial,type)[0].id;
    const relationKind = type === "sequence" ? "->>" : type === "er" ? "||--o{" : "-->";
    const connected = addVisualRelation(result,type,from,"Nuevo",relationKind,"Prueba");
    assert.ok(visualRelations(connected,type).some(r=>r.from===from && r.to==="Nuevo"), type);
  }
});
test("inline activities retain declarations when connections are edited or removed", () => {
  const source = "flowchart TD\nA[Comprar] -->|Sí| B{Pagar}\nB --> C[Confirmar]";
  const first = visualRelations(source,"activity")[0];
  const changed = updateVisualRelation(source,"activity",first,{...first,label:"Aceptar"});
  assert.match(changed,/A\[Comprar\]/); assert.match(changed,/B\{Pagar\}/); assert.match(changed,/B --> C\[Confirmar\]/);
  const removed = removeVisualRelation(source,"activity",first);
  assert.deepEqual(visualNodes(removed,"activity").map(n=>n.id),["A","B","C"]);
  assert.equal(visualRelations(removed,"activity").length,1);
});
test("use cases recognize actor stereotypes, legacy actors and system boundaries", () => {
  const source = TEMPLATES.find(t=>t.type==="usecase").source.replaceAll(":::umlActor","");
  assert.equal(visualNodes(source,"usecase").filter(n=>n.kind==="actor").length,2);
  assert.ok(!visualNodes(source,"usecase").some(n=>n.id==="Sistema"));
  const next = addVisualRelation(source,"usecase","Comprar","Pagar","include","");
  assert.ok(visualRelations(next,"usecase").at(-1).kind.includes("include"));
});
test("node deletion preserves unrelated labels, positions and declarations", () => {
  const source = writeCanvas('flowchart LR\nA[Cliente]\nB["Hablar de A"]\nC[Otra]\nA --> C\nB --> C\n%% A es parte del modelo', {...DEFAULT_CANVAS,positions:{A:{x:1,y:2},B:{x:8,y:9}}});
  const removed = removeVisualNode(source,"component","A");
  assert.match(removed,/B\["Hablar de A"\]/); assert.match(removed,/B --> C/); assert.match(removed,/%% A es parte/);
  assert.deepEqual(readCanvas(removed).positions,{B:{x:8,y:9}});
});
test("editing ER attributes rejects instructions and keeps other entities", () => {
  const source = TEMPLATES.find(t=>t.type==="er").source;
  const changed = setVisualNode(source,"er",{id:"CLIENTE",label:"CLIENTE",kind:"entity",body:"int id PK\nstring telefono"});
  assert.match(changed,/string telefono/); assert.match(changed,/PRODUCTO \{/);
  assert.throws(()=>setVisualNode(source,"er",{id:"CLIENTE",label:"",kind:"entity",body:"}\nEVIL {"}),/atributo/);
});
