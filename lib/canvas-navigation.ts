import type { Point } from "./canvas";

export type CanvasView = { zoom: number; pan: Point };
export const GRID_SIZE = 20;
/** Diagrams are vectors, so close inspection stays sharp up to 1000%. */
export const MAX_ZOOM = 10;

/** Zoom around a viewport point measured from its center. */
export function zoomAt(view: CanvasView, zoom: number, anchor: Point = { x: 0, y: 0 }): CanvasView {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(.1, zoom));
  const ratio = nextZoom / view.zoom;
  return {
    zoom: nextZoom,
    pan: {
      x: anchor.x - (anchor.x - view.pan.x) * ratio,
      y: anchor.y - (anchor.y - view.pan.y) * ratio,
    },
  };
}

export function snapPoint(point: Point, enabled: boolean): Point {
  const axis = (value: number) => Math.max(-19000, Math.min(19000, enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value));
  return { x: axis(point.x), y: axis(point.y) };
}

/** Sparse dots at low zoom keep the grid legible without changing snap units. */
export function gridSpacing(zoom: number): number {
  return GRID_SIZE * zoom * 2 ** Math.max(0, Math.ceil(Math.log2(12 / (GRID_SIZE * zoom))));
}
