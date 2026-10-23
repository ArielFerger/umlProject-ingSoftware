"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BringToFront, Copy, Maximize, SendToBack, Trash2, X, ImageIcon } from "lucide-react";
import type { CanvasSettings, Point } from "@/lib/canvas";
import { MAX_IMAGES, MAX_INLINE_IMAGE, placeImage, type CanvasImage } from "@/lib/images";
import { renderImages } from "@/lib/svg-images";

// Loaded pictures by asset id, shared across boards: a picture is fetched once per page.
const assetCache = new Map<string, Promise<string>>();
function loadAsset(board: string, asset: string) {
  let pending = assetCache.get(asset);
  if (!pending) {
    pending = fetch(`/api/assets?id=${encodeURIComponent(asset)}&board=${encodeURIComponent(board)}`)
      .then(response => { if (!response.ok) throw new Error("Imagen no disponible."); return response.blob(); })
      .then(blob => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }));
    pending.catch(() => assetCache.delete(asset));
    assetCache.set(asset, pending);
  }
  return pending;
}

/** Scales a picture down to at most 1600 px and re-encodes it compactly (WebP keeps transparency). */
export async function compressImage(file: Blob, limit = 4_000_000) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Elegí una imagen PNG, JPEG, WebP o GIF.");
  if (file.size > 25_000_000) throw new Error("La imagen es demasiado grande (máximo 25 MB).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d")!; context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let quality = .86, url = canvas.toDataURL("image/webp", quality);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > limit && quality > .4) { quality -= .12; url = canvas.toDataURL(url.startsWith("data:image/webp") ? "image/webp" : "image/jpeg", quality); }
  if (url.length > limit) throw new Error("La imagen es demasiado pesada aun comprimida.");
  return { url, width: canvas.width, height: canvas.height };
}

export type ImageRequest = { serial: number; file: Blob; point?: Point };
type Props = {
  settings: CanvasSettings; renderKey: unknown; zoom: number; active: boolean; board: string; inline: boolean;
  root: () => SVGSVGElement | null; viewport: () => HTMLElement | null; point: (x: number, y: number) => Point; center: () => Point;
  commit?: (settings: CanvasSettings) => void; onSelect: () => void; onMessage: (text: string) => void; request?: ImageRequest;
};
type Drag = { id: string; resize: boolean; start: Point; base: CanvasImage; next?: CanvasImage };

