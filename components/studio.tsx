"use client";
/* eslint-disable @next/next/no-img-element -- Avatars are served by the online gateway behind the session cookie, or are local data URLs; next/image cannot optimize them. */

import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import Link from "next/link";
import ThemePicker from "./theme-picker";
import { Braces, GitBranch, Plus, Search, Folder, ChevronDown, ChevronRight, FileCode2, Upload, Download, Copy, Trash2, History, Undo2, Redo2, Code2, Eye, Columns2, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Check, Cloud, CloudOff, LoaderCircle, Shapes, Boxes, Workflow, Network, Database, ListTree, CircleDot, Link2, StickyNote, RefreshCw, Printer, X, MessageSquare, LayoutTemplate, Save, BookOpen, MousePointer2, SlidersHorizontal, Keyboard, HelpCircle, LockKeyhole, Maximize2, Minimize2, Users, Diamond, ExternalLink, ImageDown } from "lucide-react";
import { Diagram, DiagramInput, DiagramType, TYPE_LABELS, TEMPLATES, classBlocks, diagramInput, exportDocument, signature } from "@/lib/diagrams";
import CodeEditor, { EditorHandle } from "./code-editor";
import DiagramPreview, { SvgResult } from "./diagram-preview";
import Modal from "./modal";
import SharingDialog from "./sharing";
import { mergeSharedDiagram } from "@/lib/shared-sync";
import RelationGuide, { RelationSymbol } from "./relation-guide";
import { RELATIONS, appendRelation, cleanSource, readCanvas, relationInfo, writeCanvas } from "@/lib/canvas";
import { classMembers, setClassMembers } from "@/lib/class-actions";
import ClassProperties from "./class-properties";
import { browserStorage, studioRequest } from "@/lib/studio-request";
import type { PresenceEntry } from "@/lib/presence";
import ProfileDialog, { avatarUrl } from "./profile";

const ICONS = { class: Boxes, sequence: ListTree, state: CircleDot, activity: Workflow, usecase: Shapes, component: Network, er: Database, der: Diamond };
// Browsers refuse canvases beyond ~16k px per side or ~268 Mpx in total.
const PNG_SCALES = [{ value: 2, label: "2×" }, { value: 4, label: "4×" }, { value: 6, label: "6×" }, { value: 8, label: "8×" }];
function pngScale(width: number, height: number, requested: number) {
  return Math.max(.5, Math.min(requested, 16000 / Math.max(width, height, 1), Math.sqrt(200_000_000 / Math.max(1, width * height))));
}
type ModalKind = "profile" | "share" | "new" | "class" | "relation" | "guide" | "export" | "history" | "notes" | "delete" | "chat" | null;
type Revision = { revision: number; createdAt: string; diagram: Diagram };

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

