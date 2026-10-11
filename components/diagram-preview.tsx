"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan, LoaderCircle, AlertCircle, Move, Link2, BookOpen, SlidersHorizontal, LayoutGrid, X, MoreHorizontal, Pencil, Copy, Trash2, RotateCcw, Download, Check, Code2 } from "lucide-react";
import { Diagram } from "@/lib/diagrams";
import { CanvasSettings, Point, RelationKind, RELATIONS, cleanSource, readCanvas, relationInfo, writeCanvas, type EdgeRoute, type EdgeAnchor } from "@/lib/canvas";
import { CanvasModel, applyCanvas, measureClasses, exportCanvas, edgeControls } from "@/lib/svg-canvas";
import { DEFAULT_ROUTE, nearestAnchor, outsidePoint, relationRouteKey } from "@/lib/edge-routing";
import { classSnippet, classMembers, classNames, duplicateClass, removeClass, setClassMembers } from "@/lib/class-actions";
import CanvasMenu, { MenuAction } from "./canvas-menu";
import Modal from "./modal";
import { useAppTheme } from "./theme-picker";
import { sourceRelations, updateRelation, removeRelation, type SourceRelation } from "@/lib/relation-actions";
import { NODE_KINDS, VISUAL_RELATIONS, visualNodes, visualRelations, setVisualNode, addVisualRelation, removeVisualNode, updateVisualRelation, removeVisualRelation, type VisualNode } from "@/lib/visual-diagrams";
import { prepareVisualSource, measureVisualNodes, sequenceModel, reorderSequence } from "@/lib/visual-svg";

let renderQueue: Promise<unknown> = Promise.resolve();

export type SvgResult = { svg: string; width: number; height: number };
type Drag = { kind: "node" | "pan" | "edge"; name?: string; x: number; y: number; start: Point; moved: boolean; edgeId?: string; handle?: string; next?: CanvasSettings };

