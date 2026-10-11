// An in-memory teaching repository. No shell, filesystem or network execution.
export type FileTree = Record<string, string>;
export type GitCommit = { id: string; parents: string[]; message: string; tree: FileTree; author: "Vos" | "Equipo"; order: number };
export type GitRepo = {
  name?: string;
  initialized?: boolean;
  remoteUrl?: string;
  commits: Record<string, GitCommit>;
  branches: Record<string, string>;
  remote: Record<string, string>;
  tracking: Record<string, string>;
  head: string;
  working: FileTree;
  index: FileTree;
  next: number;
  merge?: { other: string; original: FileTree; conflicts: string[] };
};
export type CommandResult = { repo: GitRepo; output: string; effect: string; error?: boolean };
export type FileChange = { path: string; kind: "added" | "modified" | "deleted" };

export function changes(before: FileTree, after: FileTree): FileChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(path => before[path] !== after[path]).map(path => ({ path, kind: !(path in before) ? "added" : !(path in after) ? "deleted" : "modified" }));
}
export function headCommit(repo: GitRepo) { return repo.commits[repo.branches[repo.head]]; }
export function headTree(repo: GitRepo): FileTree { return headCommit(repo)?.tree || {}; }
const EXAMPLE_REMOTE = "https://github.com/ejemplo/umlProject-ingSoftware.git";
export function remoteUrl(repo: GitRepo) { return repo.initialized === undefined ? EXAMPLE_REMOTE : repo.remoteUrl; }
export function emptyRepo(name = "mi-proyecto"): GitRepo {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(name)) throw new Error("Usá entre 1 y 60 letras, números, puntos, guiones o guiones bajos para el nombre.");
  return { name, initialized: false, commits: {}, branches: {}, remote: {}, tracking: {}, head: "main", working: {}, index: {}, next: 1 };
}
export function reachable(repo: GitRepo, tips: string[]): Set<string> {
  const seen = new Set<string>(); const queue = [...tips];
  while (queue.length) { const id = queue.pop()!; if (!seen.has(id) && repo.commits[id]) { seen.add(id); queue.push(...repo.commits[id].parents); } }
  return seen;
}
export function graphCommits(repo: GitRepo, remote = false) {
  const refs = remote ? Object.values(repo.remote) : [...Object.values(repo.branches), ...Object.values(repo.tracking)];
  const ids = reachable(repo, refs);
  return Object.values(repo.commits).filter(c => ids.has(c.id)).sort((a, b) => b.order - a.order);
}
export function divergence(repo: GitRepo, local = repo.branches[repo.head], remote = repo.tracking[repo.head]) {
  const a = reachable(repo, [local]); const b = reachable(repo, [remote]);
  return { ahead: [...a].filter(id => !b.has(id)).length, behind: [...b].filter(id => !a.has(id)).length };
}
function clean(repo: GitRepo) { return !changes(headTree(repo), repo.index).length && !changes(repo.index, repo.working).length; }
function createCommit(repo: GitRepo, message: string, tree: FileTree, parents: string[], author: GitCommit["author"] = "Vos") {
  const id = (0x4ab0100 + repo.next++).toString(16);
  repo.commits[id] = { id, parents, message, tree: { ...tree }, author, order: repo.next };
  return id;
}
export function initialRepo(): GitRepo {
  const repo: GitRepo = { name: "umlProject-ingSoftware", initialized: true, remoteUrl: EXAMPLE_REMOTE, commits: {}, branches: {}, remote: {}, tracking: {}, head: "main", working: {}, index: {}, next: 1 };
  const first = createCommit(repo, "Iniciar proyecto", { "README.md": "# UML Studio\nEditor de diagramas UML.\n" }, [], "Equipo");
  const second = createCommit(repo, "Agregar editor UML", { ...repo.commits[first].tree, "src/editor.ts": 'export const vista = "lienzo";\n' }, [first], "Equipo");
  const third = createCommit(repo, "Documentar relaciones", { ...repo.commits[second].tree, "docs/uml.md": "# Relaciones UML\nAsociación, herencia y composición.\n" }, [second], "Equipo");
  repo.branches.main = repo.remote.main = repo.tracking.main = third;
  repo.working = { ...repo.commits[third].tree }; repo.index = { ...repo.working };
  return repo;
}
export function editFile(repo: GitRepo, path: string, content: string): GitRepo {
  if (!validPath(path) || content.length > 100_000) throw new Error("Usá un nombre de archivo válido y menos de 100 KB de contenido.");
  return { ...repo, working: { ...repo.working, [path]: content } };
}
export function teamCommit(repo: GitRepo, conflict = false): GitRepo {
  const result = structuredClone(repo);
  const branch = result.remote.main ? "main" : Object.keys(result.remote)[0];
  const tip = result.remote[branch];
  if (!remoteUrl(result) || !tip) throw new Error("Primero configurá origin y enviá un commit con git push.");
  const path = conflict ? "src/editor.ts" : "docs/uml.md";
  const tree = { ...result.commits[tip].tree, [path]: conflict ? 'export const vista = "codigo";\n' : (result.commits[tip].tree[path] || "# Documentación\n") + `\nCambio del equipo ${result.next}: ejemplos nuevos.\n` };
  result.remote[branch] = createCommit(result, conflict ? "Actualizar editor del equipo" : "Actualizar documentación del equipo", tree, [tip], "Equipo");
  return result;
}
function validBranch(name: string) { return /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,59}$/.test(name) && !name.includes("//") && !name.endsWith("/") && !["__proto__", "constructor", "prototype"].includes(name); }
function validPath(path: string) { return !!path && path.length < 120 && !path.startsWith("/") && !path.split("/").includes("..") && !/[\s<>\\\x00]/.test(path) && !["__proto__", "constructor", "prototype"].includes(path); }
function tokens(input: string): string[] {
  const result: string[] = []; let word = ""; let quote = ""; let started = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "\\" && quote !== "'" && i + 1 < input.length) { word += input[++i]; started = true; }
    else if (quote) { if (char === quote) quote = ""; else word += char; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) { result.push(word); word = ""; started = false; } }
    else { word += char; started = true; }
  }
  if (quote) throw new Error("Falta cerrar una comilla en el comando.");
  if (started) result.push(word);
  return result;
}
function reference(repo: GitRepo, name: string) {
  if (name === "HEAD") return repo.branches[repo.head];
  return name.startsWith("origin/") ? repo.tracking[name.slice(7)] : repo.branches[name];
}
function mergeInto(repo: GitRepo, target: string, label: string, noFF = false): { output: string; effect: string; error?: boolean } {
  if (repo.merge) throw new Error("Terminá el merge pendiente o usá git merge --abort.");
  if (!clean(repo)) throw new Error("En este simulador, confirmá o restaurá tus cambios antes del merge.");
  const current = repo.branches[repo.head];
  if (reachable(repo, [current]).has(target)) return { output: "Already up to date.", effect: "La rama ya contiene esos commits." };
  if (!current || (reachable(repo, [target]).has(current) && !noFF)) {
    repo.branches[repo.head] = target; repo.index = { ...repo.commits[target].tree }; repo.working = { ...repo.index };
    return { output: `Updating ${current || "(sin commits)"}..${target}\nFast-forward`, effect: "La rama avanzó hasta el commit destino. No fue necesario crear un commit de merge." };
  }
  const ours = repo.commits[current].tree; const theirs = repo.commits[target].tree;
  const ancestors = reachable(repo, [current]);
  const baseId = [...reachable(repo, [target])].filter(id => ancestors.has(id)).sort((a, b) => repo.commits[b].order - repo.commits[a].order)[0];
  const base = repo.commits[baseId]?.tree || {}; const merged: FileTree = {}; const conflicts: string[] = [];
  for (const path of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    let value = ours[path];
    if (ours[path] === base[path]) value = theirs[path];
    else if (theirs[path] !== base[path] && ours[path] !== theirs[path]) {
      conflicts.push(path); value = `<<<<<<< HEAD\n${ours[path] || ""}=======\n${theirs[path] || ""}>>>>>>> ${label}\n`;
    }
    if (value !== undefined) merged[path] = value;
  }
  if (conflicts.length) {
    repo.merge = { other: target, original: { ...ours }, conflicts };
    repo.working = merged; repo.index = { ...merged };
    // Unmerged files remain outside the prepared snapshot until the learner
    // resolves them and runs add; markers belong only to the working file.
    for (const path of conflicts) { if (path in ours) repo.index[path] = ours[path]; else delete repo.index[path]; }
    return { output: conflicts.map(path => `CONFLICT (content): Merge conflict in ${path}`).join("\n") + "\nAutomatic merge failed; fix conflicts and then commit the result.", effect: "Ambas ramas editaron el mismo archivo. Elegí el contenido final, preparalo con git add y creá el commit de merge.", error: true };
  }
  const id = createCommit(repo, `Merge branch '${label}'`, merged, [current, target]);
  repo.branches[repo.head] = id; repo.working = { ...merged }; repo.index = { ...merged };
  return { output: `Merge made by the simulator's three-way strategy.\n[${repo.head} ${id}] Merge branch '${label}'`, effect: "El nuevo commit tiene dos padres y reúne ambos historiales. El simulador compara archivos completos." };
}
export const COMMAND_HELP = `Comandos de práctica:
git init [-b rama] · git remote add origin <URL>
git status · git diff [--staged] · git log [--oneline --graph --all]
git add <archivo> | . · git restore [--staged] <archivo> | .
git commit -m "mensaje" · git branch [nombre]
git switch [-c] <rama> · git checkout [-b] <rama>
git merge [--no-ff] <rama> · git merge --abort
git fetch [origin] · git pull [--ff-only] [origin rama]
git push [-u] [origin rama] · git remote -v
help · clear
Sólo se ejecuta este subconjunto de Git, dentro del simulador.`;

