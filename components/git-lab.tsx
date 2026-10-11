"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, Cloud, FileCode2, FolderPen, GitBranch, GitCommitHorizontal, Layers, Lightbulb, Play, Plus, RotateCcw, Shapes, Terminal, X, AlertCircle } from "lucide-react";
import { changes, commandSuggestions, COMMAND_HELP, divergence, editFile, emptyRepo, GIT_EXERCISES, graphCommits, headTree, initialRepo, remoteUrl, runGit, teamCommit, validRepo, type GitRepo, type FileChange } from "@/lib/git-simulator";
import ThemePicker from "./theme-picker";

const STORAGE = "uml-studio-git-lab-v1";
type Session = { repo: GitRepo; exercise: string; completed: string[] };
type Entry = { command: string; output: string; error?: boolean };
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
function readSession(): Session {
  const fallback = { repo: GIT_EXERCISES[0].prepare(), exercise: "commit", completed: [] };
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw || raw.length > 2_000_000) return fallback;
    const saved = JSON.parse(raw);
    if (validRepo(saved.repo) && (["free", "empty"].includes(saved.exercise) || GIT_EXERCISES.some(e => e.id === saved.exercise)) && Array.isArray(saved.completed)) return { repo: saved.repo, exercise: saved.exercise, completed: saved.completed.filter((id: unknown) => GIT_EXERCISES.some(e => e.id === id)) };
  } catch { /* An unavailable or invalid browser copy starts a fresh sandbox. */ }
  return fallback;
}

