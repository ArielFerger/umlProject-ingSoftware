import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { decodeImage, imageType, placeImage } from "../lib/images.ts";
import { readCanvas, writeCanvas } from "../lib/canvas.ts";
import { mergeSharedDiagram } from "../lib/shared-sync.ts";
import { storeAsset, readAsset } from "../lib/assets.ts";
import { createInvite, acceptInvite } from "../lib/board-access.ts";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = () => writeCanvas("classDiagram\nclass A", { positions: {}, routes: {}, lineWidth: 2, arrowScale: 1.4, labelSize: 14 });

test("only real pictures are accepted, by their bytes", () => {
  assert.equal(decodeImage(PNG).mime, "image/png");
  assert.equal(imageType(new TextEncoder().encode("GIF89a........")), "image/gif");
  assert.throws(() => decodeImage("data:image/png;base64," + btoa("<svg onload=alert(1)></svg>")), /no es una imagen válida/);
  assert.throws(() => decodeImage("data:text/html;base64,PGI+"), /PNG, JPEG, WebP o GIF/);
});

test("pictures are placed centred and no larger than 480 px", () => {
  assert.deepEqual(placeImage({ width: 1600, height: 800 }, { x: 0, y: 0 }), { x: -240, y: -120, width: 480, height: 240 });
  assert.deepEqual(placeImage({ width: 100, height: 50 }, { x: 10, y: 10 }), { x: -40, y: -15, width: 100, height: 50 });
});

test("images round-trip through canvas metadata and merge per image", () => {
  const asset = "11111111-1111-4111-8111-111111111111";
  const withImage = (source, id, image) => writeCanvas(source, { ...readCanvas(source), images: { ...readCanvas(source).images, [id]: image } });
  const one = withImage(base(), "i1", { asset, x: 0, y: 0, width: 100, height: 80, layer: "back", name: "boceto.png" });
  assert.equal(readCanvas(one).images.i1.layer, "back");
  const both = "classDiagram\nclass A\n%% uml-studio: " + JSON.stringify({ positions: {}, routes: {}, images: { bad: { asset, src: PNG, x: 0, y: 0, width: 10, height: 10 } } });
  assert.deepEqual(readCanvas(both).positions, {}, "an image with both a file and inline data is rejected");
  const diagram = { id: "d", name: "D", type: "class", project: "P", theme: "studio", notes: "", revision: 1, updatedAt: "", source: base() };
  const merged = mergeSharedDiagram(diagram, { ...diagram, source: one }, { ...diagram, revision: 2, source: withImage(base(), "i2", { src: PNG, x: 5, y: 5, width: 20, height: 20, layer: "front", name: "" }) });
  assert.deepEqual(Object.keys(readCanvas(merged.source).images).sort(), ["i1", "i2"]);
});

test("assets are stored for editors and served only through boards that use them", async t => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO diagrams VALUES (?,?,?,?,?,?,?,?,?,?)").run("board", "alice", "Tablero", "class", "P", "classDiagram", "studio", "", 1, "2026-10-18");
  sqlite.prepare("INSERT INTO diagrams VALUES (?,?,?,?,?,?,?,?,?,?)").run("other", "alice", "Otro", "class", "P", "classDiagram", "studio", "", 1, "2026-10-18");
  t.after(() => sqlite.close());
  const statement = sql => { let values = []; const stmt = { bind(...args) { values = args; return stmt; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; } }; return stmt; };
  const db = { prepare: statement };
  const invite = await createInvite(db, "alice", "board", "view");
  await acceptInvite(db, "bob", "Bob", invite.token);
  await assert.rejects(storeAsset(db, "bob", "board", PNG), e => e.status === 403, "viewers cannot upload");
  const id = await storeAsset(db, "alice", "board", PNG);
  await assert.rejects(readAsset(db, "alice", "board", id), e => e.status === 404, "not served until the board uses it");
  sqlite.prepare("UPDATE diagrams SET source = ? WHERE id = ?").run(`classDiagram\n%% uml-studio: {"images":{"x":{"asset":"${id}"}}}`, "board");
  const asset = await readAsset(db, "bob", "board", id);
  assert.equal(asset.mime, "image/png"); assert.equal(asset.bytes[0], 0x89);
  await assert.rejects(readAsset(db, "carol", "board", id), e => e.status === 404, "strangers get nothing");
  await assert.rejects(readAsset(db, "alice", "other", id), e => e.status === 404, "a board that does not use it cannot serve it");
});