export function runGit(repo: GitRepo, input: string): CommandResult {
  const next = structuredClone(repo);
  let fetched = false;
  const ok = (output: string, effect: string, error?: boolean): CommandResult => ({ repo: next, output, effect, ...(error ? { error } : {}) });
  try {
    const args = tokens(input.trim());
    if (args[0] === "help" || (args[0] === "git" && args[1] === "help")) return ok(COMMAND_HELP, "Podés escribir comandos o insertar un ejemplo desde la guía.");
    if (args[0] !== "git") throw new Error("Escribí un comando git. Usá help para ver los comandos disponibles.");
    const command = args[1]; const rest = args.slice(2);
    if (command === "init") {
      if (rest.length && !(rest.length === 2 && rest[0] === "-b" && validBranch(rest[1]))) throw new Error("Usá git init o git init -b <rama>.");
      if (next.initialized !== false) return ok("Reinitialized existing Git repository (simulado).", "El repositorio ya estaba inicializado. Sus archivos y commits se conservaron.");
      next.initialized = true; next.head = rest[1] || "main";
      return ok(`Initialized empty Git repository in ${next.name || "mi-proyecto"}/.git/ (simulado)`, "Git ya lleva el índice y las referencias. HEAD apunta a una rama sin commits; creá un archivo, preparalo y hacé tu primer commit.");
    }
    if (next.initialized === false) throw new Error("Todavía no hay un repositorio Git. Inicializalo con git init.");
    const tip = headCommit(next);
    const tree = headTree(next);
    if (command === "status" && rest.every(a => ["-s", "--short"].includes(a))) {
      const staged = changes(tree, next.index); const unstaged = changes(next.index, next.working);
      const status = [...staged.map(c => `  ${c.kind}: ${c.path}`), ...unstaged.map(c => `  ${c.kind}: ${c.path}`)];
      const d = divergence(next);
      return ok(`On branch ${next.head}\n${!tip ? "No commits yet.\n" : ""}${next.tracking[next.head] ? `Compared with origin/${next.head}: ${d.ahead} ahead, ${d.behind} behind.\n` : "No upstream branch.\n"}${next.merge ? `Unmerged paths: ${next.merge.conflicts.join(", ") || "resueltos; falta commit"}\n` : ""}${staged.length ? "Changes to be committed:\n" + staged.map(c => `  ${c.kind}: ${c.path}`).join("\n") + "\n" : ""}${unstaged.length ? "Changes not staged for commit:\n" + unstaged.map(c => `  ${c.kind}: ${c.path}`).join("\n") : ""}${status.length ? "" : "nothing to commit, working tree clean"}`, "Status consulta el estado. No modifica archivos ni commits.");
    }
    if (command === "add" || command === "restore") {
      const unstaging = command === "restore" && rest.includes("--staged");
      const paths = rest.filter(a => a !== "--staged");
      if (command === "add" && rest.some(a => a.startsWith("-") && a !== "-A")) throw new Error("Usá git add <archivo> o git add .");
      const all = paths.includes(".") || (command === "add" && paths.includes("-A"));
      const source = command === "add" ? next.working : unstaging ? tree : next.index;
      const destination = command === "add" || unstaging ? next.index : next.working;
      if (paths.filter(p => p !== "." && p !== "-A").some(p => !validPath(p) || (!(p in source) && !(p in destination)))) throw new Error("Indicá archivos existentes. Ejecutá un solo comando por vez.");
      const selected = all ? [...new Set([...Object.keys(source), ...Object.keys(destination)])] : paths;
      if (!selected.length || selected.some(p => !validPath(p) || (!(p in source) && !(p in destination)))) throw new Error("Indicá un archivo existente o . para todos.");
      if (command === "add" && next.merge && selected.some(p => next.merge!.conflicts.includes(p) && /^(<<<<<<<|=======|>>>>>>>)/m.test(source[p] || ""))) throw new Error("Primero resolvé los marcadores de conflicto en el editor de archivos.");
      for (const path of selected) { if (path in source) destination[path] = source[path]; else delete destination[path]; }
      if (command === "add" && next.merge) next.merge.conflicts = next.merge.conflicts.filter(p => !selected.includes(p));
      return ok("", command === "add" ? "Se copió el contenido actual al índice. Si editás otra vez el archivo, esa edición todavía no estará preparada." : unstaging ? "Se quitó la preparación. Tus archivos de trabajo se conservaron." : "Se restauró el archivo de trabajo desde el índice.");
    }
    if (command === "commit") {
      if (rest.length !== 2 || rest[0] !== "-m" || !rest[1].trim()) throw new Error('Usá git commit -m "Un mensaje que explique el cambio".');
      if (next.merge?.conflicts.length) throw new Error("Hay conflictos sin resolver. Editá los archivos y preparalos con git add.");
      if (!changes(tree, next.index).length && !next.merge) throw new Error("No hay cambios preparados. Primero usá git add.");
      const id = createCommit(next, rest[1].slice(0, 160), next.index, next.merge ? [tip.id, next.merge.other] : tip ? [tip.id] : []);
      next.branches[next.head] = id; delete next.merge;
      return ok(`[${next.head} ${id}] ${rest[1]}`, "El commit guarda el índice y mueve la rama actual. El remoto sigue igual hasta que hagas push.");
    }
    if (command === "branch") {
      if (!rest.length) return ok(Object.keys(next.branches).map(b => `${b === next.head ? "*" : " "} ${b}`).join("\n"), "La estrella indica la rama a la que apunta HEAD.");
      if (rest.length !== 1 || !validBranch(rest[0])) throw new Error("Usá git branch <nombre> con un nombre de rama válido.");
      if (!tip) throw new Error("Creá tu primer commit antes de agregar otra referencia de rama.");
      if (next.branches[rest[0]]) throw new Error("Esa rama ya existe.");
      next.branches[rest[0]] = tip.id;
      return ok("", "Se creó una referencia al commit actual. HEAD no cambió de rama.");
    }
    if (command === "switch" || command === "checkout") {
      const create = rest[0] === "-c" || (command === "checkout" && rest[0] === "-b"); const name = rest[create ? 1 : 0];
      if (rest.length !== (create ? 2 : 1) || !validBranch(name || "")) throw new Error("Usá git switch <rama> o git switch -c <nueva-rama>.");
      if (next.merge) throw new Error("Terminá o abortá el merge antes de cambiar de rama.");
      if (create) { if (next.branches[name]) throw new Error("La rama ya existe."); if (tip) next.branches[name] = tip.id; }
      else { if (!next.branches[name]) throw new Error("Esa rama local no existe. Podés crearla con git switch -c."); if (!clean(next)) throw new Error("En este simulador, confirmá o restaurá los cambios antes de cambiar a otra rama."); next.index = { ...next.commits[next.branches[name]].tree }; next.working = { ...next.index }; }
      next.head = name;
      return ok(`Switched to ${create ? "a new " : ""}branch '${name}'`, create ? "La nueva rama y HEAD apuntan al mismo commit. Conservaste los archivos de trabajo." : "HEAD cambió de rama; los archivos corresponden a su commit actual.");
    }
    if (command === "merge") {
      if (rest.length === 1 && rest[0] === "--abort") { if (!next.merge) throw new Error("No hay un merge pendiente."); next.working = { ...next.merge.original }; next.index = { ...next.merge.original }; delete next.merge; return ok("", "Se volvió al estado anterior al merge. Las resoluciones de esta práctica se descartaron."); }
      const noFF = rest[0] === "--no-ff"; const label = rest[noFF ? 1 : 0]; const target = reference(next, label || "");
      if (rest.length !== (noFF ? 2 : 1) || !target) throw new Error("Indicá una rama local o una referencia origin/<rama> conocida.");
      const result = mergeInto(next, target, label, noFF); return ok(result.output, result.effect, result.error);
    }
    if (command === "fetch" || command === "pull") {
      if (!remoteUrl(next)) throw new Error("Configurá el remoto con git remote add origin <URL>.");
      const ffOnly = rest.includes("--ff-only"); const positional = rest.filter(a => a !== "--ff-only");
      if (positional.length > (command === "fetch" ? 1 : 2) || (positional[0] && positional[0] !== "origin") || (command === "fetch" && ffOnly)) throw new Error("Usá git fetch origin o git pull [--ff-only] [origin rama].");
      next.tracking = { ...next.remote };
      fetched = true;
      if (command === "fetch") return ok("From origin (simulado)\nRemote-tracking branches updated.", "Fetch actualizó origin/*, la copia local de las referencias remotas. HEAD y los archivos no se movieron.");
      const branch = positional[1] || next.head; const target = next.tracking[branch];
      if (!target) throw new Error("Esa rama no existe en origin.");
      if (ffOnly && tip && !reachable(next, [target]).has(tip.id) && !reachable(next, [tip.id]).has(target)) return { repo: next, output: "fatal: Not possible to fast-forward, aborting.", effect: "Fetch sí se completó. Las ramas divergieron; integrá explícitamente origin/" + branch + " con merge.", error: true };
      const result = mergeInto(next, target, `origin/${branch}`); return ok(result.output, "Pull obtuvo las referencias remotas e intentó integrar la rama. " + result.effect, result.error);
    }
    if (command === "push") {
      if (!remoteUrl(next)) throw new Error("Configurá el remoto con git remote add origin <URL>.");
      const positional = rest.filter(a => a !== "-u" && a !== "--set-upstream");
      if (positional.length > 2 || (positional[0] && positional[0] !== "origin")) throw new Error("Usá git push [-u] [origin rama]. Push forzado no está disponible en esta práctica.");
      const branch = positional[1] || next.head; const local = next.branches[branch]; const remote = next.remote[branch];
      if (!local) throw new Error("La rama local no existe.");
      if (remote && !reachable(next, [local]).has(remote)) throw new Error("Push rechazado (non-fast-forward). El remoto tiene commits que faltan aquí; usá fetch y merge, o pull.");
      next.remote[branch] = local; next.tracking[branch] = local;
      return ok(`To origin (simulado)\n${remote === local ? "Everything up-to-date" : `${remote || "new branch"}..${local}  ${branch} -> ${branch}`}`, "El remoto recibió los commits de esa rama. Push no confirma cambios del área de trabajo.");
    }
    if (command === "log" && rest.every(a => ["--oneline", "--graph", "--all"].includes(a))) {
      if (!tip && !rest.includes("--all")) throw new Error("La rama actual todavía no tiene commits.");
      const ids = rest.includes("--all") ? reachable(next, [...Object.values(next.branches), ...Object.values(next.tracking)]) : reachable(next, [tip.id]);
      return ok(Object.values(next.commits).filter(c => ids.has(c.id)).sort((a, b) => b.order - a.order).map(c => `${rest.includes("--graph") ? "* " : ""}${c.id} ${c.message}${c.id === tip?.id ? ` (HEAD -> ${next.head})` : ""}`).join("\n"), "Log muestra commits alcanzables desde tus referencias locales. El grafo superior conserva las bifurcaciones; la consola resume el orden.");
    }
    if (command === "diff" && (rest.length === 0 || (rest.length === 1 && ["--staged", "--cached"].includes(rest[0])))) {
      const before = rest.length ? tree : next.index; const after = rest.length ? next.index : next.working;
      return ok(changes(before, after).map(c => `diff -- ${c.path}\n${(before[c.path] || "").split("\n").map(l => "- " + l).join("\n")}\n${(after[c.path] || "").split("\n").map(l => "+ " + l).join("\n")}`).join("\n") || "No differences.", rest.length ? "Comparás el índice con HEAD: lo que incluirá el próximo commit." : "Comparás el área de trabajo con el índice: lo que falta preparar. Este visor muestra el archivo completo.");
    }
    if (command === "remote" && rest.length === 1 && rest[0] === "-v") return ok(remoteUrl(next) ? `origin  ${remoteUrl(next)} (fetch)\norigin  ${remoteUrl(next)} (push)` : "", "La URL identifica el remoto simulado. No se hace ninguna conexión de red.");
    if (command === "remote" && rest.length === 3 && rest[0] === "add" && rest[1] === "origin") {
      if (remoteUrl(next)) throw new Error("El remoto origin ya existe.");
      if (!/^(https?:\/\/|ssh:\/\/|git@)[^\s<>]{1,280}$/.test(rest[2])) throw new Error("Usá una URL HTTP, HTTPS o SSH. El remoto será simulado.");
      next.remoteUrl = rest[2];
      return ok("", "Origin quedó configurado como un remoto vacío y simulado. Tu primer push publicará su primera rama.");
    }
    throw new Error("Comando u opción no disponible. Usá help para ver el subconjunto implementado.");
  } catch (error) { return { repo: fetched ? next : repo, output: `error: ${(error as Error).message}`, effect: fetched ? "Fetch actualizó origin/*. La integración no se aplicó; revisá el estado y probá de nuevo." : "El comando no se aplicó. Revisá el estado y probá de nuevo.", error: true }; }
}

