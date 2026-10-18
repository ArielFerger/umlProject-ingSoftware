"use client";
import ThemePicker from "./theme-picker";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Copy, Download, FileText, Flag, GitBranch, GraduationCap, Lightbulb, LoaderCircle, Play, RotateCcw, Search, Shapes, Trophy, Upload, X, Timer, Printer, ExternalLink, Undo2, Redo2 } from "lucide-react";
import { Diagram } from "@/lib/diagrams";
import { readCanvas, writeCanvas, appendRelation } from "@/lib/canvas";
import { STUDY, PAPERS, Progress, Entry, Exercise, Lesson, Pattern, emptyEntry, emptyProgress, parseProgress, correctAnswer, numericValue, completion, starter } from "@/lib/study";
import CodeEditor, { EditorHandle } from "./code-editor";
import DiagramPreview, { SvgResult } from "./diagram-preview";
import RelationGuide from "./relation-guide";
import Modal from "./modal";
import { studioRequest } from "@/lib/studio-request";
import StudyVisualExplorer from "./study-visual";
import { correctionText } from "@/lib/study-correction";
import { paperQuestions } from "@/lib/study-paper";
import StudyPaper from "./study-paper";
import { choiceExplanation } from "@/lib/study-grading";

type View = "ruta" | "teoria" | "patrones" | "practica" | "simulacros" | "fuentes";
type Run = { id: string; deadline: number; finished: boolean };
const tabs: [View, string][] = [["ruta", "Mi recorrido"], ["teoria", "Teoría"], ["patrones", "Fichas UML"], ["practica", "Práctica"], ["simulacros", "Simulacros"], ["fuentes", "Material original"]];
function normalize(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function saveFile(value: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function References({ ids }: { ids: number[] }) {
  return <details className="study-refs"><summary>Ver fuentes de este contenido ({ids.length})</summary>{ids.map(id => { const s = STUDY.sources.find(s => s.id === id); return s && <a key={id} href={s.url} target="_blank" rel="noreferrer"><FileText size={14} />{s.name}<ExternalLink size={12} /></a>; })}</details>;
}
function LessonBody({ lesson, onPattern, onGuide, storageKey, ready }: { lesson: Lesson; onPattern: (id: string) => void; onGuide: (kind: string) => void; storageKey: string; ready: boolean }) {
  return <>{lesson.sections.map((s, index) => <section className="study-section" key={index}><h3>{s.title}</h3>{s.text && <p>{s.text}</p>}{s.items && <ul>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ul>}{s.table && <div className="study-table-wrap"><table><thead><tr>{s.table[0].map((cell,i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{s.table.slice(1).map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}{s.code && <pre><code>{s.code}</code></pre>}{s.patterns && <div className="study-pattern-links" aria-label="Explorar los patrones de este tema">{s.patterns.map(id => <button key={id} className="study-text-btn" onClick={() => onPattern(id)}>{STUDY.patterns.find(p => p.id === id)?.name}<ArrowRight size={14} /></button>)}</div>}{s.visuals && <StudyVisualExplorer key={lesson.id + index} visuals={s.visuals} onGuide={onGuide} storageKey={storageKey} ready={ready} />}</section>)}<References ids={lesson.refs} /></>;
}
function diagram(id: string, name: string, source: string, type: Diagram["type"] = "class"): Diagram { return { id, name, source, type, theme: "studio", project: "Estudio IS II", notes: "", revision: 1, updatedAt: "2026-10-10T00:00:00Z" }; }

export default function Study() {
  const [view, setView] = useState<View>("ruta");
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const progressRef = useRef(progress); progressRef.current = progress;
  const [key, setKey] = useState("");
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [copying, setCopying] = useState(false);
  const [lessonId, setLessonId] = useState(STUDY.lessons[0].id);
  const [patternId, setPatternId] = useState("singleton");
  const [exerciseId, setExerciseId] = useState("");
  const [paperId, setPaperId] = useState("");
  const [level, setLevel] = useState(1);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("Todos");
  const [onlyReview, setOnlyReview] = useState(false);
  const [activityKind, setActivityKind] = useState("all");
  const [busy, setBusy] = useState(false);
  const [svg, setSvg] = useState<SvgResult | null>(null);
  const [guide, setGuide] = useState("");
  const [solutionId, setSolutionId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<Progress | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());
  const upload = useRef<HTMLInputElement>(null);
  const studyEditor = useRef<EditorHandle>(null);
  const content = useRef<HTMLElement>(null);
  const current = STUDY.exercises.find(e => e.id === exerciseId);
  const lesson = STUDY.lessons.find(l => l.id === lessonId)! as Lesson;
  const pattern = STUDY.patterns.find(p => p.id === patternId)! as Pattern;
  const entry = current ? progress.entries[current.id] || emptyEntry() : emptyEntry();
  const stats = completion(progress);
  const exam = STUDY.examSets.find(s => s.id === run?.id);
  const paper = PAPERS.find(p => p.id === paperId);
  const examPaper = PAPERS.find(p => p.id === exam?.paperId);
  const examIds = examPaper ? paperQuestions(examPaper).map(q => q.id) : exam?.exerciseTitles.map(t => STUDY.exercises.find(e => e.title === t)!.id) || [];
  const examActive = !!run && !run.finished && run.deadline > now;
  const currentInExam = examActive && examIds.includes(exerciseId);
  const next = STUDY.exercises.find(e => !progress.entries[e.id]?.done);

  useEffect(() => {
    let live = true;
    studioRequest("/api/study-profile").then(async response => {
      const body = await response.json() as { owner?: string; error?: string };
      if (!response.ok || !body.owner) throw new Error(body.error || "Inicia sesión para guardar tu progreso.");
      if (!live) return;
      const storageKey = "uml-studio-study-v1:" + body.owner;
      setKey(storageKey);
      try { const saved = localStorage.getItem(storageKey); if (saved) setProgress(parseProgress(JSON.parse(saved))); }
      catch { setStorageError("No pudimos leer el progreso guardado. No lo sobrescribiremos hasta que importes una copia o reinicies desde los controles."); return; }
      try { const savedRun = localStorage.getItem(storageKey + ":exam"); if (savedRun) { const r = JSON.parse(savedRun); if (typeof r.id === "string" && Number.isFinite(r.deadline) && typeof r.finished === "boolean" && STUDY.examSets.some(s => s.id === r.id)) setRun(r); } } catch { /* A malformed timer does not affect answers. */ }
      setReady(true);
    }).catch(e => { if (live) setStorageError(e.message); });
    const params = new URLSearchParams(window.location.search); const id = params.get("ejercicio");
    const choiceMode = params.get("modo") === "opciones";
    if (choiceMode) setActivityKind("choice");
    const ex = STUDY.exercises.find(e => e.id === id);
    if (PAPERS.some(p => p.id === params.get("parcial"))) { setPaperId(params.get("parcial")!); setView("simulacros"); }
    else if (ex) { setExerciseId(ex.id); setLevel(ex.level); setView("practica"); }
    else if (STUDY.patterns.some(p => p.id === params.get("patron"))) { setPatternId(params.get("patron")!); setView("patrones"); }
    else if (STUDY.lessons.some(l => l.id === params.get("tema"))) { setLessonId(params.get("tema")!); setView("teoria"); }
    else if (choiceMode) setView("practica");
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!ready || !key) return;
    try { localStorage.setItem(key, JSON.stringify(progress)); setStorageError(""); }
    catch { setStorageError("El navegador no pudo guardar los cambios. Exportá tu progreso para conservarlo."); }
  }, [progress, ready, key]);
  useEffect(() => {
    if (!ready || !key) return;
    try { if (run) localStorage.setItem(key + ":exam", JSON.stringify(run)); else localStorage.removeItem(key + ":exam"); } catch { setStorageError("No se pudo guardar el cronómetro. Exportá las respuestas para conservarlas."); }
  }, [run, ready, key]);
  useEffect(() => {
    if (!run || run.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run]);
  useEffect(() => { if (run && !run.finished && now >= run.deadline) { setRun({ ...run, finished: true }); setNotice("Se cumplió el tiempo. Tus respuestas quedaron guardadas; ya podés revisar las soluciones."); } }, [now, run]);
  useEffect(() => { setSvg(null); }, [exerciseId]);
  useEffect(() => { if (content.current) content.current.scrollTop = 0; }, [view, lessonId, patternId, exerciseId, paperId]);

  function updateEntry(id: string, patch: Partial<Entry>) { setProgress(p => ({ ...p, entries: { ...p.entries, [id]: { ...(p.entries[id] || emptyEntry()), ...patch } } })); }
  function navigate(v: View) { setView(v); setQuery(""); setNotice(""); if (v !== "practica") { const url = new URL(window.location.href); url.searchParams.delete("modo"); window.history.replaceState(null, "", url); } if (v === "simulacros") { setPaperId(""); const url = new URL(window.location.href); url.searchParams.delete("parcial"); window.history.replaceState(null, "", url); } }
  function openPaper(id: string) {
    navigate("simulacros"); setPaperId(id);
    const url = new URL(window.location.href); for (const key of ["ejercicio", "patron", "tema", "modo"]) url.searchParams.delete(key); url.searchParams.set("parcial", id); window.history.replaceState(null, "", url);
  }
  function openChoicePractice() {
    setActivityKind("choice"); setExerciseId(""); setLevel(1); setTopic("Todos"); setOnlyReview(false); navigate("practica");
    const url = new URL(window.location.href); for (const key of ["ejercicio", "parcial", "patron", "tema"]) url.searchParams.delete(key); url.searchParams.set("modo", "opciones"); window.history.replaceState(null, "", url);
  }
  function changeActivityKind(kind: string) {
    setActivityKind(kind);
    const url = new URL(window.location.href); if (kind === "choice") url.searchParams.set("modo", "opciones"); else url.searchParams.delete("modo"); window.history.replaceState(null, "", url);
  }
  function openPattern(id: string) {
    setPatternId(id); navigate("patrones");
    const url = new URL(window.location.href); url.searchParams.delete("parcial"); url.searchParams.delete("ejercicio"); url.searchParams.delete("tema"); url.searchParams.set("patron", id); window.history.replaceState(null, "", url);
  }
  function openExercise(e: Exercise) {
    if (e.kind !== "choice" && activityKind === "choice") setActivityKind("all");
    setExerciseId(e.id); setLevel(e.level); setSvg(null); navigate("practica");
    const url = new URL(window.location.href); url.searchParams.delete("parcial"); url.searchParams.delete("patron"); url.searchParams.delete("tema"); if (e.kind !== "choice") url.searchParams.delete("modo"); url.searchParams.set("ejercicio", e.id); window.history.replaceState(null, "", url);
  }
  function check() {
    if (!current) return;
    if (current.kind === "numeric" && numericValue(entry.answer) === null) { setNotice("Ingresá un número; podés usar punto o coma decimal, sin separadores de miles."); return; }
    if (entry.answer === "") { setNotice("Elegí o escribí una respuesta antes de comprobar."); return; }
    const correct = correctAnswer(current, entry.answer);
    updateEntry(current.id, { attempts: entry.attempts + 1, result: correct ? "correct" : "incorrect", done: correct, review: !correct });
    setNotice("");
  }
  function reviewComplete() {
    if (!current) return;
    if (!entry.answer.trim() && !entry.draft.trim()) { setNotice("Escribí tu razonamiento o trabajá en tu diagrama antes de completar la revisión."); return; }
    if (!current.rubric.every((_, i) => entry.rubric[i])) { setNotice("Revisá todos los puntos de la rúbrica para completar el ejercicio."); return; }
    updateEntry(current.id, { done: true, review: false }); setNotice("Ejercicio completado por autoevaluación. +25 XP si es la primera vez.");
  }
  async function copyForCorrection() {
    if (!current || currentInExam) return;
    if (!entry.answer.trim() && !entry.draft.trim()) { setNotice("Escribí tu respuesta o trabajá en tu diagrama antes de copiar para corregir."); return; }
    await copyPrepared(correctionText(current, entry, STUDY.sources));
  }
  async function copyPrepared(text: string) {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copiado: consigna, actividad y tu respuesta. Pegalo en la IA que prefieras para pedir la corrección.");
    } catch {
      setManualCopy(text);
    } finally { setCopying(false); }
  }
  async function openInStudio() {
    if (!current) return;
    setBusy(true); setNotice("");
    try {
      const source = entry.draft || starter(current);
      // Reopening preserves revisions and existing user edits; it does not overwrite a saved diagram.
      if (entry.diagramId) {
        window.location.assign("/?diagram=" + encodeURIComponent(entry.diagramId) + "&ejercicio=" + current.id);
        return;
      }
      const response = await studioRequest("/api/diagrams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: current.title, project: "Práctica IS II", type: current.diagramType || "class", theme: "studio", source, notes: current.prompt + "\n\nVolver al ejercicio: /estudio?ejercicio=" + current.id }) });
      const saved = await response.json() as Diagram & { error?: string };
      if (!response.ok) throw new Error(saved.error || "No se pudo crear el diagrama de práctica.");
      const p = { ...progressRef.current, entries: { ...progressRef.current.entries, [current.id]: { ...entry, draft: source, diagramId: saved.id } } };
      try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* The saved diagram itself persists on the server. */ }
      window.location.assign("/?diagram=" + encodeURIComponent(saved.id) + "&ejercicio=" + current.id);
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  async function retrieveDiagram() {
    if (!current || !entry.diagramId) return;
    setBusy(true);
    try {
      const response = await studioRequest("/api/diagrams?id=" + encodeURIComponent(entry.diagramId)); const saved = await response.json() as Diagram & { error?: string };
      if (!response.ok) throw new Error(saved.error || "No se pudo leer el diagrama.");
      updateEntry(current.id, { draft: saved.source }); setNotice("Se cargó la versión guardada en UML Studio en tu borrador de práctica.");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  async function importProgress(file: File) {
    try { if (file.size > 8000000) throw new Error("La copia de progreso es demasiado grande."); setPendingImport(parseProgress(JSON.parse(await file.text()))); }
    catch { setNotice("El archivo no es una copia válida del progreso de Estudio IS II."); }
  }
  function beginExam(id: string, minutes: number) { const r = { id, deadline: Date.now() + minutes * 60000, finished: false }; setRun(r); setNow(Date.now()); const selected = STUDY.examSets.find(s => s.id === id)!; if (selected.paperId) openPaper(selected.paperId); else openExercise(STUDY.exercises.find(e => e.title === selected.exerciseTitles[0])!); }
  const filtered = STUDY.exercises.filter(e => e.level === level && (activityKind === "all" || e.kind === activityKind) && (topic === "Todos" || e.topic === topic) && (!onlyReview || progress.entries[e.id]?.review) && normalize(e.title + " " + e.prompt).includes(normalize(query)));
  const remaining = run ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : 0;
  const timeText = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  return <main className="study-app">
    <header className="study-header"><a href="/" className="study-brand"><GitBranch size={23} /><span>UML Studio</span></a><span className="study-header-separator" /><span className="study-sector"><GraduationCap size={19} />Estudio IS II</span><div className="study-header-end"><span>{stats.xp} XP</span><ThemePicker /><a href="/git" className="btn" aria-label="Laboratorio Git"><GitBranch size={15} /><span>Git Lab</span></a><a href="/" className="btn" aria-label="Editor UML"><Shapes size={15} /><span>Editor UML</span></a></div></header>
    <nav className="study-nav" aria-label="Sectores de estudio">{tabs.map(([id,label]) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>{label}</button>)}</nav>
    {examActive && <div className="study-exam-bar"><Timer size={17} /><strong>{exam?.title}</strong><span>{timeText}</span><button onClick={() => exam?.paperId ? openPaper(exam.paperId) : navigate("simulacros")}>Ver preguntas</button><button onClick={() => { setRun(run && { ...run, finished: true }); setNotice("Intento finalizado. Tus respuestas quedaron guardadas para revisar."); }}>Finalizar y revisar</button></div>}
    <section ref={content} className="study-content">
      {storageError && <div className="study-alert" role="alert">{storageError}{!key && <a href="/signin-with-chatgpt?return_to=%2Festudio">Iniciar sesión</a>}</div>}
      {notice && <div className="study-notice" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={15} /></button></div>}
      {!ready && !storageError && <p className="study-loading"><LoaderCircle size={20} className="spin" />Cargando tu recorrido</p>}
      {view === "ruta" && <>
        <div className="study-hero"><div><h1>Entendé la teoría.<br />Ganale a la práctica.</h1><p>Del primer patrón a un parcial completo. Un recorrido con ejercicios reales, pistas y espacio para equivocarte.</p><button className="btn primary study-cta" disabled={!ready} onClick={() => next ? openExercise(next) : navigate("simulacros")}><Play size={16} />{stats.done ? "Continuar mi recorrido" : "Empezar por el nivel 1"}<ArrowRight size={16} /></button><div className="study-choice-link"><button className="study-text-btn" onClick={openChoicePractice}>Elegir la respuesta correcta<ArrowRight size={15} /></button></div></div><aside className="study-progress-card"><span>Tu avance</span><strong>{stats.done}<small> / {stats.total}</small></strong><p>ejercicios completados</p><progress value={stats.done} max={stats.total} aria-label="Progreso de ejercicios" /><div><span>{progress.read.length} / {STUDY.lessons.length} temas leídos</span><Trophy size={19} /></div></aside></div>
        <div className="study-route-heading"><h2>Cinco niveles. A tu ritmo.</h2><p>Podés saltar de nivel. La recomendación sigue tu primer ejercicio pendiente.</p></div>
        <div className="study-level-path">{STUDY.levels.map(l => { const tasks = STUDY.exercises.filter(e => e.level === l.id); const n = tasks.filter(e => progress.entries[e.id]?.done).length; return <button key={l.id} onClick={() => { setLevel(l.id); setExerciseId(""); navigate("practica"); }} className={next?.level === l.id ? "recommended" : ""}><span className="study-level-number">{n === tasks.length ? <Check size={22} /> : l.id}</span><span><small>Nivel {l.id}{next?.level === l.id ? " · recomendado" : ""}</small><strong>{l.name}</strong><p>{l.description}</p></span><span className="study-level-meta">{n}/{tasks.length}<small>{l.minutes}</small></span><ChevronRight size={20} /></button>; })}</div>
        <div className="study-bottom-grid"><section><BookOpen size={22} /><h2>Tu mapa de teoría</h2><p>{STUDY.lessons.length} temas, ocho patrones con estructura y secuencia, y fórmulas explicadas. Cada tema enlaza al material original.</p><button className="btn" onClick={() => navigate("teoria")}>Abrir resumen<ArrowRight size={15} /></button></section><section><Flag size={22} /><h2>Lo que falta afianzar</h2><p>{Object.values(progress.entries).filter(e => e.review).length} ejercicios para repasar. Los errores y los que marques vuelven a esta lista.</p><button className="btn" onClick={() => { setOnlyReview(true); setExerciseId(""); navigate("practica"); }}>Repasar pendientes<ArrowRight size={15} /></button></section></div>
        <div className="study-save-info"><p>Progreso y borradores guardados en este navegador, separados por tu cuenta. Exportá una copia para usarla en otro dispositivo.</p><div><button className="btn" onClick={() => saveFile(JSON.stringify(progress,null,2),"progreso-IS-II.json")}><Download size={15} />Exportar progreso</button><button className="btn" onClick={() => upload.current?.click()}><Upload size={15} />Importar copia</button><button className="study-text-btn" onClick={() => setConfirmReset(true)}>Reiniciar recorrido</button></div></div>
      </>}
      {view === "teoria" && <div className="study-two-column"><aside className="study-index"><h2>Resumen de teoría</h2><label className="study-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar un tema" aria-label="Buscar teoría" /></label>{STUDY.lessons.filter(l => normalize(l.title + " " + JSON.stringify(l.sections)).includes(normalize(query))).map(l => <button key={l.id} onClick={() => setLessonId(l.id)} className={lessonId === l.id ? "active" : ""}>{progress.read.includes(l.id) ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}<span>{l.title}</span></button>)}<a className="btn" href="/estudio/Resumen-IS-II.md" download><Download size={15} />Descargar resumen</a></aside><article className="study-article"><div className="study-article-tools"><span>Teoría y ejemplos visuales</span><button className="btn" onClick={() => window.print()}><Printer size={15} />Imprimir</button></div><h1>{lesson.title}</h1><p className="study-lead">{lesson.lead}</p><LessonBody lesson={lesson} onPattern={openPattern} onGuide={setGuide} storageKey={key} ready={ready && !storageError} /><div className="study-article-bottom"><button className="btn primary" onClick={() => setProgress(p => ({ ...p, read: p.read.includes(lesson.id) ? p.read.filter(id => id !== lesson.id) : [...p.read,lesson.id] }))}><Check size={16} />{progress.read.includes(lesson.id) ? "Tema leído" : "Marcar como leído"}</button><button className="btn" onClick={() => { const index = STUDY.lessons.findIndex(l => l.id === lesson.id); setLessonId(STUDY.lessons[(index+1)%STUDY.lessons.length].id); }}>Siguiente tema<ArrowRight size={15} /></button></div></article></div>}
      {view === "patrones" && <div className="study-two-column"><aside className="study-index study-pattern-index"><h2>Ocho patrones, paso a paso</h2><label className="study-mobile-pattern-select">Patrón<select aria-label="Patrón" value={patternId} onChange={e => openPattern(e.target.value)}>{STUDY.patterns.map(p => <option value={p.id} key={p.id}>{p.name} · {p.family}</option>)}</select></label>{["Creacional","Estructural","Comportamiento"].map(f => <section key={f}><h3>{f}</h3>{STUDY.patterns.filter(p => p.family === f).map(p => <button className={p.id === patternId ? "active" : ""} key={p.id} onClick={() => openPattern(p.id)}><Shapes size={17} />{p.name}</button>)}</section>)}</aside><article className="study-article"><h1>{pattern.name}</h1><p className="study-pattern-family">{pattern.family}</p><p className="study-lead">{pattern.purpose}</p><div className="study-pattern-tip"><Lightbulb size={20} /><p>{pattern.signal}</p></div><section className="study-section"><h3>Participantes</h3><p>{pattern.roles}</p></section><p className="study-visual-intro">Mirá quién conoce a quién en Estructura, o seguí las llamadas en En acción. Los pasos destacan el participante; el zoom permite acercarte a los detalles.</p><StudyVisualExplorer key={pattern.id} contextName={pattern.name} visuals={pattern.visuals} onGuide={setGuide} storageKey={key} ready={ready && !storageError} /><section className="study-section"><h3>Ejemplo de aplicación</h3><p>{pattern.example}</p><h3>Ventaja y costo</h3><p>{pattern.benefit}</p><p>{pattern.cost}</p></section><div className="study-callout"><strong>Antes de elegirlo</strong><p>{pattern.error}</p></div><details className="study-understanding"><summary>{pattern.check.question}</summary><p>{pattern.check.answer}</p></details><References ids={pattern.refs} /><div className="study-pattern-practice"><button className="btn primary" onClick={() => openExercise(STUDY.exercises.find(e => e.title === "Reconocé "+pattern.name)!)}>Reconocer el patrón<ArrowRight size={16} /></button><button className="btn" onClick={() => openExercise(STUDY.exercises.find(e => e.title === "Seguí las llamadas de "+pattern.name)!)}>Practicar su secuencia<ArrowRight size={16} /></button></div></article></div>}
      {view === "practica" && <>
        {!current ? <><div className="study-page-heading"><h1>{activityKind === "choice" ? "Elegí la respuesta correcta" : "Elegí tu desafío"}</h1><p>{activityKind === "choice" ? "Preguntas del resumen y casos de los parciales para entrenar. Elegí una opción, comprobá y revisá la explicación. Podés practicar los cinco niveles." : "Consignas adaptadas de las guías, más ejercicios de apoyo. Las soluciones son propuestas didácticas."}</p></div><div className="study-level-tabs">{STUDY.levels.map(l => <button className={level === l.id ? "active" : ""} key={l.id} onClick={() => setLevel(l.id)}><span>{l.id}</span>{l.name}</button>)}</div><div className="study-filters"><label className="study-search"><Search size={16} /><input placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Tipo de actividad" value={activityKind} onChange={e => changeActivityKind(e.target.value)}><option value="all">Todas las actividades</option><option value="choice">Elegir respuesta correcta</option><option value="numeric">Calcular</option><option value="uml">Modelar UML</option><option value="open">Desarrollar</option></select><select aria-label="Filtrar por tema" value={topic} onChange={e => setTopic(e.target.value)}>{["Todos",...new Set(STUDY.exercises.map(e => e.topic))].map(t => <option key={t}>{t}</option>)}</select><label><input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} />Solo para repasar</label></div><div className="study-exercise-list">{filtered.map(e => <button key={e.id} onClick={() => openExercise(e)}><span className={progress.entries[e.id]?.done ? "study-task-state done" : "study-task-state"}>{progress.entries[e.id]?.done ? <Check size={18} /> : e.id.slice(1)}</span><span><strong>{e.title}</strong><small>{e.topic} · {e.kind === "choice" ? "Elegir respuesta" : e.kind === "numeric" ? "Calcular" : e.kind === "uml" ? "Modelar en UML" : "Desarrollar"}</small></span>{progress.entries[e.id]?.review && <Flag size={16} />}<ChevronRight size={18} /></button>)}</div>{!filtered.length && <p className="study-empty">No hay ejercicios con estos filtros en el nivel {level}. Probá otro nivel o quitá los filtros.</p>}</> : <article className="study-exercise-detail">
          <div className="study-exercise-top"><button className="study-text-btn" onClick={() => setExerciseId("")}><ArrowLeft size={15} />Ejercicios del nivel {current.level}</button><span>{current.id.toUpperCase()} · {current.topic}</span><button className={"btn "+(entry.review ? "marked" : "")} onClick={() => updateEntry(current.id,{review:!entry.review})}><Flag size={15} />{entry.review ? "Marcado para repasar" : "Repasar después"}</button></div>
          <h1>{current.title}</h1>
          {current.scenario && <section className="study-company-case"><h2>El caso</h2><p>{current.scenario}</p></section>}
          <p className="study-prompt">{current.prompt}</p>
          {current.provenance && <p className="study-validation">{current.provenance}</p>}
          {current.code && <section className="study-code-reading"><div><h2>C++17 · lectura y análisis</h2><button className="btn" onClick={() => saveFile(current.code!,current.id+"-lectura.cpp","text/plain;charset=utf-8")}><Download size={15} />Descargar código</button></div><p>Leé el código y respondé abajo con tus palabras. No hace falta programar.</p><pre tabIndex={0} aria-label="Código C++17 de la actividad"><code>{current.code}</code></pre></section>}
          <References ids={current.refs} />
          {current.kind === "choice" && <fieldset className="study-options" disabled={!ready}><legend>Elegí una respuesta</legend>{current.choices!.map((option,i) => <label key={i} className={entry.answer === String(i) ? "selected" : ""}><input type="radio" name={current.id} value={i} checked={entry.answer === String(i)} onChange={() => updateEntry(current.id,{answer:String(i),result:undefined,done:false})} /><span>{String.fromCharCode(65+i)}</span>{option}</label>)}</fieldset>}
          {current.kind === "numeric" && <label className="study-answer-label">Tu resultado numérico<input aria-label="Tu resultado numérico" disabled={!ready} inputMode="decimal" value={entry.answer} onChange={e => updateEntry(current.id,{answer:e.target.value,result:undefined,done:false})} placeholder="Por ejemplo: 3,33" /><small>Usá coma o punto decimal, sin separadores de miles. Mostrá el cálculo en tus notas.</small></label>}
          {current.kind !== "choice" && <label className="study-answer-label">{current.kind === "numeric" ? "Cálculo e interpretación (opcional)" : "Tu razonamiento"}<textarea aria-label={current.kind === "numeric" ? "Cálculo e interpretación (opcional)" : "Tu razonamiento"} disabled={!ready} value={entry.answer && current.kind !== "numeric" ? entry.answer : current.kind === "numeric" ? entry.draft : ""} placeholder={current.kind === "numeric" ? "Fórmula, reemplazo, unidad e interpretación…" : "Explicá los requisitos, tu solución y por qué funciona…"} onChange={e => updateEntry(current.id,current.kind === "numeric" ? {draft:e.target.value} : {answer:e.target.value,done:false})} /></label>}
          {current.kind === "uml" && <><div className="study-workbench-title"><h2>Tu mesa de UML</h2><p>Usá el editor y el lienzo de UML Studio. La vista comprueba sintaxis; la rúbrica evalúa tu diseño.</p><div><span className="study-workbench-history"><button className="icon-btn" aria-label="Deshacer en la práctica" title="Deshacer" onClick={() => studyEditor.current?.undo()}><Undo2 size={16} /></button><button className="icon-btn" aria-label="Rehacer en la práctica" title="Rehacer" onClick={() => studyEditor.current?.redo()}><Redo2 size={16} /></button></span><button className="btn" disabled={busy || !ready} onClick={() => void openInStudio()}>{busy ? <LoaderCircle size={15} className="spin" /> : <ExternalLink size={15} />}{entry.diagramId ? "Abrir diagrama guardado" : "Llevar al editor completo"}</button>{entry.diagramId && <button className="btn" disabled={busy || !ready} onClick={() => void retrieveDiagram()}><RotateCcw size={15} />Traer versión guardada</button>}<button className="btn" onClick={() => saveFile(entry.draft || starter(current),current.title+".mmd","text/plain;charset=utf-8")}><Download size={15} />Exportar UML</button></div></div><div className="study-workbench"><section className="study-code-pane"><div className="pane-header">Código Mermaid</div><CodeEditor ref={studyEditor} key={current.id} value={entry.draft || starter(current)} onChange={draft => updateEntry(current.id,{draft,done:false})} /></section><section className="study-canvas-pane"><div className="pane-header">Vista de tu borrador</div><DiagramPreview onUndo={() => studyEditor.current?.undo()} onRedo={() => studyEditor.current?.redo()} diagram={diagram(current.id,current.title,entry.draft || starter(current),current.diagramType || "class")} onRendered={setSvg} onSourceChange={ready ? source => updateEntry(current.id,{draft:source,done:false}) : undefined} onClassClick={() => setNotice("Seleccioná un elemento y usá el doble clic para editarlo. También podés modificar el código o abrir el editor completo.")} onSettingsChange={settings => updateEntry(current.id,{draft:writeCanvas(entry.draft || starter(current),settings),done:false})} onConnect={(from,to,kind,positions) => updateEntry(current.id,{draft:writeCanvas(appendRelation(entry.draft || starter(current),from,to,kind),{...readCanvas(entry.draft || starter(current)),positions}),done:false})} onGuide={setGuide} /></section></div><p className="study-validation">{svg ? "Sintaxis válida. Revisá participantes, responsabilidades y relaciones." : "Completá tu diagrama para empezar. Si hay un error de sintaxis, se indicará en el lienzo."}</p></>}
          {!currentInExam && <div className="study-help-row"><button className="btn" disabled={entry.hints >= current.hints.length} onClick={() => updateEntry(current.id,{hints:entry.hints+1})}><Lightbulb size={16} />{entry.hints ? "Otra pista" : "Una pista"} ({Math.min(entry.hints,current.hints.length)}/{current.hints.length})</button><button className="study-text-btn" onClick={() => { updateEntry(current.id,{solutionSeen:true}); setSolutionId(current.id); }}>Ver solución explicada</button></div>}
          {!currentInExam && current.hints.slice(0,entry.hints).map((hint,i) => <div className="study-hint" key={i}><Lightbulb size={16} /><p>{hint}</p></div>)}
          {(current.kind === "choice" || current.kind === "numeric") && <><button className="btn primary study-check" disabled={!ready || currentInExam} onClick={check}><Check size={17} />Comprobar respuesta</button>{currentInExam && <p className="study-validation">Durante el simulacro se guardan respuestas y se oculta la corrección.</p>}{entry.result && !currentInExam && <div className={"study-feedback "+entry.result} role="status"><strong>{entry.result === "correct" ? "Bien resuelto. +25 XP al completar por primera vez." : "Todavía no. Revisá el planteo y probá de nuevo."}</strong>{entry.result === "correct" && <p>{current.solution}</p>}{entry.result === "incorrect" && current.kind === "choice" && choiceExplanation(current,entry.answer) && <p>{choiceExplanation(current,entry.answer)}</p>}<small>{entry.attempts} intento{entry.attempts === 1 ? "" : "s"}{entry.solutionSeen ? " · consultaste la solución" : ""}</small></div>}</>}
          {current.kind !== "choice" && current.kind !== "numeric" && !currentInExam && <section className="study-rubric"><h2>Revisá tu respuesta</h2><p>Autoevaluación: el sistema no califica automáticamente el razonamiento ni la corrección del diagrama.</p>{current.rubric.map((item,i) => <label key={i}><input type="checkbox" checked={!!entry.rubric[i]} onChange={e => { const rubric=[...entry.rubric];rubric[i]=e.target.checked;updateEntry(current.id,{rubric,done:false}); }} />{item}</label>)}<button className="btn primary" disabled={!ready} onClick={reviewComplete}><Check size={16} />Completar autoevaluación</button></section>}
          {entry.done && <div className="study-completed"><CheckCircle2 size={20} />Completado{entry.solutionSeen ? " con ayuda de la solución" : ""}. Podés volver a practicar cuando quieras.</div>}
          <section className="study-correction"><div><h2>Revisá tu solución con una IA</h2><p>Copiá la consigna, el caso o código provisto, tu respuesta y los criterios de revisión. Después pegá el texto en la IA que prefieras.</p></div><button className="btn" disabled={!ready || copying || currentInExam} onClick={() => void copyForCorrection()}>{copying ? <LoaderCircle size={16} className="spin" /> : <Copy size={16} />}Copiar y corregir</button>{currentInExam && <p className="study-validation">Disponible cuando finalices el simulacro.</p>}</section>
          <div className="study-exercise-bottom"><button className="btn" onClick={() => { const candidates = currentInExam ? STUDY.exercises.filter(e => examIds.includes(e.id)) : activityKind === "choice" ? STUDY.exercises.filter(e => e.kind === "choice").sort((a,b) => a.level-b.level) : STUDY.exercises; const index=candidates.findIndex(e => e.id === current.id);openExercise(candidates[(index+1)%candidates.length]); }}>Siguiente desafío<ArrowRight size={17} /></button><button className="study-text-btn" onClick={() => { saveFile(JSON.stringify({exercise:current,answer:entry},null,2),current.id+"-respuesta.json"); }}>Descargar esta respuesta</button></div>
        </article>}
      </>}
      {view === "simulacros" && (paper ? <>
        <button className="study-text-btn study-paper-back" onClick={() => navigate("simulacros")}><ArrowLeft size={15} />Parciales y simulacros</button>
        <StudyPaper paper={paper} entries={progress.entries} sources={STUDY.sources} ready={ready && !storageError} active={examActive && exam?.paperId === paper.id} copying={copying} onChange={updateEntry} onCopy={text => void copyPrepared(text)} onPractice={id => { const exercise = STUDY.exercises.find(e => e.id === id); if (exercise) openExercise(exercise); }} onGuide={setGuide} />
      </> : <>
        <div className="study-page-heading"><h1>Parciales y simulacros</h1><p>Los parciales por año conservan las consignas, los enunciados completos y el orden de las hojas. Podés responderlos en una sola página o resolverlos con tiempo de entrenamiento.</p></div>
        {run && <section className="study-exam-result"><h2>{exam?.title}</h2><p>{examActive ? `Tiempo restante: ${timeText}.` : "Intento finalizado. Las respuestas están guardadas para revisar."}</p>{examPaper ? <button className="btn" onClick={() => openPaper(examPaper.id)}>{examActive ? "Continuar el parcial" : "Ver mis respuestas"}<ArrowRight size={15} /></button> : <>
          <div className="study-exam-questions">{examIds.map(id => { const e=STUDY.exercises.find(e => e.id===id)!; const a=progress.entries[id]; return <button key={id} onClick={() => openExercise(e)}><span>{e.title}</span><small>{a?.answer || a?.draft ? "Con respuesta" : "Pendiente"}</small><ChevronRight size={16} /></button>; })}</div>
          {!examActive && <button className="btn" onClick={() => { let p=progressRef.current;for(const id of examIds){const e=STUDY.exercises.find(e => e.id===id)!;const a=p.entries[id];if(a && ["choice","numeric"].includes(e.kind) && a.answer){const ok=correctAnswer(e,a.answer);p={...p,entries:{...p.entries,[id]:{...a,result:ok?"correct":"incorrect",done:ok,review:!ok,attempts:a.attempts+1}}};}}setProgress(p);setNotice("Preguntas objetivas corregidas. Revisá los desarrollos con su rúbrica."); }}>Corregir preguntas objetivas</button>}
        </>}</section>}
        <h2>Parciales por año</h2><div className="study-exam-grid">{STUDY.examSets.filter(s => s.paperId).map(s => { const original = PAPERS.find(p => p.id === s.paperId)!; return <section key={s.id}><FileText size={25} /><h2>{s.title}</h2><p>{paperQuestions(original).length} preguntas originales · {original.date}</p><ul>{original.sections.map((section,i) => <li key={i}>{section.title || "Preguntas"}: {section.questions.length}</li>)}</ul><div className="study-paper-card-actions"><button className="btn primary" onClick={() => openPaper(original.id)}>Abrir parcial completo</button><button className="btn" disabled={!ready || examActive} onClick={() => beginExam(s.id,s.minutes)}>Resolver con tiempo</button></div><p className="study-validation">{s.minutes} minutos propuestos para entrenar; no es la duración oficial. Las respuestas de las prácticas adicionales se conservan por separado.</p></section>; })}</div>
        <h2 className="study-training-heading">Simulacros de práctica adicional</h2><p>Actividades adaptadas y casos nuevos para entrenar por dificultad.</p><div className="study-exam-grid">{STUDY.examSets.filter(s => !s.paperId).map(s => <section key={s.id}><Timer size={25} /><h2>{s.title}</h2><p>{s.exerciseTitles.length} desafíos · {s.minutes} minutos propuestos para entrenar.</p><ul>{s.exerciseTitles.map(t => <li key={t}>{t}</li>)}</ul><p className="study-validation">Usa tus borradores actuales. Exportá el progreso antes si querés conservar otro intento.</p><button className="btn primary" disabled={!ready || examActive} onClick={() => beginExam(s.id,s.minutes)}><Play size={16} />Iniciar simulacro</button></section>)}</div>
      </>)}
      {view === "fuentes" && <><div className="study-page-heading"><h1>Tu biblioteca de estudio</h1><p>{STUDY.sourceCount} documentos revisados: {STUDY.pdfPages} páginas PDF, tres guías/modelos Word y cuatro imágenes de parciales. Abrí el original para ver diagramas, código y enunciados completos.</p></div><label className="study-search"><Search size={16} /><input placeholder="Buscar documento" aria-label="Buscar documento original" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="study-source-list">{STUDY.sources.filter(s => normalize(s.name).includes(normalize(query))).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><FileText size={22} /><span><strong>{s.name}</strong><small>{s.format === "image" ? "Imagen del parcial" : s.pages ? s.pages+" páginas PDF" : "Documento Word"}</small></span><ExternalLink size={17} /></a>)}</div><p className="study-source-note">Las consignas de práctica se adaptaron para estudiar por dificultad y se agruparon ejercicios repetidos. Las soluciones y rúbricas son propuestas didácticas, no respuestas oficiales de la cátedra. Los ejercicios de código se presentan en C++17 para leer y analizar; los originales conservan sus lenguajes.</p></>}
    </section>
    <footer className="study-footer"><span><CheckCircle2 size={13} />{ready && !storageError ? "Guardado en este navegador" : "Revisá el guardado"}</span><span>{stats.done}/{stats.total} desafíos · {stats.xp} XP</span><button onClick={() => saveFile(JSON.stringify(progress,null,2),"progreso-IS-II.json")} title="Exportar una copia">Exportar progreso</button></footer>
    <input type="file" hidden ref={upload} accept="application/json,.json" onChange={e => { const f=e.target.files?.[0];if(f)void importProgress(f);e.currentTarget.value=""; }} />
    {guide && <Modal title="Guía de relaciones UML" wide onClose={() => setGuide("")}><RelationGuide selected={guide} onSelect={setGuide} /></Modal>}
    {manualCopy && <Modal title="Copiar para corregir" wide onClose={() => setManualCopy("")}><div className="modal-body"><p>El navegador no permitió copiar automáticamente. Seleccioná el texto y copialo con Ctrl+C, o descargalo para pegarlo en tu IA.</p><label className="study-answer-label study-copy-text">Texto de la actividad y tu respuesta<textarea aria-label="Texto de la actividad y tu respuesta" readOnly value={manualCopy} onFocus={event => event.currentTarget.select()} /></label></div><div className="modal-footer"><button className="btn" onClick={() => saveFile(manualCopy,"actividad-para-corregir.txt","text/plain;charset=utf-8")}><Download size={16} />Descargar texto</button><button className="btn primary" onClick={() => setManualCopy("")}>Listo</button></div></Modal>}
    {solutionId && (() => {const e=STUDY.exercises.find(e => e.id === solutionId)!;return <Modal title={"Solución: "+e.title} wide onClose={() => setSolutionId("")}><div className="study-solution"><p>{e.solution}</p>{e.uml && <><h3>Esquema orientativo</h3><p>Revisá el texto de la solución y adaptá los nombres y miembros al dominio de la consigna. Los casos integrales pueden necesitar más de un esquema.</p><div className="study-reference-canvas"><DiagramPreview initialFit="contain" diagram={diagram("sol-"+e.id,e.title,e.uml,e.diagramType || "class")} onRendered={() => {}} onClassClick={() => {}} onSettingsChange={() => {}} onConnect={() => {}} onGuide={setGuide} /></div><details><summary>Código Mermaid del esquema</summary><pre>{e.uml}</pre></details></>}<References ids={e.refs} /></div></Modal>;})()}
    {confirmReset && <Modal title="Reiniciar recorrido" onClose={() => setConfirmReset(false)}><div className="modal-body"><p>Se quitarán respuestas, progreso y borradores de estudio de este navegador. Los diagramas guardados en UML Studio se conservan. Exportá una copia antes si querés recuperar este recorrido.</p></div><div className="modal-footer"><button className="btn" onClick={() => setConfirmReset(false)}>Cancelar</button><button className="btn danger" onClick={() => { setProgress(emptyProgress());setRun(null);setReady(!!key);setConfirmReset(false); }}>Reiniciar</button></div></Modal>}
    {pendingImport && <Modal title="Importar progreso" onClose={() => setPendingImport(null)}><div className="modal-body"><p>La copia tiene {completion(pendingImport).done} ejercicios completados. Reemplazará las respuestas y borradores de estudio de este navegador. Los diagramas del editor se conservan.</p></div><div className="modal-footer"><button className="btn" onClick={() => setPendingImport(null)}>Cancelar</button><button className="btn primary" onClick={() => {setProgress(pendingImport);setReady(!!key);setPendingImport(null);setNotice("Copia importada.");}}>Importar copia</button></div></Modal>}
  </main>;
}
