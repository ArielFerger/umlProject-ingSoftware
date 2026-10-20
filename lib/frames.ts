import { z } from "zod";
import type { CanvasSettings, Point } from "./canvas.ts";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const frameSettings = z.object({
  title: z.string().max(120),
  x: z.number().finite().min(-19000).max(19000), y: z.number().finite().min(-19000).max(19000),
  width: z.number().finite().min(160).max(8000), height: z.number().finite().min(100).max(8000),
  color: color.default("#2563eb"), border: z.enum(["solid", "dashed", "dotted"]).default("dashed"),
  moveContents: z.boolean().default(true),
});
const endpoint = z.object({ kind: z.enum(["frame", "class"]), id: z.string().min(1).max(300) });
export const frameLinkSettings = z.object({
  from: endpoint, to: endpoint, label: z.string().max(120).default(""),
  color: color.default("#2563eb"), border: z.enum(["solid", "dashed", "dotted"]).default("solid"),
});
export type CanvasFrame = z.infer<typeof frameSettings>;
export type FrameLink = z.infer<typeof frameLinkSettings>;
export type FrameNode = Point & { name: string; width: number; height: number };
export function frameNodes(nodes: FrameNode[], settings: CanvasSettings) {
  return nodes.map(node => ({ ...node, ...(Object.hasOwn(settings.positions, node.name) ? settings.positions[node.name] : {}) }));
}
export function enclosingFrame(nodes: FrameNode[], offset = 0): CanvasFrame {
  const left = nodes.length ? Math.min(...nodes.map(n => n.x - n.width / 2)) - 50 : 0;
  const top = nodes.length ? Math.min(...nodes.map(n => n.y - n.height / 2)) - 70 : 0;
  const right = nodes.length ? Math.max(...nodes.map(n => n.x + n.width / 2)) + 50 : 480;
  const bottom = nodes.length ? Math.max(...nodes.map(n => n.y + n.height / 2)) + 50 : 320;
  return frameSettings.parse({ title: "Nuevo módulo", x: Math.max(-19000, Math.min(19000, left + offset)), y: Math.max(-19000, Math.min(19000, top + offset)), width: Math.min(8000, Math.max(160, right - left)), height: Math.min(8000, Math.max(100, bottom - top)) });
}
export function transformFrame(settings: CanvasSettings, id: string, handle: string, delta: Point, nodes: FrameNode[]): CanvasSettings {
  const frame = settings.frames?.[id];
  if (!frame) return settings;
  const next = { ...frame }, positions = { ...settings.positions };
  if (handle === "move") {
    next.x = Math.max(-19000, Math.min(19000, frame.x + delta.x));
    next.y = Math.max(-19000, Math.min(19000, frame.y + delta.y));
    if (frame.moveContents) for (const node of frameNodes(nodes, settings)) {
      if (node.x - node.width / 2 >= frame.x && node.x + node.width / 2 <= frame.x + frame.width && node.y - node.height / 2 >= frame.y && node.y + node.height / 2 <= frame.y + frame.height) {
        positions[node.name] = { x: Math.max(-19000, Math.min(19000, node.x + next.x - frame.x)), y: Math.max(-19000, Math.min(19000, node.y + next.y - frame.y)) };
      }
    }
  } else {
    if (handle.includes("e")) next.width = Math.max(160, Math.min(8000, frame.width + delta.x));
    if (handle.includes("s")) next.height = Math.max(100, Math.min(8000, frame.height + delta.y));
    if (handle.includes("w")) { next.width = Math.max(160, Math.min(8000, frame.width - delta.x)); next.x = Math.max(-19000, Math.min(19000, frame.x + frame.width - next.width)); }
    if (handle.includes("n")) { next.height = Math.max(100, Math.min(8000, frame.height - delta.y)); next.y = Math.max(-19000, Math.min(19000, frame.y + frame.height - next.height)); }
  }
  return { ...settings, positions, frames: { ...settings.frames, [id]: next } };
}
export function removeFrame(settings: CanvasSettings, id: string): CanvasSettings {
  const frames = { ...settings.frames }; delete frames[id];
  const frameLinks = Object.fromEntries(Object.entries(settings.frameLinks || {}).filter(([, link]) => ![link.from, link.to].some(end => end.kind === "frame" && end.id === id)));
  return { ...settings, frames, frameLinks };
}
export function frameLinkPoints(link: FrameLink, frames: Record<string, CanvasFrame>, nodes: FrameNode[]) {
  const rect = (end: FrameLink["from"]) => end.kind === "class" ? nodes.find(n => n.name === end.id) : Object.hasOwn(frames, end.id) ? { x: frames[end.id].x + frames[end.id].width / 2, y: frames[end.id].y + frames[end.id].height / 2, width: frames[end.id].width, height: frames[end.id].height } : undefined;
  const a = rect(link.from), b = rect(link.to);
  if (!a || !b || (link.from.kind === link.to.kind && link.from.id === link.to.id)) return null;
  const at = (box: typeof a, target: typeof b) => {
    const dx = target.x - box.x, dy = target.y - box.y;
    const scale = Math.min(box.width / 2 / (Math.abs(dx) || .001), box.height / 2 / (Math.abs(dy) || .001));
    return { x: box.x + dx * scale, y: box.y + dy * scale };
  };
  return [at(a, b), at(b, a)] as const;
}
export function frameLinkRoute(link: FrameLink, frames: Record<string, CanvasFrame>, nodes: FrameNode[]) {
  const ends = frameLinkPoints(link, frames, nodes);
  if (!ends) return null;
  if (link.from.kind === "frame" && link.to.kind === "frame") {
    const from = frames[link.from.id], to = frames[link.to.id];
    const a = { x: from.x + from.width / 2, y: from.y }, b = { x: to.x + to.width / 2, y: to.y };
    const top = Math.min(a.y, b.y) - 45;
    return { points: [a, { x: a.x, y: top }, { x: b.x, y: top }, b], label: { x: (a.x + b.x) / 2, y: top - 8 } };
  }
  return { points: [...ends], label: { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 - 8 } };
}