export type GitExercise = { id: string; title: string; goal: string; concept: string; hints: string[]; prepare: () => GitRepo; complete: (repo: GitRepo) => boolean };
function localCommit(repo: GitRepo, path: string, content: string, message: string) {
  let result = editFile(repo, path, content); result = runGit(result, "git add .").repo; return runGit(result, `git commit -m "${message}"`).repo;
}
export const GIT_EXERCISES: GitExercise[] = [
  { id: "commit", title: "Tu primer commit", goal: "Prepará el cambio en src/editor.ts y confirmalo en main. El remoto debe seguir sin ese commit.", concept: "Trabajo → índice → commit", hints: ["git status", "git add src/editor.ts", 'git commit -m "Mejorar el editor"'], prepare: () => editFile(initialRepo(), "src/editor.ts", 'export const vista = "lienzo";\nexport const propiedades = true;\n'), complete: r => r.head === "main" && r.branches.main !== r.remote.main && headCommit(r).tree["src/editor.ts"]?.includes("propiedades") && clean(r) },
  { id: "branch", title: "Trabajá en una rama", goal: "Creá feature/editor, llevá el cambio preparado a un commit allí y conservá main en su lugar.", concept: "Una rama es una referencia", hints: ["git switch -c feature/editor", "git add .", 'git commit -m "Agregar propiedades"'], prepare: () => GIT_EXERCISES[0].prepare(), complete: r => r.head === "feature/editor" && r.branches["feature/editor"] !== r.branches.main && r.branches.main === r.remote.main && clean(r) },
  { id: "merge", title: "Integrá dos historiales", goal: "Desde main, integrá feature/notas. Las ramas cambiaron archivos distintos; el resultado debe tener dos padres.", concept: "Merge de tres vías", hints: ["git log --oneline --graph --all", "git merge feature/notas"], prepare: () => { let r = runGit(initialRepo(), "git switch -c feature/notas").repo; r = localCommit(r, "docs/notas.md", "# Notas del diagrama\n", "Agregar notas"); r = runGit(r, "git switch main").repo; return localCommit(r, "src/editor.ts", 'export const vista = "lienzo";\nexport const panel = true;\n', "Agregar panel"); }, complete: r => r.head === "main" && headCommit(r).parents.length === 2 && !!headCommit(r).tree["docs/notas.md"] },
  { id: "push", title: "Publicá tus commits", goal: "Hay un commit local nuevo. Enviá main al remoto para que ambos apunten al mismo commit.", concept: "Push mueve la rama remota", hints: ["git status", "git push origin main"], prepare: () => localCommit(initialRepo(), "docs/notas.md", "# Decisiones de diseño\n", "Documentar decisiones"), complete: r => r.branches.main === r.remote.main && !!r.commits[r.remote.main].tree["docs/notas.md"] },
  { id: "pull", title: "Traé el cambio del equipo", goal: "El equipo avanzó en el remoto. Hacé fetch, observá origin/main y después integrá su commit en main.", concept: "Fetch observa; pull integra", hints: ["git fetch origin", "git merge origin/main", "También podés usar git pull origin main."], prepare: () => teamCommit(initialRepo()), complete: r => r.branches.main === r.remote.main && r.tracking.main === r.remote.main && headCommit(r).tree["docs/uml.md"]?.includes("Cambio del equipo") },
  { id: "conflict", title: "Resolvé un conflicto", goal: "Vos y el equipo editaron src/editor.ts. Integrá, resolvé el archivo sin marcadores, preparalo, creá el merge y enviá main.", concept: "Un conflicto necesita una decisión", hints: ["git pull origin main", "Abrí el archivo y elegí el contenido final; guardá la edición.", "git add src/editor.ts", 'git commit -m "Resolver conflicto"', "git push origin main"], prepare: () => teamCommit(localCommit(initialRepo(), "src/editor.ts", 'export const vista = "dividir";\n', "Vista dividida"), true), complete: r => !r.merge && r.branches.main === r.remote.main && headCommit(r).parents.length === 2 && !/^(<<<<<<<|=======|>>>>>>>)/m.test(headCommit(r).tree["src/editor.ts"] || "") },
  { id: "init", title: "Un repositorio desde cero", goal: "La carpeta tiene un README, pero todavía no es un repositorio. Inicializá Git, hacé el primer commit, configurá origin y enviá main.", concept: "De git init al primer push", hints: ["git init", "git add README.md", 'git commit -m "Iniciar proyecto"', "git remote add origin https://github.com/ejemplo/mi-proyecto.git", "git push -u origin main"], prepare: () => editFile(emptyRepo(), "README.md", "# Mi proyecto\n"), complete: r => r.initialized === true && !!r.remoteUrl && !!r.branches.main && r.branches.main === r.remote.main && !!headCommit(r)?.tree["README.md"] && clean(r) },
];

