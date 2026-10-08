"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, Scan, LoaderCircle, AlertCircle } from "lucide-react";
import { Diagram } from "@/lib/diagrams";

let renderQueue: Promise<unknown> = Promise.resolve();
let renderNumber = 0;
export type SvgResult = { svg: string; width: number; height: number };

export default function DiagramPreview({ diagram, onRendered, onClassClick }: {
  diagram: Diagram; onRendered: (result: SvgResult | null) => void; onClassClick: (name: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<SvgResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const callbacks = useRef({ onRendered, onClassClick });
  callbacks.current = { onRendered, onClassClick };
  const fit = useCallback((r: SvgResult | null = result) => {
    const el = viewport.current;
    if (el && r) {
      setZoom(Math.min(1.15, Math.max(.1, Math.min((el.clientWidth - 80) / r.width, (el.clientHeight - 90) / r.height))));
      setPan({ x: 0, y: 0 });
    }
  }, [result]);

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
              primaryTextColor: "#263d34", primaryBorderColor: "#698d7c", lineColor: "#7d8990",
              secondaryColor: "#eef2f7", tertiaryColor: "#fff4dc", background: "#ffffff",
              mainBkg: "#edf6f1", nodeBorder: "#698d7c", clusterBkg: "#f7f9fa",
              actorBkg: "#edf6f1", actorBorder: "#698d7c", actorTextColor: "#263d34",
              signalColor: "#58616c", signalTextColor: "#38414b", labelBoxBkgColor: "#f3f5f6",
            },
            flowchart: { htmlLabels: false, curve: "basis", useMaxWidth: false },
            class: { useMaxWidth: false }, sequence: { useMaxWidth: false },
          });
          const { svg } = await mermaid.render("uml" + ++renderNumber, diagram.source, staging);
          if (cancelled) return;
          const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
          const root = doc.documentElement;
          const box = root.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
          const width = box?.[2] || parseFloat(root.getAttribute("width") || "800");
          const height = box?.[3] || parseFloat(root.getAttribute("height") || "600");
          root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
          root.style.maxWidth = "none"; root.setAttribute("role", "img"); root.setAttribute("aria-label", diagram.name);
          const ready = { svg: new XMLSerializer().serializeToString(root), width, height };
          setResult(ready); callbacks.current.onRendered(ready); fit(ready); setBusy(false);
        } catch (e) {
          if (!cancelled) { setError(e instanceof Error ? e.message : "Revisa la sintaxis del diagrama."); setBusy(false); }
        } finally { staging.remove(); }
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // fit is intentionally evaluated when a fresh diagram is rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram.source, diagram.theme, diagram.id]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [fit]);

  function changeZoom(delta: number) { setZoom(z => Math.min(3, Math.max(.1, Math.round((z + delta) * 100) / 100))); }
  return <div className={"diagram-viewport " + (diagram.theme === "dark" ? "canvas-dark" : "")} ref={viewport}
    onPointerDown={e => {
      if ((e.target as HTMLElement).closest("button,.error-panel")) return;
      drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }; e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => { const d = drag.current; if (d) setPan({ x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y }); }}
    onPointerUp={e => {
      const d = drag.current; drag.current = null;
      if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 5) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const node = el?.closest("g.node");
        const id = node?.id.match(/classId-(.+)-\d+$/)?.[1];
        if (id) callbacks.current.onClassClick(id);
      }
    }} onPointerCancel={() => { drag.current = null; }}
    onWheel={e => { if (e.ctrlKey || e.metaKey) changeZoom(e.deltaY < 0 ? .1 : -.1); }}>
    {result && <div className={"diagram-art " + (error ? "invalid-art" : "")}
      style={{ width: result.width, height: result.height, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      dangerouslySetInnerHTML={{ __html: result.svg }} />}
    {busy && <div className="canvas-loading"><LoaderCircle size={16} className="spin" /> Renderizando</div>}
    {error && <div className="error-panel" role="alert"><AlertCircle size={19} /><div><strong>Revisa la sintaxis</strong><pre>{error.slice(0, 1600)}</pre></div></div>}
    {!busy && !error && <span className="canvas-caption"> {diagram.name} </span>}
    <div className="zoom-toolbar" onPointerDown={e => e.stopPropagation()}>
      <button className="icon-btn" aria-label="Alejar" title="Alejar" onClick={() => changeZoom(-.1)}><Minus size={16} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button className="icon-btn" aria-label="Acercar" title="Acercar" onClick={() => changeZoom(.1)}><Plus size={16} /></button>
      <i />
      <button className="icon-btn" aria-label="Ajustar al lienzo" title="Ajustar al lienzo" onClick={() => fit()}><Scan size={17} /></button>
    </div>
  </div>;
}
