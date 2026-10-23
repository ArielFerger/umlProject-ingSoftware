"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan, LoaderCircle, AlertCircle, Hand, Link2, BookOpen, SlidersHorizontal, LayoutGrid, X, MoreHorizontal, Pencil, Copy, Trash2, RotateCcw, Download, Check, Code2, Eraser, Maximize2, Minimize2, MousePointer2, Undo2, Redo2, Grid2X2, Magnet, Keyboard, Shapes, Frame as FrameIcon, Type, StickyNote, Highlighter, ArrowLeftRight, Route, MoveDiagonal2, ImagePlus } from "lucide-react";
import { Diagram } from "@/lib/diagrams";
import { CanvasSettings, CanvasStroke, Point, RelationKind, RELATIONS, cleanSource, readCanvas, writeCanvas, type EdgeRoute, type EdgeAnchor } from "@/lib/canvas";
import { CanvasModel, applyCanvas, measureClasses, exportCanvas, lazyExportCanvas, edgeControls, scaleEdgeControls, renderStrokes, renderStrokeSelection } from "@/lib/svg-canvas";
import { simplify, straightLine, streamline, type InkPoint, type InkTool } from "@/lib/freehand";
import { SOURCE_LIMIT } from "@/lib/diagrams";
import CanvasNotes from "./canvas-notes";
import ColorButton from "./color-button";
import CanvasImages, { type ImageRequest } from "./canvas-images";
import { browserStorage } from "@/lib/studio-request";
import { DEFAULT_ROUTE, nearestAnchor, outsidePoint, relationRouteKey } from "@/lib/edge-routing";
import { classSnippet, classMembers, classNames, duplicateClass, removeClass, setClassMembers } from "@/lib/class-actions";
import CanvasFrames from "./canvas-frames";
import CanvasMenu, { MenuAction } from "./canvas-menu";
import Modal from "./modal";
import { useAppTheme } from "./theme-picker";
import { sourceRelations, updateRelation, removeRelation, invertRelation, type SourceRelation } from "@/lib/relation-actions";
import { NODE_KINDS, VISUAL_RELATIONS, visualNodes, visualRelations, setVisualNode, addVisualRelation, removeVisualNode, updateVisualRelation, removeVisualRelation, invertVisualRelation, type VisualNode } from "@/lib/visual-diagrams";
import { prepareVisualSource, measureVisualNodes, sequenceModel, reorderSequence } from "@/lib/visual-svg";
import { zoomAt, snapPoint, gridSpacing } from "@/lib/canvas-navigation";
import { chenLayout, derIdFromLabel, isDerRelationship } from "@/lib/der";
import { ACTIVITY_KINDS, isControlNode } from "@/lib/activity";

let renderQueue: Promise<unknown> = Promise.resolve();

/**
 * Finished renders (measured SVG plus geometry), keyed by everything that
 * affects them. Reopening a diagram or undoing to a state seen before skips
 * Mermaid, the slowest step. Entries are copied on use, never shared.
 */
type RenderSnapshot = { svg: string; width: number; height: number; center: Point; nodes: CanvasModel["nodes"]; edges: CanvasModel["edges"]; derKinds: Record<string, string> };
const renderCache = new Map<string, RenderSnapshot>();
const RENDER_CACHE_SIZE = 24;
function cachedRender(key: string) {
  const hit = renderCache.get(key);
  if (hit) { renderCache.delete(key); renderCache.set(key, hit); }
  return hit;
}
function storeRender(key: string, snapshot: RenderSnapshot) {
  renderCache.set(key, snapshot);
  while (renderCache.size > RENDER_CACHE_SIZE) renderCache.delete(renderCache.keys().next().value!);
}
// Start downloading the renderer as soon as a board mounts, not on its first render.
let mermaidModule: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidModule ??= import("mermaid"));

export type SvgResult = { svg: string; width: number; height: number; center?: Point };
type ToolMode = "move" | "hand" | "place" | "connect" | "draw" | "erase" | "text" | "sticky";
type Drag = {
  kind: "node" | "pan" | "edge" | "draw" | "erase" | "marquee" | "stroke" | "resize";
  name?: string;
  x: number;
  y: number;
  start: Point;
  moved: boolean;
  edgeId?: string;
  handle?: string;
  next?: CanvasSettings;
  points?: Point[];
  strokes?: CanvasStroke[];
  erased?: boolean;
  navigationOnly?: boolean;
  /** Every selected element moved together, with its position when the drag began. */
  group?: { name: string; start: Point }[];
  /** Selection box: elements already selected when it started with Ctrl/⌘ or Shift. */
  additive?: string[];
  /** Pencil: pointer positions before smoothing, and the stroke being moved. */
  raw?: InkPoint[];
  strokeIndex?: number;
  /** Resize handle: the size factor and pointer distance from the center when it began. */
  scale?: number;
  distance?: number;
};

const PEN_COLORS = [
  { value: "#1f2937", label: "Negro" },
  { value: "#1a647b", label: "Petróleo" },
  { value: "#2563eb", label: "Azul" },
  { value: "#7c3aed", label: "Violeta" },
  { value: "#db2777", label: "Rosa" },
  { value: "#dc2626", label: "Rojo" },
  { value: "#ea580c", label: "Naranja" },
  { value: "#eab308", label: "Amarillo" },
  { value: "#16a34a", label: "Verde" },
  { value: "#ffffff", label: "Blanco" },
] as const;
const PEN_SIZES: Record<InkTool, number[]> = { pen: [2, 3.5, 6, 10], marker: [12, 20, 32] };

function roundPoint(p: Point): Point {
  return {
    x: Math.max(-19000, Math.min(19000, Math.round(p.x * 10) / 10)),
    y: Math.max(-19000, Math.min(19000, Math.round(p.y * 10) / 10)),
  };
}

/** Pointer capture fails when the pointer already ended (or never was active); dragging still works without it. */
function capturePointer(e: React.PointerEvent<Element>) {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* No active pointer with that id. */ }
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pointNearStroke(pt: Point, stroke: CanvasStroke, radius: number) {
  const limit = radius + (stroke.width || 2.5) / 2;
  if (stroke.points.length === 1) return Math.hypot(pt.x - stroke.points[0].x, pt.y - stroke.points[0].y) <= limit;
  for (let i = 1; i < stroke.points.length; i++) {
    if (distanceToSegment(pt, stroke.points[i - 1], stroke.points[i]) <= limit) return true;
  }
  return false;
}

export type RemoteSelection = { name: string; color: string; label: string };