async function api<T>(method = "GET", data?: unknown, query = ""): Promise<T> {
  const response = await studioRequest("/api/diagrams" + query, {
    method, headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new ApiError(result.error || "No se pudo completar la operación.", response.status);
  return result;
}

function download(content: Blob | string, name: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const PRESENCE_COLORS = ["#c2410c", "#7c3aed", "#0f766e", "#be123c", "#1d4ed8", "#a16207", "#15803d", "#9333ea"];
function presenceColor(userId: string) { let hash = 0; for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0; return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?"; }
/** Boards from another account are grouped by owner too, so equal project names never merge. */
function projectKey(d: Diagram) { return d.owner ? `${d.owner}\u0000${d.project}` : d.project; }
function filename(name: string) { return name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-") || "diagrama"; }
function IconButton({ title, children, onClick, disabled = false, active }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={"icon-btn " + (active ? "active" : "")} title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>;
}

const EMPTY: Record<DiagramType, string> = {
  class: "classDiagram\ndirection TB\n", sequence: "sequenceDiagram\n", state: "stateDiagram-v2\n[*] --> Inicio\n",
  activity: "flowchart TD\nInicio([Inicio])\n", usecase: "flowchart LR\n", component: "flowchart LR\n", er: "erDiagram\n",
  der: "flowchart LR\n%% DER en notación de Chen: entidades [ ], relaciones { } y atributos ([ ])\n",
};

export default function Studio() {
  const [documents, setDocuments] = useState<Diagram[]>([]);
  const docsRef = useRef<Diagram[]>([]);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef(""); selectedRef.current = selected;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const saved = useRef(new Map<string, string>());
  const serverSnapshots = useRef(new Map<string, Diagram>());
  const [profile, setProfile] = useState<{ owner?: string; displayName: string; sharing: boolean; color?: string; version?: number } | null>(null);
  const [syncOffline, setSyncOffline] = useState(false);
  // Tagged with its board so a list from the previous board is never shown on the next one.
  const [presenceState, setPresenceState] = useState<{ id: string; entries: PresenceEntry[] }>({ id: "", entries: [] });
  const presenceSession = useRef("");
  const presenceBeat = useRef<() => void>(() => {});
  const [shareRequest, setShareRequest] = useState<{ id: string; scope: "board" | "project" }>({ id: "", scope: "board" });
  const saveCycle = useRef(0);
  const saveLock = useRef<Promise<boolean> | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [editorHistory, setEditorHistory] = useState({ undo: false, redo: false });
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [inspectedClass, setInspectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [view, setView] = useState<"split" | "code" | "diagram">("diagram");
  const [svg, setSvg] = useState<SvgResult | null>(null);
  const [working, setWorking] = useState(false);
  const [exportScale, setExportScale] = useState(4);
  const [transparentPng, setTransparentPng] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [formError, setFormError] = useState("");
  const [newType, setNewType] = useState<DiagramType>("class");
  const [newName, setNewName] = useState("Nuevo diagrama");
  const [newProject, setNewProject] = useState("Mi primer proyecto");
  const [useTemplate, setUseTemplate] = useState(true);
  const [className, setClassName] = useState("NuevaClase");
  const [insertRequest, setInsertRequest] = useState<{ serial: number; kind: string }>();
  const [classBody, setClassBody] = useState("+String nombre\n+ejecutar() void");
  const [editingClass, setEditingClass] = useState("");
  const [relFrom, setRelFrom] = useState("");
  const [relTo, setRelTo] = useState("");
  const [relKind, setRelKind] = useState("-->");
  const [guideKind, setGuideKind] = useState("o--");
  const [relLabel, setRelLabel] = useState("");
  const [relCardFrom, setRelCardFrom] = useState("");
  const [relCardTo, setRelCardTo] = useState("");
  const [history, setHistory] = useState<Revision[]>([]);
  const [notes, setNotes] = useState("");
  const editor = useRef<EditorHandle>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const current = documents.find(d => d.id === selected);
  const canEdit = !recovering && current?.access !== "view";
  const isOwner = !current?.access || current.access === "owner";
  const selectionRef = useRef("");
  const presence = useMemo(() => profile?.sharing && presenceState.id === current?.id ? presenceState.entries : [], [profile?.sharing, presenceState, current?.id]);
  const others = useMemo(() => Array.from(new Map(presence.filter(p => !p.self).map(p => [p.userId, p])).values()), [presence]);
  const remoteSelections = useMemo(() => presence.filter(p => !p.self && p.selection).map(p => ({ name: p.selection, color: p.color || presenceColor(p.userId), label: p.displayName })), [presence]);
  const cleanCurrentSource = useMemo(() => current ? cleanSource(current.source) : "", [current?.source]);
  const blocks = useMemo(() => current?.type === "class" ? classBlocks(cleanCurrentSource) : [], [current?.type, cleanCurrentSource]);

  const updateDocuments = useCallback((update: (docs: Diagram[]) => Diagram[]) => {
    const next = update(docsRef.current); docsRef.current = next; setDocuments(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const docs = await api<Diagram[]>();
      saved.current = new Map(docs.map(d => [d.id, signature(d)]));
      serverSnapshots.current = new Map(docs.map(d => [d.id, d]));
      const requested = new URLSearchParams(window.location.search).get("diagram");
      updateDocuments(() => docs); setSelected(prev => requested && docs.some(d => d.id === requested) ? requested : docs.some(d => d.id === prev) ? prev : docs[0]?.id || "");
      setSaveState("saved");
    } catch (e) { setLoadError((e as Error).message); }
    finally { setLoading(false); }
  }, [updateDocuments]);

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (saveLock.current) return saveLock.current;
    const action = async () => {
      saveCycle.current++;
      let snapshot = docsRef.current.find(d => saved.current.get(d.id) !== signature(d));
      if (!snapshot) { setSaveState("saved"); return true; }
      setSaveState("saving");
      try {
        let rebases = 0;
        while (snapshot) {
          const id = snapshot.id;
          let result: Diagram;
          try { result = await api<Diagram>("PUT", snapshot); }
          catch (error) {
            if (error instanceof ApiError && error.status === 409 && rebases++ < 3) {
              const latest = await api<Diagram>("GET", undefined, "?id=" + encodeURIComponent(id));
              const base = serverSnapshots.current.get(id), local = docsRef.current.find(d => d.id === id);
              const merged = base && local && mergeSharedDiagram(base, local, latest);
              if (merged) {
                saved.current.set(id, signature(latest)); serverSnapshots.current.set(id, latest);
                updateDocuments(docs => docs.map(d => d.id === id ? merged : d));
                snapshot = docsRef.current.find(d => saved.current.get(d.id) !== signature(d)); continue;
              }
              throw new Error("Otra persona cambió la misma parte del tablero. Tu borrador está intacto: conservá una copia para revisar los cambios.");
            }
            throw error;
          }
          serverSnapshots.current.set(id, result);
          saved.current.set(id, signature(snapshot));
          updateDocuments(docs => docs.map(d => d.id === id ? { ...d, revision: result.revision, updatedAt: result.updatedAt } : d));
          snapshot = docsRef.current.find(d => saved.current.get(d.id) !== signature(d));
        }
        setSaveState("saved"); return true;
      } catch (e) { setSaveState("error"); setNotice((e as Error).message); return false; }
    };
    const promise = action(); saveLock.current = promise;
    try { return await promise; } finally { saveLock.current = null; }
  }, [updateDocuments]);

  useEffect(() => {
    void studioRequest("/api/study-profile").then(async response => { if (response.ok) setProfile(await response.json()); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!profile?.sharing) return;
    let cancelled = false, polling = false;
    const controller = new AbortController();
    const poll = async () => {
      if (polling || saveLock.current || document.hidden) return;
      polling = true;
      const cycle = saveCycle.current;
      try {
        const response = await fetch("/api/diagrams?versions=1", { signal: controller.signal });
        if (!response.ok) throw new Error("Sin conexión");
        const versions = await response.json() as { id: string; revision: number; access?: Diagram["access"] }[];
        const remote = await Promise.all(versions.map(async version => {
          const known = serverSnapshots.current.get(version.id);
          return known?.revision === version.revision ? { ...known, access: version.access } : await api<Diagram>("GET", undefined, "?id=" + encodeURIComponent(version.id));
        }));
        if (cancelled || saveLock.current || cycle !== saveCycle.current) return;
        setSyncOffline(false);
        const changed = remote.some(d => { const known = serverSnapshots.current.get(d.id); return !known || known.revision !== d.revision || known.access !== d.access; }) || remote.length !== serverSnapshots.current.size;
        if (!changed) return;
        const byId = new Map(remote.map(d => [d.id, d]));
        let conflict = false;
        const next = remote.map(server => {
          const local = docsRef.current.find(d => d.id === server.id), base = serverSnapshots.current.get(server.id);
          const dirty = local && saved.current.get(local.id) !== signature(local);
          if (dirty && local && base) {
            const merged = mergeSharedDiagram(base, local, server);
            if (!merged) { conflict = true; return { ...local, access: server.access }; }
            saved.current.set(server.id, signature(server)); serverSnapshots.current.set(server.id, server); return merged;
          }
          saved.current.set(server.id, signature(server)); serverSnapshots.current.set(server.id, server); return server;
        });
        for (const local of docsRef.current) if (!byId.has(local.id)) {
          if (saved.current.get(local.id) !== signature(local)) { next.push({ ...local, access: "view" }); conflict = true; }
          else { serverSnapshots.current.delete(local.id); saved.current.delete(local.id); }
        }
        updateDocuments(() => next);
        if (!next.some(d => d.id === selectedRef.current)) setSelected(next[0]?.id || "");
        if (conflict) { setSaveState("error"); setNotice("Hay cambios que necesitan revisión o cambió tu permiso. Tu borrador se conserva: guardalo como copia para continuar."); }
      } catch { if (!cancelled) setSyncOffline(true); } finally { polling = false; }
    };
    const timer = setInterval(() => void poll(), 2000);
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [profile?.sharing, updateDocuments]);

  useEffect(() => {
    const id = current?.id;
    if (!profile?.sharing || !id) return;
    presenceSession.current ||= crypto.randomUUID();
    let active = true;
    const send = (body: object, keepalive = false) => fetch("/api/presence", { method: "POST", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, session: presenceSession.current, ...body }) });
    const beat = async () => {
      if (document.hidden) return;
      try { const response = await send({ selection: selectionRef.current }); if (response.ok && active) setPresenceState({ id, entries: await response.json() }); } catch { /* The next heartbeat retries. */ }
    };
    presenceBeat.current = () => void beat();
    void beat();
    const timer = setInterval(() => void beat(), 5000);
    const leave = () => { void send({ leave: true }, true).catch(() => {}); };
    const visible = () => { if (!document.hidden) void beat(); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; clearInterval(timer); window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", visible); presenceBeat.current = () => {}; leave(); };
  }, [profile?.sharing, current?.id]);
  useEffect(() => { selectionRef.current = inspectedClass; const timer = setTimeout(() => presenceBeat.current(), 250); return () => clearTimeout(timer); }, [inspectedClass]);

  useEffect(() => { void load(); if (window.innerWidth <= 800) setSideOpen(false); if (window.innerWidth <= 1100) setPropertiesOpen(false); }, [load]);
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 800px)");
    const collapse = (event: MediaQueryListEvent) => { if (event.matches) { setSideOpen(false); setPropertiesOpen(false); } };
    narrow.addEventListener("change", collapse);
    return () => narrow.removeEventListener("change", collapse);
  }, []);
  useEffect(() => {
    if (!documents.some(d => saved.current.get(d.id) !== signature(d))) {
      if (saveState === "pending") setSaveState("saved");
      return;
    }
    if (saveState === "error") return;
    setSaveState("pending");
    const timeout = setTimeout(() => { void saveAll(); }, 1200);
    return () => clearTimeout(timeout);
  }, [documents, saveAll, saveState]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (docsRef.current.some(d => saved.current.get(d.id) !== signature(d))) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveAll(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveAll]);

  function edit(patch: Partial<DiagramInput>) {
    if (recovering || docsRef.current.find(d => d.id === selectedRef.current)?.access === "view") return;
    updateDocuments(docs => docs.map(d => d.id === selectedRef.current ? { ...d, ...patch } : d));
    if (saveState === "error") { setSaveState("pending"); setNotice(""); }
  }
  function openModal(kind: ModalKind) { setFormError(""); setModal(kind); }
  function beginNew() {
    setNewProject(current?.project || "Mi primer proyecto"); setNewName("Nuevo diagrama"); setNewType("class"); setUseTemplate(true); openModal("new");
  }
  async function choose(id: string) { if (await saveAll()) { setSvg(null); setSelected(id); setInspectedClass(""); setNotice(""); if (window.innerWidth <= 800) setSideOpen(false); } }
  async function create(data: DiagramInput, projectOwner?: string) {
    setWorking(true); setFormError("");
    try {
      if (!(await saveAll())) return;
      const doc = await api<Diagram>("POST", { ...data, projectOwner });
      saved.current.set(doc.id, signature(doc)); serverSnapshots.current.set(doc.id, doc); updateDocuments(docs => [...docs, doc]);
      setSelected(doc.id); setInspectedClass(""); setSvg(null); setModal(null); setSearch(""); setNotice("");
    } catch (e) { setFormError((e as Error).message); setNotice((e as Error).message); }
    finally { setWorking(false); }
  }
  function beginClass(name = "") {
    if (!canEdit) return;
    if (!name && view !== "code") {
      setInsertRequest({ serial: Date.now(), kind: "class" });
      return;
    }
    const block = blocks.find(b => b.name === name);
    setEditingClass(block?.name || ""); setClassName(block?.name || "NuevaClase");
    setClassBody(block?.body || "+String nombre\n+ejecutar() void"); openModal("class");
  }
  function saveClass() {
    if (!current || !/^[A-Za-z_][\w-]*$/.test(className)) { setFormError("Usa un nombre sin espacios: letras, números y guion bajo."); return; }
    if (/[{}]/.test(classBody)) { setFormError("Los miembros no pueden contener llaves."); return; }
    if (!editingClass && blocks.some(b => b.name === className)) { setFormError("Ya existe una clase con ese nombre."); return; }
    edit({ source: setClassMembers(current.source, className, classBody) });
    setModal(null);
  }
  function beginRelation() {
    if (!canEdit) return;
    setRelFrom(blocks[0]?.name || "Origen"); setRelTo(blocks[1]?.name || "Destino"); setRelKind("-->");
    setRelLabel(""); setRelCardFrom(""); setRelCardTo(""); openModal("relation");
  }
  function saveRelation() {
    if (!/^[A-Za-z_][\w-]*$/.test(relFrom) || !/^[A-Za-z_][\w-]*$/.test(relTo)) { setFormError("Origen y destino deben ser identificadores sin espacios."); return; }
    if (/["\n\r]/.test(relCardFrom + relCardTo) || /[\n\r]/.test(relLabel)) { setFormError("Usa una sola linea y cardinalidades sin comillas."); return; }
    const from = relFrom + (relCardFrom ? ` "${relCardFrom}"` : "");
    const to = (relCardTo ? `"${relCardTo}" ` : "") + relTo;
    edit({ source: writeCanvas(cleanSource(current!.source) + `\n${from} ${relKind} ${to}${relLabel ? " : " + relLabel : ""}\n`, readCanvas(current!.source)) }); setModal(null);
  }
  async function preserveCopy() {
    if (!current || recovering) return;
    setWorking(true); setRecovering(true); saveCycle.current++;
    try {
      const doc = await api<Diagram>("POST", { ...current, name: current.name.slice(0, 85) + " (mi copia)" });
      const remote = await api<Diagram[]>();
      saved.current = new Map(remote.map(d => [d.id, signature(d)])); serverSnapshots.current = new Map(remote.map(d => [d.id, d]));
      updateDocuments(() => remote); setSelected(doc.id); setSvg(null); setNotice(""); setSaveState("saved");
    } catch (e) { setNotice((e as Error).message); } finally { setWorking(false); setRecovering(false); }
  }
  async function showHistory() {
    if (!current) return;
    openModal("history"); setWorking(true); setHistory([]);
    try { if (await saveAll()) setHistory(await api<Revision[]>("GET", undefined, `?id=${encodeURIComponent(current.id)}&history=1`)); }
    catch (e) { setFormError((e as Error).message); } finally { setWorking(false); }
  }
  async function removeCurrent() {
    if (!current) return;
    setWorking(true);
    try {
      if (!(await saveAll())) return;
      const fresh = docsRef.current.find(d => d.id === current.id)!;
      await api("DELETE", { id: fresh.id, revision: fresh.revision });
      saved.current.delete(fresh.id); updateDocuments(docs => docs.filter(d => d.id !== fresh.id));
      setSelected(docsRef.current[0]?.id || ""); setSvg(null); setModal(null);
    } catch (e) { setFormError((e as Error).message); } finally { setWorking(false); }
  }
  async function importFile(file: File) {
    try {
      if (file.size > 150000) throw new Error("El archivo es demasiado grande (máximo 150 KB).");
      const text = await file.text();
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (parsed.format !== "uml-studio" || parsed.version !== 1) throw new Error("Elige un archivo JSON exportado por UML Studio.");
        await create(diagramInput.parse(parsed.diagram));
      } else {
        const type: DiagramType = text.includes("classDiagram") ? "class" : text.includes("sequenceDiagram") ? "sequence" : text.includes("stateDiagram") ? "state" : text.includes("erDiagram") ? "er" : /:::der[A-Z]/.test(text) ? "der" : text.includes(":::umlActor") ? "usecase" : "activity";
        await create({ name: file.name.replace(/\.[^.]+$/, ""), type, source: text, project: current?.project || "Importados", theme: "studio", notes: "" });
      }
    } catch (e) { setNotice((e as Error).message); }
  }
  async function exportPng() {
    if (!svg || !current) return;
    setWorking(true); setFormError("");
    const url = URL.createObjectURL(new Blob([svg.svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image(); image.src = url;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("No se pudo preparar la imagen.")); });
      const scale = pngScale(svg.width, svg.height, exportScale), margin = Math.round(16 * scale);
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(svg.width * scale + margin * 2); canvas.height = Math.ceil(svg.height * scale + margin * 2);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("El navegador no pudo reservar memoria para esa resolución. Probá con una escala menor.");
      if (!transparentPng) { context.fillStyle = current.theme === "studio" ? getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || "#f8fbfc" : current.theme === "dark" ? "#20252d" : "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.imageSmoothingQuality = "high";
      // The SVG is rasterized directly at the target size, so text and lines stay sharp.
      context.drawImage(image, margin, margin, svg.width * scale, svg.height * scale);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo exportar PNG. Probá con una escala menor.")), "image/png"));
      download(blob, `${filename(current.name)}-${Math.round(scale * 10) / 10}x.png`);
    } catch (e) { setFormError((e as Error).message); }
    finally { URL.revokeObjectURL(url); setWorking(false); }
  }
  function openHighResolution() {
    if (!svg || !current) return;
    const background = current.theme === "dark" ? "#20252d" : "#ffffff";
    const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${current.name.replace(/[<&>"]/g, "")} · alta resolución</title><style>html,body{margin:0;background:${background};}body{display:grid;place-items:center;min-height:100vh;}svg{width:min(96vw,${Math.round(svg.width * 2)}px);height:auto;max-width:none;}</style></head><body>${svg.svg}</body></html>`;
    const url = URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" }));
    if (!window.open(url, "_blank")) setFormError("El navegador bloqueó la ventana nueva. Permití ventanas emergentes para este sitio.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function refresh() {
    if (await saveAll()) { setNotice(""); await load(); }
  }
  function insertSnippet(kind: string) {
    if (!current) return;
    if (current.type !== "class" && ["participant", "actor", "message", "state", "transition", "node", "decisión", "flow", "usecase", "component", "database", "entity", "erlink", "weak", "relationship", "identifying", "attribute", "key", "multivalued", "derived"].includes(kind)) { setInsertRequest({ serial: Date.now(), kind }); return; }
    const suffix = Math.floor(Date.now() % 100000);
    const id = "Elemento" + suffix;
    const snippets: Record<string, string> = {
      participant: `participant ${id} as Nuevo participante`, message: `Usuario->>App: Nuevo mensaje`,
      alternative: "alt Condicion\n  Usuario->>App: Solicitud\nelse Otra condicion\n  App-->>Usuario: Respuesta\nend",
      loop: "loop Por cada elemento\n  Usuario->>App: Procesar\nend",
      state: `state "Nuevo estado" as ${id}`, transition: `Inicio --> ${id}: evento`,
      composite: `state ${id} {\n  [*] --> Activo${suffix}\n  Activo${suffix} --> [*]\n}`,
      node: `${id}[Nueva actividad]`, decisión: `${id}{Condicion?}`, flow: `Inicio --> ${id}`,
      usecase: `${id}([Nuevo caso de uso])`, actor: `${id}[Nuevo actor]`,
      component: `${id}[Nuevo componente]`, database: `${id}[(Base de datos)]`,
      entity: `${id} {\n  int id PK\n  string nombre\n}`, erlink: `ENTIDAD_A ||--o{ ENTIDAD_B : relación`,
      note: current.type === "class" ? `note "Nueva nota"` : current.type === "sequence" ? "Note over Usuario,App: Nueva nota" : `%% Nueva nota`,
    };
    if (snippets[kind]) editor.current?.insert(snippets[kind]);
  }

  const projects = Array.from(new Set(documents.map(d => d.project)));
  const projectGroups = Array.from(new Map(documents.map(d => [projectKey(d), d])).entries());
  // Editors of a shared project add new diagrams to the owner's project.
  const sharedOwnerFor = (project: string) => current?.sharedProject && current.access === "edit" && current.owner && current.project === project ? current.owner : undefined;
  const filtered = documents.filter(d => (d.name + " " + d.project + " " + TYPE_LABELS[d.type]).toLowerCase().includes(search.toLowerCase()));
  const tools = current?.type === "sequence" ? [["participant", "Participante"], ["actor", "Actor"], ["message", "Mensaje"], ["alternative", "Alternativa"], ["loop", "Bucle"]]
    : current?.type === "state" ? [["state", "Estado"], ["transition", "Transición"], ["composite", "Estado compuesto"]]
    : current?.type === "er" ? [["entity", "Entidad"], ["erlink", "Relación"]]
    : current?.type === "der" ? [["entity", "Entidad"], ["weak", "Entidad débil"], ["relationship", "Relación (rombo)"], ["attribute", "Atributo"], ["key", "Atributo clave"], ["multivalued", "Multivaluado"], ["derived", "Derivado"], ["flow", "Conexión"]]
    : current?.type === "usecase" ? [["actor", "Actor"], ["usecase", "Caso de uso"], ["flow", "Relación"]]
    : current?.type === "component" ? [["component", "Componente"], ["database", "Base de datos"], ["flow", "Conexion"]]
    : [["node", "Actividad"], ["decisión", "Decisión"], ["flow", "Conexion"]];

  const canvasSettings = useMemo(() => current && propertiesOpen ? readCanvas(current.source) : null, [current?.source, propertiesOpen]);
  const selectedBlock = blocks.find(block => block.name === inspectedClass);
  const selectedBody = useMemo(() => selectedBlock && propertiesOpen ? classMembers(cleanCurrentSource, selectedBlock.name) : "", [cleanCurrentSource, propertiesOpen, selectedBlock]);
  const openNotes = () => { if (current && canEdit) { setNotes(current.notes); setNewProject(current.project); openModal("notes"); } };
  const goStudy = async () => { if (await saveAll()) { const exercise = new URLSearchParams(window.location.search).get("ejercicio"); window.location.assign("/estudio" + (exercise ? "?ejercicio=" + encodeURIComponent(exercise) : "")); } };
  const selectForInspection = (name: string) => { setInspectedClass(name); };

  return <main className={"studio " + (!sideOpen ? "sidebar-hidden " : "") + (!propertiesOpen ? "properties-hidden " : "") + (canvasFocused ? "canvas-focused-mode" : "")}>
    <header className="app-header">
      <Link className="brand" href="/" aria-label="UML Studio, inicio"><GitBranch size={24} /><span>UML<span className="brand-light"> Studio</span></span></Link>
      <div className="header-meta"><span className="workspace-label">Espacio de trabajo</span></div>
      <div className="header-actions">
        <ThemePicker /><Link href="/git" className="btn header-quiet header-git-link" aria-label="Laboratorio Git"><GitBranch size={16} /><span>Git Lab</span></Link>
        <span className={"save-status " + saveState} aria-live="polite">
          {saveState === "saving" ? <LoaderCircle size={14} className="spin" /> : saveState === "error" ? <CloudOff size={15} /> : browserStorage ? <Save size={15} /> : <Cloud size={15} />}
          {saveState === "saved" ? browserStorage ? "Guardado en este navegador" : profile?.sharing ? syncOffline ? "Reconectando…" : canEdit ? "Guardado · online" : "Solo lectura · online" : "Guardado" : saveState === "pending" ? "Cambios pendientes" : saveState === "saving" ? "Guardando" : "Sin guardar"}
        </span>
        <span className="divider" /><button className="btn header-quiet studio-study-btn" aria-label="Estudio IS II" title="Abrir Estudio IS II" onClick={() => void goStudy()}><BookOpen size={16} /><span>Estudio IS II</span><span className="studio-study-short">Estudio</span></button>{profile?.sharing && profile.owner && <button type="button" className="online-account" title="Mi perfil" aria-label={`Mi perfil: ${profile.displayName}`} onClick={() => openModal("profile")}><span className="account-avatar" style={{ background: profile.color || presenceColor(profile.owner) }}><img alt="" src={avatarUrl(profile.owner, profile.version)} /></span><span>{profile.displayName}</span></button>}<button className="btn header-quiet chat-btn" onClick={() => { if (profile?.sharing && current) download(exportDocument(current), filename(current.name) + ".uml.json", "application/json"); else openModal("chat"); }}><MessageSquare size={16} /><span>{profile?.sharing ? "Exportar JSON" : browserStorage ? "Compartir JSON" : "Conectar con ChatGPT"}</span></button>
      </div>
    </header>

    <nav className="app-rail" aria-label="Navegación de la aplicación">
      <IconButton title="Explorador de diagramas" active={sideOpen} onClick={() => { setSideOpen(open => !open); if (window.innerWidth <= 800) setPropertiesOpen(false); }}><Folder size={20} /></IconButton>
      <IconButton title="Nuevo diagrama" disabled={loading || !!loadError} onClick={beginNew}><Plus size={20} /></IconButton>
      <IconButton title="Notas del diagrama" disabled={!current} onClick={openNotes}><StickyNote size={20} /></IconButton>
      <span className="rail-divider" />
      <IconButton title="Estudio IS II" onClick={() => void goStudy()}><BookOpen size={20} /></IconButton>
      <Link href="/git" className="icon-btn" aria-label="Laboratorio Git" title="Laboratorio Git"><GitBranch size={20} /></Link>
      <div className="rail-bottom"><IconButton title="Guía de relaciones UML" onClick={() => openModal("guide")}><HelpCircle size={20} /></IconButton></div>
    </nav>

    <aside className="sidebar">
      <div className="sidebar-heading"><h2>Diagramas</h2><IconButton title="Ocultar explorador" onClick={() => setSideOpen(false)}><PanelLeftClose size={16} /></IconButton></div>
      <button className="btn primary new-btn" onClick={beginNew} disabled={loading || !!loadError}><Plus size={17} />Nuevo diagrama</button>
      <label className="search-box"><Search size={15} /><input aria-label="Buscar diagramas" placeholder="Buscar diagramas" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="diagram-list">
        {projectGroups.map(([key, sample]) => {
          const items = filtered.filter(d => projectKey(d) === key);
          if (!items.length) return null;
          const closed = collapsed.includes(key) && !search;
          const own = !sample.owner;
          return <section key={key} className="project-group">
            <div className="project-row">
              <button className="project-title" onClick={() => setCollapsed(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}>
                {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<Folder size={15} /><span>{sample.project}{!own && <em className="project-shared">{sample.ownerName ? `de ${sample.ownerName}` : "compartido"}</em>}</span><small>{items.length}</small>
              </button>
              {profile?.sharing && own && <IconButton title={`Compartir el proyecto ${sample.project}`} onClick={async () => { if (await saveAll()) { setShareRequest({ id: sample.id, scope: "project" }); openModal("share"); } }}><Users size={14} /></IconButton>}
            </div>
            {!closed && items.map(doc => { const Icon = ICONS[doc.type]; return <button key={doc.id} className={"diagram-item " + (selected === doc.id ? "selected" : "")} onClick={() => void choose(doc.id)}>
              <Icon size={17} /><span><strong>{doc.name}</strong><small>{TYPE_LABELS[doc.type]}{doc.access === "edit" || doc.access === "view" ? " · Compartido" : ""}</small></span>
              {selected === doc.id && <Check size={13} className="document-selected-icon" />}
            </button>; })}
          </section>;
        })}
        {search && !filtered.length && <div className="list-empty">No hay resultados.</div>}
        {!loading && !documents.length && !loadError && <div className="list-empty">Todavía no hay diagramas.</div>}
      </div>
      {current && <section className="toolbox" aria-label="Herramientas de diagramado"><div className="toolbox-heading"><h2>Insertar</h2><span>{TYPE_LABELS[current.type]}</span></div>
        {current.type === "class" ? <>
          <button disabled={!canEdit} className="sidebar-tool" onClick={() => beginClass()}><Boxes size={17} /><span>Clase</span><Plus size={13} /></button>
          <button disabled={!canEdit} className="sidebar-tool" onClick={beginRelation}><Link2 size={17} /><span>Relación</span><Plus size={13} /></button>
        </> : tools.map(([kind, label]) => <button disabled={!canEdit} className="sidebar-tool" key={kind} onClick={() => insertSnippet(kind)}><Shapes size={17} /><span>{label}</span><Plus size={13} /></button>)}
        <button disabled={!canEdit} className="sidebar-tool" onClick={() => insertSnippet("note")}><StickyNote size={17} /><span>Nota</span><Plus size={13} /></button>
      </section>}
      <div className="sidebar-bottom"><button className="sidebar-action" onClick={() => importInput.current?.click()} disabled={loading || !!loadError}><Upload size={16} />Importar archivo</button>
        <button className="sidebar-action" onClick={beginNew} disabled={loading || !!loadError}><LayoutTemplate size={16} />Plantillas</button>
        <div className="sidebar-count"><span>{documents.length} diagramas</span><span><LockKeyhole size={11} />{profile?.sharing ? "Online" : "Personal"}</span></div>
      </div>
    </aside>

    <section className="main-workspace">
      {current && !loading ? <>
        <div className="document-header">
          <div className="document-title">
            {!sideOpen && <IconButton title="Mostrar explorador" onClick={() => setSideOpen(true)}><PanelLeft size={18} /></IconButton>}
            <div className="document-breadcrumb"><Folder size={13} /><span>{current.project}</span><ChevronRight size={12} /><span>{TYPE_LABELS[current.type]}</span></div>
            <input readOnly={!canEdit} className="name-input" aria-label="Nombre del diagrama" value={current.name} maxLength={100} onChange={e => edit({ name: e.target.value })} onBlur={() => { if (canEdit && !current.name.trim()) edit({ name: "Sin titulo" }); }} />
          </div>
          <div className="document-actions">{profile?.sharing && others.length > 0 && <div className="presence-stack" role="group" aria-label={`${others.length === 1 ? "1 persona conectada" : others.length + " personas conectadas"} a este tablero`}>
              {others.slice(0, 4).map(p => <span key={p.userId} className="presence-avatar" style={{ background: p.color || presenceColor(p.userId), borderColor: p.color || undefined }} title={p.displayName + (p.selection ? ` · en ${p.selection}` : " · conectado")}>{initials(p.displayName)}<img alt="" src={avatarUrl(p.userId)} onError={e => { e.currentTarget.hidden = true; }} /></span>)}
              {others.length > 4 && <span className="presence-avatar presence-more" title={others.slice(4).map(p => p.displayName).join(", ")}>+{others.length - 4}</span>}
              <span className="presence-label">{others.length === 1 ? others[0].displayName.split(" ")[0] + " está aquí" : others.length + " conectados"}</span>
            </div>}
            {profile?.sharing && <button className="btn" onClick={async () => { if (await saveAll()) { setShareRequest({ id: current.id, scope: "board" }); openModal("share"); } }}><Users size={16}/><span>Compartir</span></button>}<IconButton title="Guardar ahora" onClick={() => void saveAll()}><Save size={17} /></IconButton><IconButton title={browserStorage || profile?.sharing ? "Recargar diagramas" : "Actualizar desde el chat"} onClick={() => void refresh()}><RefreshCw size={17} /></IconButton><IconButton title="Historial de versiones" onClick={() => void showHistory()}><History size={17} /></IconButton>
            <button className="btn export-btn" aria-label="Exportar diagrama" onClick={() => openModal("export")}><Download size={16} /><span>Exportar</span></button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <div className="toolbar-left"><div className="segmented view-switch" role="group" aria-label="Vista del editor">
            <button className={view === "diagram" ? "active" : ""} aria-pressed={view === "diagram"} onClick={() => setView("diagram")}><Shapes size={15} /><span>Lienzo</span></button>
            <button className={view === "split" ? "active" : ""} aria-pressed={view === "split"} onClick={() => setView("split")}><Columns2 size={15} /><span>Dividir</span></button>
            <button className={view === "code" ? "active" : ""} aria-pressed={view === "code"} onClick={() => setView("code")}><Code2 size={15} /><span>Código</span></button>
          </div><span className="toolbar-divider" /><IconButton title="Deshacer" disabled={!canEdit || !editorHistory.undo} onClick={() => editor.current?.undo()}><Undo2 size={16} /></IconButton><IconButton title="Rehacer" disabled={!canEdit || !editorHistory.redo} onClick={() => editor.current?.redo()}><Redo2 size={16} /></IconButton></div>
          <div className="toolbar-right">
            <IconButton title={canvasFocused ? "Salir de pantalla casi completa" : "Enfocar pantalla de dibujo (pantalla casi completa)"} active={canvasFocused} onClick={() => { if (view === "code") setView("diagram"); setCanvasFocused(f => !f); }}>{canvasFocused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</IconButton>
            <IconButton title="Notas y proyecto" active={!!current.notes} onClick={openNotes}><StickyNote size={16} /></IconButton>
            <IconButton title="Duplicar diagrama" onClick={() => void create({ ...current, name: current.name + " (copia)" }, sharedOwnerFor(current.project))}><Copy size={16} /></IconButton>
            <IconButton title="Eliminar diagrama" disabled={!isOwner} onClick={() => openModal("delete")}><Trash2 size={16} /></IconButton>
            <span className="toolbar-divider" /><IconButton title={propertiesOpen ? "Ocultar propiedades" : "Mostrar propiedades"} active={propertiesOpen} onClick={() => { setPropertiesOpen(open => !open); if (window.innerWidth <= 800) setSideOpen(false); }}>{propertiesOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />}</IconButton>
          </div>
        </div>
        {notice && <div className="notice" role="alert"><CloudOff size={16} /><span>{notice}</span>{current && <><button className="text-btn" disabled={working} onClick={() => void preserveCopy()}>Conservar como copia</button><button className="text-btn" onClick={() => download(exportDocument(current), filename(current.name) + ".uml.json")}>Descargar borrador</button></>}<button className="text-btn" onClick={() => { setSaveState("pending"); void saveAll(); }}>Reintentar</button><IconButton title="Cerrar aviso" onClick={() => setNotice("")}><X size={14} /></IconButton></div>}
        <div className={"editor-workspace view-" + view}>
          <section className="code-pane">
            <div className="pane-header"><span><Braces size={15} />Código</span><small>Mermaid</small></div>
            <CodeEditor readOnly={!canEdit} remoteRevision={current.revision} ref={editor} key={current.id} value={current.source} onChange={source => edit({ source })} onHistoryChange={setEditorHistory} />
            <div className="code-footer"><span>{current.source.split("\n").length} líneas</span><span>UTF-8</span></div>
          </section>
          <section className="canvas-pane"><div className="pane-header canvas-pane-heading"><span><Shapes size={15} />{TYPE_LABELS[current.type]}</span><span className="live-label"><Check size={12} />Sincronizado con Mermaid</span></div>
            <DiagramPreview initialFit="contain" insertRequest={insertRequest} diagram={current} onRendered={setSvg} onClassClick={name => beginClass(name)} onSourceChange={canEdit ? source => edit({ source }) : undefined}
              selectedClass={inspectedClass} onSelectionChange={selectForInspection} inspectorOpen={propertiesOpen} remoteSelections={remoteSelections}
              onUndo={canEdit ? () => editor.current?.undo() : undefined} onRedo={canEdit ? () => editor.current?.redo() : undefined} canUndo={editorHistory.undo} canRedo={editorHistory.redo}
              focused={canvasFocused} onFocusChange={setCanvasFocused}
              onSettingsChange={settings => edit({ source: writeCanvas(current.source, settings) })}
              onConnect={(from, to, kind, positions) => edit({ source: writeCanvas(appendRelation(current.source, from, to, kind), { ...readCanvas(current.source), positions }) })}
              onGuide={kind => { setGuideKind(kind); openModal("guide"); }} />
          </section>
          <aside className="properties-panel" aria-label="Propiedades del diagrama">
            <div className="pane-header"><span><SlidersHorizontal size={15} />Propiedades</span><IconButton title="Cerrar propiedades" onClick={() => setPropertiesOpen(false)}><X size={15} /></IconButton></div>
            <fieldset className="properties-content" disabled={!canEdit}>
              {selectedBlock ? <>
                <button className="property-back" onClick={() => setInspectedClass("")}><ChevronRight size={13} />Volver al diagrama</button>
                <ClassProperties key={current.id + selectedBlock.name + selectedBody} name={selectedBlock.name} body={selectedBody} onApply={body => edit({ source: setClassMembers(current.source, selectedBlock.name, body) })} />
              </> : <>
                <section className="property-section"><h3>Diagrama</h3>
                  <label className="property-field">Nombre<input value={current.name} maxLength={100} onChange={event => edit({ name: event.target.value })} onBlur={() => { if (canEdit && !current.name.trim()) edit({ name: "Sin título" }); }} /></label>
                  <label className="property-field">Proyecto<input value={current.project} readOnly={!isOwner} title={isOwner ? undefined : "Sólo el propietario mueve el tablero a otro proyecto"} maxLength={80} onChange={event => edit({ project: event.target.value })} onBlur={() => { if (!current.project.trim()) edit({ project: "Sin proyecto" }); }} /></label>
                  <label className="property-field">Apariencia<select aria-label="Tema del diagrama" value={current.theme} onChange={event => edit({ theme: event.target.value as DiagramInput["theme"] })}><option value="studio">Studio · petróleo</option><option value="neutral">Neutro</option><option value="dark">Oscuro</option></select></label>
                </section>
                {current.type === "class" && <section className="property-section"><div className="property-section-heading"><h3>Clases</h3><span>{blocks.length}</span></div><div className="inspector-classes">{blocks.map(block => <button key={block.name} onClick={() => selectForInspection(block.name)}><Boxes size={14} /><span>{block.name}</span><ChevronRight size={13} /></button>)}</div><button className="property-add" onClick={() => beginClass()}><Plus size={14} />Agregar clase</button></section>}
              </>}
              {canvasSettings && <section className="property-section line-settings"><h3>Conexiones</h3>
                <label className="range-property"><span>Grosor de línea<output>{canvasSettings.lineWidth} px</output></span><input aria-label="Grosor de línea" type="range" min="1" max="6" step=".5" value={canvasSettings.lineWidth} onChange={event => edit({ source: writeCanvas(current.source, { ...canvasSettings, lineWidth: Number(event.target.value) }) })} /></label>
                {current.type === "class" && <><label className="range-property"><span>Tamaño de punta<output>{Math.round(canvasSettings.arrowScale * 100)}%</output></span><input aria-label="Tamaño de punta" type="range" min="1" max="3" step=".1" value={canvasSettings.arrowScale} onChange={event => edit({ source: writeCanvas(current.source, { ...canvasSettings, arrowScale: Number(event.target.value) }) })} /></label>
                  <label className="range-property"><span>Texto de relaciones<output>{canvasSettings.labelSize} px</output></span><input aria-label="Texto de relaciones" type="range" min="12" max="24" value={canvasSettings.labelSize} onChange={event => edit({ source: writeCanvas(current.source, { ...canvasSettings, labelSize: Number(event.target.value) }) })} /></label></>}
              </section>}
              <section className="property-section"><h3>Notas</h3><textarea className="diagram-notes" aria-label="Notas del diagrama" placeholder="Decisiones, supuestos, pendientes…" rows={3} maxLength={10000} value={current.notes} onChange={event => edit({ notes: event.target.value })} /></section>
            </fieldset>
            <div className="inspector-tip"><MousePointer2 size={15} /><p>{current.type === "class" ? "Seleccioná una clase para editar sus atributos y métodos." : "Agregá elementos desde el lienzo. Doble clic para editar; conectá origen y destino con el mouse."}</p></div>
          </aside>
        </div>
        <footer className="statusbar"><span><GitBranch size={12} />{TYPE_LABELS[current.type]}</span><span>{blocks.length ? blocks.length + " clases" : current.source.length + " caracteres"}</span><span className="statusbar-hint"><Keyboard size={12} />Ctrl / ⌘ + S para guardar</span><span className="statusbar-end">Versión {current.revision}<span className="statusbar-separator" />{new Date(current.updatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span></footer>
      </> : <div className="workspace-empty">
        {loading ? <><LoaderCircle size={28} className="spin" /><h2>Abriendo tu espacio</h2></> : loadError ? <><CloudOff size={30} /><h2>No pudimos cargar tus diagramas</h2><p>{loadError}</p><button className="btn primary" onClick={() => void load()}><RefreshCw size={16} />Reintentar</button>{!browserStorage && <a className="text-btn" href="/signin-with-chatgpt?return_to=%2F">Iniciar sesión</a>}</> : <><Shapes size={40} /><h2>Tu próximo diagrama empieza acá</h2><button className="btn primary" onClick={beginNew}><Plus size={17} />Crear diagrama</button></>}
      </div>}
    </section>

    <input type="file" className="file-input" accept=".json,.mmd,.mermaid,.txt" ref={importInput} onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.currentTarget.value = ""; }} />

    {modal === "profile" && <ProfileDialog onClose={() => setModal(null)} onSaved={saved => setProfile(current => current && { ...current, displayName: saved.displayName, color: saved.color, version: saved.version })} />}
    {modal === "share" && (() => { const doc = documents.find(d => d.id === shareRequest.id) || current; return doc ? <SharingDialog key={doc.id + shareRequest.scope} diagram={doc} initialScope={shareRequest.scope} presence={doc.id === current?.id ? presence : []} onClose={() => setModal(null)} /> : null; })()}
    {modal === "new" && <Modal title="Nuevo diagrama" wide onClose={() => setModal(null)}>
      <form onSubmit={e => { e.preventDefault(); void create({ name: newName, type: newType, project: newProject, source: useTemplate ? TEMPLATES.find(t => t.type === newType)!.source : EMPTY[newType], theme: "studio", notes: "" }, sharedOwnerFor(newProject)); }}>
        <div className="modal-body"><div className="form-row"><label>Nombre<input autoFocus required maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} /></label><label>Proyecto<input required maxLength={80} list="projects" value={newProject} onChange={e => setNewProject(e.target.value)} /><datalist id="projects">{projects.map(p => <option key={p} value={p} />)}</datalist></label></div>
          <div className="template-grid">{TEMPLATES.map(template => { const Icon = ICONS[template.type]; return <label key={template.type} className={"template-option " + (newType === template.type ? "chosen" : "")}><input type="radio" name="diagram-type" value={template.type} checked={newType === template.type} onChange={() => setNewType(template.type)} /><Icon size={24} /><strong>{TYPE_LABELS[template.type]}</strong><span>{template.description}</span>{newType === template.type && <Check size={15} className="template-check" />}</label>; })}</div>
          <label className="checkbox-label"><input type="checkbox" checked={useTemplate} onChange={e => setUseTemplate(e.target.checked)} />Empezar con un ejemplo</label>
          {newType === "usecase" || newType === "component" ? <p className="form-hint">Representacion con nodos y conexiones Mermaid.</p> : newType === "der" ? <p className="form-hint">Notación de Chen: entidades en rectángulo, relaciones en rombo, atributos en elipse y claves subrayadas. Las cardinalidades se escriben en cada conexión.</p> : null}
          {sharedOwnerFor(newProject) && <p className="form-hint">Se agregará al proyecto compartido de {current?.ownerName || "su propietario"}; todos sus participantes lo verán.</p>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary" disabled={working}>{working ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}Crear diagrama</button></div>
      </form>
    </Modal>}

    {modal === "class" && <Modal title={editingClass ? "Editar clase" : "Agregar clase"} onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); saveClass(); }}><div className="modal-body">
      <label>Nombre<input autoFocus required value={className} disabled={!!editingClass} onChange={e => setClassName(e.target.value)} /></label>
      <label>Atributos y métodos<textarea rows={8} className="mono" value={classBody} onChange={e => setClassBody(e.target.value)} /></label>
      <div className="visibility-key"><code>+</code> Público <code>-</code> Privado <code>#</code> Protegido</div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary"><Check size={16} />{editingClass ? "Aplicar cambios" : "Agregar clase"}</button></div></form></Modal>}

    {modal === "relation" && <Modal title="Agregar relación" onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); saveRelation(); }}><div className="modal-body">
      <div className="form-row"><label>Origen<input required list="class-names" value={relFrom} onChange={e => setRelFrom(e.target.value)} /></label><label>Destino<input required list="class-names" value={relTo} onChange={e => setRelTo(e.target.value)} /></label></div><datalist id="class-names">{blocks.map(b => <option key={b.name} value={b.name} />)}</datalist>
      <label>Tipo<select value={relKind} onChange={e => setRelKind(e.target.value)}>{RELATIONS.map(relation => <option key={relation.value} value={relation.value}>{relation.name}</option>)}</select></label>
      <div className="relation-inline-guide"><RelationSymbol kind={relKind} /><strong>{relationInfo(relKind).short}</strong><p>{relationInfo(relKind).meaning}</p><small>{relationInfo(relKind).symbol}</small></div>
      <div className="form-row"><label>Cardinalidad del origen<input placeholder="1" value={relCardFrom} onChange={e => setRelCardFrom(e.target.value)} /></label><label>Cardinalidad del destino<input placeholder="0..*" value={relCardTo} onChange={e => setRelCardTo(e.target.value)} /></label></div>
      <label>Etiqueta<input placeholder="realiza, contiene, utiliza..." value={relLabel} onChange={e => setRelLabel(e.target.value)} /></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary"><Link2 size={16} />Agregar relación</button></div></form></Modal>}

    {modal === "guide" && <Modal title="Guía de relaciones UML" wide onClose={() => setModal(null)}><RelationGuide selected={guideKind} onSelect={setGuideKind} /></Modal>}

    {modal === "export" && current && <Modal title="Exportar diagrama" onClose={() => setModal(null)}><div className="modal-body export-options">
      <button onClick={() => svg && download(svg.svg, filename(current.name) + ".svg", "image/svg+xml")} disabled={!svg}><Shapes size={22} /><span><strong>SVG</strong><small>Vectorial, para documentos y diseño</small></span><Download size={17} /></button>
      <div className="export-png">
        <button onClick={() => void exportPng()} disabled={!svg || working}><ImageDown size={22} /><span><strong>PNG en alta resolución</strong><small>{svg ? (() => { const scale = pngScale(svg.width, svg.height, exportScale); return `${Math.ceil(svg.width * scale + 32 * scale)} × ${Math.ceil(svg.height * scale + 32 * scale)} px`; })() : "Esperando el diagrama"}</small></span>{working ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}</button>
        <div className="export-png-options">
          <div className="segmented" role="group" aria-label="Escala del PNG">{PNG_SCALES.map(option => <button key={option.value} type="button" className={exportScale === option.value ? "active" : ""} aria-pressed={exportScale === option.value} onClick={() => setExportScale(option.value)}>{option.label}</button>)}</div>
          <label className="checkbox-label"><input type="checkbox" checked={transparentPng} onChange={e => setTransparentPng(e.target.checked)} />Fondo transparente</label>
        </div>
        {svg && pngScale(svg.width, svg.height, exportScale) < exportScale && <p className="form-hint">El diagrama es muy grande: se exporta a la máxima resolución que admite el navegador.</p>}
      </div>
      <button onClick={openHighResolution} disabled={!svg}><ExternalLink size={22} /><span><strong>Ver en alta resolución</strong><small>Abre el diagrama vectorial en una pestaña para ampliarlo sin pérdida</small></span><Eye size={17} /></button>
      <button onClick={() => download(current.source, filename(current.name) + ".mmd")}><FileCode2 size={22} /><span><strong>Mermaid</strong><small>Código fuente editable</small></span><Download size={17} /></button>
      <button onClick={() => download(exportDocument(current), filename(current.name) + ".uml.json", "application/json")}><Braces size={22} /><span><strong>Proyecto JSON</strong><small>Diagrama, notas y configuración</small></span><Download size={17} /></button>
      <button onClick={() => { setModal(null); setTimeout(() => window.print(), 150); }} disabled={!svg || view === "code"}><Printer size={22} /><span><strong>Imprimir / PDF</strong><small>Desde el diálogo de impresión</small></span><Printer size={17} /></button>
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div></Modal>}

    {modal === "history" && current && <Modal title="Historial de versiones" onClose={() => setModal(null)}><div className="modal-body">
      <div className="history-current"><Check size={16} /><strong>Versión {current.revision}</strong><span>Actual</span></div>
      {working ? <div className="history-empty"><LoaderCircle className="spin" size={24} /></div> : history.length ? <div className="history-list">{history.map(rev => <div className="history-row" key={rev.revision}><History size={17} /><div><strong>Versión {rev.revision}</strong><small>{new Date(rev.createdAt).toLocaleString("es-AR")}</small></div><button className="btn" disabled={!canEdit} onClick={() => { edit(diagramInput.parse(rev.diagram)); setModal(null); }}>Restaurar</button></div>)}</div> : <div className="history-empty">Las versiones anteriores apareceran acá.</div>}
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div></Modal>}

    {modal === "notes" && current && <Modal title="Notas del diagrama" onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); edit({ notes, project: isOwner ? newProject : current.project }); setModal(null); }}><div className="modal-body"><label>Proyecto<input required readOnly={!isOwner} value={newProject} maxLength={80} onChange={e => setNewProject(e.target.value)} /></label><label>Notas<textarea rows={8} maxLength={10000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Decisiones, restricciones, pendientes..." /></label></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary"><Check size={16} />Guardar notas</button></div></form></Modal>}

    {modal === "delete" && current && <Modal title="Eliminar diagrama" onClose={() => setModal(null)}><div className="modal-body"><p>Se eliminara <strong>{current.name}</strong> y su historial de versiones.</p><p>Descarga una copia antes de continuar si querés conservarlo.</p>{formError && <p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn danger" disabled={working} onClick={() => void removeCurrent()}><Trash2 size={16} />Eliminar</button></div></Modal>}

    {modal === "chat" && <Modal title={browserStorage ? "Compartir diagrama" : "Editar desde el chat"} onClose={() => setModal(null)}><div className="modal-body chat-modal"><div className="chat-modal-icon"><MessageSquare size={26} /></div>{browserStorage ? <p>Tus diagramas se guardan en este navegador. Descargá un <strong>Proyecto JSON</strong> para conservar una copia o compartirlo en Codex o ChatGPT.</p> : <p>Conecta el plugin personal <strong>UML Studio</strong> en Codex o ChatGPT para que pueda leer y modificar tus diagramas guardados.</p>}<div className="chat-example">&ldquo;En Tienda online, agregá una clase Cupon relacionada con Pedido.&rdquo;</div><p>También podes adjuntar el archivo JSON del diagrama en este chat.</p><p className="form-hint">{browserStorage ? "Importá el JSON que recibas para abrir el diagrama actualizado. Cada navegador conserva su propio espacio." : "Despues de un cambio en el chat, usa Actualizar para cargar la nueva versión."}</p></div><div className="modal-footer"><button className="btn" onClick={() => { if (current) download(exportDocument(current), filename(current.name) + ".uml.json", "application/json"); }} disabled={!current}><Download size={16} />Descargar JSON</button><button className="btn primary" onClick={() => setModal(null)}>Entendido</button></div></Modal>}
  </main>;
}
