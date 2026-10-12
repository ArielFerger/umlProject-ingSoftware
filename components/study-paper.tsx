"use client";
import { useRef, useState } from "react";
import { Copy, ExternalLink, Redo2, Undo2 } from "lucide-react";
import { type Entry, type StudySource, emptyEntry } from "@/lib/study";
import { paperCorrectionText, type PaperQuestion, type StudyPaperDoc } from "@/lib/study-paper";
import { appendRelation, readCanvas, writeCanvas } from "@/lib/canvas";
import CodeEditor, { type EditorHandle } from "./code-editor";
import DiagramPreview from "./diagram-preview";

function AnswerDiagram({ question, entry, ready, onChange, onGuide }: { question: PaperQuestion; entry: Entry; ready: boolean; onChange: (patch: Partial<Entry>) => void; onGuide: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const source = entry.draft || `classDiagram\ndirection TB\n%% Respuesta a la pregunta ${question.number}\n`;
  return <details className="study-paper-diagram" onToggle={event => setOpen(event.currentTarget.open)}><summary>Diagrama de tu respuesta (Mermaid)</summary>{open && <>
    <div className="study-workbench-title"><div><button className="icon-btn" aria-label={`Deshacer diagrama ${question.id}`} onClick={() => editor.current?.undo()}><Undo2 size={16} /></button><button className="icon-btn" aria-label={`Rehacer diagrama ${question.id}`} onClick={() => editor.current?.redo()}><Redo2 size={16} /></button></div></div>
    <div className="study-workbench"><section className="study-code-pane"><div className="pane-header">Código Mermaid</div><CodeEditor ref={editor} value={source} onChange={draft => { if (ready) onChange({ draft }); }} /></section><section className="study-canvas-pane"><div className="pane-header">Tu diagrama</div><DiagramPreview diagram={{ id: question.id, name: `Respuesta ${question.number}`, source, type: "class", theme: "studio", project: "Parciales", notes: "", revision: 1, updatedAt: "" }} onRendered={() => {}} onClassClick={() => {}} onSourceChange={ready ? draft => onChange({ draft }) : undefined} onSettingsChange={settings => { if (ready) onChange({ draft: writeCanvas(source, settings) }); }} onConnect={(from, to, kind, positions) => { if (ready) onChange({ draft: writeCanvas(appendRelation(source, from, to, kind), { ...readCanvas(source), positions }) }); }} onGuide={onGuide} /></section></div>
  </>}</details>;
}

export default function StudyPaper({ paper, entries, sources, ready, active, copying, onChange, onCopy, onPractice, onGuide }: { paper: StudyPaperDoc; entries: Record<string, Entry>; sources: StudySource[]; ready: boolean; active: boolean; copying: boolean; onChange: (id: string, patch: Partial<Entry>) => void; onCopy: (text: string) => void; onPractice: (id: string) => void; onGuide: (kind: string) => void }) {
  return <article className="study-paper">
    <header className="study-paper-header"><h1>{paper.title}</h1><p>{paper.date}</p><p className="study-validation">{paper.note}</p><div>{sources.filter(source => paper.refs.includes(source.id)).map(source => <a className="study-text-btn" href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.name}<ExternalLink size={14} /></a>)}</div></header>
    {paper.sections.map((section, sectionIndex) => <section className="study-paper-section" key={sectionIndex}>
      {section.title && <h2>{section.title}</h2>}
      {section.paragraphs?.map((text, i) => <p key={i}>{text}</p>)}
      {section.items && <ul>{section.items.map((text, i) => <li key={i}>{text}</li>)}</ul>}
      {section.title === "Teoría" && <p><strong>Responder:</strong></p>}
      <ol className="study-paper-questions">{section.questions.map(question => { const entry = entries[question.id] || emptyEntry(); return <li value={question.number} key={question.id} data-question-id={question.id}>
        <p className="study-paper-prompt">{question.points !== undefined && <strong>{question.points} Puntos. </strong>}{question.prompt}</p>
        {question.paragraphs?.map((text, i) => <p key={i}>{text}</p>)}
        {question.images?.map(image => <figure key={image.url}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.alt} loading="lazy" /></a><figcaption>{image.alt} · abrí la imagen para verla en tamaño original</figcaption></figure>)}
        {question.items && <ul>{question.items.map((text, i) => <li key={i}>{text}</li>)}</ul>}
        {question.code && <div className="study-code-reading"><p><strong>{question.codeLanguage} · código original de la hoja</strong></p><pre tabIndex={0} aria-label={`Código original ${question.id}`}><code>{question.code}</code></pre></div>}
        {question.sourceImages && <details className="study-refs"><summary>Ver fragmento original del código</summary>{question.sourceImages.map(image => <a href={image.url} key={image.url} target="_blank" rel="noreferrer">{image.alt}<ExternalLink size={14} /></a>)}</details>}
        <div className="study-paper-answer"><label className="study-answer-label">Tu respuesta<textarea aria-label={`Respuesta ${section.title ? section.title + " " : ""}${question.number}`} disabled={!ready} value={entry.answer} onChange={event => onChange(question.id, { answer: event.target.value })} /></label>
          {question.canDiagram && <AnswerDiagram question={question} entry={entry} ready={ready} onChange={patch => onChange(question.id, patch)} onGuide={onGuide} />}
          <div className="study-paper-answer-actions"><button className="btn" disabled={!ready || active || copying} onClick={() => onCopy(paperCorrectionText(paper, entries, question.id))}><Copy size={15} />Copiar y corregir esta respuesta</button>{question.practiceId && <button className="study-text-btn" onClick={() => onPractice(question.practiceId!)}>Abrir práctica adicional{question.codeLanguage === "PHP" ? " en C++" : ""}<ExternalLink size={14} /></button>}</div>
        </div>
      </li>; })}</ol>
    </section>)}
    <div className="study-correction"><div><h2>Corregir el parcial completo</h2><p>Copiá todas las consignas originales y tus respuestas en su orden. Las respuestas se guardan aparte de las prácticas adicionales.</p></div><button className="btn" disabled={!ready || active || copying} onClick={() => onCopy(paperCorrectionText(paper, entries))}><Copy size={16} />Copiar parcial y corregir</button>{active && <p className="study-validation">La corrección estará disponible cuando finalices el intento con tiempo.</p>}</div>
  </article>;
}
