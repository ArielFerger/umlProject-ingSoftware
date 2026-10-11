import { test } from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, readWorkspace, workspaceOperation } from "../lib/browser-workspace.ts";

const query = id => new URLSearchParams({ id });
const input = { name: "Prueba", type: "class", project: "Vercel", theme: "studio", source: 'classDiagram\nclass Cliente\n%% uml-studio: {"positions":{"Cliente":{"x":30,"y":50}},"lineWidth":2,"arrowScale":1.4,"labelSize":14}\n', notes: "Conservar" };
test("browser workspace initializes once and empty workspaces stay empty", () => {
  assert.equal(initialWorkspace().documents.length, 3);
  assert.equal(readWorkspace({ version: 1, documents: [], history: {} }).documents.length, 0);
  assert.throws(() => readWorkspace({ version: 9 }), /Conservamos los datos/);
});
test("browser CRUD and revision history preserve canonical source and notes", () => {
  const created = workspaceOperation({ version: 1, documents: [], history: {} }, "POST", query(""), input);
  assert.equal(created.status, 201);
  const saved = workspaceOperation(created.state, "PUT", query(""), { ...created.result, name: "Actualizado" });
  assert.equal(saved.result.revision, 2);
  assert.equal(saved.result.source, input.source);
  assert.equal(saved.result.notes, input.notes);
  const history = workspaceOperation(saved.state, "GET", new URLSearchParams({ id: saved.result.id, history: "1" }));
  assert.equal(history.result[0].diagram.name, "Prueba");
  const removed = workspaceOperation(saved.state, "DELETE", query(""), { id: saved.result.id, revision: 2 });
  assert.deepEqual(removed.state, { version: 1, documents: [], history: {} });
});
test("stale writes and deletions reject with 409 without changing the saved workspace", () => {
  const state = initialWorkspace(), doc = state.documents[0];
  const saved = workspaceOperation(state, "PUT", query(""), { ...doc, notes: "Nueva revisión" });
  assert.throws(() => workspaceOperation(saved.state, "PUT", query(""), doc), error => error.status === 409);
  assert.throws(() => workspaceOperation(saved.state, "DELETE", query(""), { id: doc.id, revision: 1 }), error => error.status === 409);
  assert.equal(saved.state.documents[0].notes, "Nueva revisión");
  assert.equal(state.documents[0].notes, "");
});
test("history stays bounded and missing or invalid documents cannot be saved", () => {
  let state = initialWorkspace();
  for (let i = 0; i < 35; i++) state = workspaceOperation(state, "PUT", query(""), { ...state.documents[0], notes: String(i) }).state;
  assert.equal(state.history[state.documents[0].id].length, 30);
  assert.throws(() => workspaceOperation(state, "GET", query("missing")), error => error.status === 404);
  assert.throws(() => workspaceOperation(state, "POST", query(""), { ...input, source: "" }));
});
