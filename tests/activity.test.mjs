import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES } from "../lib/diagrams.ts";
import { activityDeclaration, clipToOutline, controlLayoutLabel, flowDirection, insideShape, isControlNode } from "../lib/activity.ts";
import { visualNodes, visualRelations, setVisualNode, removeVisualNode } from "../lib/visual-diagrams.ts";

const template = TEMPLATES.find(t => t.type === "activity").source;

test("activity template reads actions, decisions and UML control nodes", () => {
  const kinds = Object.fromEntries(visualNodes(template, "activity").map(n => [n.id, n.kind]));
  assert.deepEqual([kinds.Inicio, kinds.Carrito, kinds.Stock, kinds.Fork1, kinds.Join1, kinds.Fin], ["start", "activity", "decision", "fork", "join", "end"]);
  assert.equal(visualNodes(template, "activity").find(n => n.id === "Stock").label, "¿Stock disponible?");
  const guards = visualRelations(template, "activity").filter(r => r.label).map(r => r.label);
  assert.deepEqual(guards, ["[sí]", "[no]", "[sí]", "[no]"]);
  assert.equal(visualRelations(template, "activity").filter(r => r.from === "Fork1").length, 2);
});

test("control nodes keep their kind through edits and removal", () => {
  let source = setVisualNode(template, "activity", { id: "Merge1", label: "Fusión", kind: "merge", body: "" }, true);
  source = setVisualNode(source, "activity", { id: "FinFlujo", label: "Fin de flujo", kind: "flowEnd", body: "" }, true);
  const kinds = Object.fromEntries(visualNodes(source, "activity").map(n => [n.id, n.kind]));
  assert.equal(kinds.Merge1, "merge"); assert.equal(kinds.FinFlujo, "flowEnd");
  assert.ok(source.includes('Merge1{"Fusión"}:::actMerge'));
  assert.equal(activityDeclaration("A", "Revisar", "activity"), 'A("Revisar")', "actions are rounded rectangles");
  const removed = removeVisualNode(template, "activity", "Fork1");
  assert.ok(!/\bFork1\b/.test(removed.replace(/%% uml-studio.*/, "")));
  assert.ok(isControlNode("join") && !isControlNode("decision"));
});

test("fork bars lie across the flow direction", () => {
  assert.equal(flowDirection("flowchart TD\nA"), "vertical");
  assert.equal(flowDirection("flowchart LR\nA"), "horizontal");
  assert.ok(controlLayoutLabel("fork", "vertical").length > 20);
  assert.ok(controlLayoutLabel("join", "horizontal").includes("<br/>"));
});

test("arrows end on the outline of diamonds and circles, not their bounding box", () => {
  const diamond = { x: 0, y: 0, width: 100, height: 60, shape: "diamond" };
  // Mermaid ends this edge at the box's left edge, 50 units from the centre at y=15: outside the diamond.
  const clipped = clipToOutline([{ x: -200, y: 15 }, { x: -50, y: 15 }], diamond).at(-1);
  assert.ok(Math.abs(Math.abs(clipped.x) / 50 + Math.abs(clipped.y) / 30 - 1) < .02, `${clipped.x},${clipped.y} on the outline`);
  const circle = { x: 0, y: 0, width: 26, height: 26, shape: "ellipse" };
  const toCircle = clipToOutline([{ x: 0, y: -100 }, { x: 0, y: -13 }], circle).at(-1);
  assert.ok(Math.abs(toCircle.y + 13) < .1);
  // A segment that passes beside the shape is aimed at its centre instead.
  const beside = clipToOutline([{ x: -100, y: -100 }, { x: -50, y: -30 }], diamond).at(-1);
  assert.ok(insideShape({ ...diamond, width: 101, height: 61 }, beside) && !insideShape({ ...diamond, width: 98, height: 58 }, beside));
  const rect = { x: 0, y: 0, width: 100, height: 60, shape: "rect" };
  assert.deepEqual(clipToOutline([{ x: -200, y: 0 }, { x: -50, y: 0 }], rect).at(-1), { x: -50, y: 0 });
});

test("arrow ends dragged onto a diamond attach to its outline", async () => {
  const { anchorPoint, routeEdge } = await import("../lib/edge-routing.ts");
  const diamond = { name: "D", x: 100, y: 100, width: 160, height: 160, shape: "diamond" };
  const p = anchorPoint(diamond, { side: "right", offset: .25 });
  assert.ok(Math.abs(Math.abs(p.x - 100) / 80 + Math.abs(p.y - 100) / 80 - 1) < 1e-9, "on the diamond");
  const box = anchorPoint({ ...diamond, shape: undefined }, { side: "right", offset: .25 });
  assert.deepEqual(box, { x: 180, y: 60 }, "rectangles keep the box point");
  const route = routeEdge({ name: "A", x: 100, y: -200, width: 120, height: 40 }, diamond, { shape: "straight", points: [] });
  assert.deepEqual([Math.round(route.end.x), Math.round(route.end.y)], [100, 20], "automatic routes meet the top vertex");
});