export default function DiagramPreview({ diagram, onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, selectedClass, onSelectionChange, inspectorOpen = false, insertRequest, initialFit = "readable", focused, onFocusChange, onUndo, onRedo, canUndo = true, canRedo = true, remoteSelections }: {
  diagram: Diagram; onRendered: (result: SvgResult | null) => void; onClassClick: (name: string) => void;
  onSettingsChange: (settings: CanvasSettings) => void;
  onConnect: (from: string, to: string, kind: RelationKind, positions: Record<string, Point>) => void;
  onGuide: (kind: string) => void;
  onSourceChange?: (source: string) => void;
  selectedClass?: string;
  onSelectionChange?: (name: string) => void;
  inspectorOpen?: boolean;
  insertRequest?: { serial: number; kind: string };
  initialFit?: "readable" | "contain";
  focused?: boolean;
  onFocusChange?: (focused: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Elements other connected people have selected on this board. */
  remoteSelections?: RemoteSelection[];
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
  const viewState = useRef({ zoom, pan });
  viewState.current = { zoom, pan };
  const [mode, setMode] = useState<ToolMode>("move");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [penColor, setPenColor] = useState<string>("#1f2937");
  const [penTool, setPenTool] = useState<InkTool>("pen");
  const [penSizes, setPenSizes] = useState<Record<InkTool, number>>({ pen: 3.5, marker: 20 });
  const penWidth = penSizes[penTool];
  const [selectedStroke, setSelectedStroke] = useState(-1);
  const [localFocus, setLocalFocus] = useState(false);
  const isFocused = focused ?? localFocus;
  const [relationKind, setRelationKind] = useState<RelationKind>("-->");
  const [origin, setOrigin] = useState("");
  const [localSelection, setLocalSelection] = useState("");
  const selectedNode = selectedClass ?? localSelection;
  const [selectedEdge, setSelectedEdge] = useState("");
  const [frameRequest, setFrameRequest] = useState(0);
  const hoveredEdgeRef = useRef("");
  const prevSelectedEdgeRef = useRef("");
  const viewCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomLabel = useRef<HTMLButtonElement>(null);
  const [edgeForm, setEdgeForm] = useState<(SourceRelation & { edgeId: string }) | null>(null);
  const [edgeDelete, setEdgeDelete] = useState<SourceRelation | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointerNode = useRef("");
  const fittedId = useRef("");
  const renderedId = useRef("");
  const renderedContent = useRef("");
  const prevViewCenter = useRef<{ id: string; center: Point } | null>(null);
  const hadSize = useRef(false);
  const [context, setContext] = useState<{ x: number; y: number; name: string; point?: Point } | null>(null);
  const closeContext = useCallback(() => setContext(null), []);
  const [classForm, setClassForm] = useState<{ name: string; body: string; editing: boolean; point?: Point } | null>(null);
  const [nodeForm, setNodeForm] = useState<(VisualNode & { editing: boolean; point?: Point; owner?: string }) | null>(null);
  const [connectionForm, setConnectionForm] = useState<{ from: string; to: string; kind: string; label: string } | null>(null);
  const [visualKind, setVisualKind] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [imageRequest, setImageRequest] = useState<ImageRequest>();
  const imageInput = useRef<HTMLInputElement>(null);
  /** First picture in a drop or paste, if any. */
  const pictureIn = (files?: FileList | null) => Array.from(files || []).find(file => /^image\/(png|jpeg|webp|gif)$/.test(file.type));
  // Multiple selection (two or more elements); a single selection keeps using selectedNode.
  const [group, setGroup] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");
  const pendingLink = useRef<{ from: string; to: string } | null>(null);
  const pendingNode = useRef("");
  const content = useMemo(() => cleanSource(diagram.source), [diagram.source]);
  const settings = useMemo(() => readCanvas(diagram.source), [diagram.source]);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const callbacks = useRef({ onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, onSelectionChange, onFocusChange });
  callbacks.current = { onRendered, onClassClick, onSettingsChange, onConnect, onGuide, onSourceChange, onSelectionChange, onFocusChange };
  const isClass = diagram.type === "class";
  const isSequence = diagram.type === "sequence";
  const isDer = diagram.type === "der";
  // Attribute placement around Chen entities, used where the user has not placed them.
  const derGraph = useRef<{ kinds: Record<string, string>; edges: CanvasModel["edges"] }>({ kinds: {}, edges: [] });
  const withLayout = useCallback((next: CanvasSettings): CanvasSettings => {
    if (!isDer) return next;
    const saved = next.positions, nodes = model.current.nodes.map(node => Object.hasOwn(saved, node.name) ? { ...node, ...saved[node.name] } : node);
    return { ...next, positions: { ...chenLayout(nodes, derGraph.current.kinds, derGraph.current.edges, Object.keys(saved)), ...saved } };
  }, [isDer]);
  const movingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editable = !!onSourceChange;
  const nodesInSource = useMemo(() => visualNodes(content, diagram.type), [content, diagram.type]);
  const availableRelations = isClass ? RELATIONS : VISUAL_RELATIONS[diagram.type] || [];
  const activeKind = isClass ? relationKind : visualKind || availableRelations[0]?.value || "-->";
  const selection = model.current.nodes.some(node => node.name === selectedNode) ? selectedNode : "";
  const selectedGroup = group.filter(name => model.current.nodes.some(node => node.name === name));
  const multi = selectedGroup.length > 1;
  const root = () => art.current?.querySelector<SVGSVGElement>("svg") || null;

  function updateHoveredEdge(nextId: string) {
    if (hoveredEdgeRef.current === nextId) return;
    const svg = root();
    if (svg) {
      if (hoveredEdgeRef.current) {
        svg.querySelectorAll<SVGElement>(`[data-edge-id="${CSS.escape(hoveredEdgeRef.current)}"]`).forEach(el => el.classList.remove("edge-hovered"));
      }
      if (nextId) {
        svg.querySelectorAll<SVGElement>(`[data-edge-id="${CSS.escape(nextId)}"]`).forEach(el => el.classList.add("edge-hovered"));
      }
    }
    hoveredEdgeRef.current = nextId;
  }

  function syncViewDom(nextZoom: number, nextPan: Point) {
    viewState.current = { zoom: nextZoom, pan: nextPan };
    if (art.current) {
      art.current.style.transform = `translate(-50%, -50%) translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextZoom})`;
      // A promoted layer is scaled as a bitmap; release it when the gesture
      // settles so the browser redraws the vector diagram at the new zoom.
      art.current.classList.add("view-moving");
      clearTimeout(movingTimer.current);
      movingTimer.current = setTimeout(() => art.current?.classList.remove("view-moving"), 180);
    }
    if (viewport.current) {
      const spacing = gridSpacing(nextZoom);
      const cx = result?.center?.x || 0;
      const cy = result?.center?.y || 0;
      viewport.current.style.backgroundSize = `${spacing}px ${spacing}px`;
      viewport.current.style.backgroundPosition = `calc(50% + ${nextPan.x - cx * nextZoom}px) calc(50% + ${nextPan.y - cy * nextZoom}px)`;
    }
    // The DOM already shows the new view; React state (and every control that
    // depends on it) catches up once the gesture pauses instead of every frame.
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(nextZoom * 100)}%`;
    clearTimeout(viewCommit.current);
    viewCommit.current = setTimeout(() => { setZoom(viewState.current.zoom); setPan(viewState.current.pan); }, 120);
  }

  useEffect(() => () => { clearTimeout(viewCommit.current); clearTimeout(movingTimer.current); }, []);

  function activateTool(tool: ToolMode) {
    setMode(tool); setOrigin(""); setContext(null); setShowShortcuts(false); if (tool !== "move") setSelectedStroke(-1);
    viewport.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const release = () => setSpaceHeld(false);
    const keyup = (event: KeyboardEvent) => { if (event.code === "Space") release(); };
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", release);
    return () => { window.removeEventListener("keyup", keyup); window.removeEventListener("blur", release); };
  }, []);

  const toggleFocus = useCallback((next?: boolean) => {
    const value = next ?? !isFocused;
    setLocalFocus(value);
    callbacks.current.onFocusChange?.(value);
  }, [isFocused]);

  function clientPoint(x: number, y: number): Point {
    const matrix = root()?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: Math.max(-19000, Math.min(19000, point.x)), y: Math.max(-19000, Math.min(19000, point.y)) };
  }

  function viewportCenterPoint(): Point {
    const el = viewport.current;
    if (!el || !root()) return { x: 200, y: 180 };
    const rect = el.getBoundingClientRect();
    const base = clientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const existing = Object.values(positions.current);
    let candidate = roundPoint(base);
    let attempts = 0;
    while (existing.some(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) < 52) && attempts < 12) {
      attempts++;
      candidate = roundPoint({ x: base.x + ((attempts % 3) - 1) * 75 + 45, y: base.y + Math.floor(attempts / 3) * 65 });
    }
    return candidate;
  }

  useEffect(() => {
    if (!insertRequest || !onSourceChange) return;
    setFormError("");
    if (insertRequest.kind === "image") { imageInput.current?.click(); return; }
    // Text and sticky notes are board tools: the next click places them.
    if (insertRequest.kind === "text" || insertRequest.kind === "sticky") { activateTool(insertRequest.kind); setFeedback(insertRequest.kind === "text" ? "Hacé clic en el tablero para escribir un texto." : "Hacé clic en el tablero para pegar una nota adhesiva."); return; }
    if (isClass) {
      if (insertRequest.kind === "class") openClass("", undefined);
      return;
    }
    // Activity control nodes need no text: they are placed at once with a generated name.
    if (diagram.type === "activity" && isControlNode(insertRequest.kind)) {
      const info = ACTIVITY_KINDS.find(k => k.value === insertRequest.kind)!, taken = nodesInSource.map(n => n.id);
      const base = info.defaultLabel!.normalize("NFD").replace(/[^A-Za-z]/g, "") || "Nodo";
      let id = base, n = 2; while (taken.includes(id)) id = base + n++;
      try {
        let source = setVisualNode(diagram.source, "activity", { id, label: info.defaultLabel!, kind: info.value, body: "" }, true);
        source = writeCanvas(source, { ...readCanvas(source), positions: { ...positions.current, ...settingsRef.current.positions, [id]: viewportCenterPoint() } });
        callbacks.current.onSourceChange?.(source); pendingNode.current = id; setSelectedNode(id);
        setFeedback(`${info.label} agregado. Conectalo con C o desde su barra.`);
      } catch (e) { setFeedback((e as Error).message); }
      return;
    }
    if (["message", "transition", "flow", "erlink"].includes(insertRequest.kind)) {
      if (!nodesInSource.length) { setFeedback("Primero agregá los elementos que querés conectar."); return; }
      setConnectionForm({ from: nodesInSource[0].id, to: nodesInSource[1]?.id || nodesInSource[0].id, kind: activeKind, label: "" });
    } else {
      const kind = ({ node: "activity", decisión: "decision" } as Record<string,string>)[insertRequest.kind] || insertRequest.kind;
      setNodeForm({ id: "", label: "", kind, body: diagram.type === "er" ? "int id PK\nstring nombre" : "", editing: false, point: viewportCenterPoint(), owner: isDer && !["entity", "weak", "relationship", "identifying"].includes(kind) ? selectedNode || undefined : undefined });
    }
    // A request is a gesture, not a persistent editing mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.serial]);

  const fit = useCallback((readable = false) => {
    const el = viewport.current, svg = art.current?.querySelector<SVGSVGElement>("svg");
    if (!el || !svg) return;
    const box = svg.getBBox();
    const view = svg.viewBox.baseVal;
    const fitted = Math.min(1.15, Math.max(.1, Math.min(Math.max(100, el.clientWidth - 140) / (box.width + 40), Math.max(100, el.clientHeight - 180) / (box.height + 40))));
    const scale = readable ? Math.max(.8, fitted) : fitted;
    const nextPan = { x: (view.x + view.width / 2 - box.x - box.width / 2) * scale + 30, y: readable && scale > fitted ? (view.y + view.height / 2 - box.y) * scale - el.clientHeight / 2 + 100 : (view.y + view.height / 2 - box.y - box.height / 2) * scale + 15 };
    viewState.current = { zoom: scale, pan: nextPan };
    setZoom(scale);
    setPan(nextPan);
  }, []);

  useEffect(() => { void loadMermaid(); }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); callbacks.current.onRendered(null);
    const cacheKey = JSON.stringify([diagram.type, diagram.theme, dark, diagram.name, content]);
    /** Applies a render, fresh or cached, to this board. */
    const apply = (snapshot: RenderSnapshot) => {
      const nodes = snapshot.nodes.map(node => ({ ...node }));
      const edges = snapshot.edges.map(edge => ({ ...edge, points: edge.points?.map(point => ({ ...point })) }));
      if (isDer) derGraph.current = { kinds: snapshot.derKinds, edges };
      model.current = { nodes, edges };
      const sourceLines = isClass ? null : content.split("\n");
      const relations: SourceRelation[] = isClass ? sourceRelations(content) : visualRelations(content, diagram.type).map(r => ({ ...r, raw: sourceLines![r.line], fromCard: "", toCard: "", indent: "", comment: "" }));
      const relationsByPair = new Map<string, SourceRelation[]>();
      for (const r of relations) {
        const key = `${r.from}\0${r.to}`;
        const list = relationsByPair.get(key) || [];
        list.push(r);
        relationsByPair.set(key, list);
      }
      const pairIndex = new Map<string, number>();
      relationSources.current = new Map(edges.flatMap(edge => {
        const key = `${edge.start}\0${edge.end}`;
        const idx = pairIndex.get(key) || 0;
        const relation = relationsByPair.get(key)?.[idx];
        if (!relation) return [];
        pairIndex.set(key, idx + 1);
        edge.routeKey = relationRouteKey(relation.from, relation.to, idx);
        return [[edge.id, relation] as const];
      }));
      renderedId.current = diagram.id;
      renderedContent.current = content;
      setResult({ svg: snapshot.svg, width: snapshot.width, height: snapshot.height, center: snapshot.center });
      setBusy(false);
    };
    const cached = cachedRender(cacheKey);
    // Mermaid ids must stay unique in the page: skip the cache if that SVG is already shown elsewhere.
    const cachedId = cached?.svg.match(/<svg[^>]*?\sid="([^"]+)"/)?.[1];
    if (cached && !(cachedId && document.getElementById(cachedId))) {
      const timer = setTimeout(() => { if (!cancelled) apply(cached); }, 0);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    const timer = setTimeout(() => {
      renderQueue = renderQueue.catch(() => {}).then(async () => {
        if (cancelled) return;
        const staging = document.createElement("div");
        staging.style.cssText = "position:fixed;left:-20000px;top:0;visibility:hidden;";
        document.body.appendChild(staging);
        try {
          const mermaid = (await loadMermaid()).default;
          if (isClass) await document.fonts.load("14px 'IBM Plex Mono'");
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: dark ? "dark" : "base",
            fontFamily: "Source Sans 3 Variable, sans-serif", suppressErrorRendering: true,
            themeCSS: isClass ? ".members-group text, .methods-group text { font-family: 'IBM Plex Mono', monospace; font-size: 14px; } .label-group text { font-family: 'Source Sans 3 Variable', sans-serif; font-size: 17px; font-weight: 650; } .divider path { stroke-width: 1px; }" : "",
            themeVariables: dark ? { fontSize: "15px", primaryColor: "#243b47", primaryTextColor: "#e4edf1", primaryBorderColor: "#84b6c4", lineColor: "#96b5c0", mainBkg: "#243b47", sequenceNumberColor: "#14202a" } : {
              // Autonumber digits sit on the signal-colored circle; Mermaid's derived color was unreadable.
              sequenceNumberColor: "#ffffff",
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
          const center = { x: (box.x || 0) + width / 2, y: (box.y || 0) + height / 2 };
          live.setAttribute("width", String(width)); live.setAttribute("height", String(height));
          live.style.maxWidth = "none"; live.style.overflow = "visible";
          live.setAttribute("role", "img"); live.setAttribute("aria-label", diagram.name);
          const parsed = await mermaid.mermaidAPI.getDiagramFromText(renderedSource);
          const db = parsed.db as unknown as { getData?: () => { nodes: { id: string; domId?: string; label?: string; isGroup?: boolean }[]; edges: CanvasModel["edges"] } };
          const data = db.getData?.();
          const nodes = isClass ? measureClasses(live) : measureVisualNodes(live, data?.nodes || [], content, diagram.type);
          let edges: CanvasModel["edges"] = [];
          let derKinds: Record<string, string> = {};
          if (nodes.length) {
            if (isSequence) {
              edges = sequenceModel(live, content);
            } else {
              const pathsById = new Map<string, SVGPathElement>();
              for (const el of live.querySelectorAll<SVGPathElement>(".edgePaths path")) {
                if (el.dataset.id) pathsById.set(el.dataset.id, el);
              }
              const labelsById = new Map<string, SVGGElement>();
              for (const el of live.querySelectorAll<SVGGElement>(".edgeLabel")) {
                const id = el.querySelector("[data-id]")?.getAttribute("data-id");
                if (id) labelsById.set(id, el);
              }
              derKinds = isDer ? Object.fromEntries(visualNodes(content, "der").map(node => [node.id, node.kind])) : {};
              edges = (data?.edges || []).map(edge => {
                if (diagram.type === "er") { edge.start = edge.start?.match(/^entity-(.*)-\d+$/)?.[1] || edge.start; edge.end = edge.end?.match(/^entity-(.*)-\d+$/)?.[1] || edge.end; }
                const path = pathsById.get(edge.id);
                const label = labelsById.get(edge.id);
                const matrix = label?.transform.baseVal.consolidate()?.matrix;
                let points: Point[] | undefined;
                try { points = JSON.parse(atob(path?.getAttribute("data-points") || "")); } catch { /* Some Mermaid edges have no layout points. */ }
                const labelNear = !isDer ? undefined : isDerRelationship(derKinds[edge.start || ""]) ? "end" as const : isDerRelationship(derKinds[edge.end || ""]) ? "start" as const : undefined;
                return { ...edge, points, labelPosition: matrix ? { x: matrix.e, y: matrix.f } : undefined, labelNear };
              });
            }
          }
          if (isDer) derGraph.current = { kinds: derKinds, edges };
          const snapshot: RenderSnapshot = { svg: new XMLSerializer().serializeToString(live), width, height, center, nodes, edges, derKinds };
          storeRender(cacheKey, snapshot);
          if (!cancelled) apply(snapshot);
        } catch (e) {
          if (!cancelled) { setError(e instanceof Error ? e.message : "Revisa la sintaxis del diagrama."); setBusy(false); }
        } finally { staging.remove(); }
      });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [content, diagram.theme, dark, diagram.id, diagram.type, diagram.name, isClass, isSequence, isDer]);

  useEffect(() => {
    const svg = root();
    // Wait for the drawing of the current source: applying new positions to the
    // previous drawing makes removed elements jump for a moment.
    if (!svg || busy || error || renderedId.current !== diagram.id || renderedContent.current !== content) return;
    if (!isSequence) positions.current = applyCanvas(svg, model.current, withLayout(settings), dark);
    else {
      positions.current = Object.fromEntries(model.current.nodes.map(n => [n.name, { x: n.x, y: n.y }]));
      svg.querySelectorAll<SVGGElement>('[data-class]').forEach(node => { node.setAttribute("tabindex", "0"); node.setAttribute("role", "button"); node.setAttribute("aria-label", "Participante " + node.getAttribute("data-class")); });
      svg.querySelectorAll<SVGPathElement>(".edgePaths path,.messageLine0,.messageLine1").forEach(path => { path.style.strokeWidth = String(settings.lineWidth); });
      renderStrokes(svg, settings.strokes);
    }
    callbacks.current.onRendered(lazyExportCanvas(svg));
    if (pendingEdgeKey.current && renderedContent.current === content) {
      const reselected = model.current.edges.find(edge => edge.routeKey === pendingEdgeKey.current);
      pendingEdgeKey.current = "";
      setSelectedEdge(reselected?.id || "");
    }
    if (pendingNode.current && model.current.nodes.some(node => node.name === pendingNode.current)) {
      const addedName = pendingNode.current;
      pendingNode.current = "";
      const nodeEl = Array.from(svg.querySelectorAll<SVGGElement>("[data-class]")).find(n => n.getAttribute("data-class") === addedName);
      const outline = nodeEl?.querySelector("g.outer-path > path, rect, path");
      if (outline && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        outline.animate([{ strokeWidth: "4px" }, { strokeWidth: "2.5px" }], { duration: 240, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    }
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
    if (fittedId.current !== diagram.id) {
      fittedId.current = diagram.id;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) art.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
      if (result?.center) prevViewCenter.current = { id: diagram.id, center: result.center };
      fit(initialFit === "readable");
    } else if (result?.center) {
      if (prevViewCenter.current?.id === diagram.id) {
        const dx = (result.center.x - prevViewCenter.current.center.x) * viewState.current.zoom;
        const dy = (result.center.y - prevViewCenter.current.center.y) * viewState.current.zoom;
        if (Math.hypot(dx, dy) > 0.5) {
          const nextPan = { x: viewState.current.pan.x + dx, y: viewState.current.pan.y + dy };
          viewState.current = { zoom: viewState.current.zoom, pan: nextPan };
          setPan(nextPan);
        }
      }
      prevViewCenter.current = { id: diagram.id, center: result.center };
    }
  }, [result, settings, busy, error, diagram.theme, dark, diagram.id, fit, isClass, isSequence, initialFit, content, withLayout]);

  useEffect(() => {
    setGroup([]); setMarquee(null); setDeleteGroup([]); setSelectedStroke(-1);
    setMode("move"); setOrigin(""); setSelectedNode(""); setSelectedEdge(""); hoveredEdgeRef.current = ""; prevSelectedEdgeRef.current = ""; setEdgeForm(null); setEdgeDelete(null); setContext(null); setClassForm(null); setNodeForm(null); setConnectionForm(null); setVisualKind(""); setDeleteTarget(""); setFeedback(""); pendingLink.current = null; pendingNode.current = ""; prevViewCenter.current = null; hadSize.current = false;
  }, [diagram.id]);
  useEffect(() => {
    const svg = root();
    if (!svg) return;
    svg.querySelectorAll(".studio-remote-selection").forEach(el => el.remove());
    if (busy || error) return;
    const NS = "http://www.w3.org/2000/svg";
    for (const remote of remoteSelections || []) {
      const node = model.current.nodes.find(n => n.name === remote.name);
      const element = node ? svg.getElementById(node.domId) as SVGGElement | null : null;
      if (!element) continue;
      const box = element.getBBox(), overlay = document.createElementNS(NS, "g");
      overlay.setAttribute("class", "studio-remote-selection"); overlay.style.pointerEvents = "none";
      const ring = document.createElementNS(NS, "rect");
      for (const [key, value] of Object.entries({ x: box.x - 7, y: box.y - 7, width: box.width + 14, height: box.height + 14, rx: 9 })) ring.setAttribute(key, String(value));
      ring.style.cssText = `fill:none;stroke:${remote.color};stroke-width:2.5px;stroke-dasharray:7 4;`;
      const tag = document.createElementNS(NS, "text");
      tag.setAttribute("x", String(box.x - 6)); tag.setAttribute("y", String(box.y - 12));
      tag.style.cssText = `fill:${remote.color};font:700 12px 'Source Sans 3 Variable',sans-serif;paint-order:stroke;stroke:#fff;stroke-width:3px;`;
      tag.textContent = remote.label;
      overlay.appendChild(ring); overlay.appendChild(tag); element.appendChild(overlay);
    }
  }, [remoteSelections, result, busy, error]);
  useEffect(() => {
    const svg = root();
    svg?.querySelectorAll("[data-class]").forEach(node => {
      node.classList.toggle("connection-origin", node.getAttribute("data-class") === origin);
      const name = node.getAttribute("data-class") || "";
      node.classList.toggle("class-selected", multi ? selectedGroup.includes(name) : name === selection);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, selection, result, group]);
  useEffect(() => {
    const svg = root();
    if (svg && !busy && !error) {
      edgeControls(svg, model.current, settings, selectedEdge, viewState.current.zoom, editable);
    }
    const prev = prevSelectedEdgeRef.current;
    if (prev && prev !== selectedEdge) {
      svg?.querySelectorAll<SVGElement>(`[data-edge-id="${CSS.escape(prev)}"]`).forEach(element => {
        element.classList.remove("edge-selected");
        if (element.getAttribute("role") === "button") element.setAttribute("aria-pressed", "false");
      });
    }
    if (selectedEdge) {
      svg?.querySelectorAll<SVGElement>(`[data-edge-id="${CSS.escape(selectedEdge)}"]`).forEach(element => {
        element.classList.add("edge-selected");
        if (element.getAttribute("role") === "button") element.setAttribute("aria-pressed", "true");
      });
    }
    prevSelectedEdgeRef.current = selectedEdge;
  }, [selectedEdge, result, settings, busy, error, editable]);
  useEffect(() => {
    if (!selectedEdge || busy || error) return;
    const svg = root();
    if (svg) scaleEdgeControls(svg, zoom);
  }, [zoom, selectedEdge, busy, error]);
  // Edits from the relation bar keep the arrow selected: it is found again by route key after the redraw.
  const pendingEdgeKey = useRef("");
  useEffect(() => { if (!pendingEdgeKey.current) setSelectedEdge(""); hoveredEdgeRef.current = ""; prevSelectedEdgeRef.current = ""; }, [content]);
  useEffect(() => {
    if (!busy && renderedId.current === diagram.id && renderedContent.current === content && selectedNode && !model.current.nodes.some(node => node.name === selectedNode)) {
      setSelectedNode(""); setFeedback("");
    }
  }, [result, busy, diagram.id, content, selectedNode]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(() => {
      const el = viewport.current;
      if (!el) return;
      const hasSize = el.clientWidth > 20 && el.clientHeight > 20;
      if (hasSize && (!hadSize.current || !callbacks.current.onSourceChange)) {
        hadSize.current = true;
        if (root()) fit(initialFit === "readable");
      } else if (!hasSize) {
        hadSize.current = false;
      }
    });
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [fit, initialFit]);

  useEffect(() => {
    const el = viewport.current;
    if (!el || busy || error) return;
    const wheel = (event: WheelEvent) => {
      if (!art.current?.querySelector("svg") || (!event.deltaY && !event.deltaX)) return;
      if (event.target instanceof Element && event.target.closest("button,input,select,textarea,.zoom-toolbar,.draw-side-toolbar,.error-panel")) return;
      event.preventDefault();
      if (drag.current) return;
      // Normalize mouse notches and trackpad deltas; preserve the point under
      // the cursor rather than zooming around the middle of the canvas.
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1);
      const current = viewState.current;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const nextPan = { x: current.pan.x - (event.deltaX || delta), y: current.pan.y };
        syncViewDom(current.zoom, nextPan);
        return;
      }
      const box = el.getBoundingClientRect();
      const x = event.clientX - box.left - el.clientWidth / 2;
      const y = event.clientY - box.top - el.clientHeight / 2;
      const next = zoomAt(current, current.zoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * .0025), { x, y });
      syncViewDom(next.zoom, next.pan);
    };
    // React's delegated wheel listener is passive, so use a local listener to
    // stop page/browser scrolling only while the gesture belongs to the canvas.
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [busy, error, result]);

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
  function changeColor(key: "nodeColors" | "edgeColors", id: string, color?: string) {
    const colors = { ...settingsRef.current[key] };
    if (color) colors[id] = color; else delete colors[id];
    changeSettings({ [key]: colors });
  }
  function resetRoute() {
    if (!chosenEdge?.routeKey) return;
    const routes = { ...settingsRef.current.routes }; delete routes[chosenEdge.routeKey]; changeSettings({ routes });
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
  function showSettings(next: CanvasSettings, edgeId = selectedEdge, dirtyEdgeOnly = false) {
    const svg = root(); if (!svg) return;
    positions.current = applyCanvas(svg, model.current, withLayout(next), dark, undefined, dirtyEdgeOnly ? edgeId : undefined);
    edgeControls(svg, model.current, next, edgeId, viewState.current.zoom, !!callbacks.current.onSourceChange);
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
  const strokeChoice = selectedStroke >= 0 ? settings.strokes?.[selectedStroke] : undefined;
  useEffect(() => {
    const svg = root();
    if (svg && !busy && !error) renderStrokeSelection(svg, mode === "move" ? strokeChoice || null : null, viewState.current.zoom);
  }, [strokeChoice, result, busy, error, mode, zoom]);
  /** Topmost pencil stroke under a board point, or -1. */
  function strokeAt(pt: Point) {
    const strokes = settingsRef.current.strokes || [];
    for (let i = strokes.length - 1; i >= 0; i--) if (pointNearStroke(pt, strokes[i], 7 / Math.max(.2, viewState.current.zoom))) return i;
    return -1;
  }
  /** Writes pencil changes unless they would exceed the size a board can store. */
  function commitStrokes(next: CanvasStroke[]) {
    const candidate = { ...settingsRef.current, strokes: next.length ? next : undefined };
    if (writeCanvas(diagram.source, candidate).length > SOURCE_LIMIT) { setFeedback("El tablero llegó a su tamaño máximo: borrá algunos trazos para seguir dibujando."); const svg = root(); if (svg) renderStrokes(svg, settingsRef.current.strokes); return false; }
    changeSettings({ strokes: candidate.strokes });
    return true;
  }
  function inkPoint(e: React.PointerEvent): InkPoint {
    const pt = roundPoint(clientPoint(e.clientX, e.clientY));
    // Only pens report real pressure; a mouse always reads 0.5 while pressed.
    return e.pointerType === "pen" && e.pressure > 0 ? { ...pt, p: Math.round(e.pressure * 100) / 100 } : pt;
  }
  function colorSelection(color?: string) {
    const colors = { ...settingsRef.current.nodeColors };
    for (const name of multi ? selectedGroup : selection ? [selection] : []) { if (color) colors[name] = color; else delete colors[name]; }
    changeSettings({ nodeColors: colors });
  }

  function relationChange(change: () => { source: string; routeKey: string }) {
    try { const result = change(); pendingEdgeKey.current = result.routeKey; callbacks.current.onSourceChange?.(result.source); }
    catch (e) { pendingEdgeKey.current = ""; setFeedback((e as Error).message); }
  }
  function changeEdgeKind(kind: string) {
    if (!chosenRelation || !chosenEdge?.routeKey) return;
    const key = chosenEdge.routeKey;
    relationChange(() => ({ routeKey: key, source: isClass ? updateRelation(diagram.source, chosenRelation, { ...chosenRelation, kind }) : updateVisualRelation(diagram.source, diagram.type, chosenRelation, { ...chosenRelation, kind }) }));
  }
  function invertEdge() {
    if (!chosenRelation) return;
    relationChange(() => isClass ? invertRelation(diagram.source, chosenRelation) : invertVisualRelation(diagram.source, diagram.type, chosenRelation));
    setFeedback("Dirección invertida. Podés deshacerlo con Deshacer.");
  }
  const scaleOf = (name: string) => settings.nodeScales && Object.hasOwn(settings.nodeScales, name) ? settings.nodeScales[name] : 1;
  function resizeSelection(factor: number | "reset") {
    const scales = { ...settingsRef.current.nodeScales };
    for (const name of multi ? selectedGroup : selection ? [selection] : []) {
      const next = factor === "reset" ? 1 : Math.round(Math.max(.4, Math.min(4, (scales[name] || 1) * factor)) * 20) / 20;
      if (next === 1) delete scales[name]; else scales[name] = next;
    }
    changeSettings({ nodeScales: scales });
  }
  /** Corner handle of the selected element: drag it to change the element's size. */
  useEffect(() => {
    const svg = root();
    svg?.querySelector(".studio-resize-handle")?.remove();
    if (!svg || busy || error || multi || !selection || isSequence || !onSourceChange || mode !== "move") return;
    const node = model.current.nodes.find(n => n.name === selection), at = positions.current[selection];
    if (!node || !at) return;
    const scale = scaleOf(selection), size = 11 / Math.max(.2, zoom);
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    handle.setAttribute("class", "studio-resize-handle"); handle.setAttribute("data-resize-handle", selection);
    handle.setAttribute("x", String(at.x + node.width * scale / 2 - size / 2)); handle.setAttribute("y", String(at.y + node.height * scale / 2 - size / 2));
    handle.setAttribute("width", String(size)); handle.setAttribute("height", String(size)); handle.setAttribute("rx", String(size / 4));
    handle.style.cssText = `fill:var(--paper,#fff);stroke:var(--accent,#1a647b);stroke-width:${1.6 / Math.max(.2, zoom)}px;cursor:nwse-resize;pointer-events:all`;
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = "Arrastrá para cambiar el tamaño"; handle.appendChild(title);
    (svg.querySelector("g.root") || svg).appendChild(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, multi, result, settings, zoom, busy, error, mode]);

  /** Ctrl/⌘ + click: add or remove one element from the selection. */
  function toggleInGroup(name: string) {
    const base = multi ? selectedGroup : selection ? [selection] : [];
    const next = base.includes(name) ? base.filter(n => n !== name) : [...base, name];
    setSelectedEdge("");
    setGroup(next.length > 1 ? next : []);
    setSelectedNode(next.at(-1) || "");
    setFeedback(next.length > 1 ? `${next.length} elementos seleccionados.` : "");
  }
  function selectMany(names: string[]) {
    setSelectedEdge("");
    setGroup(names.length > 1 ? names : []);
    setSelectedNode(names.at(-1) || "");
    if (names.length > 1) setFeedback(`${names.length} elementos seleccionados. Arrastrá cualquiera para moverlos juntos.`);
  }
  function clearSelection() { setGroup([]); setSelectedNode(""); setSelectedEdge(""); setSelectedStroke(-1); }
  /** Elements whose box touches the screen rectangle drawn with the selection box. */
  function namesInside(x1: number, y1: number, x2: number, y2: number) {
    const a = clientPoint(Math.min(x1, x2), Math.min(y1, y2)), b = clientPoint(Math.max(x1, x2), Math.max(y1, y2));
    return model.current.nodes.filter(node => {
      const p = positions.current[node.name] || node;
      return p.x + node.width / 2 >= a.x && p.x - node.width / 2 <= b.x && p.y + node.height / 2 >= a.y && p.y - node.height / 2 <= b.y;
    }).map(node => node.name);
  }
  function moveGroup(entries: { name: string; start: Point }[], dx: number, dy: number, snap: boolean) {
    const svg = root(); if (!svg) return;
    for (const entry of entries) positions.current[entry.name] = snapPoint({ x: entry.start.x + dx, y: entry.start.y + dy }, snap);
    positions.current = applyCanvas(svg, model.current, withLayout({ ...settingsRef.current, positions: { ...positions.current } }), dark);
  }
  /** Removes several elements as one source change, so a single Undo restores them all. */
  function removeMany(names: string[]) {
    let next = diagram.source;
    for (const name of names) next = isClass ? removeClass(next, name) : removeVisualNode(next, diagram.type, name);
    return next;
  }
  function placeClass(name: string, point: Point) {
    const svg = root();
    if (!svg) return;
    if (isSequence) {
      // The participant's both boxes and its lifeline move together while dragging.
      const geometry = model.current.nodes.find(n => n.name === name); if (!geometry) return;
      const dx = point.x - geometry.x, main = svg.getElementById(geometry.domId);
      main?.setAttribute("transform", `translate(${dx},0) ${geometry.transform}`);
      svg.querySelectorAll<SVGElement>(`[data-twin][data-class="${CSS.escape(name)}"], [data-et="life-line"][data-id="${CSS.escape(name)}"]`).forEach(el => el.setAttribute("transform", `translate(${dx},0) ${el.dataset.origTransform || ""}`));
      return;
    }
    positions.current[name] = point;
    const next = { ...settingsRef.current, positions: positions.current };
    applyCanvas(svg, model.current, withLayout(next), dark, name);
  }
  function changeSettings(patch: Partial<CanvasSettings>) { if (callbacks.current.onSourceChange) callbacks.current.onSettingsChange({ ...settingsRef.current, ...patch }); }
  function setViewZoom(value: number) {
    const next = zoomAt(viewState.current, value);
    viewState.current = next; setZoom(next.zoom); setPan(next.pan);
  }
  function changeZoom(delta: number) { setViewZoom(Math.round(viewState.current.zoom * (delta > 0 ? 1.25 : .8) * 100) / 100); }

  function undoStroke() {
    const current = settingsRef.current.strokes || [];
    if (!current.length) return;
    const next = current.slice(0, -1);
    changeSettings({ strokes: next.length ? next : undefined });
  }
  function clearStrokes() {
    if (!settingsRef.current.strokes?.length) return;
    changeSettings({ strokes: undefined });
    setFeedback("Se borraron los trazos del lápiz. Podés recuperarlos con Deshacer.");
  }

  function openClass(name = "", explicitPoint?: Point) {
    if (!callbacks.current.onSourceChange) { if (name) callbacks.current.onClassClick(name); return; }
    setFormError("");
    const targetPoint = name ? undefined : snapPoint(roundPoint(explicitPoint || viewportCenterPoint()), snapToGrid);
    if (!isClass) {
      const node = nodesInSource.find(n => n.id === name);
      setNodeForm(node ? { ...node, editing: true } : { id: "", label: "", kind: NODE_KINDS[diagram.type][0].value, body: diagram.type === "er" ? "int id PK\nstring nombre" : "", editing: false, point: targetPoint });
      return;
    }
    try { setClassForm({ name, body: name ? classMembers(diagram.source, name) : "+String nombre\n+ejecutar() void", editing: !!name, point: targetPoint }); }
    catch (e) { setFeedback((e as Error).message); }
  }
  function saveClass() {
    if (!classForm || !callbacks.current.onSourceChange) return;
    try {
      if (!classForm.editing && [...classNames(diagram.source), ...model.current.nodes.map(node => node.name)].includes(classForm.name)) throw new Error("Ya existe una clase con ese nombre.");
      let nextSource = setClassMembers(diagram.source, classForm.name, classForm.body);
      if (!classForm.editing) {
        const targetPoint = roundPoint(classForm.point || viewportCenterPoint());
        const nextPositions = {
          ...positions.current,
          ...settingsRef.current.positions,
          [classForm.name]: targetPoint,
        };
        nextSource = writeCanvas(nextSource, { ...readCanvas(nextSource), positions: nextPositions });
        positions.current = nextPositions;
        pendingNode.current = classForm.name;
      }
      callbacks.current.onSourceChange(nextSource);
      setSelectedNode(classForm.name); setClassForm(null); setFeedback("Clase " + classForm.name + " guardada.");
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
  function openContext(x: number, y: number, name = "", point?: Point) {
    if (name) setSelectedNode(name);
    setContext({ x, y, name, point });
  }
  function copyClass(name: string) {
    if (!isClass) {
      const original = nodesInSource.find(n => n.id === name);
      if (!original) return;
      let id = name + "_copia", count = 2;
      while (nodesInSource.some(n => n.id === id)) id = name + "_copia" + count++;
      mutate(() => {
        let next = setVisualNode(diagram.source, diagram.type, { ...original, id }, true);
        const pos = positions.current[name];
        if (pos && !isSequence) {
          const nextPositions = { ...positions.current, ...settingsRef.current.positions, [id]: roundPoint({ x: pos.x + 80, y: pos.y + 80 }) };
          next = writeCanvas(next, { ...readCanvas(next), positions: nextPositions });
          positions.current = nextPositions;
        }
        return next;
      });
      pendingNode.current = id;
      return;
    }
    mutate(() => {
      const copy = duplicateClass(diagram.source, name, model.current.nodes.map(node => node.name));
      const position = positions.current[name];
      const nextPositions = position
        ? { ...positions.current, ...settingsRef.current.positions, [copy.name]: roundPoint({ x: position.x + 80, y: position.y + 80 }) }
        : { ...positions.current, ...settingsRef.current.positions };
      const next = writeCanvas(copy.source, { ...readCanvas(copy.source), positions: nextPositions });
      positions.current = nextPositions;
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
      const targetPt = context?.point;
      actions.push({ label: isClass ? "Agregar clase aquí" : "Agregar elemento aquí", icon: <Plus size={16} />, run: () => openClass("", targetPt), disabled: busy });
      actions.push({ label: "Dibujar con lápiz", icon: <Pencil size={16} />, run: () => { setMode("draw"); setOrigin(""); }, disabled: busy || !!error });
      actions.push({ label: "Ordenar automáticamente", icon: <LayoutGrid size={16} />, run: arrange, disabled: busy || !!error || isSequence });
      if (!isClass) actions.push({ label: isSequence ? "Agregar mensaje" : "Agregar conexión", icon: <Link2 size={16} />, disabled: nodesInSource.length < 1 || busy || !!error, run: () => { setFormError(""); setConnectionForm({ from: nodesInSource[0]?.id || "", to: nodesInSource[1]?.id || nodesInSource[0]?.id || "", kind: activeKind, label: "" }); } });
    }
    actions.push({ label: isFocused ? "Salir de modo foco" : "Enfocar pantalla de dibujo", icon: isFocused ? <Minimize2 size={16} /> : <Maximize2 size={16} />, run: () => toggleFocus(), separator: !!onSourceChange });
    actions.push({ label: "Ajustar al lienzo", icon: <Scan size={16} />, run: () => fit(), disabled: !result || busy || !!error });
    actions.push({ label: "Ver al 100%", icon: <Scan size={16} />, run: () => setViewZoom(1), disabled: !result });
    actions.push({ label: "Copiar código Mermaid", icon: <Code2 size={16} />, run: () => void copySource(), separator: true });
    actions.push({ label: "Descargar Mermaid", icon: <Download size={16} />, run: () => downloadSource() });
    actions.push({ label: "Descargar SVG", icon: <Download size={16} />, run: () => downloadSource(true), disabled: !result || busy || !!error });
    if (isClass) actions.push({ label: "Guía de relaciones UML", icon: <BookOpen size={16} />, run: () => callbacks.current.onGuide(relationKind), separator: true });
  }

  function canvasShortcut(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || (e.target as Element).closest("input,textarea,select,[contenteditable=true],dialog,[role=menu]")) return;
    if (classForm || nodeForm || connectionForm || edgeForm || edgeDelete || deleteTarget || deleteGroup.length || context || drag.current) return;
    const key = e.key.toLowerCase();
    if (e.key === "Escape") {
      e.preventDefault();
      if (showShortcuts) setShowShortcuts(false);
      else if (mode !== "move" || selection || selectedEdge || multi || selectedStroke >= 0) {
        activateTool("move"); clearSelection();
      } else if (isFocused) toggleFocus(false);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (key === "a" && onSourceChange && !isSequence && result && !busy && !error) { e.preventDefault(); activateTool("move"); selectMany(model.current.nodes.map(node => node.name)); return; }
      if (onSourceChange && ((key === "z" && onUndo) || (key === "y" && onRedo))) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) { if (canRedo) onRedo?.(); }
        else if (canUndo) onUndo?.();
      }
      return;
    }
    if (e.altKey) return;
    // Space on buttons keeps its native activation; on the board it holds the hand.
    if (e.code === "Space" && !(e.target as Element).closest("button,summary")) { e.preventDefault(); setSpaceHeld(true); return; }
    if (key === "v" || key === "h") { e.preventDefault(); activateTool(key === "v" ? "move" : "hand"); return; }
    if (key === "?" || key === "f1") { e.preventDefault(); setShowShortcuts(v => !v); return; }
    if (key === "g") { e.preventDefault(); setShowGrid(v => !v); return; }
    if (key === "f") { e.preventDefault(); toggleFocus(); return; }
    if (!result || busy || error) return;
    if (key === "1") { e.preventDefault(); fit(); return; }
    if (key === "0") { e.preventDefault(); setViewZoom(1); return; }
    if (key === "+" || key === "=" || key === "-") { e.preventDefault(); changeZoom(key === "-" ? -.1 : .1); return; }
    if (!onSourceChange) return;
    if (selectedStroke >= 0 && strokeChoice && (key === "delete" || key === "backspace")) { e.preventDefault(); commitStrokes((settings.strokes || []).filter((_, i) => i !== selectedStroke)); setSelectedStroke(-1); return; }
    const tools: Record<string, ToolMode> = { c: "connect", p: "draw", e: "erase", t: "text", k: "sticky" };
    if (key === "m") { e.preventDefault(); setPenTool("marker"); activateTool("draw"); return; }
    if (tools[key]) { e.preventDefault(); activateTool(tools[key]); return; }
    if (key === "n") { e.preventDefault(); if (isSequence) openClass(); else activateTool("place"); return; }
    if (key === "s" && !isSequence) { e.preventDefault(); setSnapToGrid(v => !v); return; }
    if (multi && (key === "delete" || key === "backspace")) { e.preventDefault(); setFormError(""); setDeleteGroup(selectedGroup); return; }
    if (selection && (key === "delete" || key === "backspace")) { e.preventDefault(); setFormError(""); setDeleteTarget(selection); }
  }

  const modeLabel = { move: "Seleccionar", hand: "Mover lienzo", place: isClass ? "Nueva clase" : "Nuevo elemento", connect: "Conectar", draw: penTool === "marker" ? "Resaltador" : "Lápiz", erase: "Borrador", text: "Texto", sticky: "Nota adhesiva" }[spaceHeld ? "hand" : mode];
  const cellSize = gridSpacing(zoom);

  return <div className={"diagram-preview-shell board-shell" + (dark ? " board-dark" : "") + (isFocused ? " is-focused" : "")} onKeyDown={canvasShortcut}
    onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSpaceHeld(false); }}
    onPaste={e => { if (!onSourceChange || (e.target as Element).closest("input,textarea,[contenteditable=true]")) return; const file = pictureIn(e.clipboardData.files); if (file) { e.preventDefault(); setImageRequest({ serial: Date.now(), file }); } }}
    onDragOver={e => { if (onSourceChange && Array.from(e.dataTransfer.items).some(item => item.kind === "file")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
    onDrop={e => { const file = pictureIn(e.dataTransfer.files); if (!onSourceChange || !file) return; e.preventDefault(); setImageRequest({ serial: Date.now(), file, point: roundPoint(clientPoint(e.clientX, e.clientY)) }); }}>
    <div className="board-heading"><Shapes size={18} /><div><strong>{diagram.name}</strong><span>{onSourceChange ? "Tablero UML" : "Solo lectura"} · {modeLabel}</span></div></div>
    <div className="canvas-tools" role="toolbar" aria-label="Vista del tablero">
      <button className={"icon-btn " + (showGrid ? "active" : "")} title="Mostrar cuadrícula (G)" aria-label="Mostrar cuadrícula" aria-pressed={showGrid} onClick={() => setShowGrid(v => !v)}><Grid2X2 size={17} /></button>
      {onSourceChange && !isSequence && <button className={"icon-btn " + (snapToGrid ? "active" : "")} title="Ajustar a cuadrícula de 20 px (S)" aria-label="Ajustar a cuadrícula" aria-pressed={snapToGrid} onClick={() => setSnapToGrid(v => !v)}><Magnet size={17} /></button>}
      {onSourceChange && !inspectorOpen && <details className="canvas-style">
        <summary aria-label="Ajustar flechas y etiquetas" title="Ajustar flechas y etiquetas"><SlidersHorizontal size={17} /></summary>
        <div className="style-popover">
          <label>Grosor de línea <output>{settings.lineWidth} px</output><input aria-label="Grosor de línea" type="range" min="1" max="6" step=".5" value={settings.lineWidth} onChange={e => changeSettings({ lineWidth: Number(e.target.value) })} /></label>
          {isClass && <label>Tamaño de punta <output>{Math.round(settings.arrowScale * 100)}%</output><input aria-label="Tamaño de punta" type="range" min="1" max="3" step=".1" value={settings.arrowScale} onChange={e => changeSettings({ arrowScale: Number(e.target.value) })} /></label>}
          {isClass && <label>Texto de relaciones <output>{settings.labelSize} px</output><input aria-label="Texto de relaciones" type="range" min="12" max="24" step="1" value={settings.labelSize} onChange={e => changeSettings({ labelSize: Number(e.target.value) })} /></label>}
        </div>
      </details>}
      <button className={"icon-btn " + (showShortcuts ? "active" : "")} aria-label="Atajos del lienzo" title="Atajos del lienzo (?)" aria-expanded={showShortcuts} onClick={() => setShowShortcuts(v => !v)}><Keyboard size={18} /></button>
      <span className="board-control-divider" />
      <button className={"icon-btn " + (isFocused ? "active" : "")} aria-label={isFocused ? "Salir de modo foco" : "Enfocar pantalla de dibujo"} aria-pressed={isFocused} title="Modo foco (F)" onClick={() => toggleFocus()}>{isFocused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      <button className="icon-btn" aria-label="Opciones del lienzo" title="Opciones del lienzo" onClick={e => { const box = e.currentTarget.getBoundingClientRect(); openContext(box.right - 256, box.bottom + 8, "", undefined); }}><MoreHorizontal size={19} /></button>
    </div>
    {showShortcuts && <section className="board-shortcuts" aria-label="Atajos de teclado">
      <header><strong>Tu lienzo, a mano</strong><button className="icon-btn" aria-label="Cerrar atajos" onClick={() => setShowShortcuts(false)}><X size={16} /></button></header>
      <p>Usá los atajos con el foco en el tablero.</p>
      <dl>{[["Seleccionar", "V"], ["Mano", "H"], ["Mano temporal", "Espacio"], ...(onSourceChange ? [["Añadir elemento", "N"], ["Conectar", "C"], ["Lápiz / resaltador / borrador", "P / M / E"], ["Texto / nota adhesiva", "T / K"], ["Selección múltiple", "Arrastrar en vacío"], ["Sumar / quitar de la selección", "Ctrl/⌘ clic"], ["Seleccionar todo", "Ctrl/⌘ A"]] : []), ["Ajustar / 100%", "1 / 0"], ["Cuadrícula", "G"], ["Modo foco", "F"], ...(onUndo ? [["Deshacer / rehacer", "Ctrl/⌘ Z / ⇧ Z"]] : [])].map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
      <footer>Rueda para zoom · Mayús + rueda para desplazar · Esc para cancelar</footer>
    </section>}
    {mode === "connect" && <div className="connection-prompt" role="status"><Link2 size={14} /><select aria-label="Relación rápida" value={activeKind} onChange={e => { if (isClass) setRelationKind(e.target.value as RelationKind); else setVisualKind(e.target.value); setOrigin(""); }}>{availableRelations.map(item => <option key={item.value} value={item.value}>{item.name}</option>)}</select>{isClass && <button className="icon-btn" title="Guía de relaciones UML" aria-label="Guía de relaciones UML" onClick={() => callbacks.current.onGuide(relationKind)}><BookOpen size={16} /></button>}<span>{origin ? origin + " → elegí el destino" : "Elegí el origen y después el destino"}</span><button className="icon-btn" title="Cancelar conexión" aria-label="Cancelar conexión" onClick={() => { setMode("move"); setOrigin(""); }}><X size={14} /></button></div>}
    {(mode === "draw" || mode === "erase") && onSourceChange && <div className="ink-toolbar" role="toolbar" aria-label="Opciones del lápiz" aria-orientation="vertical" onPointerDown={e => e.stopPropagation()}>
      <div className="ink-tools" role="group" aria-label="Herramienta">
        <button type="button" className={"ink-tool" + (mode === "draw" && penTool === "pen" ? " active" : "")} aria-pressed={mode === "draw" && penTool === "pen"} title="Lápiz (P)" aria-label="Lápiz" onClick={() => { setPenTool("pen"); setMode("draw"); }}><Pencil size={17} /></button>
        <button type="button" className={"ink-tool" + (mode === "draw" && penTool === "marker" ? " active" : "")} aria-pressed={mode === "draw" && penTool === "marker"} title="Resaltador (M)" aria-label="Resaltador" onClick={() => { setPenTool("marker"); setMode("draw"); }}><Highlighter size={17} /></button>
        <button type="button" className={"ink-tool" + (mode === "erase" ? " active" : "")} aria-pressed={mode === "erase"} title="Borrador de trazos (E)" aria-label="Borrador" disabled={!settings.strokes?.length} onClick={() => setMode("erase")}><Eraser size={17} /></button>
      </div>
      <div className="ink-swatches" role="group" aria-label="Color">
        {PEN_COLORS.map(c => <button key={c.value} type="button" className={"ink-swatch" + (penColor === c.value ? " active" : "")} style={{ backgroundColor: c.value }} title={c.label} aria-label={`Color ${c.label}`} aria-pressed={penColor === c.value} onClick={() => { setPenColor(c.value); setMode("draw"); }} />)}
        <label className={"ink-swatch ink-custom" + (!PEN_COLORS.some(c => c.value === penColor) ? " active" : "")} title="Otro color"><input type="color" aria-label="Otro color" value={penColor} onChange={e => { setPenColor(e.target.value); setMode("draw"); }} /></label>
      </div>
      <div className="ink-sizes" role="group" aria-label="Grosor">
        {PEN_SIZES[penTool].map(size => <button key={size} type="button" className={"ink-size" + (penWidth === size ? " active" : "")} aria-pressed={penWidth === size} title={`${size} px`} aria-label={`Grosor ${size} píxeles`} onClick={() => { setPenSizes(current => ({ ...current, [penTool]: size })); setMode("draw"); }}><span style={{ width: Math.min(20, size + 2), height: Math.min(20, size + 2), background: penColor, opacity: penTool === "marker" ? .45 : 1 }} /></button>)}
      </div>
      <div className="ink-actions">
        <button type="button" className="icon-btn" title="Deshacer último trazo" aria-label="Deshacer último trazo" disabled={!settings.strokes?.length} onClick={undoStroke}><Undo2 size={16} /></button>
        <button type="button" className="icon-btn" title="Borrar todos los dibujos" aria-label="Borrar todos los dibujos" disabled={!settings.strokes?.length} onClick={clearStrokes}><Trash2 size={16} /></button>
        <button type="button" className="icon-btn ink-done" title="Listo (V)" aria-label="Salir del modo lápiz" onClick={() => activateTool("move")}><Check size={16} /></button>
      </div>
    </div>}
    {strokeChoice && mode === "move" && onSourceChange && !busy && !error && <div className="node-selection" role="toolbar" aria-label="Trazo seleccionado" onPointerDown={e => e.stopPropagation()}>
      <strong>{strokeChoice.tool === "marker" ? <Highlighter size={15} /> : <Pencil size={15} />}Trazo</strong><span className="board-control-divider" />
      <div className="ink-swatches" role="group" aria-label="Color del trazo">{PEN_COLORS.map(c => <button key={c.value} type="button" className={"ink-swatch" + (strokeChoice.color === c.value ? " active" : "")} style={{ backgroundColor: c.value }} title={c.label} aria-label={`Color ${c.label}`} onClick={() => commitStrokes((settings.strokes || []).map((stroke, i) => i === selectedStroke ? { ...stroke, color: c.value } : stroke))} />)}</div>
      <span className="node-selection-hint">Arrastralo para moverlo</span>
      <button className="icon-btn board-delete" title="Eliminar trazo (Supr)" aria-label="Eliminar trazo" onClick={() => { commitStrokes((settings.strokes || []).filter((_, i) => i !== selectedStroke)); setSelectedStroke(-1); }}><Trash2 size={16} /></button>
      <button className="icon-btn" title="Deseleccionar (Esc)" aria-label="Deseleccionar trazo" onClick={() => setSelectedStroke(-1)}><X size={15} /></button>
    </div>}
    {chosenEdge && !busy && !error && <div className="relation-selection" role="region" aria-label="Relación seleccionada" onPointerDown={e => e.stopPropagation()}>
      <Link2 size={16} /><div className="relation-title"><strong>{chosenEdge.start} → {chosenEdge.end}</strong>{chosenRelation?.label && <span>{chosenRelation.label}</span>}</div>
      {onSourceChange && chosenRelation && <>
        <select className="relation-kind" aria-label="Tipo de relación" title="Cambiar el tipo de relación" value={availableRelations.some(r => r.value === chosenRelation.kind) ? chosenRelation.kind : ""} onChange={e => changeEdgeKind(e.target.value)}>
          {!availableRelations.some(r => r.value === chosenRelation.kind) && <option value="" disabled>{chosenRelation.kind}</option>}
          {availableRelations.map(r => <option key={r.value} value={r.value}>{r.name}</option>)}
        </select>
        <button className="icon-btn" title="Invertir dirección" aria-label="Invertir dirección de la relación" onClick={invertEdge}><ArrowLeftRight size={16} /></button>
      </>}
      {onSourceChange && !isSequence && chosenEdge.routeKey && <ColorButton label="Color de flecha" colors={[["Petróleo", "#1a647b"], ["Grafito", "#334155"], ["Azul", "#2563eb"], ["Violeta", "#7c3aed"], ["Rosa", "#db2777"], ["Rojo", "#dc2626"], ["Naranja", "#ea580c"], ["Verde", "#15803d"]]} value={settings.edgeColors?.[chosenEdge.routeKey]} onChange={color => changeColor("edgeColors", chosenEdge.routeKey!, color)} />}
      {onSourceChange && !isSequence && chosenEdge.routeKey && <details className="relation-route-menu">
        <summary className="icon-btn" title="Recorrido de la flecha" aria-label="Recorrido de la flecha"><Route size={16} /></summary>
        <div className="relation-routing">
          <label>Trazo<select aria-label="Forma de la conexión" value={settings.routes[chosenEdge.routeKey]?.shape || "automatic"} onChange={e => e.target.value === "automatic" ? resetRoute() : changeRoute({ shape: e.target.value as EdgeRoute["shape"] })}>
            <option value="automatic">Automático</option><option value="straight">Recta</option><option value="curved">Curva</option><option value="orthogonal">En ángulo</option>
          </select></label>
          <div className="relation-routing-row">
            <button className="btn" aria-label="Agregar punto de conexión" disabled={chosenRoute.points.length >= 20} onClick={addBend}><Plus size={14} />Punto</button>
            <button className="icon-btn" aria-label="Quitar último punto de conexión" title="Quitar último punto" disabled={!chosenRoute.points.length} onClick={() => changeRoute({ points: chosenRoute.points.slice(0, -1) })}><Minus size={15} /></button>
            <button className="icon-btn" aria-label="Restaurar recorrido automático" title="Restaurar recorrido automático" disabled={!settings.routes[chosenEdge.routeKey]} onClick={resetRoute}><RotateCcw size={15} /></button>
          </div>
          {(["from", "to"] as const).map(end => <label key={end}>{end === "from" ? "Origen" : "Destino"}<select aria-label={`Lado de ${end === "from" ? "origen" : "destino"}`} value={chosenRoute[end]?.side || "automatic"} onChange={e => changeRoute({ [end]: e.target.value === "automatic" ? undefined : { side: e.target.value as EdgeAnchor["side"], offset: .5 } })}><option value="automatic">Automático</option><option value="top">Arriba</option><option value="right">Derecha</option><option value="bottom">Abajo</option><option value="left">Izquierda</option></select></label>)}
          <span className="edge-route-hint">Arrastrá extremos y puntos sobre el lienzo. Supr quita un punto.</span>
        </div>
      </details>}
      {onSourceChange && <><button className="icon-btn" title="Editar etiqueta y multiplicidad" disabled={!chosenRelation} onClick={() => editEdge(selectedEdge)} aria-label="Editar relación seleccionada"><Pencil size={15} /></button><button className="icon-btn board-delete" title="Eliminar relación" aria-label="Eliminar relación seleccionada" disabled={!chosenRelation} onClick={() => { setFormError(""); setEdgeDelete(chosenRelation || null); }}><Trash2 size={16} /></button></>}
      <button className="icon-btn" title="Deseleccionar (Esc)" aria-label="Deseleccionar relación" onClick={() => setSelectedEdge("")}><X size={15} /></button>
    </div>}
    <div className="canvas-stage">
      {isClass && <CanvasFrames key={diagram.id} settings={settings} renderKey={result} addRequest={frameRequest} zoom={zoom} active={mode === "move" && !spaceHeld && !busy && !error} otherSelection={selection || selectedEdge} root={root} nodes={() => model.current.nodes} point={clientPoint} preview={next => showSettings(next)} commit={onSourceChange ? next => callbacks.current.onSourceChange && callbacks.current.onSettingsChange(next) : undefined} select={() => { setSelectedNode(""); setSelectedEdge(""); }} />}
      <CanvasNotes key={"notes-" + diagram.id} settings={settings} renderKey={result} zoom={zoom} dark={dark} active={mode === "move" && !spaceHeld && !busy && !error} placing={mode === "text" || mode === "sticky" ? mode : null}
        root={root} viewport={() => viewport.current} point={clientPoint} commit={onSourceChange ? next => callbacks.current.onSettingsChange(next) : undefined}
        onPlaced={() => setMode("move")} onSelect={() => { clearSelection(); }} />
      <CanvasImages key={"images-" + diagram.id} settings={settings} renderKey={result} zoom={zoom} active={mode === "move" && !spaceHeld && !busy && !error} board={diagram.id} inline={browserStorage}
        root={root} viewport={() => viewport.current} point={clientPoint} center={viewportCenterPoint} commit={onSourceChange ? next => callbacks.current.onSettingsChange(next) : undefined}
        onSelect={() => clearSelection()} onMessage={setFeedback} request={imageRequest} />
      {onSourceChange && <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="file-input" onChange={e => { const file = pictureIn(e.target.files); e.currentTarget.value = ""; if (file) setImageRequest({ serial: Date.now(), file }); }} />}
      <aside className="draw-side-toolbar" role="toolbar" aria-label="Herramientas del lienzo" aria-orientation="vertical">
        <button className={"icon-btn board-tool " + (mode === "move" && !spaceHeld ? "active" : "")} data-tooltip="Seleccionar · V" title="Seleccionar y mover (V)" aria-label="Seleccionar y mover" aria-pressed={mode === "move"} onClick={() => activateTool("move")}><MousePointer2 size={20} /></button>
        <button className={"icon-btn board-tool " + (mode === "hand" || spaceHeld ? "active" : "")} data-tooltip="Mano · H / Espacio" title="Mover lienzo (H o mantener Espacio)" aria-label="Mover lienzo" aria-pressed={mode === "hand" || spaceHeld} onClick={() => activateTool("hand")}><Hand size={20} /></button>
        {onSourceChange && <>
          <span className="draw-toolbar-divider" />
          <button className={"icon-btn board-tool " + (mode === "place" ? "active" : "")} data-tooltip={isClass ? "Nueva clase · N" : "Nuevo elemento · N"} title={isClass ? "Agregar clase en el lienzo (N)" : "Agregar elemento (N)"} aria-label={isClass ? "Agregar clase" : "Agregar elemento"} aria-pressed={mode === "place"} disabled={busy || !!error} onClick={() => { if (isSequence) openClass(); else activateTool(mode === "place" ? "move" : "place"); }}><Plus size={23} /></button>
          <button className={"icon-btn board-tool " + (mode === "connect" ? "active" : "")} data-tooltip="Conectar · C" title="Conectar elementos (C)" aria-label="Conectar elementos" aria-pressed={mode === "connect"} disabled={busy || !!error} onClick={() => activateTool(mode === "connect" ? "move" : "connect")}><Link2 size={20} /></button>
          <span className="draw-toolbar-divider" />
          {isClass && <button className="icon-btn board-tool" data-tooltip="Marco de módulo" title="Crear marco de módulo" aria-label="Crear marco de módulo" disabled={busy || !!error} onClick={() => { activateTool("move"); setSelectedNode(""); setSelectedEdge(""); setFrameRequest(value => value + 1); }}><FrameIcon size={20} /></button>}
          <button className={"icon-btn board-tool " + (mode === "draw" ? "active" : "")} data-tooltip="Lápiz · P" title="Lápiz (P)" aria-label="Lápiz" aria-pressed={mode === "draw"} disabled={busy || !!error} onClick={() => { if (mode !== "draw") setPenTool("pen"); activateTool(mode === "draw" ? "move" : "draw"); }}><Pencil size={20} /></button>
          <button className={"icon-btn board-tool " + (mode === "erase" ? "active" : "")} data-tooltip="Borrador · E" title="Borrador (E)" aria-label="Borrador" aria-pressed={mode === "erase"} disabled={busy || !!error} onClick={() => activateTool(mode === "erase" ? "move" : "erase")}><Eraser size={20} /></button>
          <button className={"icon-btn board-tool " + (mode === "text" ? "active" : "")} data-tooltip="Texto · T" title="Texto (T)" aria-label="Agregar texto" aria-pressed={mode === "text"} disabled={busy || !!error} onClick={() => activateTool(mode === "text" ? "move" : "text")}><Type size={20} /></button>
          <button className={"icon-btn board-tool " + (mode === "sticky" ? "active" : "")} data-tooltip="Nota adhesiva · K" title="Nota adhesiva (K)" aria-label="Agregar nota adhesiva" aria-pressed={mode === "sticky"} disabled={busy || !!error} onClick={() => activateTool(mode === "sticky" ? "move" : "sticky")}><StickyNote size={20} /></button>
          <button className="icon-btn board-tool" data-tooltip="Imagen · arrastrá o pegá" title="Agregar imagen (también podés arrastrarla o pegarla con Ctrl+V)" aria-label="Agregar imagen" disabled={busy || !!error} onClick={() => imageInput.current?.click()}><ImagePlus size={20} /></button>
          <span className="draw-toolbar-divider" />
          <button className="icon-btn board-tool" data-tooltip="Ordenar elementos" title="Ordenar automáticamente" aria-label="Ordenar automáticamente" disabled={busy || !!error || isSequence} onClick={arrange}><LayoutGrid size={20} /></button>

        </>}
      </aside>
      {onSourceChange && onUndo && onRedo && <div className="board-history" role="toolbar" aria-label="Historial del lienzo">
        <button className="icon-btn" title="Deshacer (Ctrl/⌘ Z)" aria-label="Deshacer en el lienzo" disabled={!canUndo || busy} onClick={onUndo}><Undo2 size={18} /></button>
        <button className="icon-btn" title="Rehacer (Ctrl/⌘ Mayús Z)" aria-label="Rehacer en el lienzo" disabled={!canRedo || busy} onClick={onRedo}><Redo2 size={18} /></button>
      </div>}
      {multi && mode === "move" && onSourceChange && !busy && !error && <div className="node-selection" role="toolbar" aria-label="Acciones de la selección">
        <strong>{selectedGroup.length} elementos</strong><span className="board-control-divider" />
        {!isSequence && <ColorButton label="Color de la selección" value={selectedGroup.every(name => settings.nodeColors?.[name] && settings.nodeColors[name] === settings.nodeColors?.[selectedGroup[0]]) ? settings.nodeColors?.[selectedGroup[0]] : undefined} onChange={colorSelection} />}
        {!isSequence && <div className="size-stepper" role="group" aria-label="Tamaño de la selección">
          <button className="icon-btn" title="Achicar" aria-label="Achicar selección" onClick={() => resizeSelection(1 / 1.15)}><Minus size={14} /></button>
          <button className="size-value" title="Tamaño original" aria-label="Restaurar tamaño original" onClick={() => resizeSelection("reset")}><MoveDiagonal2 size={14} /></button>
          <button className="icon-btn" title="Agrandar" aria-label="Agrandar selección" onClick={() => resizeSelection(1.15)}><Plus size={14} /></button>
        </div>}
        <button className="icon-btn board-delete" title="Eliminar selección (Supr)" aria-label="Eliminar elementos seleccionados" onClick={() => { setFormError(""); setDeleteGroup(selectedGroup); }}><Trash2 size={16} /></button>
        <button className="icon-btn" title="Deseleccionar (Esc)" aria-label="Deseleccionar todo" onClick={clearSelection}><X size={15} /></button>
      </div>}
      {!multi && selection && mode === "move" && onSourceChange && !busy && !error && <div className="node-selection" role="toolbar" aria-label={"Acciones de " + selection}>
        <strong title={selection}>{selection}</strong><span className="board-control-divider" />
        {!isSequence && <ColorButton label={isClass ? "Color de clase" : "Color del elemento"} value={settings.nodeColors && Object.hasOwn(settings.nodeColors, selection) ? settings.nodeColors[selection] : undefined} onChange={color => changeColor("nodeColors", selection, color)} />}
        {!isSequence && <div className="size-stepper" role="group" aria-label="Tamaño">
          <button className="icon-btn" title="Achicar" aria-label="Achicar elemento" disabled={scaleOf(selection) <= .4} onClick={() => resizeSelection(1 / 1.15)}><Minus size={14} /></button>
          <button className="size-value" title="Tamaño original" aria-label="Restaurar tamaño original" onClick={() => resizeSelection("reset")}>{Math.round(scaleOf(selection) * 100)}%</button>
          <button className="icon-btn" title="Agrandar (o arrastrá la esquina)" aria-label="Agrandar elemento" disabled={scaleOf(selection) >= 4} onClick={() => resizeSelection(1.15)}><Plus size={14} /></button>
        </div>}
        <span className="board-control-divider" />
        <button className="icon-btn" title="Editar elemento" aria-label="Editar elemento seleccionado" onClick={() => openClass(selection)}><Pencil size={16} /></button>
        <button className="icon-btn" title="Duplicar elemento" aria-label="Duplicar elemento seleccionado" onClick={() => copyClass(selection)}><Copy size={16} /></button>
        <button className="icon-btn" title="Conectar desde aquí" aria-label="Conectar elemento seleccionado" onClick={() => { activateTool("connect"); setOrigin(selection); }}><Link2 size={16} /></button>
        <button className="icon-btn board-delete" title="Eliminar elemento" aria-label="Eliminar elemento seleccionado" onClick={() => { setFormError(""); setDeleteTarget(selection); }}><Trash2 size={16} /></button>
        <button className="icon-btn" title="Deseleccionar" aria-label="Deseleccionar elemento" onClick={() => setSelectedNode("")}><X size={15} /></button>
      </div>}
      <div className={"diagram-viewport " + (dark ? "canvas-dark " : "") + (mode === "connect" ? "connecting " : "") + (mode === "place" ? "placing " : "") + (mode === "text" || mode === "sticky" ? "placing-note " : "") + (mode === "draw" ? "drawing " : "") + (mode === "erase" ? "erasing " : "") + (mode === "hand" || spaceHeld ? "hand-tool " : "") + (panning ? "is-panning" : "")} ref={viewport} tabIndex={0}
        style={{ backgroundImage: showGrid ? undefined : "none", backgroundSize: `${cellSize}px ${cellSize}px`, backgroundPosition: `calc(50% + ${pan.x - (result?.center?.x || 0) * zoom}px) calc(50% + ${pan.y - (result?.center?.y || 0) * zoom}px)` }} aria-label={"Lienzo de " + diagram.name}
        onFocusCapture={event => { const name = (event.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (name) setSelectedNode(name); }}
        onContextMenu={e => { e.preventDefault(); drag.current = null; const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id"); if (edgeId) { selectEdge(edgeId); return; } const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); const pt = roundPoint(clientPoint(e.clientX || box.x + box.width / 2, e.clientY || box.y + box.height / 2)); openContext(e.clientX || box.x + Math.min(box.width / 2, 180), e.clientY || box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || "", pt); }}
        onPointerDown={e => {
          if (e.button !== 0 && e.button !== 1) return;
          pointerNode.current = (e.target as Element).closest("[data-class]")?.getAttribute("data-class") || "";
          if ((e.target as Element).closest("button,.error-panel,.zoom-toolbar,.draw-side-toolbar")) return;
          if (e.button === 1 || mode === "hand" || spaceHeld) {
            e.preventDefault(); e.currentTarget.focus({ preventScroll: true });
            drag.current = { kind: "pan", x: e.clientX, y: e.clientY, start: viewState.current.pan, moved: false, navigationOnly: true };
            setPanning(true); capturePointer(e); return;
          }
          if (!(e.target as Element).closest("[data-class],[data-edge-id]")) e.currentTarget.focus({ preventScroll: true });
          if (mode === "draw" && onSourceChange && !busy && !error) {
            e.preventDefault();
            const pt = inkPoint(e);
            drag.current = { kind: "draw", x: e.clientX, y: e.clientY, start: pt, moved: false, points: [pt], raw: [pt] };
            const svg = root();
            if (svg) renderStrokes(svg, settingsRef.current.strokes || [], { points: [pt], color: penColor, width: penWidth, tool: penTool });
            capturePointer(e);
            return;
          }
          if (mode === "erase" && onSourceChange && !busy && !error) {
            e.preventDefault();
            const pt = clientPoint(e.clientX, e.clientY);
            const currentStrokes = settingsRef.current.strokes || [];
            const filtered = currentStrokes.filter(s => !pointNearStroke(pt, s, 14 / Math.max(.2, zoom)));
            const erased = filtered.length !== currentStrokes.length;
            drag.current = { kind: "erase", x: e.clientX, y: e.clientY, start: pt, moved: false, strokes: filtered, erased };
            if (erased) { const svg = root(); if (svg) renderStrokes(svg, filtered); }
            capturePointer(e);
            return;
          }
          const resizing = (e.target as Element).closest("[data-resize-handle]")?.getAttribute("data-resize-handle");
          if (resizing && onSourceChange && !busy && !error) {
            e.preventDefault();
            const at = positions.current[resizing], pt = clientPoint(e.clientX, e.clientY);
            drag.current = { kind: "resize", name: resizing, x: e.clientX, y: e.clientY, start: at, moved: false, scale: scaleOf(resizing), distance: Math.max(8, Math.hypot(pt.x - at.x, pt.y - at.y)) };
            capturePointer(e); return;
          }
          const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id");
          const handle = (e.target as Element).closest("[data-handle]");
          if (edgeId && handle && onSourceChange && !busy && !error) {
            e.preventDefault();
            drag.current = { kind: "edge", edgeId, handle: handle.getAttribute("data-handle")!, x: e.clientX, y: e.clientY, start: clientPoint(e.clientX, e.clientY), moved: false };
            capturePointer(e); return;
          }
          if (edgeId && mode !== "place") { e.preventDefault(); selectEdge(edgeId); Array.from(root()?.querySelectorAll<SVGElement>(".studio-edge-target") || []).find(el => el.getAttribute("data-edge-id") === edgeId)?.focus({ preventScroll: true }); return; }
          const node = (e.target as Element).closest("[data-class]");
          const name = node?.getAttribute("data-class");
          const additive = e.ctrlKey || e.metaKey;
          if (name && mode === "move" && additive && onSourceChange && !busy && !error) { e.preventDefault(); toggleInGroup(name); return; }
          if (name && mode !== "place" && onSourceChange && !busy && !error) {
            const together = mode === "move" && multi && selectedGroup.includes(name) && !isSequence;
            if (!together) setGroup([]);
            setSelectedNode(name);
            drag.current = { kind: "node", name, x: e.clientX, y: e.clientY, start: positions.current[name] || { x: 0, y: 0 }, moved: false,
              group: together ? selectedGroup.map(member => ({ name: member, start: positions.current[member] || { x: 0, y: 0 } })) : undefined };
          } else if (mode === "move" && onSourceChange && !busy && !error && strokeAt(clientPoint(e.clientX, e.clientY)) >= 0) {
            const index = strokeAt(clientPoint(e.clientX, e.clientY));
            clearSelection(); setSelectedStroke(index);
            drag.current = { kind: "stroke", x: e.clientX, y: e.clientY, start: { x: 0, y: 0 }, moved: false, strokeIndex: index };
          } else if (mode === "move" && e.pointerType !== "touch" && onSourceChange && !isSequence && !busy && !error) {
            // Dragging on empty board draws a selection box; the hand tool, Space and the middle button still pan.
            drag.current = { kind: "marquee", x: e.clientX, y: e.clientY, start: { x: 0, y: 0 }, moved: false, additive: additive || e.shiftKey ? (multi ? selectedGroup : selection ? [selection] : []) : [] };
          } else { drag.current = { kind: "pan", x: e.clientX, y: e.clientY, start: viewState.current.pan, moved: false }; setPanning(true); }
          capturePointer(e);
        }}
        onPointerMove={e => {
          if (!drag.current) { updateHoveredEdge((e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id") || ""); return; }
          const d = drag.current; if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
          if (d.kind === "draw" && d.points && d.raw) {
            const pt = inkPoint(e), last = d.raw[d.raw.length - 1];
            if (e.shiftKey) d.points = straightLine(d.raw[0], pt);
            else if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 1.2 / Math.max(.2, viewState.current.zoom) && d.raw.length < 4000) {
              // Each point moves part of the way toward the pointer; the ink catches up on release.
              d.raw.push(pt); d.points.push(streamline(d.points.at(-1)!, pt));
            } else return;
            const svg = root();
            if (svg) renderStrokes(svg, settingsRef.current.strokes || [], { points: d.points, color: penColor, width: penWidth, tool: penTool });
            return;
          }
          if (d.kind === "resize" && d.name && d.scale && d.distance) {
            const pt = clientPoint(e.clientX, e.clientY);
            const next = Math.round(Math.max(.4, Math.min(4, d.scale * Math.hypot(pt.x - d.start.x, pt.y - d.start.y) / d.distance)) * 100) / 100;
            const scales = { ...settingsRef.current.nodeScales, [d.name]: next };
            const svg = root();
            if (svg) { positions.current = applyCanvas(svg, model.current, withLayout({ ...settingsRef.current, nodeScales: scales }), dark); svg.querySelector(".studio-resize-handle")?.remove(); }
            d.next = { ...settingsRef.current, nodeScales: scales };
            return;
          }
          if (d.kind === "stroke" && d.strokeIndex !== undefined && d.moved) {
            const strokes = settingsRef.current.strokes || [], zoomNow = viewState.current.zoom;
            const moved = strokes.map((stroke, i) => i !== d.strokeIndex ? stroke : { ...stroke, points: stroke.points.map(p => ({ ...p, x: Math.round((p.x + dx / zoomNow) * 10) / 10, y: Math.round((p.y + dy / zoomNow) * 10) / 10 })) });
            d.strokes = moved;
            const svg = root();
            if (svg) { renderStrokes(svg, moved); renderStrokeSelection(svg, moved[d.strokeIndex], zoomNow); }
            return;
          }
          if (d.kind === "erase") {
            const pt = clientPoint(e.clientX, e.clientY);
            const currentStrokes = d.strokes || settingsRef.current.strokes || [];
            const filtered = currentStrokes.filter(s => !pointNearStroke(pt, s, 14 / Math.max(.2, viewState.current.zoom)));
            if (filtered.length !== currentStrokes.length) {
              d.strokes = filtered;
              d.erased = true;
              const svg = root();
              if (svg) renderStrokes(svg, filtered);
            }
            return;
          }
          if (d.kind === "edge" && d.moved && d.edgeId && d.handle) {
            d.next = moveEdgeHandle(d.edgeId, d.handle, clientPoint(e.clientX, e.clientY)); showSettings(d.next, d.edgeId, true);
          }
          else if (d.kind === "pan") {
            const nextPan = { x: d.start.x + dx, y: d.start.y + dy };
            syncViewDom(viewState.current.zoom, nextPan);
          }
          else if (d.kind === "marquee") {
            if (!d.moved) return;
            const box = e.currentTarget.getBoundingClientRect();
            setMarquee({ left: Math.min(d.x, e.clientX) - box.left, top: Math.min(d.y, e.clientY) - box.top, width: Math.abs(e.clientX - d.x), height: Math.abs(e.clientY - d.y) });
          }
          else if (mode === "move" && d.moved && d.group) moveGroup(d.group, dx / viewState.current.zoom, dy / viewState.current.zoom, snapToGrid && !e.altKey);
          else if (mode === "move" && d.moved && d.name) placeClass(d.name, snapPoint({ x: d.start.x + dx / viewState.current.zoom, y: d.start.y + dy / viewState.current.zoom }, snapToGrid && !e.altKey && !isSequence));
        }}
        onPointerUp={e => {
          const d = drag.current; drag.current = null; setPanning(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          if (!d || d.navigationOnly) return;
          if (d.kind === "draw" && d.points?.length) {
            const finished = e.shiftKey || !d.raw || d.raw.length < 2 ? d.points : [...d.points, d.raw.at(-1)!];
            const points = simplify(finished, .45 / Math.max(.2, viewState.current.zoom)).slice(0, 1500);
            const stroke: CanvasStroke = { points, color: penColor, width: penWidth, tool: penTool };
            const nextStrokes = [...(settingsRef.current.strokes || []).slice(-299), stroke];
            if (commitStrokes(nextStrokes)) { const svg = root(); if (svg) renderStrokes(svg, nextStrokes); }
            return;
          }
          if (d.kind === "stroke") {
            if (d.moved && d.strokes) commitStrokes(d.strokes);
            return;
          }
          if (d.kind === "resize") {
            if (d.moved && d.next) callbacks.current.onSettingsChange(d.next);
            return;
          }
          if (d.kind === "erase") {
            if (d.erased && d.strokes) {
              changeSettings({ strokes: d.strokes.length ? d.strokes : undefined });
            }
            return;
          }
          if (d.kind === "edge") {
            if (d.moved && d.next) callbacks.current.onSettingsChange(d.next);
            return;
          }
          if (d.kind === "marquee") {
            setMarquee(null);
            if (!d.moved) { clearSelection(); return; }
            const inside = namesInside(d.x, d.y, e.clientX, e.clientY);
            selectMany([...new Set([...(d.additive || []), ...inside])]);
            return;
          }
          if (!d.name) {
            if (!d.moved) {
              const clickedPoint = snapPoint(roundPoint(clientPoint(e.clientX, e.clientY)), snapToGrid && !e.altKey);
              if (mode === "place" && onSourceChange && !busy && !error) {
                setMode("move");
                openClass("", clickedPoint);
                return;
              }
              clearSelection();
            }
            return;
          }
          if (!d.moved) { if (d.group) setGroup([]); selectClass(d.name); }
          else if (mode === "move") {
            if (isSequence) { const x = d.start.x + (e.clientX - d.x) / viewState.current.zoom; const before = model.current.nodes.filter(n => n.name !== d.name).sort((a,b) => a.x - b.x).find(n => n.x > x)?.name; mutate(() => reorderSequence(diagram.source, d.name!, before)); return; }
            callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
            const svg = root();
            const node = Array.from(svg?.querySelectorAll<SVGGElement>("[data-class]") || []).find(node => node.getAttribute("data-class") === d.name);
            const outline = node?.querySelector("g.outer-path > path");
            if (outline && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) outline.animate([{ strokeWidth: "4px" }, { strokeWidth: "2.5px" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
          }
        }}
        onPointerCancel={() => {
          const cancelled = drag.current; drag.current = null; setPanning(false); setMarquee(null);
          if (!isSequence) showSettings(settingsRef.current);
          else if (cancelled?.kind === "node" && cancelled.name) placeClass(cancelled.name, cancelled.start);
          else { const svg = root(); if (svg) renderStrokes(svg, settingsRef.current.strokes); }
        }}
        onPointerLeave={() => updateHoveredEdge("")}
        onDoubleClick={e => { if (mode !== "move" || spaceHeld || busy || error || (e.target as Element).closest("button,[data-handle]")) return; const edgeId = (e.target as Element).closest("[data-edge-id]")?.getAttribute("data-edge-id"); if (edgeId) { editEdge(edgeId); return; } const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class") || pointerNode.current; if (name && mode === "move" && !busy && !error && onSourceChange) openClass(name); }}
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
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const node = (e.target as Element).closest("[data-class]"); const box = (node || e.currentTarget).getBoundingClientRect(); openContext(box.x + Math.min(box.width / 2, 180), box.y + Math.min(box.height / 2, 160), node?.getAttribute("data-class") || "", undefined); return; }
          const name = (e.target as Element).closest("[data-class]")?.getAttribute("data-class"); if (!name || busy || error) return;
          if (e.key === "Enter") { e.preventDefault(); if (mode === "connect") selectClass(name); else openClass(name); }
          const vectors: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
          const delta = vectors[e.key];
          if (delta && onSourceChange && !isSequence && multi && selectedGroup.includes(name)) {
            e.preventDefault(); moveGroup(selectedGroup.map(member => ({ name: member, start: positions.current[member] || { x: 0, y: 0 } })), delta.x, delta.y, false);
            callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
            return;
          }
          if (delta && onSourceChange && !isSequence && positions.current[name]) {
            e.preventDefault(); const point = positions.current[name]; placeClass(name, { x: Math.max(-19000, Math.min(19000, point.x + delta.x)), y: Math.max(-19000, Math.min(19000, point.y + delta.y)) });
            callbacks.current.onSettingsChange({ ...settingsRef.current, positions: { ...positions.current } });
          }
        }}
        >
        {marquee && <div className="selection-marquee" style={marquee} aria-hidden="true" />}
        {result && <div ref={art} className={"diagram-art " + (error ? "invalid-art" : "")}
          style={{ width: result.width, height: result.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, "--edge-emphasis-width": `${settings.lineWidth + 1.5}px` } as React.CSSProperties}
          dangerouslySetInnerHTML={markup} />}
        {busy && <div className="canvas-loading"><LoaderCircle size={16} className="spin" />Renderizando</div>}
        {error && <div className="error-panel" role="alert"><AlertCircle size={19} /><div><strong>Revisa la sintaxis</strong><pre>{error.slice(0, 1600)}</pre></div></div>}
        {!busy && !error && <span className="canvas-caption"><span className="board-mode-dot" />{modeLabel}<span className="canvas-context-hint">{mode === "hand" || spaceHeld ? "Arrastrá para recorrer el tablero"
          : mode === "draw" ? "Dibujá con el mouse o un lápiz · Mayús para una línea recta · V para terminar"
          : mode === "erase" ? "Tocá o arrastrá sobre un trazo para borrarlo"
          : mode === "text" || mode === "sticky" ? "Hacé clic donde quieras escribir · doble clic para editar después"
          : mode === "connect" ? "Elegí el origen y después el destino"
          : snapToGrid && onSourceChange && !isSequence ? "Ajuste a 20 px · Alt para mover libremente"
          : onSourceChange && !isSequence ? "Arrastrá en vacío para seleccionar varios · Espacio + arrastrar para navegar" : "Espacio + arrastrar para navegar · doble clic para editar"}</span></span>}
        {feedback && <div className="canvas-feedback" role="status"><span>{feedback}</span><button className="icon-btn" aria-label="Cerrar mensaje del lienzo" onClick={() => setFeedback("")}><X size={14} /></button></div>}
        <div className="zoom-toolbar" onPointerDown={e => e.stopPropagation()}>
          <button className="icon-btn" aria-label="Alejar" title="Alejar" onClick={() => changeZoom(-.1)}><Minus size={16} /></button>
          <button ref={zoomLabel} className="zoom-value" aria-label="Restablecer zoom al 100%" title="Restablecer zoom al 100% (0)" onClick={() => setViewZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button className="icon-btn" aria-label="Acercar" title="Acercar" onClick={() => changeZoom(.1)}><Plus size={16} /></button>
          <i /><button className="icon-btn" aria-label="Ajustar al lienzo" title="Ajustar al lienzo" onClick={() => fit()}><Scan size={17} /></button>
        </div>
      </div>
    </div>
    {context && <CanvasMenu x={context.x} y={context.y} title={context.name || "Opciones del lienzo"} actions={actions} onClose={closeContext} dark={dark} container={viewport.current?.closest("dialog") || undefined} />}
    {edgeForm && <Modal title="Editar relación" onClose={() => setEdgeForm(null)}><form onSubmit={e => { e.preventDefault(); try { callbacks.current.onSourceChange?.(isClass ? updateRelation(diagram.source, edgeForm, edgeForm) : updateVisualRelation(diagram.source, diagram.type, edgeForm, edgeForm)); setEdgeForm(null); setSelectedEdge(""); setFeedback("Relación actualizada. Podés recuperar el cambio con Deshacer."); } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <p><strong>{edgeForm.from}</strong> — <strong>{edgeForm.to}</strong></p>
      <label>Tipo de relación<select value={edgeForm.kind} onChange={e => setEdgeForm({ ...edgeForm, kind: e.target.value })}>{!availableRelations.some(r => r.value === edgeForm.kind) && <option value={edgeForm.kind}>{edgeForm.kind} (actual)</option>}{availableRelations.map(r => <option key={r.value} value={r.value}>{r.name}</option>)}</select></label>
      <label>{isDer ? "Cardinalidad" : "Etiqueta"}<input autoFocus maxLength={200} value={edgeForm.label} placeholder={isDer ? "1, N, (0,N), (1,1)" : "Por ejemplo: realiza"} onChange={e => setEdgeForm({ ...edgeForm, label: e.target.value })} /></label>
      {isClass && <div className="relation-cardinality"><label>Multiplicidad de {edgeForm.from}<input maxLength={30} placeholder="1" value={edgeForm.fromCard} onChange={e => setEdgeForm({ ...edgeForm, fromCard: e.target.value })} /></label><label>Multiplicidad de {edgeForm.to}<input maxLength={30} placeholder="0..*" value={edgeForm.toCard} onChange={e => setEdgeForm({ ...edgeForm, toCard: e.target.value })} /></label></div>}
      <p className="form-hint">Se conserva el código de las otras relaciones y la posición de los elementos.</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setEdgeForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />Aplicar cambios</button></div></form></Modal>}
    {edgeDelete && <Modal title="Eliminar relación" onClose={() => setEdgeDelete(null)}><div className="modal-body"><p>Se quitará la relación entre <strong>{edgeDelete.from}</strong> y <strong>{edgeDelete.to}</strong>. Los elementos se conservan.</p><p>Podés recuperarla con Deshacer.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setEdgeDelete(null)}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(isClass ? removeRelation(diagram.source, edgeDelete) : removeVisualRelation(diagram.source, diagram.type, edgeDelete)); setEdgeDelete(null); setSelectedEdge(""); setFeedback("Relación eliminada. Podés recuperarla con Deshacer."); } catch (error) { setFormError((error as Error).message); } }}><Trash2 size={16} />Eliminar relación</button></div></Modal>}
    {nodeForm && <Modal title={nodeForm.editing ? "Editar elemento" : "Agregar elemento"} onClose={() => setNodeForm(null)}><form onSubmit={e => { e.preventDefault(); try {
      let source = setVisualNode(diagram.source, diagram.type, nodeForm, !nodeForm.editing);
      if (isDer && !nodeForm.editing && nodeForm.owner && nodesInSource.some(n => n.id === nodeForm.owner)) source = addVisualRelation(source, "der", nodeForm.owner, nodeForm.id, "---", "");
      // An attribute attached to its owner is placed around it by the Chen layout.
      const orbit = isDer && !!nodeForm.owner && !["entity", "weak", "relationship", "identifying"].includes(nodeForm.kind);
      if (!nodeForm.editing && !isSequence && !orbit) {
        const targetPt = roundPoint(nodeForm.point || viewportCenterPoint());
        const nextPositions = { ...positions.current, ...settingsRef.current.positions, [nodeForm.id]: targetPt };
        source = writeCanvas(source, { ...readCanvas(source), positions: nextPositions });
        positions.current = nextPositions;
      }
      callbacks.current.onSourceChange?.(source); pendingNode.current = nodeForm.id; setSelectedNode(nodeForm.id); setNodeForm(null); setFeedback("Elemento guardado. Podés recuperar el cambio con Deshacer.");
    } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <label>Tipo de elemento<select aria-label="Tipo de elemento" value={nodeForm.kind} onChange={e => setNodeForm({ ...nodeForm, kind: e.target.value })}>{NODE_KINDS[diagram.type]?.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
      {isDer && <>
        <label>Nombre visible<input required data-autofocus maxLength={180} value={nodeForm.label} placeholder="Por ejemplo: Cliente, Realiza, DNI" onChange={e => { const label = e.target.value; const taken = nodesInSource.map(n => n.id); const ownerPrefix = nodeForm.owner && !["entity", "weak", "relationship", "identifying"].includes(nodeForm.kind) ? nodeForm.owner : ""; const automatic = !nodeForm.id || nodeForm.id === derIdFromLabel(nodeForm.label, taken, ownerPrefix); setNodeForm({ ...nodeForm, label, id: nodeForm.editing || !automatic ? nodeForm.id : derIdFromLabel(label, taken, ownerPrefix) }); }} /></label>
        {isDerRelationship(nodeForm.kind) && <label>Cardinalidad de la relación<input maxLength={20} value={nodeForm.body} placeholder="1:N, N:M, 1:1 (opcional)" onChange={e => setNodeForm({ ...nodeForm, body: e.target.value })} /></label>}
        {!nodeForm.editing && <label>Conectar con<select aria-label="Conectar con" value={nodeForm.owner || ""} onChange={e => setNodeForm({ ...nodeForm, owner: e.target.value || undefined })}><option value="">Sin conexión</option>{nodesInSource.map(n => <option key={n.id} value={n.id}>{n.label} ({n.id})</option>)}</select></label>}
      </>}
      <label>Identificador<input required autoFocus={!isDer} disabled={nodeForm.editing} maxLength={100} value={nodeForm.id} placeholder="Por ejemplo: Usuario" onChange={e => setNodeForm({ ...nodeForm, id: e.target.value })} /></label>
      {diagram.type !== "er" && !isDer && <label>Texto visible<input required maxLength={180} value={nodeForm.label} placeholder="Por ejemplo: Consultar pedidos" onChange={e => setNodeForm({ ...nodeForm, label: e.target.value })} /></label>}
      {diagram.type === "er" && <><label>Atributos<textarea aria-label="Atributos" rows={8} className="mono" value={nodeForm.body} onChange={e => setNodeForm({ ...nodeForm, body: e.target.value })} /></label><p className="form-hint">Un atributo por línea: tipo, nombre y clave opcional. Ejemplo: int id PK.</p></>}
      <p className="form-hint">{isDer ? "Entidades en rectángulo, relaciones en rombo y atributos en elipse. La clave primaria se muestra subrayada." : "El identificador conecta este elemento con el resto del diagrama. El código Mermaid se actualiza al guardar."}</p>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setNodeForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{nodeForm.editing ? "Aplicar cambios" : "Agregar elemento"}</button></div></form></Modal>}
    {connectionForm && <Modal title={isSequence ? "Agregar mensaje" : "Agregar conexión"} onClose={() => setConnectionForm(null)}><form onSubmit={e => { e.preventDefault(); try {
      callbacks.current.onSourceChange?.(addVisualRelation(diagram.source, diagram.type, connectionForm.from, connectionForm.to, connectionForm.kind, connectionForm.label));
      pendingLink.current = { from: connectionForm.from, to: connectionForm.to }; setConnectionForm(null); setFeedback(isSequence ? "Mensaje agregado al final de la secuencia." : "Conexión agregada.");
    } catch (error) { setFormError((error as Error).message); } }}><div className="modal-body">
      <div className="form-row">{(["from", "to"] as const).map(end => <label key={end}>{end === "from" ? "Origen" : "Destino"}<select aria-label={end === "from" ? "Origen" : "Destino"} value={connectionForm[end]} onChange={e => setConnectionForm({ ...connectionForm, [end]: e.target.value })}>{nodesInSource.map(n => <option key={n.id} value={n.id}>{n.label} ({n.id})</option>)}{diagram.type === "state" && <option value="[*]">Inicio / fin [*]</option>}</select></label>)}</div>
      <label>Tipo de conexión<select value={connectionForm.kind} onChange={e => setConnectionForm({ ...connectionForm, kind: e.target.value })}>{availableRelations.map(r => <option key={r.value} value={r.value}>{r.name}</option>)}</select></label>
      <label>{isSequence ? "Texto del mensaje" : isDer ? "Cardinalidad" : "Etiqueta"}<input autoFocus required={isSequence || diagram.type === "er"} maxLength={200} value={connectionForm.label} onChange={e => setConnectionForm({ ...connectionForm, label: e.target.value })} placeholder={isSequence ? "Por ejemplo: Solicitar pedido" : isDer ? "1, N, *, (0,N), (1,1) · vacío para atributos" : "Por ejemplo: Sí / No / confirmar"} /></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setConnectionForm(null)}>Cancelar</button><button className="btn primary"><Link2 size={16} />{isSequence ? "Agregar mensaje" : "Agregar conexión"}</button></div></form></Modal>}
    {classForm && <Modal title={classForm.editing ? "Editar clase" : "Agregar clase"} onClose={() => setClassForm(null)}><form onSubmit={e => { e.preventDefault(); saveClass(); }}><div className="modal-body">
      <label>Nombre<input required autoFocus maxLength={120} disabled={classForm.editing} value={classForm.name} placeholder="Por ejemplo: Cliente" onChange={e => setClassForm({ ...classForm, name: e.target.value })} /></label>
      <label>Atributos y métodos<textarea rows={8} className="mono" value={classForm.body} onChange={e => setClassForm({ ...classForm, body: e.target.value })} /></label>
      <div className="visibility-key"><code>+</code> Público <code>-</code> Privado <code>#</code> Protegido</div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setClassForm(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{classForm.editing ? "Aplicar cambios" : "Agregar clase"}</button></div></form></Modal>}
    {deleteGroup.length > 0 && <Modal title={`Eliminar ${deleteGroup.length} elementos`} onClose={() => setDeleteGroup([])}><div className="modal-body"><p>Se quitarán <strong>{deleteGroup.map(name => nodesInSource.find(n => n.id === name)?.label || name).join(", ")}</strong> y sus relaciones del diagrama.</p><p>Un solo Deshacer los recupera a todos.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setDeleteGroup([])}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(removeMany(deleteGroup)); setDeleteGroup([]); clearSelection(); setFeedback("Elementos eliminados. Podés recuperarlos con Deshacer."); } catch (e) { setFormError((e as Error).message); } }}><Trash2 size={16} />Eliminar {deleteGroup.length} elementos</button></div></Modal>}
    {deleteTarget && <Modal title={isClass ? "Eliminar clase" : "Eliminar elemento"} onClose={() => setDeleteTarget("")}><div className="modal-body"><p>Se quitará <strong>{deleteTarget}</strong> y sus relaciones del diagrama.</p><p>Podés recuperar este cambio con Deshacer en el editor.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setDeleteTarget("")}>Cancelar</button><button className="btn danger" onClick={() => { try { callbacks.current.onSourceChange?.(isClass ? removeClass(diagram.source, deleteTarget) : removeVisualNode(diagram.source, diagram.type, deleteTarget)); setDeleteTarget(""); setSelectedNode(""); setFeedback((isClass ? "Clase eliminada." : "Elemento eliminado.") + " Podés recuperar el cambio con Deshacer."); } catch(e) { setFormError((e as Error).message); } }}><Trash2 size={16} />{isClass ? "Eliminar clase" : "Eliminar elemento"}</button></div></Modal>}
  </div>;
}