export function commandSuggestions(repo: GitRepo, input: string): { value: string; description: string }[] {
  if (!input.trim()) return [];
  const paths = [...new Set([...Object.keys(repo.working), ...Object.keys(repo.index), ...Object.keys(headTree(repo))])].sort();
  const fileMatch = input.match(/^(git (?:add|restore)(?: --staged)? )([^ ]*)$/);
  if (fileMatch) return paths.filter(path => path.startsWith(fileMatch[2])).slice(0, 6).map(path => ({ value: fileMatch[1] + path, description: "Archivo de esta práctica" }));
  const branchMatch = input.match(/^(git (?:switch|checkout|merge)(?: --no-ff)? )([^ ]*)$/);
  if (branchMatch) return [...Object.keys(repo.branches), ...(branchMatch[1].includes("merge") ? Object.keys(repo.tracking).map(name => "origin/" + name) : [])].filter(name => name.startsWith(branchMatch[2])).slice(0, 6).map(name => ({ value: branchMatch[1] + name, description: "Referencia conocida" }));
  const remoteMatch = input.match(/^(git (?:push|pull)(?: -u| --ff-only)? origin )([^ ]*)$/);
  if (remoteMatch) return [...new Set([...Object.keys(repo.branches), ...Object.keys(repo.remote)])].filter(name => name.startsWith(remoteMatch[2])).slice(0, 6).map(name => ({ value: remoteMatch[1] + name, description: "Rama de esta práctica" }));
  const options: [string, string][] = [
    ["git init", "Inicializar repositorio"], ["git init -b main", "Inicializar con la rama main"],
    ["git status", "Ver el estado de las cuatro zonas"], ["git add .", "Preparar todos los cambios"],
    ["git diff", "Comparar trabajo e índice"], ["git diff --staged", "Comparar índice y HEAD"],
    ['git commit -m "', "Escribí el mensaje y cerrá la comilla"], ["git log --oneline --graph --all", "Ver el historial"],
    ["git branch", "Listar ramas"], ["git switch -c ", "Escribí un nombre nuevo de rama"],
    ["git merge --abort", "Cancelar el merge pendiente"], ["git fetch origin", "Actualizar referencias remotas"],
    ["git pull origin " + repo.head, "Descargar e integrar"], ["git push -u origin " + repo.head, "Publicar la rama actual"],
    ["git restore --staged .", "Quitar preparación"], ["git remote -v", "Ver el remoto configurado"],
    ["git remote add origin https://github.com/ejemplo/" + (repo.name || "mi-proyecto") + ".git", "Configurar un remoto simulado"],
  ];
  return options.filter(([value]) => value.startsWith(input) && value !== input).slice(0, 6).map(([value, description]) => ({ value, description }));
}

