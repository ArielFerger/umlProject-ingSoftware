import assert from "node:assert/strict";
import { test } from "node:test";
import { changes, commandSuggestions, editFile, emptyRepo, GIT_EXERCISES, graphCommits, headCommit, initialRepo, runGit, teamCommit, validRepo } from "../lib/git-simulator.ts";

function command(repo, text) { const result = runGit(repo, text); assert.equal(result.error, undefined, result.output); return result.repo; }

test("add snapshots the file and commit excludes later unstaged edits", () => {
  const original = initialRepo(); const before = structuredClone(original);
  let r = editFile(original, "src/editor.ts", "primera versión\n");
  r = command(r, "git add src/editor.ts");
  r = editFile(r, "src/editor.ts", "segunda versión\n");
  r = command(r, 'git commit -m "Una copia preparada"');
  assert.equal(headCommit(r).tree["src/editor.ts"], "primera versión\n");
  assert.equal(r.working["src/editor.ts"], "segunda versión\n");
  assert.equal(changes(r.index, r.working).length, 1);
  assert.equal(r.remote.main, before.remote.main);
  assert.deepEqual(original, before);
});

test("fetch updates tracking without moving HEAD or the worktree", () => {
  const r = teamCommit(initialRepo()); const fetched = command(r, "git fetch origin");
  assert.equal(fetched.tracking.main, r.remote.main);
  assert.equal(fetched.branches.main, r.branches.main);
  assert.deepEqual(fetched.working, r.working);
  const pulled = command(fetched, "git pull --ff-only origin main");
  assert.equal(pulled.branches.main, r.remote.main);
  assert.deepEqual(pulled.working, pulled.commits[r.remote.main].tree);
});

test("a push cannot overwrite a divergent remote and ff-only pull keeps its completed fetch", () => {
  let r = GIT_EXERCISES.find(e => e.id === "push").prepare();
  r = teamCommit(r);
  const pushed = runGit(r, "git push origin main");
  assert.equal(pushed.error, true); assert.deepEqual(pushed.repo, r);
  const pulled = runGit(r, "git pull --ff-only origin main");
  assert.equal(pulled.error, true);
  assert.equal(pulled.repo.tracking.main, r.remote.main);
  assert.equal(pulled.repo.branches.main, r.branches.main);
});

test("a three-way merge retains both independent edits and two parents", () => {
  const exercise = GIT_EXERCISES.find(e => e.id === "merge"); const r = exercise.prepare();
  const result = command(r, "git merge feature/notas"); const commit = headCommit(result);
  assert.deepEqual(commit.parents, [r.branches.main, r.branches["feature/notas"]]);
  assert.equal(commit.tree["docs/notas.md"], "# Notas del diagrama\n");
  assert.match(commit.tree["src/editor.ts"], /panel/);
  assert.equal(exercise.complete(result), true);
});

test("conflicts require resolution and staging before a merge commit and push", () => {
  const exercise = GIT_EXERCISES.find(e => e.id === "conflict");
  const pull = runGit(exercise.prepare(), "git pull origin main");
  assert.equal(pull.error, true);
  let r = pull.repo;
  assert.deepEqual(r.merge.conflicts, ["src/editor.ts"]);
  assert.equal(changes(r.index, r.working)[0].path, "src/editor.ts");
  assert.doesNotMatch(r.index["src/editor.ts"], /^<<<<<<</m);
  assert.equal(runGit(r, "git add .").error, true);
  assert.equal(runGit(r, 'git commit -m "Prematuro"').error, true);
  r = editFile(r, "src/editor.ts", 'export const vista = "lienzo";\n');
  r = command(r, "git add src/editor.ts"); r = command(r, 'git commit -m "Resolver el conflicto"');
  assert.equal(headCommit(r).parents.length, 2);
  assert.equal(exercise.complete(r), false);
  r = command(r, "git push origin main"); assert.equal(exercise.complete(r), true);
});

test("restore --staged preserves working changes and merge --abort restores the prior snapshot", () => {
  let r = GIT_EXERCISES[0].prepare(); const content = r.working["src/editor.ts"];
  r = command(r, "git add ."); r = command(r, "git restore --staged .");
  assert.equal(r.working["src/editor.ts"], content);
  assert.equal(changes(headCommit(r).tree, r.index).length, 0);
  const conflict = GIT_EXERCISES.find(e => e.id === "conflict").prepare();
  const merged = runGit(conflict, "git pull origin main").repo;
  const aborted = command(merged, "git merge --abort");
  assert.deepEqual(aborted.working, conflict.working);
  assert.equal(aborted.merge, undefined);
});

