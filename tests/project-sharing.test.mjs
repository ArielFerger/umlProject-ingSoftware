import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { boardAccess, createInvite, acceptInvite, createProjectInvite, listProjectSharing, changeProjectMember, revokeProjectAccess, ACCESS_SQL, ROLE_SQL, EDIT_SQL, asUser } from "../lib/board-access.ts";
import { heartbeat, leave, PRESENCE_TTL } from "../lib/presence.ts";

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"));
  const insert = sqlite.prepare("INSERT INTO diagrams VALUES (?,?,?,?,?,?,?,?,?,?)");
  insert.run("a1", "alice", "Modelo", "der", "Base de datos", "flowchart LR", "studio", "", 1, "2026-10-18");
  insert.run("a2", "alice", "Clases", "class", "Base de datos", "classDiagram", "studio", "", 1, "2026-10-19");
  insert.run("other", "alice", "Privado", "class", "Personal", "classDiagram", "studio", "", 1, "2026-10-19");
  t.after(() => sqlite.close());
  const statement = sql => { let values = []; const stmt = { bind(...args) { values = args; return stmt; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; } }; return stmt; };
  const db = { prepare: statement, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
  return { db, sqlite };
}
const visible = (sqlite, user) => sqlite.prepare(`SELECT d.id, ${ROLE_SQL} FROM diagrams d WHERE ${ACCESS_SQL} ORDER BY d.id`).all(...asUser(user, 7));

test("a project invitation shares every diagram in that project, including later ones", async t => {
  const { db, sqlite } = database(t);
  await assert.rejects(createProjectInvite(db, "bob", "Bob", "Base de datos", "view"), e => e.status === 403);
  const invite = await createProjectInvite(db, "alice", "Alice", "Base de datos", "view");
  assert.notEqual(sqlite.prepare("SELECT token_hash FROM project_invites").get().token_hash, invite.token);
  const joined = await acceptInvite(db, "bob", "Bob", invite.token);
  assert.equal(joined.project, "Base de datos");
  assert.equal(joined.id, "a2", "opens the most recent diagram");
  assert.deepEqual(visible(sqlite, "bob").map(r => [r.id, r.access, r.owner_name]), [["a1", "view", "Alice"], ["a2", "view", "Alice"]]);
  sqlite.prepare("INSERT INTO diagrams VALUES (?,?,?,?,?,?,?,?,?,?)").run("a3", "alice", "Nuevo", "er", "Base de datos", "erDiagram", "studio", "", 1, "2026-10-20");
  assert.equal((await boardAccess(db, "bob", "a3")).access, "view");
  await assert.rejects(boardAccess(db, "bob", "other"), e => e.status === 404);
  await assert.rejects(boardAccess(db, "bob", "a1", "edit"), e => e.status === 403);
});

test("project roles combine with board roles and can be changed or revoked", async t => {
  const { db, sqlite } = database(t);
  const board = await createInvite(db, "alice", "a1", "edit");
  await acceptInvite(db, "bob", "Bob", board.token);
  const project = await createProjectInvite(db, "alice", "Alice", "Base de datos", "view");
  await acceptInvite(db, "bob", "Bob", project.token);
  assert.equal((await boardAccess(db, "bob", "a1")).access, "edit", "board editor stays editor");
  assert.equal((await boardAccess(db, "bob", "a2")).access, "view");
  await changeProjectMember(db, "alice", "Base de datos", "bob", "edit");
  assert.equal(Number(sqlite.prepare(`UPDATE diagrams SET revision=revision+1 WHERE id=? AND ${EDIT_SQL}`).run("a2", "bob", "bob", "bob").changes), 1);
  const sharing = await listProjectSharing(db, "alice", "Base de datos");
  assert.equal(sharing.members.length, 1); assert.equal(sharing.diagrams, 2);
  await revokeProjectAccess(db, "alice", "Base de datos", { invite: project.id });
  await assert.rejects(acceptInvite(db, "carol", "Carol", project.token), e => e.status === 404);
  await revokeProjectAccess(db, "alice", "Base de datos", { member: "bob" });
  await assert.rejects(boardAccess(db, "bob", "a2"), e => e.status === 404);
  assert.equal((await boardAccess(db, "bob", "a1")).access, "edit");
});

test("presence lists active tabs on a board and protects session ids", async t => {
  const { db } = database(t);
  const project = await createProjectInvite(db, "alice", "Alice", "Base de datos", "edit");
  await acceptInvite(db, "bob", "Bob", project.token);
  const aliceTab = "11111111-1111-4111-8111-111111111111", bobTab = "22222222-2222-4222-8222-222222222222";
  const now = 1_800_000_000_000;
  await heartbeat(db, "alice", "Alice", "a1", aliceTab, "Cliente", now, "#0f766e");
  const seen = await heartbeat(db, "bob", "Bob", "a1", bobTab, "", now + 1000);
  assert.deepEqual(seen.map(p => [p.displayName, p.selection, p.self]), [["Bob", "", true], ["Alice", "Cliente", false]]);
  assert.equal(seen.find(p => p.displayName === "Alice").color, "#0f766e");
  assert.equal((await heartbeat(db, "bob", "Bob", "a1", bobTab, "", now + 1500, "red;}")).find(p => p.self).color, "", "only hex colors are stored");
  await heartbeat(db, "bob", "Impostor", "a1", aliceTab, "Pedido", now + 2000);
  const after = await heartbeat(db, "alice", "Alice", "a1", aliceTab, "Cliente", now + 2500);
  assert.equal(after.find(p => p.sessionId === aliceTab).displayName, "Alice");
  assert.equal(after.length, 2);
  const later = await heartbeat(db, "alice", "Alice", "a1", aliceTab, "", now + 2500 + PRESENCE_TTL + 1);
  assert.deepEqual(later.map(p => p.displayName), ["Alice"], "stale tabs disappear");
  await leave(db, "alice", "a1", aliceTab);
  await assert.rejects(heartbeat(db, "carol", "Carol", "a1", aliceTab, "", now), e => e.status === 404);
});
