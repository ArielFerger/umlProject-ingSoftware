"use client";

import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, LoaderCircle } from "lucide-react";
import type { Diagram } from "@/lib/diagrams";
import type { StudyVisual } from "@/lib/study";
import { studioRequest } from "@/lib/studio-request";
import DiagramPreview from "./diagram-preview";

function download(source: string, name: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudyVisualExplorer({ visuals, storageKey, ready, onGuide, contextName }: {
  visuals: StudyVisual[]; storageKey: string; ready: boolean; onGuide: (kind: string) => void; contextName?: string;
}) {
  const uid = useId();
  const [active, setActive] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = visuals[active];
  const step = current.steps[stepIndex];
  const name = contextName ? contextName + " · " + current.title : current.title;
  const reference: Diagram = { id: current.id, name, type: current.type, source: current.source, theme: "studio", project: "Estudio IS II", notes: current.caption, revision: 1, updatedAt: "2026-10-11T00:00:00Z" };

  function selectStep(index: number) { setStepIndex(index); setSelected(""); }
  async function openEditable() {
    if (!ready || !storageKey || busy) return;
    setBusy(true); setError("");
    try {
      const copyKey = storageKey + ":visual-copies";
      let copies: Record<string, string> = {};
      try {
        const saved = JSON.parse(localStorage.getItem(copyKey) || "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) copies = Object.fromEntries(Object.entries(saved).filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].length < 300));
      } catch { /* A malformed copy index does not affect study progress. */ }
      const previousId = copies[current.id];
      if (previousId) {
        const check = await studioRequest("/api/diagrams?id=" + encodeURIComponent(previousId));
        if (check.ok) { window.location.assign("/?diagram=" + encodeURIComponent(previousId)); return; }
        if (check.status !== 404) throw new Error("No se pudo recuperar tu copia. Reintentá en unos segundos.");
      }
      const response = await studioRequest("/api/diagrams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: "Estudio · " + name, project: "Ejemplos de teoría IS II", type: current.type, theme: "studio", source: current.source,
        notes: current.caption + "\n\n" + current.reading.join("\n") + "\n\nReferencia: /estudio",
      }) });
      const saved = await response.json() as Diagram & { error?: string };
      if (!response.ok) throw new Error(saved.error || "No se pudo crear la copia editable. Reintentá.");
      try { localStorage.setItem(copyKey, JSON.stringify({ ...copies, [current.id]: saved.id })); } catch { /* The saved diagram remains available in the workspace. */ }
      window.location.assign("/?diagram=" + encodeURIComponent(saved.id));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="study-visual-explorer">
    {visuals.length > 1 && <div className="study-visual-tabs" role="group" aria-label="Vistas del patrón">{visuals.map((visual, index) => <button key={visual.id} aria-pressed={active === index} onClick={() => { setActive(index); selectStep(0); setError(""); }}>{visual.title}<small>{visual.type === "sequence" ? "Secuencia" : "Clases"}</small></button>)}</div>}
    <figure aria-label={current.title}>
      <div className="study-reference-canvas study-explained-canvas">
        <DiagramPreview key={current.id} diagram={reference} initialFit="contain" selectedClass={selected || step?.focus || ""} onClassClick={setSelected} onSelectionChange={setSelected} onRendered={() => {}} onSettingsChange={() => {}} onConnect={() => {}} onGuide={onGuide} />
      </div>
      <figcaption>{current.caption}</figcaption>
    </figure>
    <div className="study-visual-actions"><button className="btn" disabled={!ready || busy} onClick={() => void openEditable()}>{busy ? <LoaderCircle size={15} className="spin" /> : <ExternalLink size={15} />}Abrir copia editable</button><button className="btn" onClick={() => download(current.source, current.id + ".mmd")}><Download size={15} />Descargar Mermaid</button></div>
    {error && <p className="study-alert" role="alert">{error}</p>}
    {step && <section className="study-walkthrough" aria-labelledby={uid + "-heading"}>
      <div className="study-walkthrough-heading"><h3 id={uid + "-heading"}>Seguí la explicación</h3><span>Paso {stepIndex + 1} de {current.steps.length}</span></div>
      <div className="study-step-select" role="group" aria-label="Pasos de la explicación">{current.steps.map((item, index) => <button key={index} aria-pressed={stepIndex === index} onClick={() => selectStep(index)}><span>{index + 1}</span>{item.title}</button>)}</div>
      <div className="study-step-description" aria-live="polite"><strong>{step.title}</strong><p>{step.text}</p></div>
      <div className="study-step-controls"><button className="btn" disabled={stepIndex === 0} onClick={() => selectStep(stepIndex - 1)}><ArrowLeft size={15} />Anterior</button><button className="btn" disabled={stepIndex === current.steps.length - 1} onClick={() => selectStep(stepIndex + 1)}>Siguiente paso<ArrowRight size={15} /></button></div>
    </section>}
    <section className="study-section study-diagram-reading"><h3>Cómo leer este diagrama</h3><ul>{current.reading.map((text, index) => <li key={index}>{text}</li>)}</ul></section>
    <details className="study-source-code"><summary>Ver código Mermaid del ejemplo</summary><pre><code>{current.source}</code></pre></details>
  </div>;
}