export function validRepo(value: unknown): value is GitRepo {
  if (!value || typeof value !== "object") return false;
  const r = value as GitRepo;
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const tree = (v: unknown) => record(v) && Object.entries(v).every(([k, text]) => validPath(k) && typeof text === "string" && text.length <= 100_000);
  if (!record(r.commits) || !record(r.branches) || !record(r.remote) || !record(r.tracking) || !tree(r.working) || !tree(r.index) || !Number.isInteger(r.next) || r.next < 1 || Object.keys(r.commits).length > 500) return false;
  if (!Object.entries(r.commits).every(([id, c]) => record(c) && c.id === id && typeof c.message === "string" && Number.isFinite(c.order) && (c.author === "Vos" || c.author === "Equipo") && Array.isArray(c.parents) && c.parents.every(p => typeof p === "string" && !!r.commits[p]) && tree(c.tree))) return false;
  if (![r.branches, r.remote, r.tracking].every(refs => Object.entries(refs).every(([name, id]) => validBranch(name) && typeof id === "string" && !!r.commits[id]))) return false;
  if (typeof r.head !== "string" || !validBranch(r.head) || (Object.keys(r.branches).length > 0 && !r.branches[r.head])) return false;
  if (r.name !== undefined && (typeof r.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(r.name))) return false;
  if (r.initialized !== undefined && typeof r.initialized !== "boolean") return false;
  if (r.remoteUrl !== undefined && (typeof r.remoteUrl !== "string" || !/^(https?:\/\/|ssh:\/\/|git@)[^\s<>]{1,280}$/.test(r.remoteUrl))) return false;
  if (r.initialized === undefined && (!r.branches[r.head] || !r.remote.main)) return false;
  if (r.initialized === false && [r.commits, r.branches, r.remote, r.tracking, r.index].some(record => Object.keys(record).length > 0)) return false;
  if (r.merge && (!r.commits[r.merge.other] || !tree(r.merge.original) || !Array.isArray(r.merge.conflicts) || !r.merge.conflicts.every(validPath))) return false;
  return true;
}
