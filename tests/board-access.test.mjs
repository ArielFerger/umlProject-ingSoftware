import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { boardAccess, createInvite, acceptInvite, listSharing, changeMember, revokeAccess, EDIT_SQL } from "../lib/board-access.ts";
function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
  sqlite.prepare("INSERT INTO diagrams VALUES (?,?,?,?,?,?,?,?,?,?)").run("board","alice","Tablero","class","Proyecto","classDiagram\nclass A","studio","",1,"2026-10-18");
  t.after(()=>sqlite.close());
  const db = { prepare(sql) { let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};return stmt;} };
  return {db,sqlite};
}
test("invitations require the owner, store only a hash, and require membership to read",async t=>{
 const {db,sqlite}=database(t);
 await assert.rejects(boardAccess(db,"bob","board"),e=>e.status===404);
 await assert.rejects(createInvite(db,"bob","board","edit"),e=>e.status===404);
 const invite=await createInvite(db,"alice","board","view");
 assert.equal(invite.token.length,64);assert.notEqual(sqlite.prepare("SELECT token_hash FROM diagram_invites").get().token_hash,invite.token);
 await acceptInvite(db,"bob","Bob",invite.token);
 assert.equal((await boardAccess(db,"bob","board")).access,"view");
 await assert.rejects(boardAccess(db,"bob","board","edit"),e=>e.status===403);
 await assert.rejects(listSharing(db,"bob","board"),e=>e.status===403);
 assert.equal((await listSharing(db,"alice","board")).members.length,1);
});
test("editors can update but cannot own or delete; revocation applies immediately",async t=>{
 const {db,sqlite}=database(t);const invite=await createInvite(db,"alice","board","edit");
 await acceptInvite(db,"bob","Bob",invite.token);
 assert.equal((await boardAccess(db,"bob","board","edit")).access,"edit");
 await assert.rejects(boardAccess(db,"bob","board","owner"),e=>e.status===403);
 assert.equal(Number(sqlite.prepare(`UPDATE diagrams SET revision=revision+1 WHERE id=? AND ${EDIT_SQL}`).run("board","bob","bob","bob").changes),1);
 await changeMember(db,"alice","board","bob","view");
 assert.equal(Number(sqlite.prepare(`UPDATE diagrams SET revision=revision+1 WHERE id=? AND ${EDIT_SQL}`).run("board","bob","bob","bob").changes),0);
 await revokeAccess(db,"alice","board",{invite:invite.id});
 await assert.rejects(acceptInvite(db,"charlie","Charlie",invite.token),e=>e.status===404);
 await revokeAccess(db,"alice","board",{member:"bob"});
 await assert.rejects(boardAccess(db,"bob","board"),e=>e.status===404);
});
test("expired links are rejected, read links do not downgrade editors, owner never becomes a member",async t=>{
 const {db,sqlite}=database(t);const edit=await createInvite(db,"alice","board","edit"),view=await createInvite(db,"alice","board","view");
 await acceptInvite(db,"bob","Bob",edit.token);await acceptInvite(db,"bob","Bob",view.token);
 assert.equal((await boardAccess(db,"bob","board")).access,"edit");
 await acceptInvite(db,"alice","Alice",view.token);
 assert.equal((await listSharing(db,"alice","board")).members.length,1);
 sqlite.prepare("UPDATE diagram_invites SET expires_at='2000-01-01' WHERE id=?").run(view.id);
 await assert.rejects(acceptInvite(db,"charlie","Charlie",view.token),e=>e.status===404);
});
