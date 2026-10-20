import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CANVAS, RELATIONS, appendRelation, cleanSource, readCanvas, writeCanvas } from "../lib/canvas.ts";

const source = "classDiagram\nclass Equipo\nclass Jugador\nEquipo o-- Jugador : agrupa\n%% comentario personal\n";

test("canvas settings survive a source round trip without changing Mermaid", () => {
  const settings = { positions: { Equipo: { x: -120, y: 800 }, Jugador: { x: 320, y: 200 } }, routes: {}, lineWidth: 6, arrowScale: 3, labelSize: 24 };
  const saved = writeCanvas(source, settings);
  assert.deepEqual(readCanvas(saved), settings);
  assert.equal(cleanSource(saved), source.trimEnd());
  assert.equal(saved.match(/%% uml-studio: /g).length, 1);
  assert.equal(writeCanvas(saved, settings), saved);
});

test("invalid and out-of-range metadata fall back to safe defaults", () => {
  for (const metadata of ["not json", '{"lineWidth":99}', '{"positions":{"Equipo":{"x":20001,"y":0}}}', '{"arrowScale":0}']) {
    assert.deepEqual(readCanvas(source + "%% uml-studio: " + metadata), DEFAULT_CANVAS);
  }
  assert.deepEqual(readCanvas(source), DEFAULT_CANVAS);
});

test("the last valid-format metadata line wins and obsolete copies are removed", () => {
  const saved = source + '%% uml-studio: {"lineWidth":1}\r\n  %% uml-studio: {"lineWidth":4}\r\n';
  assert.equal(readCanvas(saved).lineWidth, 4);
  assert.equal(writeCanvas(saved, readCanvas(saved)).match(/%% uml-studio: /g).length, 1);
  assert.match(cleanSource(saved), /%% comentario personal/);
});

test("every quick relationship preserves positions and styling", () => {
  const settings = { ...DEFAULT_CANVAS, positions: { Equipo: { x: 50, y: 100 } }, arrowScale: 2 };
  for (const relation of RELATIONS) {
    const saved = appendRelation(writeCanvas(source, settings), "Equipo", "Jugador", relation.value);
    assert.deepEqual(readCanvas(saved), settings);
    assert.ok(cleanSource(saved).endsWith(`Equipo ${relation.value} Jugador`));
  }
});

test("freehand pencil strokes round-trip in canvas metadata", () => {
  const settings = {
    ...DEFAULT_CANVAS,
    positions: { Equipo: { x: 100, y: 150 } },
    strokes: [
      { points: [{ x: 10, y: 20 }, { x: 40, y: 60 }, { x: 80, y: 90 }], color: "#1a647b", width: 3 },
    ],
  };
  const saved = writeCanvas(source, settings);
  assert.deepEqual(readCanvas(saved), settings);
  const cleared = writeCanvas(saved, { ...settings, strokes: [] });
  assert.equal(readCanvas(cleared).strokes, undefined);
});


test("class and arrow colors round-trip and reject CSS injection", () => {
  const settings = { ...DEFAULT_CANVAS, nodeColors: { Equipo: "#FDE68A" }, edgeColors: { '["Equipo","Jugador",0]': "#dc2626" } };
  assert.deepEqual(readCanvas(writeCanvas(source, settings)), settings);
  assert.equal(cleanSource(writeCanvas(source, settings)), source.trimEnd());
  assert.throws(() => writeCanvas(source, { ...settings, nodeColors: { Equipo: "url(https://invalid.test)" } }));
  assert.deepEqual(readCanvas(writeCanvas(source, { ...DEFAULT_CANVAS, nodeColors: {}, edgeColors: {} })), DEFAULT_CANVAS);
});

test("color contrast switches between light and dark class labels", async () => {
  const { colorInk } = await import("../lib/svg-colors.ts");
  assert.equal(colorInk("#ffffff"), "#111827");
  assert.equal(colorInk("#fde68a"), "#111827");
  assert.equal(colorInk("#334155"), "#ffffff");
  assert.equal(colorInk("#000000"), "#ffffff");
});