function RepoGraph({ repo, remote, selected, onSelect }: { repo: GitRepo; remote?: boolean; selected: string; onSelect: (id: string) => void }) {
  const commits = graphCommits(repo, remote);
  if (!commits.length) return <p className="git-zone-empty"><GitCommitHorizontal size={20} />{remote ? "Sin commits remotos" : repo.initialized === false ? "Carpeta sin inicializar" : "Todavía no hay commits"}<small>{remote ? remoteUrl(repo) ? "Tu primer push creará la rama remota." : "Configurá origin con git remote add." : repo.initialized === false ? "git init crea el repositorio vacío." : "Prepará un archivo y usá git commit."}</small></p>;
  const refs = remote ? repo.remote : repo.branches;
  const lanes = new Map<string, number>();
  const names = Object.keys(refs).sort((a, b) => a === "main" ? -1 : b === "main" ? 1 : a.localeCompare(b));
  function trace(id: string, lane: number) { if (!id || lanes.has(id)) return; lanes.set(id, lane); trace(repo.commits[id]?.parents[0], lane); }
  names.forEach((name, lane) => trace(refs[name], lane));
  if (!remote) Object.values(repo.tracking).forEach(id => trace(id, lanes.has(id) ? lanes.get(id)! : Math.max(0, ...lanes.values()) + 1));
  const point = (id: string) => ({ x: 20 + (lanes.get(id) || 0) * 22, y: 28 + commits.findIndex(c => c.id === id) * 64 });
  const height = Math.max(190, commits.length * 64 + 10);
  const maxLane = Math.max(0, ...lanes.values()); const left = 42 + maxLane * 22;
  return <div className="git-graph-scroll"><div className="git-graph" style={{ height, minWidth: left + 145 }}>
    <svg aria-hidden="true" width={left} height={height} className="git-graph-lines">
      {commits.flatMap(commit => commit.parents.filter(parent => commits.some(c => c.id === parent)).map(parent => {
        const a = point(commit.id); const b = point(parent);
        return <path key={commit.id + parent} d={`M ${a.x} ${a.y} C ${a.x} ${a.y + 24}, ${b.x} ${b.y - 24}, ${b.x} ${b.y}`} className={(lanes.get(commit.id) || 0) ? "branch-line" : ""} />;
      }))}
      {commits.map(commit => { const p = point(commit.id); return <circle key={commit.id} cx={p.x} cy={p.y} r={selected === commit.id ? 7 : 5} className={selected === commit.id ? "selected-commit" : ""} />; })}
    </svg>
    {commits.map((commit, index) => {
      const labels = Object.entries(refs).filter(([, id]) => id === commit.id).map(([name]) => name);
      const tracking = !remote ? Object.entries(repo.tracking).filter(([, id]) => id === commit.id).map(([name]) => "origin/" + name) : [];
      return <button key={commit.id} className={"git-commit " + (selected === commit.id ? "selected" : "")} style={{ top: index * 64 + 2, left }} onClick={() => onSelect(commit.id)} aria-label={`${remote ? "Remoto" : "Local"}: commit ${commit.id}, ${commit.message}`} aria-pressed={selected === commit.id}>
        <span className="git-commit-refs">{!remote && repo.branches[repo.head] === commit.id && <span className="head-ref">HEAD</span>}{labels.map(label => <span key={label}>{label}</span>)}{tracking.map(label => <span key={label} className="tracking-ref">{label}</span>)}</span>
        <code>{commit.id}</code><span className="git-commit-message" title={commit.message}>{commit.message}</span>
      </button>;
    })}
  </div></div>;
}
function FileRows({ list, conflicts, onOpen, onStage, staged }: { list: FileChange[]; conflicts?: string[]; onOpen: (path: string) => void; onStage: (path: string) => void; staged?: boolean }) {
  return <div className="git-files">{list.map(file => <div className="git-file" key={file.path}>
    <button className="git-file-open" onClick={() => onOpen(file.path)}><FileCode2 size={16} /><span><code>{file.path}</code><small>{conflicts?.includes(file.path) ? "Conflicto" : file.kind === "added" ? "Nuevo archivo" : file.kind === "deleted" ? "Eliminado" : "Modificado"}</small></span></button>
    <button className="icon-btn" aria-label={(staged ? "Quitar del índice " : "Preparar ") + file.path} title={staged ? "Quitar del índice" : "Preparar archivo"} onClick={() => onStage(file.path)}>{staged ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</button>
  </div>)}</div>;
}

export default function GitLab() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return ready ? <GitWorkbench /> : <main className="git-loading"><GitBranch size={24} /><p>Preparando el laboratorio Git…</p></main>;
}
function GitWorkbench() {
  const [session, setSession] = useState(readSession);
  const [entries, setEntries] = useState<Entry[]>([{ command: "", output: "Git Lab · repositorio de práctica\nEscribí git status para empezar. help muestra los comandos disponibles." }]);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [effect, setEffect] = useState("Observá las cuatro zonas y ejecutá git status para conocer el estado de tu práctica.");
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<{ path: string; content: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [hints, setHints] = useState(false);
  const [newRepository, setNewRepository] = useState(false);
  const [repoName, setRepoName] = useState("mi-proyecto");
  const [repoError, setRepoError] = useState("");
  const [autocomplete, setAutocomplete] = useState(() => { try { return localStorage.getItem("uml-git-autocomplete") !== "off"; } catch { return true; } });
  const [inputFocused, setInputFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const suggestionId = useId();
  const input = useRef<HTMLInputElement>(null);
  const output = useRef<HTMLDivElement>(null);
  const repo = session.repo;
  const exercise = GIT_EXERCISES.find(e => e.id === session.exercise);
  const staged = changes(headTree(repo), repo.index);
  const unstaged = changes(repo.index, repo.working);
  const d = divergence(repo);
  const localCount = graphCommits(repo).length; const remoteCount = graphCommits(repo, true).length;
  const selectedCommit = repo.commits[selected || repo.branches[repo.head]];
  const completedNow = !!exercise?.complete(repo);
  const suggestions = autocomplete && inputFocused && !suggestionsDismissed ? commandSuggestions(repo, command) : [];
  const activeSuggestion = Math.min(suggestionIndex, Math.max(0, suggestions.length - 1));
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(session)); }
    catch { /* The live sandbox still works when storage is unavailable. */ }
  }, [session]);
  useEffect(() => { output.current?.scrollTo({ top: output.current.scrollHeight, behavior: "instant" }); }, [entries]);
  function apply(next: GitRepo) {
    const done = exercise?.complete(next);
    setSession(previous => ({ ...previous, repo: next, completed: done && !previous.completed.includes(exercise!.id) ? [...previous.completed, exercise!.id] : previous.completed }));
  }
  function execute(value: string) {
    if (!value.trim()) return;
    if (value.trim() === "clear") { setEntries([]); setCommand(""); return; }
    const result = runGit(repo, value);
    apply(result.repo); setError(!!result.error); setEffect(result.effect);
    setEntries(previous => [...previous.slice(-59), { command: value, output: result.output, error: result.error }]);
    setCommandHistory(previous => [...previous.slice(-59), value]); setHistoryIndex(-1); setCommand(""); setSuggestionsDismissed(true);
  }
  function insert(value: string) { setCommand(value); setSuggestionsDismissed(true); input.current?.focus(); }
  function start(id: string) {
    const chosen = GIT_EXERCISES.find(e => e.id === id);
    setSession(previous => ({ ...previous, exercise: chosen?.id || (id === "empty" ? "empty" : "free"), repo: chosen ? chosen.prepare() : id === "empty" ? emptyRepo(repo.name || "mi-proyecto") : initialRepo() }));
    setEntries([{ command: "", output: chosen ? "Ejercicio: " + chosen.title + "\n" + chosen.goal : "Práctica libre · podés editar archivos, crear ramas y simular un cambio del equipo." }]);
    setSelected(""); setFile(null); setFileError(""); setCommand(""); setHints(false); setError(false); setNewRepository(false); setSuggestionsDismissed(true);
    setEffect(chosen?.concept || "Explorá las cuatro zonas con tus propios comandos. El estado de esta práctica se guarda en este navegador.");
  }
  function openFile(path: string) { setFile({ path, content: repo.working[path] || "" }); setFileError(""); }
  function createRepository() {
    try {
      const next = emptyRepo(repoName.trim());
      setSession(previous => ({ ...previous, repo: next, exercise: "empty" }));
      setNewRepository(false); setRepoError(""); setSelected(""); setFile(null); setCommand(""); setError(false); setHints(false);
      setEntries([{ command: "", output: `Carpeta de práctica: ${next.name}\nSin archivos, commits ni remoto. Empezá con git init.` }]);
      setEffect("Tu carpeta está vacía. Inicializá Git, creá archivos con + y probá tus propios comandos.");
    } catch (e) { setRepoError((e as Error).message); }
  }
  function downloadProgress() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "git-lab-practica.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <main className="git-app">
    <header className="git-header"><Link href="/" className="brand"><GitBranch size={23} /><span>UML<span className="brand-light"> Studio</span></span></Link><h1>Git Lab</h1><div className="git-header-end"><span className="git-sandbox-label">Simulador</span><ThemePicker /><Link href="/estudio" className="btn header-quiet" aria-label="Estudio IS II"><BookOpen size={16} /><span>Estudio</span></Link><Link href="/" className="btn" aria-label="Editor UML"><Shapes size={16} /><span>Editor UML</span></Link></div></header>
    <aside className="git-lessons" aria-label="Ejercicios de Git">
      <div className="git-lessons-heading"><h2>Aprendé haciendo</h2><span>{session.completed.length}/{GIT_EXERCISES.length}</span></div>
      <label className="git-mobile-exercise">Ejercicio<select value={session.exercise} onChange={e => start(e.target.value)}>{GIT_EXERCISES.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}<option value="free">Práctica libre</option><option value="empty">Repositorio vacío</option></select></label>
      <div className="git-exercise-list">{GIT_EXERCISES.map((e, index) => <button key={e.id} className={session.exercise === e.id ? "active" : ""} aria-current={session.exercise === e.id ? "step" : undefined} onClick={() => start(e.id)}><span className="exercise-number">{session.completed.includes(e.id) ? <Check size={16} /> : index + 1}</span><span><strong>{e.title}</strong><small>{e.concept}</small></span></button>)}<button className={session.exercise === "free" ? "active" : ""} onClick={() => start("free")}><Play size={17} /><span><strong>Práctica libre</strong><small>Armá tu propio flujo</small></span></button></div>
      <section className="git-mission"><h3>{exercise ? "Tu objetivo" : "Explorá el repositorio"}</h3><p>{exercise?.goal || "Editá archivos, probá comandos y observá cómo cambian los dos repositorios."}</p>{completedNow && <p className="git-success" role="status"><CheckCircle2 size={17} />Ejercicio resuelto</p>}{exercise && <button className="text-btn git-hints-btn" onClick={() => setHints(!hints)} aria-expanded={hints}><Lightbulb size={15} />{hints ? "Ocultar pistas" : "Ver pistas"}</button>}{hints && <ol className="git-hints">{exercise?.hints.map(hint => <li key={hint}>{hint.startsWith("git ") ? <button onClick={() => insert(hint)}><code>{hint}</code></button> : hint}</li>)}</ol>}<button className="btn" onClick={() => start(session.exercise)}><RotateCcw size={14} />Reiniciar ejercicio</button></section>
      <div className="git-reference"><p>Tu práctica queda en este navegador. Los archivos y remotos son simulados.</p><button className="text-btn" onClick={downloadProgress}>Descargar práctica</button><a href="https://git-scm.com/book/es/v2" target="_blank" rel="noreferrer">Manual de Git</a></div>
    </aside>
    <div className="git-main">
      <div className="git-repo-bar"><div><GitBranch size={16} /><strong>{repo.name || "umlProject-ingSoftware"}</strong><span>{repo.initialized === false ? "Sin inicializar" : <>HEAD → <code>{repo.head}</code>{!repo.branches[repo.head] && " · sin commits"}</>}</span></div><div className="git-repo-actions"><button className="btn" onClick={() => { setNewRepository(!newRepository); setRepoError(""); }} aria-expanded={newRepository}><Plus size={15} /><span>Nuevo repositorio</span></button><button className="btn" disabled={!remoteUrl(repo) || !Object.keys(repo.remote).length} title={!Object.keys(repo.remote).length ? "Primero enviá un commit al remoto" : undefined} onClick={() => { apply(teamCommit(repo)); setEffect("El equipo agregó un commit al remoto. Tu referencia origin/* todavía muestra la última información descargada: probá git fetch."); setError(false); }}><Cloud size={15} /><span>Simular cambio remoto</span></button></div></div>
      <div className="git-visual">
        {newRepository && <form className="git-new-repo" onSubmit={event => { event.preventDefault(); createRepository(); }}><div><h2>Crear un repositorio desde cero</h2><button type="button" className="icon-btn" aria-label="Cerrar nuevo repositorio" onClick={() => setNewRepository(false)}><X size={16} /></button></div><p>Creá una carpeta vacía y ejecutá <code>git init</code>. Esta práctica reemplaza el repositorio actual; tus ejercicios completados se conservan.</p><label>Nombre del repositorio<input value={repoName} onChange={event => setRepoName(event.target.value)} placeholder="mi-proyecto" maxLength={60} /></label>{repoError && <p className="form-error" role="alert">{repoError}</p>}<button className="btn primary"><FolderPen size={16} />Crear espacio vacío</button></form>}
        <div className="git-zones">
          <section className="git-zone zone-work" aria-label="Working directory">
            <div className="git-zone-title"><FolderPen size={23} /><h2>Working directory<small>Archivos de trabajo</small></h2></div>
            <div className="git-zone-content"><div className="git-zone-meta"><span>{unstaged.length} sin preparar</span><button className="icon-btn" onClick={() => { setFile({ path: Object.keys(repo.working).length ? "docs/nuevo.md" : "README.md", content: "" }); setFileError(""); }} aria-label="Crear archivo de práctica"><Plus size={16} /></button></div>
              <FileRows list={unstaged} conflicts={repo.merge?.conflicts} onOpen={openFile} onStage={path => execute("git add " + path)} />
              {!unstaged.length && <p className="git-zone-empty"><Check size={18} />Sin cambios pendientes<small>Editá un archivo para empezar.</small></p>}
              <details className="git-file-tree"><summary>Todos los archivos<ChevronDown size={14} /></summary>{Object.keys(repo.working).map(path => <button key={path} onClick={() => openFile(path)}><FileCode2 size={14} /><code>{path}</code></button>)}</details>
            </div>
          </section>
          <section className="git-zone zone-stage" aria-label="Staging area"><div className="git-zone-title"><Layers size={23} /><h2>Staging area<small>Índice · próximo commit</small></h2></div><div className="git-zone-content"><div className="git-zone-meta"><span>{staged.length} preparado{staged.length === 1 ? "" : "s"}</span><Layers size={16} /></div><FileRows list={staged} onOpen={openFile} staged onStage={path => execute("git restore --staged " + path)} />{!staged.length && <p className="git-zone-empty"><Layers size={19} />El índice está limpio<small><code>git add</code> prepara una copia del archivo.</small></p>}<p className="git-stage-tip">Sólo el contenido preparado se incluye en <code>git commit</code>.</p></div></section>
          <section className="git-zone zone-local" aria-label="Local repository"><div className="git-zone-title"><GitCommitHorizontal size={24} /><h2>Local repository<small>Historial de tu computadora</small></h2></div><div className="git-zone-meta"><span>{localCount} {localCount === 1 ? "commit conocido" : "commits conocidos"}</span><GitBranch size={15} /></div><RepoGraph repo={repo} selected={selectedCommit?.id || ""} onSelect={setSelected} /><p className="git-sync-state">{repo.tracking[repo.head] ? `${d.ahead} adelante · ${d.behind} atrás de origin/${repo.head}` : "Rama sin referencia remota"}</p></section>
          <section className="git-zone zone-remote" aria-label="Remote repository"><div className="git-zone-title"><Cloud size={24} /><h2>Remote repository<small>Servidor origin · simulado</small></h2></div><div className="git-zone-meta"><span>{remoteCount} {remoteCount === 1 ? "commit" : "commits"} en remoto</span><Cloud size={15} /></div><RepoGraph repo={repo} remote selected={selectedCommit?.id || ""} onSelect={setSelected} /><p className="git-sync-state">{!remoteUrl(repo) ? "Origin sin configurar" : !Object.keys(repo.remote).length ? "Remoto vacío" : Object.entries(repo.remote).every(([name, id]) => repo.tracking[name] === id) ? "Referencias origin/* actualizadas" : "Hay cambios remotos sin descargar"}</p></section>
        </div>
        <div className="git-flow" aria-label="Flujo de comandos Git">
          <button className="flow-add" onClick={() => insert("git add .")}><code>git add</code><ArrowRight size={18} /><small>Trabajo → índice</small></button>
          <button className="flow-commit" onClick={() => insert('git commit -m "Describir el cambio"')}><code>git commit</code><ArrowRight size={18} /><small>Índice → local</small></button>
          <button className="flow-push" onClick={() => insert("git push origin " + repo.head)}><code>git push</code><ArrowRight size={18} /><small>Local → remoto</small></button>
          <button className="flow-fetch" onClick={() => insert("git fetch origin")}><ArrowLeft size={18} /><code>git fetch</code><small>Remoto → origin/* local</small></button>
          <button className="flow-pull" onClick={() => insert("git pull origin " + repo.head)}><ArrowLeft size={18} /><code>git pull</code><small>Descargar e integrar</small></button>
          <button className="flow-restore" onClick={() => insert("git restore --staged .")}><ArrowLeft size={18} /><code>git restore --staged</code><small>Quitar preparación</small></button>
        </div>
        {file && <form className="git-file-editor" onSubmit={event => { event.preventDefault(); try { apply(editFile(repo, file.path, file.content)); setEffect("Guardaste " + file.path + " en Working directory. Usá git add para preparar esta versión."); setError(false); setFile(null); } catch (e) { setFileError((e as Error).message); } }}><div><h3><FileCode2 size={17} />Editar archivo de práctica</h3><button className="icon-btn" type="button" onClick={() => setFile(null)} aria-label="Cerrar editor de archivo"><X size={17} /></button></div><label>Nombre del archivo<input value={file.path} onChange={event => setFile({ ...file, path: event.target.value })} /></label><label>Contenido<textarea className="mono" value={file.content} onChange={event => setFile({ ...file, content: event.target.value })} rows={6} spellCheck={false} /></label>{fileError && <p className="form-error" role="alert">{fileError}</p>}<button className="btn primary"><Check size={15} />Guardar en Working directory</button></form>}
        {selectedCommit && <details className="git-commit-detail" key={selectedCommit.id}><summary><GitCommitHorizontal size={16} /><code>{selectedCommit.id}</code><span>{selectedCommit.message}</span><ChevronDown size={15} /></summary><div><p>Autor: {selectedCommit.author}. Padres: {selectedCommit.parents.join(", ") || "ninguno (commit inicial)"}. Identificador simulado.</p><h3>Archivos de este commit</h3>{Object.entries(selectedCommit.tree).map(([path, content]) => <details key={path}><summary><code>{path}</code></summary><pre>{content}</pre></details>)}</div></details>}
      </div>
      <div className={"git-effect " + (error ? "error" : "")} role="status">{error ? <AlertCircle size={17} /> : <ArrowRight size={17} />}<p>{effect}</p></div>
      <section className="git-console" aria-label="Consola de práctica Git">
        <div className="git-console-heading"><span><Terminal size={16} />Consola Git</span><span>↑ ↓ historial</span><label className="git-autocomplete-toggle"><input type="checkbox" checked={autocomplete} onChange={event => { setAutocomplete(event.target.checked); setSuggestionsDismissed(false); try { localStorage.setItem("uml-git-autocomplete", event.target.checked ? "on" : "off"); } catch { /* Session preference still works. */ } }} />Autocompletar</label><button onClick={() => { setEntries(previous => [...previous, { command: "help", output: COMMAND_HELP }]); input.current?.focus(); }}>Comandos</button><button onClick={() => setEntries([])}>Limpiar</button></div>
        <div className="git-console-output" ref={output} role="log" aria-label="Historial de la consola">{entries.map((entry, index) => <div key={index} className={entry.error ? "console-error" : ""}>{entry.command && <div className="git-echo"><span>$</span> {entry.command}</div>}{entry.output && <pre>{entry.output}</pre>}</div>)}</div>
        <form className="git-prompt" onSubmit={event => { event.preventDefault(); execute(command); }}>
          {!!suggestions.length && <div className="git-completions"><div>Tab completa · Esc cierra · ↑ ↓ elige</div><div id={suggestionId} role="listbox" aria-label="Sugerencias de Git">{suggestions.map((suggestion, index) => <button type="button" role="option" id={suggestionId + "-" + index} aria-selected={index === activeSuggestion} key={suggestion.value} onMouseDown={event => event.preventDefault()} onClick={() => insert(suggestion.value)}><code>{suggestion.value}</code><span>{suggestion.description}</span></button>)}</div></div>}
          <span className="git-prompt-branch"><GitBranch size={14} />{repo.head}</span><span aria-hidden="true">$</span><input ref={input} aria-label="Comando Git" role="combobox" aria-autocomplete={autocomplete ? "list" : "none"} aria-expanded={!!suggestions.length} aria-controls={suggestions.length ? suggestionId : undefined} aria-activedescendant={suggestions.length ? suggestionId + "-" + activeSuggestion : undefined} value={command} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onChange={event => { setCommand(event.target.value); setHistoryIndex(-1); setSuggestionsDismissed(false); setSuggestionIndex(0); }} placeholder={repo.initialized === false ? "git init" : "git status"} spellCheck={false} autoComplete="off" autoCapitalize="none" onKeyDown={event => {
          if (event.key === "Escape") { setSuggestionsDismissed(true); return; }
          if (suggestions.length && !event.altKey) {
            if (event.key === "Tab") { event.preventDefault(); insert(suggestions[activeSuggestion].value); return; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSuggestionIndex((activeSuggestion + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); return; }
          }
          if (event.key === "ArrowUp") { event.preventDefault(); const index = historyIndex < 0 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1); setHistoryIndex(index); setCommand(commandHistory[index] || ""); }
          if (event.key === "ArrowDown") { event.preventDefault(); const index = historyIndex < 0 ? -1 : historyIndex + 1; if (index >= commandHistory.length) { setHistoryIndex(-1); setCommand(""); } else { setHistoryIndex(index); setCommand(commandHistory[index] || ""); } }
        }} /><button aria-label="Ejecutar comando Git" disabled={!command.trim()}><ArrowRight size={17} /><span>Ejecutar</span></button></form>
      </section>
      <footer className="git-footer"><span>Estado de práctica local</span><button onClick={() => { try { localStorage.setItem(STORAGE, JSON.stringify(session)); setStorageError("Copia local actualizada."); } catch { setStorageError("No se pudo guardar. Descargá tu práctica para conservarla."); } }}>Guardar práctica</button>{storageError && <span role="status">{storageError}</span>}</footer>
    </div>
  </main>;
}