export default function CanvasImages(props: Props) {
  const [chosen, setSelected] = useState("");
  const [sources, setSources] = useState<Map<string, string>>(() => new Map());
  const selected = props.active ? chosen : "";
  const latest = useRef(props);
  const state = useRef({ selected, sources });
  useLayoutEffect(() => { latest.current = props; state.current = { selected, sources }; });
  const drag = useRef<Drag | null>(null);
  const lastRequest = useRef(props.request?.serial || 0);
  const editable = !!props.commit;
  const images = props.settings.images || {};
  const image = images[selected];

  // Resolve each picture to a data URL: inline ones directly, stored ones through the cache.
  useEffect(() => {
    let active = true;
    for (const [id, item] of Object.entries(props.settings.images || {})) {
      if (state.current.sources.has(id)) continue;
      const ready = item.src ? Promise.resolve(item.src) : item.asset ? loadAsset(props.board, item.asset) : null;
      ready?.then(url => { if (active) setSources(current => new Map(current).set(id, url)); }).catch(() => {});
    }
    return () => { active = false; };
  }, [props.settings.images, props.board]);

  function draw(settings = latest.current.settings) {
    const svg = latest.current.root(); if (!svg) return;
    renderImages(svg, settings, state.current.sources, { selected: state.current.selected, editable: !!latest.current.commit && latest.current.active, zoom: latest.current.zoom });
  }
  useEffect(() => { draw(); }, [props.settings.images, props.renderKey, sources, selected, props.zoom, props.active, editable]);

  function save(id: string, value: CanvasImage | null) {
    const p = latest.current, next = { ...p.settings.images };
    if (value) next[id] = value; else delete next[id];
    p.commit?.({ ...p.settings, images: next });
  }

  // New pictures: compress, store (or inline), then place them where they were dropped.
  useEffect(() => {
    const request = props.request;
    if (!request || request.serial === lastRequest.current) return;
    lastRequest.current = request.serial;
    const p = latest.current;
    if (!p.commit) return;
    if (Object.keys(p.settings.images || {}).length >= MAX_IMAGES) { p.onMessage(`Podés agregar hasta ${MAX_IMAGES} imágenes por tablero.`); return; }
    void (async () => {
      try {
        p.onMessage("Subiendo imagen…");
        const picture = await compressImage(request.file, p.inline ? MAX_INLINE_IMAGE : 4_000_000);
        let stored: Pick<CanvasImage, "asset" | "src">;
        if (p.inline) stored = { src: picture.url };
        else {
          const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board: p.board, data: picture.url }) });
          const result = await response.json() as { id?: string; error?: string };
          if (!response.ok || !result.id) throw new Error(result.error || "No se pudo subir la imagen.");
          assetCache.set(result.id, Promise.resolve(picture.url));
          stored = { asset: result.id };
        }
        const id = crypto.randomUUID(), now = latest.current;
        setSources(current => new Map(current).set(id, picture.url));
        const name = "name" in request.file ? String((request.file as File).name).slice(0, 120) : "";
        now.commit?.({ ...now.settings, images: { ...now.settings.images, [id]: { ...stored, ...placeImage(picture, request.point || now.center()), layer: "front", name } } });
        now.onSelect(); setSelected(id); now.onMessage("Imagen agregada. Arrastrala para moverla; la esquina cambia su tamaño.");
      } catch (error) { latest.current.onMessage((error as Error).message); }
    })();
  }, [props.request]);

  useEffect(() => {
    const view = props.viewport(); if (!view) return;
    const down = (event: PointerEvent) => {
      const p = latest.current, target = event.target as Element;
      if (event.button !== 0 || !p.commit || !p.active || target.closest(".image-panel")) return;
      const id = target.closest("[data-image-id]")?.getAttribute("data-image-id");
      if (!id) { setSelected(""); return; }
      event.preventDefault(); event.stopPropagation();
      p.onSelect(); setSelected(id);
      drag.current = { id, resize: !!target.closest("[data-image-handle]"), start: p.point(event.clientX, event.clientY), base: p.settings.images![id] };
      try { view.setPointerCapture(event.pointerId); } catch { /* The pointer already ended. */ }
    };
    const move = (event: PointerEvent) => {
      const d = drag.current; if (!d) return;
      event.stopPropagation();
      const at = latest.current.point(event.clientX, event.clientY), dx = at.x - d.start.x, dy = at.y - d.start.y;
      if (!d.next && Math.hypot(dx, dy) < 2) return;
      if (d.resize) {
        // Corner resize keeps the picture's proportions.
        const ratio = d.base.height / d.base.width, width = Math.max(16, Math.min(6000, Math.round(d.base.width + Math.max(dx, dy / ratio))));
        d.next = { ...d.base, width, height: Math.max(16, Math.round(width * ratio)) };
      } else d.next = { ...d.base, x: Math.max(-19000, Math.min(19000, Math.round(d.base.x + dx))), y: Math.max(-19000, Math.min(19000, Math.round(d.base.y + dy))) };
      draw({ ...latest.current.settings, images: { ...latest.current.settings.images, [d.id]: d.next } });
    };
    const up = (event: PointerEvent) => {
      const d = drag.current; if (!d) return;
      event.stopPropagation(); drag.current = null;
      if (view.hasPointerCapture(event.pointerId)) view.releasePointerCapture(event.pointerId);
      if (d.next) save(d.id, d.next);
    };
    view.addEventListener("pointerdown", down); view.addEventListener("pointermove", move); view.addEventListener("pointerup", up);
    return () => { view.removeEventListener("pointerdown", down); view.removeEventListener("pointermove", move); view.removeEventListener("pointerup", up); };
  }, [props.renderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target;
      if ((target instanceof Element && target.closest("input,textarea,select,[contenteditable=true],dialog")) || !latest.current.commit) return;
      const current = latest.current.settings.images?.[selected]; if (!current) return;
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); save(selected, null); setSelected(""); }
      else if (event.key === "Escape") { event.stopPropagation(); setSelected(""); }
      else {
        const step = event.shiftKey ? 20 : 5, delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key];
        if (delta) { event.preventDefault(); event.stopPropagation(); save(selected, { ...current, x: current.x + delta[0], y: current.y + delta[1] }); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [selected]);

  if (!editable || !image) return null;
  return <div className="node-selection image-panel" role="toolbar" aria-label="Opciones de la imagen" onPointerDown={e => e.stopPropagation()}>
    <strong title={image.name}><ImageIcon size={15} />{image.name || "Imagen"}</strong><span className="board-control-divider" />
    <button type="button" className="icon-btn" title={image.layer === "back" ? "Traer delante del diagrama" : "Enviar detrás del diagrama"} aria-label={image.layer === "back" ? "Traer delante del diagrama" : "Enviar detrás del diagrama"} onClick={() => save(selected, { ...image, layer: image.layer === "back" ? "front" : "back" })}>{image.layer === "back" ? <BringToFront size={16} /> : <SendToBack size={16} />}</button>
    <button type="button" className="icon-btn" title="Tamaño original (hasta 480 px)" aria-label="Restaurar tamaño" onClick={() => { const img = new Image(); img.onload = () => save(selected, { ...image, ...placeImage({ width: img.naturalWidth, height: img.naturalHeight }, { x: image.x + image.width / 2, y: image.y + image.height / 2 }) }); img.src = sources.get(selected) || ""; }}><Maximize size={16} /></button>
    <button type="button" className="icon-btn" title="Duplicar" aria-label="Duplicar imagen" disabled={Object.keys(images).length >= MAX_IMAGES} onClick={() => { const id = crypto.randomUUID(); setSources(current => new Map(current).set(id, sources.get(selected) || "")); latest.current.commit?.({ ...props.settings, images: { ...props.settings.images, [id]: { ...image, x: image.x + 24, y: image.y + 24 } } }); setSelected(id); }}><Copy size={16} /></button>
    <button type="button" className="icon-btn board-delete" title="Eliminar (Supr)" aria-label="Eliminar imagen" onClick={() => { save(selected, null); setSelected(""); }}><Trash2 size={16} /></button>
    <button type="button" className="icon-btn" title="Deseleccionar (Esc)" aria-label="Deseleccionar imagen" onClick={() => setSelected("")}><X size={15} /></button>
  </div>;
}
