import assert from "node:assert/strict";
import { test } from "node:test";
import { zoomAt, snapPoint, gridSpacing, MAX_ZOOM } from "../lib/canvas-navigation.ts";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("cursor anchored zoom preserves the world point after panning", () => {
  const view = { zoom: .7, pan: { x: 315, y: -92 } };
  const anchor = { x: -175, y: 210 };
  for (const zoom of [.1, 1, 2.5, 4, 10, 25]) {
    const next = zoomAt(view, zoom, anchor);
    close((anchor.x - next.pan.x) / next.zoom, (anchor.x - view.pan.x) / view.zoom);
    close((anchor.y - next.pan.y) / next.zoom, (anchor.y - view.pan.y) / view.zoom);
    assert.ok(next.zoom >= .1 && next.zoom <= MAX_ZOOM);
  }
});

test("toolbar zoom and reset keep the visible center stationary", () => {
  const view = { zoom: 2.8, pan: { x: -1500, y: 375 } };
  const reset = zoomAt(view, 1);
  close(reset.pan.x / reset.zoom, view.pan.x / view.zoom);
  close(reset.pan.y / reset.zoom, view.pan.y / view.zoom);
  assert.deepEqual(zoomAt(reset, view.zoom), view);
});

test("grid snapping works across the origin and respects metadata bounds", () => {
  assert.deepEqual(snapPoint({ x: 31, y: -31 }, true), { x: 40, y: -40 });
  assert.deepEqual(snapPoint({ x: 31.5, y: -31.5 }, false), { x: 31.5, y: -31.5 });
  assert.deepEqual(snapPoint({ x: 25000, y: -25000 }, true), { x: 19000, y: -19000 });
});

test("low-zoom grid stays readable and aligned to multiples of snap units", () => {
  for (const zoom of [.1, .15, .3, .5, 1, 2, 4]) {
    const spacing = gridSpacing(zoom);
    assert.ok(spacing >= 12);
    assert.ok(Number.isInteger(spacing / zoom / 20));
  }
});
