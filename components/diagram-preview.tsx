"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan, LoaderCircle, AlertCircle, Move, Link2, BookOpen, SlidersHorizontal, LayoutGrid, X } from "lucide-react";
import { Diagram } from "@/lib/diagrams";
import { CanvasSettings, Point, RelationKind, RELATIONS, cleanSource, readCanvas, relationInfo } from "@/lib/canvas";
import { CanvasModel, applyCanvas, measureClasses, exportCanvas } from "@/lib/svg-canvas";

let renderQueue: Promise<unknown> = Promise.resolve();
let renderNumber = 0;
export type SvgResult = { svg: string; width: number; height: number };
type Drag = { kind: "node" | "pan"; name?: string; x: number; y: number; start: Point; moved: boolean };

export default function DiagramPreview({ diagram, onRendered, onClassClick, onSettingsChange, onConnect, onGuide }: {
  diagram: Diagram; onRendered: (result: SvgResult | null) => void; onClassClick: (name: string) => void;
  onSettingsChange: (settings: CanvasSettings) => void;
  onConnect: (from: string, to: string, kind: RelationKind, positions: Record<string, Point>) => void;
  onGuide: (kind: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const model = useRef<CanvasModel>({ nodes: [], edges: [] });
  const positions = useRef<Record<string, Point>>({});
  const [result, setResult] = useState<SvgResult | null>(null);
  const markup = useMemo(() => ({ __html: result?.svg || "" }), [result]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"move" | "connect">("move");
  const [relationKind, setRelationKind] = useState<RelationKind>("-->");
  const [origin, setOrigin] = useState("");
  const [selectedNode, setSelectedNode] = useState("");
  const drag = useRef<Drag | null>(null);
  const fittedId = useRef("");
  const renderedId = useRef("");
  const content = useMemo(() => cleanSource(diagram.source), [diagram.source]);
  const settings = useMemo(() => readCanvas(diagram.source), [diagram.source]);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const callbacks = useRef({ onRendered, onClassClick, onSettingsChange, onConnect, onGuide });
  callbacks.current = { onRendered, onClassClick, onSettingsChange, onConnect, onGuide };
  const isClass = diagram.type === "class";
  const relation = relationInfo(relationKind);
  const root = () => art.current?.querySelector<SVGSVGElement>("svg") || null;

  const fit = useCallback(() => {
    const el = viewport.current, svg = art.current?.querySelector<SVGSVGElement>("svg");
    if (!el || !svg) return;
    const box = svg.getBBox(), view = svg.viewBox.baseVal;
    const scale = Math.min(1.15, Math.max(.1, Math.min((el.clientWidth - 65) / (box.width + 50), (el.clientHeight - 85) / (box.height + 50))));
    setZoom(scale);
    setPan({ x: (view.x + view.width / 2 - box.x - box.width / 2) * scale, y: (view.y + view.height / 2 - box.y - box.height / 2) * scale });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); callbacks.current.onRendered(null);
    const timer = setTimeout(() => {
      renderQueue = renderQueue.catch(() => {}).then(async () => {
        if (cancelled) return;
        const staging = document.createElement("div");
        staging.style.cssText = "position:fixed;left:-20000px;top:0;visibility:hidden;";
        document.body.appendChild(staging);
        try {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: diagram.theme === "dark" ? "dark" : "base",
            fontFamily: "Arial, sans-serif", suppressErrorRendering: true,
            themeVariables: diagram.theme === "dark" ? { fontSize: "14px" } : {
              fontSize: "14px", primaryColor: diagram.theme === "neutral" ? "#f3f4f6" : "#edf6f1",
              primaryTextColor: "#263d34", primaryBorderColor: "#698d7c", lineColor: "#596f62",
              secondaryColor: "#eef2f7", tertiaryColor: "#fff4dc", background: "#ffffff",
              mainBkg: "#edf6f1", nodeBorder: "#698d7c", clusterBkg: "#f7f9fa",
              actorBkg: "#edf6f1", actorBorder: "#698d7c", actorTextColor: "#263d34",
              signalColor: "#58616c", signalTextColor: "#38414b", labelBoxBkgColor: "#f3f5f6",
            },
            flowchart: { htmlLabels: false, curve: "basis", useMaxWidth: false },
            class: { useMaxWidth: false }, sequence: { useMaxWidth: false },
            // Mermaid's unified class renderer reads spacing from state config.
            state: isClass ? { nodeSpacing: 70, rankSpacing: 140 } : {},
          });
          const { svg } = await mermaid.render("uml" + ++renderNumber, content, staging);
          if (cancelled) return;
          staging.innerHTML = svg;
          const live = staging.querySelector<SVGSVGElement>("svg")!;
          const box = live.viewBox.baseVal;
          const width = box.width || 800, height = box.height || 600;
          live.setAttribute("width", String(width)); live.setAttribute("height", String(height));
          live.style.maxWidth = "none"; live.style.overflow = "visible";
          live.setAttribute("role", "img"); live.setAttribute("aria-label", diagram.name);
          const nodes = isClass ? measureClasses(live) : [];
          let edges: CanvasModel["edges"] = [];
          if (nodes.length) {
            const parsed = await mermaid.mermaidAPI.getDiagramFromText(content);
            const db = parsed.db as unknown as { getData: () => { edges: CanvasModel["edges"] } };
            edges = db.getData().edges.map(edge => {
              const path = Array.from(live.querySelectorAll<SVGPathElement>(".edgePaths path")).find(el => el.dataset.id === edge.id);
              const label = Array.from(live.querySelectorAll<SVGGElement>(".edgeLabel")).find(el => el.querySelector("[data-id]")?.getAttribute("data-id") === edge.id);
              const matrix = label?.transform.baseVal.consolidate()?.matrix;
              let points: Point[] | undefined;
              try { points = JSON.parse(atob(path?.getAttribute("data-points") || "")); } catch { /* Some Mermaid edges have no layout points. */ }
              return { ...edge, points, labelPosition: matrix ? { x: matrix.e, y: matrix.f } : undefined };
            });
          }
          model.current = { nodes, edges };
          renderedId.current = diagram.id;
          setResult({ svg: new XMLSerializer().serializeToString(live), width, height });
          setBusy(false);
        } catch (e) {
          if (!cancelled) { setError(e instanceof Error ? e.message : "Revisa la sintaxis del diagrama."); setBusy(false); }
        } finally { staging.remove(); }
      });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [content, diagram.theme, diagram.id, isClass]);

  useEffect(() => {
    const svg = root();
    if (!svg || busy || error || renderedId.current !== diagram.id) return;
    if (isClass) positions.current = applyCanvas(svg, model.current, settings, diagram.theme === "dark");
    else {
      svg.querySelectorAll<SVGPathElement>(".edgePaths path,.messageLine0,.messageLine1").forEach(path => { path.style.strokeWidth = String(settings.lineWidth); });
    }
    callbacks.current.onRendered(exportCanvas(svg));
    if (fittedId.current !== diagram.id) { fittedId.current = diagram.id; fit(); }
  }, [result, settings, busy, error, diagram.theme, diagram.id, fit, isClass]);

  useEffect(() => {
    setMode("move"); setOrigin(""); setSelectedNode("");
  }, [diagram.id]);
  useEffect(() => {
    const svg = root();
    svg?.querySelectorAll("[data-class]").forEach(node => {
      node.classList.toggle("connection-origin", node.getAttribute("data-class") === origin);
      node.classList.toggle("class-selected", node.getAttribute("data-class") === selectedNode);
    });
  }, [origin, selectedNode, result]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(() => { if (root()) fit(); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [fit]);

  function selectClass(name: string) {
    if (busy || error) return;
    setSelectedNode(name);
    if (mode === "connect") {
      if (!origin) setOrigin(name);
      else {
        callbacks.current.onConnect(origin, name, relationKind, positions.current);
        setOrigin("");
      }
    }
  }
  function placeClass(name: string, point: Point) {
    const svg = root();
    if (!svg) return;
    const next = { ...settingsRef.current, positions: { ...positions.current, [name]: point } };
    positions.current = applyCanvas(svg, model.current, next, diagram.theme === "dark");
  }
  function changeSettings(patch: Partial<CanvasSettings>) { callbacks.current.onSettingsChange({ ...settingsRef.current, ...patch }); }
  function changeZoom(delta: number) { setZoom(z => Math.min(4, Math.max(.1, Math.round((z + delta) * 100) / 100))); }

  return <>
    <div className="canvas-tools">
      {isClass && <>
        <div className="segmented canvas-mode">
          <button className={"icon-btn " + (mode === "move" ? "active" : "")} title="Mover clases" aria-label="Mover clases" onClick={() => { setMode("move"); setOrigin(""); }}><Move size={16} /></button>
          <button className={"icon-btn " + (mode === "connect" ? "active" : "")} title="Conectar clases" aria-label="Conectar clases" onClick={() => { setMode("connect"); setOrigin(""); }}><Link2 size={16} /></button>
        </div>
        <select aria-label="Relación rápida" value={relationKind} onChange={e => { setRelationKind(e.target.value as RelationKind); setMode("connect"); setOrigin(""); }}>
          {RELATIONS.map(item => <option key={item.value} value={item.value}>{item.name}</option>)}
        </select>
        <button className="icon-btn" title="Guía de relaciones UML" aria-label="Guía de relaciones UML" onClick={() => callbacks.current.onGuide(relationKind)}><BookOpen size={17} /></button>
        <span className="canvas-tool-spacer" />
        <button className="icon-btn" title="Ordenar clases automáticamente" aria-label="Ordenar clases automáticamente" disabled={busy || !!error} onClick={() => { changeSettings({ positions: {} }); setTimeout(fit, 50); }}><LayoutGrid size={17} /></button>
      </>}
      <details className="canvas-style">
        <summary aria-label="Ajustar flechas y etiquetas" title="Ajustar flechas y etiquetas"><SlidersHorizontal size={17} /></summary>
        <div className="style-popover">
          <label>Grosor de línea <output>{settings.lineWidth} px</output><input aria-label="Grosor de línea" type="range" min="1" max="6" step=".5" value={settings.lineWidth} onChange={e => changeSettings({ lineWidth: Number(e.target.value) })} /></label>
          {isClass && <label>Tamaño de punta <output>{Math.round(settings.arrowScale * 100)}%</output><input aria-label="Tamaño de punta" type="range" min="1" max="3" step=".1" value={settings.arrowScale} onChange={e => changeSettings({ arrowScale: Number(e.target.value) })} /></label>}
          {isClass && <label>Texto de relaciones <output>{settings.labelSize} px</output><input aria-label="Texto de relaciones" type="range" min="12" max="24" step="1" value={settings.labelSize} onChange={e => changeSettings({ labelSize: Number(e.target.value) })} /></label>}
        </div>
      </details>
    </div>
    {isClass && mode === "connect" && <div className="connection-prompt" role="status"><Link2 size={14} /><span>{origin ? origin + " → " + relation.destination : relation.origin + " → " + relation.destination}</span><button className="icon-btn" title="Cancelar conexión" aria-label="Cancelar conexión" onClick={() => { setMode("move"); setOrigin(""); }}><X size={14} /></button></div>}
    <div className={"diagram-viewport " + (diagram.theme === "dark" ? "canvas-dark " : "") + (mode === "connect" ? "connecting" : "")} ref={viewport}
      onPointerDown={e => {
        if ((e.target as Element).closest("button,.error-panel")) return;
        const node = (e.target as Element).closest("[data-class]");
        const name = node?.getAttribute("data-class");
        if (name && !busy && !error) {
          setSelectedNode(name);
          drag.current = { kind: "node", name, x: e.clientX, y: e.clientY, start: positions.current[name] || { x: 0, y: 0 }, moved: false };
        } else drag.current = { kind: "pan", x: e.clientX, y: e.clientY, start: pan, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
        if (d.kind === "pan") setPan({ x: d.start.x + dx, y: d.start.y + dy });
        else if (mode === "move" && d.moved && d.name) placeClass(d.name, { x: Math.max(-19000, Math.min(19000, d.start.x + dx / zoom)), y: Math.max(-19000, Math.min(19000, d.start.y + dy / zoom)) });
      }}
      onPointerUp={e => {
        const d = drag.current; drag.current = null;
        if (!d || !d.name) return;
        if (!d.moved) selectClass(d.name);
        else if (mode === "move") {
          callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
          const svg = root(); if (svg) callbacks.current.onRendered(exportCanvas(svg));
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; const svg = root(); if (svg && isClass) positions.current = applyCanvas(svg, model.current, settingsRef.current, diagram.theme === "dark"); }}
      onDoubleClick={e => { const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (name && mode === "move") callbacks.current.onClassClick(name); }}
      onKeyDown={e => {
        if (e.key === "Escape") { setOrigin(""); setMode("move"); return; }
        const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (!name || busy || error) return;
        if (e.key === "Enter") { e.preventDefault(); if (mode === "connect") selectClass(name); else callbacks.current.onClassClick(name); }
        const vectors: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
        const delta = vectors[e.key]; if (delta && positions.current[name]) {
          e.preventDefault(); const point = positions.current[name]; placeClass(name, { x: Math.max(-19000, Math.min(19000, point.x + delta.x)), y: Math.max(-19000, Math.min(19000, point.y + delta.y)) });
          callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
        }
      }}
      onWheel={e => { if (e.ctrlKey || e.metaKey) changeZoom(e.deltaY < 0 ? .1 : -.1); }}>
      {result && <div ref={art} className={"diagram-art " + (error ? "invalid-art" : "")}
        style={{ width: result.width, height: result.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        dangerouslySetInnerHTML={markup} />}
      {busy && <div className="canvas-loading"><LoaderCircle size={16} className="spin" />Renderizando</div>}
      {error && <div className="error-panel" role="alert"><AlertCircle size={19} /><div><strong>Revisa la sintaxis</strong><pre>{error.slice(0, 1600)}</pre></div></div>}
      {!busy && !error && <span className="canvas-caption">{diagram.name}</span>}
      <div className="zoom-toolbar" onPointerDown={e => e.stopPropagation()}>
        <button className="icon-btn" aria-label="Alejar" title="Alejar" onClick={() => changeZoom(-.1)}><Minus size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" aria-label="Acercar" title="Acercar" onClick={() => changeZoom(.1)}><Plus size={16} /></button>
        <i /><button className="icon-btn" aria-label="Ajustar al lienzo" title="Ajustar al lienzo" onClick={fit}><Scan size={17} /></button>
      </div>
    </div>
  </>;
}