test("exercise completion requires repository state, not typing the expected command", () => {
  const exercise = GIT_EXERCISES[0]; let r = exercise.prepare();
  assert.equal(exercise.complete(r), false);
  assert.equal(runGit(r, 'git commit -m "Mejorar el editor"').error, true);
  r = command(r, "git add ."); r = command(r, "git commit -m 'Mensaje con espacios'");
  assert.equal(exercise.complete(r), true);
  const branch = GIT_EXERCISES.find(e => e.id === "branch");
  let b = command(branch.prepare(), "git switch -c feature/editor");
  b = command(b, "git add ."); b = command(b, 'git commit -m "Editor"');
  assert.equal(branch.complete(b), true);
});

test("unsupported shell commands, malformed quotes and broken persisted refs fail safely", () => {
  const r = initialRepo();
  for (const text of ["rm -rf /", "git push --force", 'git commit -m "abierta', "git add . && git push", "git switch constructor"]) {
    const result = runGit(r, text); assert.equal(result.error, true, text); assert.deepEqual(result.repo, r);
  }
  assert.equal(validRepo(JSON.parse(JSON.stringify(r))), true);
  assert.equal(validRepo({ ...r, branches: { main: "inexistente" } }), false);
  assert.equal(validRepo({ ...r, working: { "../escape": "contenido" } }), false);
});

test("an empty folder becomes a repository with a root commit and its first remote branch", () => {
  let r = emptyRepo("nuevo-proyecto");
  assert.equal(validRepo(r), true); assert.equal(graphCommits(r).length, 0);
  assert.equal(runGit(r, "git status").error, true);
  r = editFile(r, "README.md", "# Proyecto desde cero\n");
  assert.equal(runGit(r, "git add .").error, true);
  r = command(r, "git init -b trunk");
  assert.equal(r.head, "trunk"); assert.equal(headCommit(r), undefined);
  assert.match(runGit(r, "git status").output, /No commits yet/);
  r = command(r, "git add ."); r = command(r, "git restore --staged README.md");
  assert.equal(r.index["README.md"], undefined); assert.match(r.working["README.md"], /desde cero/);
  r = command(r, "git add README.md"); r = command(r, 'git commit -m "Primer commit"');
  assert.deepEqual(headCommit(r).parents, []); assert.equal(graphCommits(r).length, 1);
  assert.equal(runGit(r, "git push -u origin trunk").error, true);
  r = command(r, "git remote add origin https://github.com/ejemplo/nuevo-proyecto.git");
  assert.equal(runGit(r, "git remote add origin https://otro.test/repo.git").error, true);
  r = command(r, "git push -u origin trunk");
  assert.equal(r.remote.trunk, r.branches.trunk); assert.equal(validRepo(r), true);
  const advanced = teamCommit(r); assert.notEqual(advanced.remote.trunk, r.remote.trunk);
  r = command(advanced, "git pull --ff-only origin trunk");
  assert.equal(r.remote.trunk, r.branches.trunk); assert.equal(validRepo(r), true);
});

test("from-zero exercise and legacy practice copies remain valid without inventing commits", () => {
  const exercise = GIT_EXERCISES.find(e => e.id === "init"); let r = exercise.prepare();
  assert.equal(exercise.complete(r), false);
  for (const step of exercise.hints) r = command(r, step);
  assert.equal(exercise.complete(r), true); assert.equal(Object.keys(r.commits).length, 1);
  const legacy = initialRepo(); delete legacy.name; delete legacy.initialized; delete legacy.remoteUrl;
  assert.equal(validRepo(legacy), true); assert.match(runGit(legacy, "git remote -v").output, /https:/);
  assert.equal(validRepo({ ...emptyRepo(), commits: initialRepo().commits }), false);
});

test("autocomplete uses actual file and branch names and never mutates or runs commands", () => {
  const r = GIT_EXERCISES.find(e => e.id === "merge").prepare(); const before = structuredClone(r);
  assert.ok(commandSuggestions(r, "git sta").some(s => s.value === "git status"));
  assert.ok(commandSuggestions(r, "git add s").some(s => s.value === "git add src/editor.ts"));
  assert.ok(commandSuggestions(r, "git merge f").some(s => s.value === "git merge feature/notas"));
  assert.deepEqual(commandSuggestions(r, 'git commit -m "mi mensaje'), []);
  assert.deepEqual(commandSuggestions(r, "git push --force"), []);
  assert.deepEqual(commandSuggestions(r, ""), []); assert.deepEqual(r, before);
});
