import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorPoint, nearestAnchor, routeEdge, relationRouteKey, segmentClear, polylineMidpoint } from "../lib/edge-routing.ts";
import { DEFAULT_CANVAS, readCanvas, writeCanvas } from "../lib/canvas.ts";
import { sourceRelations, removeRelation, updateRelation } from "../lib/relation-actions.ts";

const a = { name: "A", x: 100, y: 100, width: 120, height: 80 };
const b = { name: "B", x: 400, y: 300, width: 100, height: 100 };
const source = "classDiagram\nA --> B : primera\nA --> B : segunda\nB --> A : regreso";
test("attachment snaps to all four borders and keeps the position along a side", () => {
  for (const [cursor, side, offset] of [[{ x: 70, y: 59 }, "top", .25], [{ x: 161, y: 120 }, "right", .75], [{ x: 130, y: 141 }, "bottom", .75], [{ x: 39, y: 80 }, "left", .25]]) {
    assert.deepEqual(nearestAnchor(a, cursor), { side, offset });
  }
  assert.deepEqual(nearestAnchor(a, { x: -1000, y: -1000 }), { side: "top", offset: 0 });
});
test("curved and square routes enter the chosen sides with correctly oriented terminals", () => {
  for (const shape of ["curved", "orthogonal"]) for (const side of ["top", "right", "bottom", "left"]) {
    const connection = { shape, from: { side: "right", offset: .25 }, to: { side, offset: .65 }, points: [{ x: 250, y: 50 }] };
    const result = routeEdge(a, b, connection, 17, 5);
    assert.deepEqual(result.origin, anchorPoint(a, connection.from));
    assert.deepEqual(result.destination, anchorPoint(b, connection.to));
    const expected = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[side];
    assert.equal(result.end.x, result.destination.x + expected[0] * 5);
    assert.equal(result.end.y, result.destination.y + expected[1] * 5);
    assert.equal(result.endToward.x, result.end.x + expected[0] * 30);
    assert.equal(result.endToward.y, result.end.y + expected[1] * 30);
    if (shape === "orthogonal") for (let i = 1; i < result.knots.length; i++) assert.ok(result.knots[i].x === result.knots[i - 1].x || result.knots[i].y === result.knots[i - 1].y);
    else assert.match(result.path, / Q /);
  }
});
test("top-to-left straight and curved connections stay visible outside the classes", () => {
  const upper = { name: "Cliente", x: 318, y: 74, width: 238, height: 132 };
  const lower = { name: "Pedido", x: 319, y: 305, width: 210, height: 176 };
  for (const shape of ["straight", "curved", "orthogonal"]) {
    const result = routeEdge(upper, lower, { shape, from: { side: "top", offset: .7 }, to: { side: "left", offset: .5 }, points: [{ x: 414, y: 215 }] }, 0, 7);
    assert.ok(result.knots[1].y < result.start.y);
    assert.ok(result.knots[2].y <= result.knots[1].y);
    assert.ok(result.knots.at(-2).x < result.end.x);
    for (let i = 1; i < result.knots.length; i++) assert.ok(segmentClear(result.knots[i - 1], result.knots[i], [upper, lower]), `hidden ${shape} segment ${i}`);
    const tokens = result.path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
    let cursor = result.start, i = 0;
    while (i < tokens.length) {
      const command = tokens[i++];
      const p = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
      if (command === "Q") {
        const end = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
        for (let j = 1; j <= 50; j++) {
          const t = j / 50, sample = { x: (1-t)**2*cursor.x+2*(1-t)*t*p.x+t*t*end.x, y: (1-t)**2*cursor.y+2*(1-t)*t*p.y+t*t*end.y };
          assert.ok(segmentClear(sample, sample, [upper, lower]), "curve crosses a class");
        }
        cursor = end;
      } else cursor = p;
    }
  }
});
test("straight bends and self-relations remain finite when nodes move or overlap", () => {
  for (const shape of ["straight", "curved", "orthogonal"]) {
    const route = { shape, points: [] };
    for (const other of [b, a, { ...b, x: a.x, y: a.y }]) {
      const result = routeEdge(a, other, route, 23.8, 7);
      assert.doesNotMatch(result.path, /NaN|Infinity/);
    }
  }
  const bend = { x: 200, y: 50 };
  assert.match(routeEdge(a, b, { shape: "straight", points: [bend] }).path, /L 200 50/);
});
test("square connections with outward-facing sides turn outside the endpoint boxes", () => {
  const upper = { ...a, width: 100, height: 60 }, lower = { ...b, x: 100, y: 400, width: 100, height: 160 };
  for (const [from, to] of [["right", "left"], ["left", "right"]]) {
    const result = routeEdge(upper, lower, { shape: "orthogonal", from: { side: from, offset: .5 }, to: { side: to, offset: .5 }, points: [] }, 0, 5);
    for (let i = 2; i < result.knots.length - 1; i++) {
      const p = result.knots[i - 1], q = result.knots[i];
      for (const node of [upper, lower]) {
        if (p.y === q.y && p.y > node.y - node.height / 2 && p.y < node.y + node.height / 2) assert.ok(Math.max(p.x, q.x) <= node.x - node.width / 2 || Math.min(p.x, q.x) >= node.x + node.width / 2);
        if (p.x === q.x && p.x > node.x - node.width / 2 && p.x < node.x + node.width / 2) assert.ok(Math.max(p.y, q.y) <= node.y - node.height / 2 || Math.min(p.y, q.y) >= node.y + node.height / 2);
      }
    }
  }
});
test("routing metadata survives old documents, saved edits and parallel-edge removal", () => {
  const key0 = relationRouteKey("A", "B", 0), key1 = relationRouteKey("A", "B", 1), reverse = relationRouteKey("B", "A", 0);
  const routes = { [key0]: { shape: "straight", points: [] }, [key1]: { shape: "orthogonal", to: { side: "left", offset: .2 }, points: [{ x: 300, y: 90 }] }, [reverse]: { shape: "curved", points: [] } };
  const saved = writeCanvas(source, { ...DEFAULT_CANVAS, routes });
  assert.deepEqual(readCanvas(saved).routes, routes);
  assert.deepEqual(readCanvas(source + '\n%% uml-studio: {"lineWidth":3}').routes, {});
  const edited = updateRelation(saved, sourceRelations(saved)[1], { kind: "..>", label: "nueva", fromCard: "1", toCard: "*" });
  assert.deepEqual(readCanvas(edited).routes, routes);
  const removed = removeRelation(edited, sourceRelations(edited)[0]);
  assert.deepEqual(readCanvas(removed).routes, { [key0]: routes[key1], [reverse]: routes[reverse] });
  assert.deepEqual(readCanvas(source + '\n%% uml-studio: {"routes":{"bad":{"shape":"orthogonal","from":{"side":"left","offset":2}}}}'), DEFAULT_CANVAS);
});
test("polylineMidpoint computes arc-length midpoint without DOM layout queries", () => {
  assert.deepEqual(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]), { x: 100, y: 0 });
  assert.deepEqual(polylineMidpoint([{ x: 10, y: 20 }, { x: 10, y: 20 }]), { x: 10, y: 20 });
});

