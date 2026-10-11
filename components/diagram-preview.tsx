"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan, LoaderCircle, AlertCircle, Move, Link2, BookOpen, SlidersHorizontal, LayoutGrid, X, MoreHorizontal, Pencil, Copy, Trash2, RotateCcw, Download, Check, Code2 } from "lucide-react";
import { Diagram } from "@/lib/diagrams";
import { CanvasSettings, Point, RelationKind, RELATIONS, cleanSource, readCanvas, relationInfo, writeCanvas } from "@/lib/canvas";
import { CanvasModel, applyCanvas, measureClasses, exportCanvas } from "@/lib/svg-canvas";
import { classSnippet, classMembers, classNames, duplicateClass, removeClass, setClassMembers } from "@/lib/class-actions";
import CanvasMenu, { MenuAction } from "./canvas-menu";
import Modal from "./modal";
import { useAppTheme } from "./theme-picker";

let renderQueue: Promise<unknown> = Promise.resolve();
let renderNumber = 0;
export type SvgResult = { svg: string; width: number; height: number };
type Drag = { kind: "node" | "pan"; name?: string; x: number; y: number; start: Point; moved: boolean };

export default function DiagramPreview({ diagram, onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, selectedClass, onSelectionChange, inspectorOpen = false }: {
  diagram: Diagram; onRendered: (result: SvgResult | null) => void; onClassClick: (name: string) => void;
  onSettingsChange: (settings: CanvasSettings) => void;
  onConnect: (from: string, to: string, kind: RelationKind, positions: Record<string, Point>) => void;
  onGuide: (kind: string) => void;
  onSourceChange?: (source: string) => void;
  selectedClass?: string;
  onSelectionChange?: (name: string) => void;
  inspectorOpen?: boolean;
}) {
  const { isDark } = useAppTheme();
  const dark = diagram.theme === "dark" || (diagram.theme === "studio" && isDark);
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
  const [localSelection, setLocalSelection] = useState("");
  const selectedNode = selectedClass ?? localSelection;
  const drag = useRef<Drag | null>(null);
  const fittedId = useRef("");
  const renderedId = useRef("");
  const [context, setContext] = useState<{ x: number; y: number; name: string } | null>(null);
  const closeContext = useCallback(() => setContext(null), []);
  const [classForm, setClassForm] = useState<{ name: string; body: string; editing: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const pendingLink = useRef<{ from: string; to: string } | null>(null);
  const pendingNode = useRef("");
  const content = useMemo(() => cleanSource(diagram.source), [diagram.source]);
  const settings = useMemo(() => readCanvas(diagram.source), [diagram.source]);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const callbacks = useRef({ onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, onSelectionChange });
  callbacks.current = { onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, onSelectionChange };
  const isClass = diagram.type === "class";
  const relation = relationInfo(relationKind);
  const root = () => art.current?.querySelector<SVGSVGElement>("svg") || null;

  const fit = useCallback((readable = false) => {
    const el = viewport.current, svg = art.current?.querySelector<SVGSVGElement>("svg");
    if (!el || !svg) return;
    const box = svg.getBBox(), view = svg.viewBox.baseVal;
    const fitted = Math.min(1.15, Math.max(.1, Math.min((el.clientWidth - 65) / (box.width + 50), (el.clientHeight - 85) / (box.height + 50))));
    const scale = readable ? Math.max(.8, fitted) : fitted;
    setZoom(scale);
    setPan({ x: (view.x + view.width / 2 - box.x - box.width / 2) * scale, y: readable && scale > fitted ? (view.y + view.height / 2 - box.y) * scale - el.clientHeight / 2 + 48 : (view.y + view.height / 2 - box.y - box.height / 2) * scale });
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
          if (isClass) await document.fonts.load("14px 'IBM Plex Mono'");
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: dark ? "dark" : "base",
            fontFamily: "Source Sans 3 Variable, sans-serif", suppressErrorRendering: true,
            themeCSS: isClass ? ".members-group text, .methods-group text { font-family: 'IBM Plex Mono', monospace; font-size: 14px; } .label-group text { font-family: 'Source Sans 3 Variable', sans-serif; font-size: 17px; font-weight: 650; } .divider path { stroke-width: 1px; }" : "",
            themeVariables: dark ? { fontSize: "15px", primaryColor: "#243b47", primaryTextColor: "#e4edf1", primaryBorderColor: "#84b6c4", lineColor: "#96b5c0", mainBkg: "#243b47" } : {
              fontSize: "15px", primaryColor: diagram.theme === "neutral" ? "#f4f6f8" : "#edf5f7",
              primaryTextColor: "#243c48", primaryBorderColor: "#759ca9", lineColor: "#5d7b88",
              secondaryColor: "#eff2f8", tertiaryColor: "#f7f2e6", background: "#ffffff",
              mainBkg: diagram.theme === "neutral" ? "#f4f6f8" : "#edf5f7", nodeBorder: "#759ca9", clusterBkg: "#f4f7f9",
              actorBkg: "#edf5f7", actorBorder: "#759ca9", actorTextColor: "#243c48",
              signalColor: "#5d7b88", signalTextColor: "#243c48", labelBoxBkgColor: "#f4f7f9",
            },
            flowchart: { htmlLabels: false, curve: "basis", useMaxWidth: false },
            class: { useMaxWidth: false, padding: 8, dividerMargin: 6 }, sequence: { useMaxWidth: false },
            // Mermaid's unified class renderer reads spacing from state config.
            state: isClass ? { nodeSpacing: 35, rankSpacing: 45, padding: 8 } : {},
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
  }, [content, diagram.theme, dark, diagram.id, isClass]);

  useEffect(() => {
    const svg = root();
    if (!svg || busy || error || renderedId.current !== diagram.id) return;
    if (isClass) positions.current = applyCanvas(svg, model.current, settings, dark);
    else {
      svg.querySelectorAll<SVGPathElement>(".edgePaths path,.messageLine0,.messageLine1").forEach(path => { path.style.strokeWidth = String(settings.lineWidth); });
    }
    callbacks.current.onRendered(exportCanvas(svg));
    if (pendingNode.current && model.current.nodes.some(node => node.name === pendingNode.current)) { pendingNode.current = ""; fit(true); }
    const link = pendingLink.current;
    if (link) {
      const edge = model.current.edges.findLast(edge => edge.start === link.from && edge.end === link.to);
      const path = edge && Array.from(svg.querySelectorAll<SVGPathElement>(".edgePaths path")).find(path => path.dataset.id === edge.id);
      if (path) {
        pendingLink.current = null; setSelectedNode(link.to);
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const length = path.getTotalLength();
          const frames = getComputedStyle(path).strokeDasharray === "none"
            ? [{ strokeDasharray: `${length}px`, strokeDashoffset: `${length}px` }, { strokeDasharray: `${length}px`, strokeDashoffset: "0px" }]
            : [{ opacity: .2 }, { opacity: 1 }];
          path.animate(frames, { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
        }
      }
    }
    if (fittedId.current !== diagram.id) { fittedId.current = diagram.id; fit(true); }
  }, [result, settings, busy, error, diagram.theme, dark, diagram.id, fit, isClass]);

  useEffect(() => {
    setMode("move"); setOrigin(""); setSelectedNode(""); setContext(null); setClassForm(null); setDeleteTarget(""); setFeedback(""); pendingLink.current = null; pendingNode.current = "";
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
    const observer = new ResizeObserver(() => { if (root()) fit(true); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [fit]);

  function setSelectedNode(name: string) { setLocalSelection(name); callbacks.current.onSelectionChange?.(name); }
  function selectClass(name: string) {
    if (busy || error) return;
    setSelectedNode(name);
    if (mode === "connect") {
      if (!origin) setOrigin(name);
      else {
        pendingLink.current = { from: origin, to: name };
        callbacks.current.onConnect(origin, name, relationKind, positions.current);
        setOrigin("");
      }
    }
  }
  function placeClass(name: string, point: Point) {
    const svg = root();
    if (!svg) return;
    const next = { ...settingsRef.current, positions: { ...positions.current, [name]: point } };
    positions.current = applyCanvas(svg, model.current, next, dark);
  }
  function changeSettings(patch: Partial<CanvasSettings>) { callbacks.current.onSettingsChange({ ...settingsRef.current, ...patch }); }
  function changeZoom(delta: number) { setZoom(z => Math.min(4, Math.max(.1, Math.round((z + delta) * 100) / 100))); }

  function openClass(name = "") {
    if (!callbacks.current.onSourceChange) { if (name) callbacks.current.onClassClick(name); return; }
    setFormError("");
    try { setClassForm({ name, body: name ? classMembers(diagram.source, name) : "+String nombre\n+ejecutar() void", editing: !!name }); }
    catch (e) { setFeedback((e as Error).message); }
  }
  function saveClass() {
    if (!classForm || !callbacks.current.onSourceChange) return;
    try {
      if (!classForm.editing && [...classNames(diagram.source), ...model.current.nodes.map(node => node.name)].includes(classForm.name)) throw new Error("Ya existe una clase con ese nombre.");
      callbacks.current.onSourceChange(setClassMembers(diagram.source, classForm.name, classForm.body));
      if (!classForm.editing) pendingNode.current = classForm.name;
      setSelectedNode(classForm.name); setClassForm(null); setFeedback("Clase " + classForm.name + " guardada en el diagrama.");
    } catch (e) { setFormError((e as Error).message); }
  }
  function mutate(action: () => string) {
    try { callbacks.current.onSourceChange?.(action()); }
    catch (e) { setFeedback((e as Error).message); }
  }
  async function copySource(name = "") {
    try {
      const text = name ? classSnippet(diagram.source, name) : cleanSource(diagram.source);
      await navigator.clipboard.writeText(text); setFeedback(name ? "Código de " + name + " copiado." : "Código Mermaid copiado.");
    } catch { setFeedback("No se pudo copiar. Usá la opción de descargar Mermaid para conservar el código."); }
  }
  function downloadSource(svg = false) {
    const live = root(); if (svg && !live) return;
    const text = svg ? exportCanvas(live!).svg : diagram.source;
    const url = URL.createObjectURL(new Blob([text], { type: svg ? "image/svg+xml" : "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = (diagram.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "diagrama") + (svg ? ".svg" : ".mmd"); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openContext(x: number, y: number, name = "") {
    if (name) setSelectedNode(name);
    setContext({ x, y, name });
  }
  function copyClass(name: string) {
    mutate(() => {
      const copy = duplicateClass(diagram.source, name, model.current.nodes.map(node => node.name));
      const position = positions.current[name];
      const next = position ? writeCanvas(copy.source, { ...readCanvas(copy.source), positions: { ...positions.current, [copy.name]: { x: Math.min(19000, position.x + 80), y: Math.min(19000, position.y + 80) } } }) : copy.source;
      pendingNode.current = copy.name; setSelectedNode(copy.name);
      setFeedback("Se creó " + copy.name + ". Sus relaciones se agregan por separado.");
      return next;
    });
  }
  function arrange() { changeSettings({ positions: {} }); requestAnimationFrame(() => requestAnimationFrame(() => fit())); }
  const actions: MenuAction[] = [];
  if (context?.name) {
    const name = context.name;
    if (onSourceChange) {
      actions.push({ label: "Editar atributos y métodos", icon: <Pencil size={16} />, run: () => openClass(name), disabled: busy || !!error });
      actions.push({ label: "Duplicar clase", icon: <Copy size={16} />, disabled: busy || !!error, run: () => copyClass(name) });
      actions.push({ label: "Conectar desde esta clase", icon: <Link2 size={16} />, disabled: busy || !!error, run: () => { setMode("connect"); setOrigin(name); } });
    }
    actions.push({ label: "Copiar código de la clase", icon: <Code2 size={16} />, run: () => void copySource(name) });
    if (onSourceChange) {
      actions.push({ label: "Restaurar posición automática", icon: <RotateCcw size={16} />, disabled: busy || !!error || !settings.positions[name], separator: true, run: () => { const positions = { ...settingsRef.current.positions }; delete positions[name]; changeSettings({ positions }); } });
      actions.push({ label: "Eliminar clase…", icon: <Trash2 size={16} />, disabled: busy || !!error, danger: true, run: () => { setFormError(""); setDeleteTarget(name); } });
    }
  } else {
    if (isClass && onSourceChange) {
      actions.push({ label: "Agregar clase", icon: <Plus size={16} />, run: () => openClass(), disabled: busy || !!error });
      actions.push({ label: "Ordenar clases automáticamente", icon: <LayoutGrid size={16} />, run: arrange, disabled: busy || !!error });
    }
    actions.push({ label: "Ajustar al lienzo", icon: <Scan size={16} />, run: () => fit(), disabled: !result || busy || !!error, separator: isClass && !!onSourceChange });
    actions.push({ label: "Ver al 100%", icon: <Scan size={16} />, run: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, disabled: !result });
    actions.push({ label: "Copiar código Mermaid", icon: <Code2 size={16} />, run: () => void copySource(), separator: true });
    actions.push({ label: "Descargar Mermaid", icon: <Download size={16} />, run: () => downloadSource() });
    actions.push({ label: "Descargar SVG", icon: <Download size={16} />, run: () => downloadSource(true), disabled: !result || busy || !!error });
    if (isClass) actions.push({ label: "Guía de relaciones UML", icon: <BookOpen size={16} />, run: () => callbacks.current.onGuide(relationKind), separator: true });
  }

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
        <button className="icon-btn canvas-help" title="Guía de relaciones UML" aria-label="Guía de relaciones UML" onClick={() => callbacks.current.onGuide(relationKind)}><BookOpen size={17} /></button>
        <span className="canvas-tool-spacer" />
        <button className="icon-btn canvas-arrange" title="Ordenar clases automáticamente" aria-label="Ordenar clases automáticamente" disabled={busy || !!error} onClick={arrange}><LayoutGrid size={17} /></button>
      </>}
      {!inspectorOpen && <details className="canvas-style">
        <summary aria-label="Ajustar flechas y etiquetas" title="Ajustar flechas y etiquetas"><SlidersHorizontal size={17} /></summary>
        <div className="style-popover">
          <label>Grosor de línea <output>{settings.lineWidth} px</output><input aria-label="Grosor de línea" type="range" min="1" max="6" step=".5" value={settings.lineWidth} onChange={e => changeSettings({ lineWidth: Number(e.target.value) })} /></label>
          {isClass && <label>Tamaño de punta <output>{Math.round(settings.arrowScale * 100)}%</output><input aria-label="Tamaño de punta" type="range" min="1" max="3" step=".1" value={settings.arrowScale} onChange={e => changeSettings({ arrowScale: Number(e.target.value) })} /></label>}
          {isClass && <label>Texto de relaciones <output>{settings.labelSize} px</output><input aria-label="Texto de relaciones" type="range" min="12" max="24" step="1" value={settings.labelSize} onChange={e => changeSettings({ labelSize: Number(e.target.value) })} /></label>}
        </div>
      </details>}
      <button className="icon-btn canvas-options" aria-label="Opciones del lienzo" title="Opciones del lienzo (clic derecho)" onClick={e => { const box = e.currentTarget.getBoundingClientRect(); openContext(box.right - 256, box.bottom + 8, model.current.nodes.some(node => node.name === selectedNode) ? selectedNode : ""); }}><MoreHorizontal size={19} /></button>
    </div>
    {isClass && mode === "connect" && <div className="connection-prompt" role="status"><Link2 size={14} /><span>{origin ? origin + " → " + relation.destination : relation.origin + " → " + relation.destination}</span><button className="icon-btn" title="Cancelar conexión" aria-label="Cancelar conexión" onClick={() => { setMode("move"); setOrigin(""); }}><X size={14} /></button></div>}
    <div className={"diagram-viewport " + (dark ? "canvas-dark " : "") + (mode === "connect" ? "connecting" : "")} ref={viewport} tabIndex={0} aria-label={"Lienzo de " + diagram.name}
      onFocusCapture={event => { const name = (event.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (name) setSelectedNode(name); }}
      onContextMenu={e => { e.preventDefault(); drag.current = null; const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); openContext(e.clientX || box.x + Math.min(box.width / 2, 180), e.clientY || box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || ""); }}
      onPointerDown={e => {
        if (e.button !== 0) return;
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
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (!d) return;
        if (!d.name) { if (!d.moved) setSelectedNode(""); return; }
        if (!d.moved) selectClass(d.name);
        else if (mode === "move") {
          callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
          const svg = root(); if (svg) callbacks.current.onRendered(exportCanvas(svg));
          const node = Array.from(svg?.querySelectorAll<SVGGElement>("[data-class]") || []).find(node => node.getAttribute("data-class") === d.name);
          const outline = node?.querySelector("g.outer-path > path");
          if (outline && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) outline.animate([{ strokeWidth: "4px" }, { strokeWidth: "2.5px" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      }}
      onPointerCancel={() => { drag.current = null; const svg = root(); if (svg && isClass) positions.current = applyCanvas(svg, model.current, settingsRef.current, dark); }}
      onDoubleClick={e => { const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (name && mode === "move" && !busy && !error) openClass(name); }}
      onKeyDown={e => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); openContext(box.x + Math.min(box.width / 2, 180), box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || ""); return; }
        if (e.key === "Escape") { setOrigin(""); setMode("move"); setSelectedNode(""); return; }
        const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (!name || busy || error) return;
        if (e.key === "Enter") { e.preventDefault(); if (mode === "connect") selectClass(name); else openClass(name); }
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
      {!busy && !error && <span className="canvas-caption">{diagram.name}<span className="canvas-context-hint">Arrastrá el lienzo para moverte · clic derecho para ver acciones</span></span>}
      {feedback && <div className="canvas-feedback" role="status"><span>{feedback}</span><button className="icon-btn" aria-label="Cerrar mensaje del lienzo" onClick={() => setFeedback("")}><X size={14} /></button></div>}
      <div className="zoom-toolbar" onPointerDown={e => e.stopPropagation()}>
        <button className="icon-btn" aria-label="Alejar" title="Alejar" onClick={() => changeZoom(-.1)}><Minus size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" aria-label="Acercar" title="Acercar" onClick={() => changeZoom(.1)}><Plus size={16} /></button>
        <i /><button className="icon-btn" aria-label="Ajustar al lienzo" title="Ajustar al lienzo" onClick={() => fit()}><Scan size={17} /></button>
      </div>
    </div>
    {context && <CanvasMenu x={context.x} y={context.y} title={context.name || "Opciones del lienzo"} actions={actions} onClose={closeContext} dark={dark} container={viewport.current?.closest("dialog") || undefined} />}
    {classForm && <Modal title={classForm.editing ? "Editar clase" : "Agregar clase"} onClose={() => setClassForm(null)}><form onSubmit={e => { e.preventDefault(); saveClass(); }}><div className="modal-body">
      <label>Nombre<input required autoFocus maxLength={120} disabled={classForm.editing} value={classForm.name} placeholder="Por ejemplo: Cliente" onChange={e => setClassForm({ ...classForm, name: e.target.value })} /></label>
      <label>Atributos y métodos<textarea rows={8} className="mono" value={classForm.body} onChange={e => setClassForm({ ...classForm, body: e.target.value })} /></label>
      <div className="visibility-key"><code>+</code> Público <code>-</code> Privado <code>#</code> Protegido</div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setClassForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{classForm.editing ? "Aplicar cambios" : "Agregar clase"}</button></div></form></Modal>}
    {deleteTarget && <Modal title="Eliminar clase" onClose={() => setDeleteTarget("")}><div className="modal-body"><p>Se quitará <strong>{deleteTarget}</strong> y sus relaciones del diagrama.</p><p>Podés recuperar este cambio con Deshacer en el editor.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setDeleteTarget("")}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(removeClass(diagram.source, deleteTarget)); setDeleteTarget(""); setSelectedNode(""); setFeedback("Clase eliminada. Podés recuperar el cambio con Deshacer."); } catch(e) { setFormError((e as Error).message); } }}><Trash2 size={16} />Eliminar clase</button></div></Modal>}
  </>;
}