export default function DiagramPreview({ diagram, onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, selectedClass, onSelectionChange, inspectorOpen = false, insertRequest }: {
  diagram: Diagram; onRendered: (result: SvgResult | null) => void; onClassClick: (name: string) => void;
  onSettingsChange: (settings: CanvasSettings) => void;
  onConnect: (from: string, to: string, kind: RelationKind, positions: Record<string, Point>) => void;
  onGuide: (kind: string) => void;
  onSourceChange?: (source: string) => void;
  selectedClass?: string;
  onSelectionChange?: (name: string) => void;
  inspectorOpen?: boolean;
  insertRequest?: { serial: number; kind: string };
}) {
  const { isDark } = useAppTheme();
  const dark = diagram.theme === "dark" || (diagram.theme === "studio" && isDark);
  const viewport = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const model = useRef<CanvasModel>({ nodes: [], edges: [] });
  const relationSources = useRef(new Map<string, SourceRelation>());
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
  const [selectedEdge, setSelectedEdge] = useState("");
  const [hoveredEdge, setHoveredEdge] = useState("");
  const [edgeForm, setEdgeForm] = useState<(SourceRelation & { edgeId: string }) | null>(null);
  const [edgeDelete, setEdgeDelete] = useState<SourceRelation | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointerNode = useRef("");
  const fittedId = useRef("");
  const renderedId = useRef("");
  const [context, setContext] = useState<{ x: number; y: number; name: string } | null>(null);
  const closeContext = useCallback(() => setContext(null), []);
  const [classForm, setClassForm] = useState<{ name: string; body: string; editing: boolean } | null>(null);
  const [nodeForm, setNodeForm] = useState<(VisualNode & { editing: boolean; point?: Point }) | null>(null);
  const [connectionForm, setConnectionForm] = useState<{ from: string; to: string; kind: string; label: string } | null>(null);
  const [visualKind, setVisualKind] = useState("");
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
  const isSequence = diagram.type === "sequence";
  const nodesInSource = useMemo(() => visualNodes(diagram.source, diagram.type), [diagram.source, diagram.type]);
  const availableRelations = isClass ? RELATIONS : VISUAL_RELATIONS[diagram.type] || [];
  const activeKind = isClass ? relationKind : visualKind || availableRelations[0]?.value || "-->";
  const selection = isClass ? selectedNode : localSelection;
  const root = () => art.current?.querySelector<SVGSVGElement>("svg") || null;
  useEffect(() => {
    if (!insertRequest || !onSourceChange || isClass) return;
    setFormError("");
    if (["message", "transition", "flow", "erlink"].includes(insertRequest.kind)) {
      if (!nodesInSource.length) { setFeedback("Primero agregá los elementos que querés conectar."); return; }
      setConnectionForm({ from: nodesInSource[0].id, to: nodesInSource[1]?.id || nodesInSource[0].id, kind: activeKind, label: "" });
    } else {
      const kind = ({ node: "activity", decisión: "decision" } as Record<string,string>)[insertRequest.kind] || insertRequest.kind;
      setNodeForm({ id: "", label: "", kind, body: diagram.type === "er" ? "int id PK\nstring nombre" : "", editing: false });
    }
    // A request is a gesture, not a persistent editing mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.serial]);

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
          const renderedSource = prepareVisualSource(content, diagram.type);
          // Unique across mounted previews and hot module reloads: Mermaid looks
          // up its SVG by ID while drawing, including outside the staging node.
          const { svg } = await mermaid.render("uml" + crypto.randomUUID().replaceAll("-", ""), renderedSource, staging);
          if (cancelled) return;
          staging.innerHTML = svg;
          const live = staging.querySelector<SVGSVGElement>("svg")!;
          const box = live.viewBox.baseVal;
          const width = box.width || 800, height = box.height || 600;
          live.setAttribute("width", String(width)); live.setAttribute("height", String(height));
          live.style.maxWidth = "none"; live.style.overflow = "visible";
          live.setAttribute("role", "img"); live.setAttribute("aria-label", diagram.name);
          const parsed = await mermaid.mermaidAPI.getDiagramFromText(renderedSource);
          const db = parsed.db as unknown as { getData?: () => { nodes: { id: string; domId?: string; label?: string; isGroup?: boolean }[]; edges: CanvasModel["edges"] } };
          const data = db.getData?.();
          const nodes = isClass ? measureClasses(live) : measureVisualNodes(live, data?.nodes || [], content, diagram.type);
          let edges: CanvasModel["edges"] = [];
          if (nodes.length) {
            edges = isSequence ? sequenceModel(live, content) : (data?.edges || []).map(edge => {
              if (diagram.type === "er") { edge.start = edge.start?.match(/^entity-(.*)-\d+$/)?.[1] || edge.start; edge.end = edge.end?.match(/^entity-(.*)-\d+$/)?.[1] || edge.end; }
              const path = Array.from(live.querySelectorAll<SVGPathElement>(".edgePaths path")).find(el => el.dataset.id === edge.id);
              const label = Array.from(live.querySelectorAll<SVGGElement>(".edgeLabel")).find(el => el.querySelector("[data-id]")?.getAttribute("data-id") === edge.id);
              const matrix = label?.transform.baseVal.consolidate()?.matrix;
              let points: Point[] | undefined;
              try { points = JSON.parse(atob(path?.getAttribute("data-points") || "")); } catch { /* Some Mermaid edges have no layout points. */ }
              return { ...edge, points, labelPosition: matrix ? { x: matrix.e, y: matrix.f } : undefined };
            });
          }
          model.current = { nodes, edges };
          const relations: SourceRelation[] = isClass ? sourceRelations(content) : visualRelations(content, diagram.type).map(r => ({ ...r, raw: content.split("\n")[r.line], fromCard: "", toCard: "", indent: "", comment: "" }));
          const used = new Set<number>(), counts = new Map<string, number>();
          relationSources.current = new Map(edges.flatMap(edge => {
            const relation = relations.find(r => !used.has(r.line) && r.from === edge.start && r.to === edge.end);
            if (!relation) return [];
            const pair = JSON.stringify([relation.from, relation.to]), occurrence = counts.get(pair) || 0;
            counts.set(pair, occurrence + 1); edge.routeKey = relationRouteKey(relation.from, relation.to, occurrence);
            used.add(relation.line); return [[edge.id, relation] as const];
          }));
          renderedId.current = diagram.id;
          setResult({ svg: new XMLSerializer().serializeToString(live), width, height });
          setBusy(false);
        } catch (e) {
          if (!cancelled) { setError(e instanceof Error ? e.message : "Revisa la sintaxis del diagrama."); setBusy(false); }
        } finally { staging.remove(); }
      });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [content, diagram.theme, dark, diagram.id, diagram.type, isClass, isSequence]);

  useEffect(() => {
    const svg = root();
    if (!svg || busy || error || renderedId.current !== diagram.id) return;
    if (!isSequence) positions.current = applyCanvas(svg, model.current, settings, dark);
    else {
      positions.current = Object.fromEntries(model.current.nodes.map(n => [n.name, { x: n.x, y: n.y }]));
      svg.querySelectorAll<SVGGElement>('[data-class]').forEach(node => { node.setAttribute("tabindex", "0"); node.setAttribute("role", "button"); node.setAttribute("aria-label", "Participante " + node.getAttribute("data-class")); });
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
  }, [result, settings, busy, error, diagram.theme, dark, diagram.id, fit, isClass, isSequence]);

  useEffect(() => {
    setMode("move"); setOrigin(""); setSelectedNode(""); setSelectedEdge(""); setHoveredEdge(""); setEdgeForm(null); setEdgeDelete(null); setContext(null); setClassForm(null); setNodeForm(null); setConnectionForm(null); setVisualKind(""); setDeleteTarget(""); setFeedback(""); pendingLink.current = null; pendingNode.current = "";
  }, [diagram.id]);
  useEffect(() => {
    const svg = root();
    svg?.querySelectorAll("[data-class]").forEach(node => {
      node.classList.toggle("connection-origin", node.getAttribute("data-class") === origin);
      node.classList.toggle("class-selected", node.getAttribute("data-class") === selection);
    });
  }, [origin, selection, result]);
  useEffect(() => {
    const svg = root();
    if (svg && !busy && !error) edgeControls(svg, model.current, settings, selectedEdge, zoom, !!onSourceChange);
    root()?.querySelectorAll<SVGElement>("[data-edge-id]").forEach(element => {
      const id = element.getAttribute("data-edge-id");
      element.classList.toggle("edge-selected", id === selectedEdge);
      element.classList.toggle("edge-hovered", id === hoveredEdge);
      if (element.getAttribute("role") === "button") element.setAttribute("aria-pressed", String(id === selectedEdge));
    });
  }, [selectedEdge, hoveredEdge, result, settings, zoom, busy, error, onSourceChange]);
  useEffect(() => { setSelectedEdge(""); setHoveredEdge(""); }, [content]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(() => { if (root()) fit(true); });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [fit]);

  function setSelectedNode(name: string) { if (name) setSelectedEdge(""); setLocalSelection(name); callbacks.current.onSelectionChange?.(name); }
  function selectEdge(id: string) {
    if (busy || error) return;
    setSelectedNode(""); setSelectedEdge(id); setOrigin(""); setMode("move"); setContext(null);
  }
  function editEdge(id: string) {
    const relation = relationSources.current.get(id);
    if (!relation || !callbacks.current.onSourceChange) return;
    setFormError(""); setEdgeForm({ ...relation, edgeId: id });
  }
  const chosenEdge = model.current.edges.find(edge => edge.id === selectedEdge);
  const chosenRelation = relationSources.current.get(selectedEdge);
  const chosenRoute = chosenEdge?.routeKey ? settings.routes[chosenEdge.routeKey] || DEFAULT_ROUTE : DEFAULT_ROUTE;
  function changeRoute(patch: Partial<EdgeRoute>) {
    if (!chosenEdge?.routeKey || !callbacks.current.onSourceChange) return;
    changeSettings({ routes: { ...settingsRef.current.routes, [chosenEdge.routeKey]: { ...chosenRoute, ...patch } } });
  }
  function resetRoute() {
    if (!chosenEdge?.routeKey) return;
    const routes = { ...settingsRef.current.routes }; delete routes[chosenEdge.routeKey]; changeSettings({ routes });
  }
  function clientPoint(x: number, y: number): Point {
    const matrix = root()?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: Math.max(-19000, Math.min(19000, point.x)), y: Math.max(-19000, Math.min(19000, point.y)) };
  }
  function moveEdgeHandle(edgeId: string, handle: string, point: Point, current = settingsRef.current): CanvasSettings {
    point = { x: Math.max(-19000, Math.min(19000, point.x)), y: Math.max(-19000, Math.min(19000, point.y)) };
    const edge = model.current.edges.find(edge => edge.id === edgeId);
    if (!edge?.routeKey) return current;
    const route = current.routes[edge.routeKey] || DEFAULT_ROUTE;
    const next: EdgeRoute = { ...route, points: [...route.points] };
    if (handle === "from" || handle === "to") {
      const node = model.current.nodes.find(node => node.name === (handle === "from" ? edge.start : edge.end));
      if (node) next[handle] = nearestAnchor({ ...node, ...positions.current[node.name] }, point);
    } else {
      const nodes = model.current.nodes.filter(n => n.name === edge.start || n.name === edge.end).map(n => ({ ...n, ...positions.current[n.name] }));
      point = outsidePoint(point, nodes);
      if (handle === "new") { if (next.points.length < 20) next.points.push(point); }
      else if (next.points[Number(handle)]) next.points[Number(handle)] = point;
    }
    return { ...current, positions: { ...positions.current }, routes: { ...current.routes, [edge.routeKey]: next } };
  }
  function showSettings(next: CanvasSettings, edgeId = selectedEdge) {
    const svg = root(); if (!svg) return;
    positions.current = applyCanvas(svg, model.current, next, dark);
    edgeControls(svg, model.current, next, edgeId, zoom, !!callbacks.current.onSourceChange);
    svg.querySelectorAll<SVGElement>("[data-edge-id]").forEach(el => el.classList.toggle("edge-selected", el.getAttribute("data-edge-id") === edgeId));
  }
  function addBend() {
    if (!chosenEdge || chosenRoute.points.length >= 20) return;
    const path = Array.from(root()?.querySelectorAll<SVGPathElement>(".studio-edge-line") || []).find(p => p.dataset.id === selectedEdge);
    if (!path) return;
    const point = path.getPointAtLength(path.getTotalLength() * (chosenRoute.points.length ? .65 : .5));
    changeRoute({ points: [...chosenRoute.points, { x: point.x, y: point.y }] });
  }
  function selectClass(name: string) {
    if (busy || error) return;
    setSelectedNode(name);
    if (mode === "connect") {
      if (!origin) setOrigin(name);
      else {
        if (!isClass) { setConnectionForm({ from: origin, to: name, kind: activeKind, label: "" }); setFormError(""); setMode("move"); setOrigin(""); return; }
        pendingLink.current = { from: origin, to: name };
        callbacks.current.onConnect(origin, name, relationKind, positions.current);
        setOrigin("");
      }
    }
  }
  function placeClass(name: string, point: Point) {
    const svg = root();
    if (!svg) return;
    if (isSequence) { const geometry = model.current.nodes.find(n => n.name === name); const el = geometry && svg.getElementById(geometry.domId); if (el) el.setAttribute("transform", `translate(${point.x - geometry.x},0) ${geometry.transform}`); return; }
    const next = { ...settingsRef.current, positions: { ...positions.current, [name]: point } };
    positions.current = applyCanvas(svg, model.current, next, dark);
  }
  function changeSettings(patch: Partial<CanvasSettings>) { callbacks.current.onSettingsChange({ ...settingsRef.current, ...patch }); }
  function changeZoom(delta: number) { setZoom(z => Math.min(4, Math.max(.1, Math.round((z + delta) * 100) / 100))); }

  function openClass(name = "") {
    if (!callbacks.current.onSourceChange) { if (name) callbacks.current.onClassClick(name); return; }
    setFormError("");
    if (!isClass) { const node = nodesInSource.find(n => n.id === name); setNodeForm(node ? { ...node, editing: true } : { id: "", label: "", kind: NODE_KINDS[diagram.type][0].value, body: diagram.type === "er" ? "int id PK\nstring nombre" : "", editing: false, point: context ? clientPoint(context.x, context.y) : undefined }); return; }
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
      const text = name && isClass ? classSnippet(diagram.source, name) : cleanSource(diagram.source);
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
    if (!isClass) { const original = nodesInSource.find(n => n.id === name); if (!original) return; let id = name + "_copia", count = 2; while (nodesInSource.some(n => n.id === id)) id = name + "_copia" + count++; mutate(() => setVisualNode(diagram.source, diagram.type, { ...original, id }, true)); pendingNode.current = id; return; }
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
      actions.push({ label: isClass ? "Editar atributos y métodos" : "Editar elemento", icon: <Pencil size={16} />, run: () => openClass(name), disabled: busy || !!error });
      actions.push({ label: isClass ? "Duplicar clase" : "Duplicar elemento", icon: <Copy size={16} />, disabled: busy || !!error, run: () => copyClass(name) });
      actions.push({ label: "Conectar desde este elemento", icon: <Link2 size={16} />, disabled: busy || !!error, run: () => { setMode("connect"); setOrigin(name); } });
    }
    actions.push({ label: "Copiar código del elemento", icon: <Code2 size={16} />, run: () => void copySource(name) });
    if (onSourceChange) {
      actions.push({ label: "Restaurar posición automática", icon: <RotateCcw size={16} />, disabled: busy || !!error || !settings.positions[name], separator: true, run: () => { const positions = { ...settingsRef.current.positions }; delete positions[name]; changeSettings({ positions }); } });
      actions.push({ label: isClass ? "Eliminar clase…" : "Eliminar elemento…", icon: <Trash2 size={16} />, disabled: busy || !!error, danger: true, run: () => { setFormError(""); setDeleteTarget(name); } });
    }
  } else {
    if (onSourceChange) {
      actions.push({ label: isClass ? "Agregar clase" : "Agregar elemento", icon: <Plus size={16} />, run: () => openClass(), disabled: busy });
      actions.push({ label: "Ordenar automáticamente", icon: <LayoutGrid size={16} />, run: arrange, disabled: busy || !!error || isSequence });
      if (!isClass) actions.push({ label: isSequence ? "Agregar mensaje" : "Agregar conexión", icon: <Link2 size={16} />, disabled: nodesInSource.length < 1 || busy || !!error, run: () => { setFormError(""); setConnectionForm({ from: nodesInSource[0]?.id || "", to: nodesInSource[1]?.id || nodesInSource[0]?.id || "", kind: activeKind, label: "" }); } });
    }
    actions.push({ label: "Ajustar al lienzo", icon: <Scan size={16} />, run: () => fit(), disabled: !result || busy || !!error, separator: !!onSourceChange });
    actions.push({ label: "Ver al 100%", icon: <Scan size={16} />, run: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, disabled: !result });
    actions.push({ label: "Copiar código Mermaid", icon: <Code2 size={16} />, run: () => void copySource(), separator: true });
    actions.push({ label: "Descargar Mermaid", icon: <Download size={16} />, run: () => downloadSource() });
    actions.push({ label: "Descargar SVG", icon: <Download size={16} />, run: () => downloadSource(true), disabled: !result || busy || !!error });
    if (isClass) actions.push({ label: "Guía de relaciones UML", icon: <BookOpen size={16} />, run: () => callbacks.current.onGuide(relationKind), separator: true });
  }

  return <>
    <div className="canvas-tools">
      {<>
        {onSourceChange && <button className="btn canvas-add" aria-label={isClass ? "Agregar clase" : "Agregar elemento"} disabled={busy} onClick={() => openClass()}><Plus size={16} /><span>{isClass ? "Clase" : "Elemento"}</span></button>}
        <div className="segmented canvas-mode">
          <button className={"icon-btn " + (mode === "move" ? "active" : "")} title="Mover elementos" aria-label="Mover elementos" onClick={() => { setMode("move"); setOrigin(""); }}><Move size={16} /></button>
          <button className={"icon-btn " + (mode === "connect" ? "active" : "")} title="Conectar elementos" aria-label="Conectar elementos" disabled={!onSourceChange || busy || !!error} onClick={() => { setMode("connect"); setOrigin(""); }}><Link2 size={16} /></button>
        </div>
        <select aria-label="Relación rápida" disabled={!onSourceChange || busy || !!error} value={activeKind} onChange={e => { if (isClass) setRelationKind(e.target.value as RelationKind); else setVisualKind(e.target.value); setMode("connect"); setOrigin(""); }}>
          {availableRelations.map(item => <option key={item.value} value={item.value}>{item.name}</option>)}
        </select>
        {isClass && <button className="icon-btn canvas-help" title="Guía de relaciones UML" aria-label="Guía de relaciones UML" onClick={() => callbacks.current.onGuide(relationKind)}><BookOpen size={17} /></button>}
        <span className="canvas-tool-spacer" />
        <button className="icon-btn canvas-arrange" title="Ordenar automáticamente" aria-label="Ordenar automáticamente" disabled={busy || !!error || isSequence || !onSourceChange} onClick={arrange}><LayoutGrid size={17} /></button>
      </>}
      {!inspectorOpen && <details className="canvas-style">
        <summary aria-label="Ajustar flechas y etiquetas" title="Ajustar flechas y etiquetas"><SlidersHorizontal size={17} /></summary>
        <div className="style-popover">
          <label>Grosor de línea <output>{settings.lineWidth} px</output><input aria-label="Grosor de línea" type="range" min="1" max="6" step=".5" value={settings.lineWidth} onChange={e => changeSettings({ lineWidth: Number(e.target.value) })} /></label>
          {isClass && <label>Tamaño de punta <output>{Math.round(settings.arrowScale * 100)}%</output><input aria-label="Tamaño de punta" type="range" min="1" max="3" step=".1" value={settings.arrowScale} onChange={e => changeSettings({ arrowScale: Number(e.target.value) })} /></label>}
          {isClass && <label>Texto de relaciones <output>{settings.labelSize} px</output><input aria-label="Texto de relaciones" type="range" min="12" max="24" step="1" value={settings.labelSize} onChange={e => changeSettings({ labelSize: Number(e.target.value) })} /></label>}
        </div>
      </details>}
      <button className="icon-btn canvas-options" aria-label="Opciones del lienzo" title="Opciones del lienzo (clic derecho)" onClick={e => { const box = e.currentTarget.getBoundingClientRect(); openContext(box.right - 256, box.bottom + 8, model.current.nodes.some(node => node.name === selection) ? selection : ""); }}><MoreHorizontal size={19} /></button>
    </div>
    {mode === "connect" && <div className="connection-prompt" role="status"><Link2 size={14} /><span>{origin ? origin + " → elegí el destino" : "Elegí el origen y después el destino"}</span><button className="icon-btn" title="Cancelar conexión" aria-label="Cancelar conexión" onClick={() => { setMode("move"); setOrigin(""); }}><X size={14} /></button></div>}
      {chosenEdge && !busy && !error && <div className="relation-selection" role="region" aria-label="Relación seleccionada" onPointerDown={e => e.stopPropagation()}>
        <Link2 size={16} /><div><strong>{chosenEdge.start} — {chosenEdge.end}</strong><span>{chosenRelation ? `${RELATIONS.find(r => r.value === chosenRelation.kind)?.name || chosenRelation.kind}${chosenRelation.label ? ` · ${chosenRelation.label}` : ""}` : "Relación Mermaid"}</span></div>
        {onSourceChange && <><button className="btn" disabled={!chosenRelation} onClick={() => editEdge(selectedEdge)} aria-label="Editar relación seleccionada"><Pencil size={15} /><span>Editar</span></button><button className="icon-btn" aria-label="Eliminar relación seleccionada" disabled={!chosenRelation} onClick={() => { setFormError(""); setEdgeDelete(chosenRelation || null); }}><Trash2 size={16} /></button></>}
        <button className="icon-btn" aria-label="Deseleccionar relación" onClick={() => setSelectedEdge("")}><X size={15} /></button>
        {onSourceChange && !isSequence && chosenEdge.routeKey && <div className="relation-routing">
          <label>Trazo<select aria-label="Forma de la conexión" value={settings.routes[chosenEdge.routeKey]?.shape || "automatic"} onChange={e => e.target.value === "automatic" ? resetRoute() : changeRoute({ shape: e.target.value as EdgeRoute["shape"] })}>
            <option value="automatic">Automático</option><option value="straight">Recta</option><option value="curved">Curva</option><option value="orthogonal">En ángulo</option>
          </select></label>
          <button className="btn" aria-label="Agregar punto de conexión" disabled={chosenRoute.points.length >= 20} onClick={addBend}><Plus size={14} />Punto</button>
          <button className="icon-btn" aria-label="Quitar último punto de conexión" title="Quitar último punto" disabled={!chosenRoute.points.length} onClick={() => changeRoute({ points: chosenRoute.points.slice(0, -1) })}><Minus size={15} /></button>
          <button className="icon-btn" aria-label="Restaurar recorrido automático" title="Restaurar recorrido automático" disabled={!settings.routes[chosenEdge.routeKey]} onClick={resetRoute}><RotateCcw size={15} /></button>
          <details className="edge-anchors"><summary>Extremos</summary><div className="edge-anchor-fields">
            {(["from", "to"] as const).map(end => <label key={end}>{end === "from" ? "Origen" : "Destino"}<select aria-label={`Lado de ${end === "from" ? "origen" : "destino"}`} value={chosenRoute[end]?.side || "automatic"} onChange={e => changeRoute({ [end]: e.target.value === "automatic" ? undefined : { side: e.target.value as EdgeAnchor["side"], offset: .5 } })}><option value="automatic">Automático</option><option value="top">Arriba</option><option value="right">Derecha</option><option value="bottom">Abajo</option><option value="left">Izquierda</option></select></label>)}
          </div></details>
          <span className="edge-route-hint">Arrastrá extremos y puntos. Supr quita un punto.</span>
        </div>}
      </div>}
    <div className={"diagram-viewport " + (dark ? "canvas-dark " : "") + (mode === "connect" ? "connecting" : "")} ref={viewport} tabIndex={0} aria-label={"Lienzo de " + diagram.name}
      onFocusCapture={event => { const name = (event.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (name) setSelectedNode(name); }}
      onContextMenu={e => { e.preventDefault(); drag.current = null; const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id"); if (edgeId) { selectEdge(edgeId); return; } const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); openContext(e.clientX || box.x + Math.min(box.width / 2, 180), e.clientY || box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || ""); }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        pointerNode.current = (e.target as Element).closest("[data-class]")?.getAttribute("data-class") || "";
        if ((e.target as Element).closest("button,.error-panel")) return;
        const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id");
        const handle = (e.target as Element).closest("[data-handle]");
        if (edgeId && handle && onSourceChange && !busy && !error) {
          e.preventDefault();
          drag.current = { kind: "edge", edgeId, handle: handle.getAttribute("data-handle")!, x: e.clientX, y: e.clientY, start: clientPoint(e.clientX, e.clientY), moved: false };
          e.currentTarget.setPointerCapture(e.pointerId); return;
        }
        if (edgeId) { e.preventDefault(); selectEdge(edgeId); Array.from(root()?.querySelectorAll<SVGElement>(".studio-edge-target") || []).find(el => el.getAttribute("data-edge-id") === edgeId)?.focus({ preventScroll: true }); return; }
        const node = (e.target as Element).closest("[data-class]");
        const name = node?.getAttribute("data-class");
        if (name && onSourceChange && !busy && !error) {
          setSelectedNode(name);
          drag.current = { kind: "node", name, x: e.clientX, y: e.clientY, start: positions.current[name] || { x: 0, y: 0 }, moved: false };
        } else drag.current = { kind: "pan", x: e.clientX, y: e.clientY, start: pan, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        if (!drag.current) { setHoveredEdge((e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id") || ""); return; }
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
        if (d.kind === "edge" && d.moved && d.edgeId && d.handle) {
          d.next = moveEdgeHandle(d.edgeId, d.handle, clientPoint(e.clientX, e.clientY)); showSettings(d.next, d.edgeId);
        }
        else if (d.kind === "pan") setPan({ x: d.start.x + dx, y: d.start.y + dy });
        else if (mode === "move" && d.moved && d.name) placeClass(d.name, { x: Math.max(-19000, Math.min(19000, d.start.x + dx / zoom)), y: Math.max(-19000, Math.min(19000, d.start.y + dy / zoom)) });
      }}
      onPointerUp={e => {
        const d = drag.current; drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (!d) return;
        if (d.kind === "edge") {
          if (d.moved && d.next) { callbacks.current.onSettingsChange(d.next); const svg = root(); if (svg) callbacks.current.onRendered(exportCanvas(svg)); }
          return;
        }
        if (!d.name) { if (!d.moved) { setSelectedNode(""); setSelectedEdge(""); } return; }
        if (!d.moved) selectClass(d.name);
        else if (mode === "move") {
          if (isSequence) { const x = d.start.x + (e.clientX - d.x) / zoom; const before = model.current.nodes.filter(n => n.name !== d.name).sort((a,b) => a.x - b.x).find(n => n.x > x)?.name; mutate(() => reorderSequence(diagram.source, d.name!, before)); return; }
          callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
          const svg = root(); if (svg) callbacks.current.onRendered(exportCanvas(svg));
          const node = Array.from(svg?.querySelectorAll<SVGGElement>("[data-class]") || []).find(node => node.getAttribute("data-class") === d.name);
          const outline = node?.querySelector("g.outer-path > path");
          if (outline && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) outline.animate([{ strokeWidth: "4px" }, { strokeWidth: "2.5px" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      }}
      onPointerCancel={() => { drag.current = null; if (!isSequence) showSettings(settingsRef.current); }}
      onPointerLeave={() => setHoveredEdge("")}
      onDoubleClick={e => { if ((e.target as Element).closest("[data-handle]")) return; const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id"); if (edgeId) { editEdge(edgeId); return; } const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class") || pointerNode.current; if (name && mode === "move" && !busy && !error && onSourceChange) openClass(name); }}
      onKeyDown={e => {
        const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id");
        const handle = (e.target as Element).closest<SVGElement>("[data-handle]");
        if (edgeId && handle && onSourceChange) {
          const key = handle.getAttribute("data-handle")!, step = e.shiftKey ? 20 : 5;
          const delta: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
          if (delta[e.key]) {
            e.preventDefault(); const x = Number(handle.dataset.x), y = Number(handle.dataset.y);
            const next = moveEdgeHandle(edgeId, key, { x: x + delta[e.key].x, y: y + delta[e.key].y });
            callbacks.current.onSettingsChange(next);
            requestAnimationFrame(() => Array.from(root()?.querySelectorAll<SVGElement>("[data-handle]") || []).find(el => el.dataset.handle === (key === "new" ? "0" : key))?.focus({ preventScroll: true }));
            return;
          }
          if ((e.key === "Delete" || e.key === "Backspace") && /^\d+$/.test(key)) { e.preventDefault(); changeRoute({ points: chosenRoute.points.filter((_, i) => i !== Number(key)) }); return; }
          if (key === "new" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); addBend(); return; }
        }
        if (edgeId && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectEdge(edgeId); return; }
        if (edgeId && e.key === "F2") { e.preventDefault(); editEdge(edgeId); return; }
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); openContext(box.x + Math.min(box.width / 2, 180), box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || ""); return; }
        if (e.key === "Escape") { setOrigin(""); setMode("move"); setSelectedNode(""); setSelectedEdge(""); return; }
        const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (!name || busy || error) return;
        if (e.key === "Enter") { e.preventDefault(); if (mode === "connect") selectClass(name); else openClass(name); }
        const vectors: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
        const delta = vectors[e.key]; if (delta && onSourceChange && !isSequence && positions.current[name]) {
          e.preventDefault(); const point = positions.current[name]; placeClass(name, { x: Math.max(-19000, Math.min(19000, point.x + delta.x)), y: Math.max(-19000, Math.min(19000, point.y + delta.y)) });
          callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
        }
      }}
      onWheel={e => { if (e.ctrlKey || e.metaKey) changeZoom(e.deltaY < 0 ? .1 : -.1); }}>
      {result && <div ref={art} className={"diagram-art " + (error ? "invalid-art" : "")}
        style={{ width: result.width, height: result.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, "--edge-emphasis-width": `${settings.lineWidth + 1.5}px` } as React.CSSProperties}
        dangerouslySetInnerHTML={markup} />}
      {busy && <div className="canvas-loading"><LoaderCircle size={16} className="spin" />Renderizando</div>}
      {error && <div className="error-panel" role="alert"><AlertCircle size={19} /><div><strong>Revisa la sintaxis</strong><pre>{error.slice(0, 1600)}</pre></div></div>}
      {!chosenEdge && !busy && !error && <span className="canvas-caption">{diagram.name}<span className="canvas-context-hint">{isSequence ? "Arrastrá participantes para reordenarlos · conectá origen y destino para crear mensajes" : "Arrastrá elementos · doble clic para editar · conectá origen y destino"}</span></span>}
      {feedback && <div className="canvas-feedback" role="status"><span>{feedback}</span><button className="icon-btn" aria-label="Cerrar mensaje del lienzo" onClick={() => setFeedback("")}><X size={14} /></button></div>}
      <div className="zoom-toolbar" onPointerDown={e => e.stopPropagation()}>
        <button className="icon-btn" aria-label="Alejar" title="Alejar" onClick={() => changeZoom(-.1)}><Minus size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" aria-label="Acercar" title="Acercar" onClick={() => changeZoom(.1)}><Plus size={16} /></button>
        <i /><button className="icon-btn" aria-label="Ajustar al lienzo" title="Ajustar al lienzo" onClick={() => fit()}><Scan size={17} /></button>
      </div>
    </div>
    {context && <CanvasMenu x={context.x} y={context.y} title={context.name || "Opciones del lienzo"} actions={actions} onClose={closeContext} dark={dark} container={viewport.current?.closest("dialog") || undefined} />}
    {edgeForm && <Modal title="Editar relación" onClose={() => setEdgeForm(null)}><form onSubmit={e => { e.preventDefault(); try { callbacks.current.onSourceChange?.(isClass ? updateRelation(diagram.source, edgeForm, edgeForm) : updateVisualRelation(diagram.source, diagram.type, edgeForm, edgeForm)); setEdgeForm(null); setSelectedEdge(""); setFeedback("Relación actualizada. Podés recuperar el cambio con Deshacer."); } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <p><strong>{edgeForm.from}</strong> — <strong>{edgeForm.to}</strong></p>
      <label>Tipo de relación<select value={edgeForm.kind} onChange={e => setEdgeForm({ ...edgeForm, kind: e.target.value })}>{!availableRelations.some(r => r.value === edgeForm.kind) && <option value={edgeForm.kind}>{edgeForm.kind} (actual)</option>}{availableRelations.map(r => <option key={r.value} value={r.value}>{r.name}</option>)}</select></label>
      <label>Etiqueta<input autoFocus maxLength={200} value={edgeForm.label} placeholder="Por ejemplo: realiza" onChange={e => setEdgeForm({ ...edgeForm, label: e.target.value })} /></label>
      {isClass && <div className="relation-cardinality"><label>Multiplicidad de {edgeForm.from}<input maxLength={30} placeholder="1" value={edgeForm.fromCard} onChange={e => setEdgeForm({ ...edgeForm, fromCard: e.target.value })} /></label><label>Multiplicidad de {edgeForm.to}<input maxLength={30} placeholder="0..*" value={edgeForm.toCard} onChange={e => setEdgeForm({ ...edgeForm, toCard: e.target.value })} /></label></div>}
      <p className="form-hint">Se conserva el código de las otras relaciones y la posición de los elementos.</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setEdgeForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />Aplicar cambios</button></div></form></Modal>}
    {edgeDelete && <Modal title="Eliminar relación" onClose={() => setEdgeDelete(null)}><div className="modal-body"><p>Se quitará la relación entre <strong>{edgeDelete.from}</strong> y <strong>{edgeDelete.to}</strong>. Los elementos se conservan.</p><p>Podés recuperarla con Deshacer.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setEdgeDelete(null)}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(isClass ? removeRelation(diagram.source, edgeDelete) : removeVisualRelation(diagram.source, diagram.type, edgeDelete)); setEdgeDelete(null); setSelectedEdge(""); setFeedback("Relación eliminada. Podés recuperarla con Deshacer."); } catch (error) { setFormError((error as Error).message); } }}><Trash2 size={16} />Eliminar relación</button></div></Modal>}
    {nodeForm && <Modal title={nodeForm.editing ? "Editar elemento" : "Agregar elemento"} onClose={() => setNodeForm(null)}><form onSubmit={e => { e.preventDefault(); try {
      let source = setVisualNode(diagram.source, diagram.type, nodeForm, !nodeForm.editing);
      if (!nodeForm.editing && nodeForm.point && !isSequence) source = writeCanvas(source, { ...readCanvas(source), positions: { ...settings.positions, [nodeForm.id]: nodeForm.point } });
      callbacks.current.onSourceChange?.(source); pendingNode.current = nodeForm.id; setSelectedNode(nodeForm.id); setNodeForm(null); setFeedback("Elemento guardado. Podés recuperar el cambio con Deshacer.");
    } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <label>Tipo de elemento<select aria-label="Tipo de elemento" value={nodeForm.kind} onChange={e => setNodeForm({ ...nodeForm, kind: e.target.value })}>{NODE_KINDS[diagram.type]?.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
      <label>Identificador<input required autoFocus disabled={nodeForm.editing} maxLength={100} value={nodeForm.id} placeholder="Por ejemplo: Usuario" onChange={e => setNodeForm({ ...nodeForm, id: e.target.value })} /></label>
      {diagram.type !== "er" && <label>Texto visible<input required maxLength={180} value={nodeForm.label} placeholder="Por ejemplo: Consultar pedidos" onChange={e => setNodeForm({ ...nodeForm, label: e.target.value })} /></label>}
      {diagram.type === "er" && <><label>Atributos<textarea aria-label="Atributos" rows={8} className="mono" value={nodeForm.body} onChange={e => setNodeForm({ ...nodeForm, body: e.target.value })} /></label><p className="form-hint">Un atributo por línea: tipo, nombre y clave opcional. Ejemplo: int id PK.</p></>}
      <p className="form-hint">El identificador conecta este elemento con el resto del diagrama. El código Mermaid se actualiza al guardar.</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setNodeForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{nodeForm.editing ? "Aplicar cambios" : "Agregar elemento"}</button></div></form></Modal>}
    {connectionForm && <Modal title={isSequence ? "Agregar mensaje" : "Agregar conexión"} onClose={() => setConnectionForm(null)}><form onSubmit={e => { e.preventDefault(); try {
      callbacks.current.onSourceChange?.(addVisualRelation(diagram.source, diagram.type, connectionForm.from, connectionForm.to, connectionForm.kind, connectionForm.label));
      pendingLink.current = { from: connectionForm.from, to: connectionForm.to }; setConnectionForm(null); setFeedback(isSequence ? "Mensaje agregado al final de la secuencia." : "Conexión agregada.");
    } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <div className="form-row">{(["from", "to"] as const).map(end => <label key={end}>{end === "from" ? "Origen" : "Destino"}<select aria-label={end === "from" ? "Origen" : "Destino"} value={connectionForm[end]} onChange={e => setConnectionForm({ ...connectionForm, [end]: e.target.value })}>{nodesInSource.map(n => <option key={n.id} value={n.id}>{n.label} ({n.id})</option>)}{diagram.type === "state" && <option value="[*]">Inicio / fin [*]</option>}</select></label>)}</div>
      <label>Tipo de conexión<select value={connectionForm.kind} onChange={e => setConnectionForm({ ...connectionForm, kind: e.target.value })}>{availableRelations.map(r => <option key={r.value} value={r.value}>{r.name}</option>)}</select></label>
      <label>{isSequence ? "Texto del mensaje" : "Etiqueta"}<input autoFocus required={isSequence || diagram.type === "er"} maxLength={200} value={connectionForm.label} onChange={e => setConnectionForm({ ...connectionForm, label: e.target.value })} placeholder={isSequence ? "Por ejemplo: Solicitar pedido" : "Por ejemplo: Sí / No / confirmar"} /></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setConnectionForm(null)}>Cancelar</button><button className="btn primary"><Link2 size={16} />{isSequence ? "Agregar mensaje" : "Agregar conexión"}</button></div></form></Modal>}
    {classForm && <Modal title={classForm.editing ? "Editar clase" : "Agregar clase"} onClose={() => setClassForm(null)}><form onSubmit={e => { e.preventDefault(); saveClass(); }}><div className="modal-body">
      <label>Nombre<input required autoFocus maxLength={120} disabled={classForm.editing} value={classForm.name} placeholder="Por ejemplo: Cliente" onChange={e => setClassForm({ ...classForm, name: e.target.value })} /></label>
      <label>Atributos y métodos<textarea rows={8} className="mono" value={classForm.body} onChange={e => setClassForm({ ...classForm, body: e.target.value })} /></label>
      <div className="visibility-key"><code>+</code> Público <code>-</code> Privado <code>#</code> Protegido</div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setClassForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{classForm.editing ? "Aplicar cambios" : "Agregar clase"}</button></div></form></Modal>}
    {deleteTarget && <Modal title={isClass ? "Eliminar clase" : "Eliminar elemento"} onClose={() => setDeleteTarget("")}><div className="modal-body"><p>Se quitará <strong>{deleteTarget}</strong> y sus relaciones del diagrama.</p><p>Podés recuperar este cambio con Deshacer en el editor.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setDeleteTarget("")}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(isClass ? removeClass(diagram.source, deleteTarget) : removeVisualNode(diagram.source, diagram.type, deleteTarget)); setDeleteTarget(""); setSelectedNode(""); setFeedback((isClass ? "Clase eliminada." : "Elemento eliminado.") + " Podés recuperar el cambio con Deshacer."); } catch(e) { setFormError((e as Error).message); } }}><Trash2 size={16} />{isClass ? "Eliminar clase" : "Eliminar elemento"}</button></div></Modal>}
  </>;
}
