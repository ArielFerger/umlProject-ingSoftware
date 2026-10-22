import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createOnlineGateway } from "../scripts/online-gateway.mjs";
import { decodeAvatar, defaultColor, initials } from "../scripts/online-profile.mjs";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function gateway(t) {
  const upstream = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ headers: req.headers })); });
  await new Promise(r => upstream.listen(0, "127.0.0.1", r));
  const probe = http.createServer(); await new Promise(r => probe.listen(0, "127.0.0.1", r)); const port = probe.address().port; await new Promise(r => probe.close(r));
  const origin = "http://127.0.0.1:" + port, server = createOnlineGateway({ upstreamPort: upstream.address().port, publicOrigin: origin, databasePath: ":memory:" });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  t.after(() => { server.closeAllConnections(); upstream.closeAllConnections(); server.close(); upstream.close(); });
  const call = (path, init = {}) => fetch(origin + path, { ...init, redirect: "manual", headers: { ...init.headers } });
  const signIn = async (path, fields) => (await call(path, { method: "POST", headers: { Origin: origin }, body: new URLSearchParams(fields) })).headers.get("set-cookie")?.split(";")[0];
  const send = (cookie, path, body) => call(path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { origin, call, signIn, send };
}

test("profiles update name, bio, color and photo, and the Worker receives the color", async t => {
  const { call, signIn, send } = await gateway(t);
  assert.equal((await call("/auth/profile")).status, 401);
  const cookie = await signIn("/auth/register", { username: "ana", password: "secure test password", display_name: "Ana Pérez" });
  const profile = await (await call("/auth/profile", { headers: { Cookie: cookie } })).json();
  assert.equal(profile.displayName, "Ana Pérez"); assert.equal(profile.color, defaultColor(profile.id)); assert.equal(profile.hasAvatar, false);
  const svg = await call("/auth/avatar/" + profile.id, { headers: { Cookie: cookie } });
  assert.match(svg.headers.get("content-type"), /svg/); assert.match(await svg.text(), />AP</);

  const updated = await (await send(cookie, "/auth/profile", { displayName: "Ana P. <b>", bio: "Estudiante de Ingeniería", color: "#0F766E", avatar: "data:image/png;base64," + PNG })).json();
  assert.deepEqual([updated.displayName, updated.bio, updated.color, updated.hasAvatar], ["Ana P. <b>", "Estudiante de Ingeniería", "#0f766e", true]);
  const photo = await call("/auth/avatar/" + profile.id, { headers: { Cookie: cookie } });
  assert.equal(photo.headers.get("content-type"), "image/png"); assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  const forwarded = await (await call("/api/diagrams", { headers: { Cookie: cookie, "x-uml-user-color": "#000000" } })).json();
  assert.equal(forwarded.headers["x-uml-user-color"], "#0f766e");
  assert.equal(decodeURIComponent(forwarded.headers["oai-authenticated-user-full-name"]), "Ana P. <b>");

  assert.equal((await send(cookie, "/auth/profile", { displayName: "Ana", avatar: "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64") })).status, 400);
  assert.equal((await send(cookie, "/auth/profile", { displayName: "", color: "red" })).status, 400);
  const removed = await (await send(cookie, "/auth/profile", { displayName: "Ana", bio: "", color: "", avatar: null })).json();
  assert.equal(removed.hasAvatar, false); assert.equal(removed.customColor, false);
  // Profile writes need the app's origin like every other change.
  assert.equal((await call("/auth/profile", { method: "POST", headers: { Cookie: cookie, Origin: "https://attacker.test" }, body: "{}" })).status, 403);
});

test("changing the password needs the current one and signs out other devices", async t => {
  const { call, signIn, send } = await gateway(t);
  const first = await signIn("/auth/register", { username: "beto", password: "secure test password", display_name: "Beto" });
  const second = await signIn("/auth/login", { username: "beto", password: "secure test password" });
  assert.equal((await send(first, "/auth/password", { current: "wrong password!!", next: "another secure password" })).status, 403);
  assert.equal((await send(first, "/auth/password", { current: "secure test password", next: "short" })).status, 400);
  const changed = await (await send(first, "/auth/password", { current: "secure test password", next: "another secure password" })).json();
  assert.equal(changed.closedSessions, 1);
  assert.equal((await call("/auth/profile", { headers: { Cookie: first } })).status, 200);
  assert.equal((await call("/auth/profile", { headers: { Cookie: second } })).status, 401);
  assert.equal(await signIn("/auth/login", { username: "beto", password: "secure test password" }), undefined);
  assert.ok(await signIn("/auth/login", { username: "beto", password: "another secure password" }));
});

test("avatar data and initials are validated", () => {
  assert.equal(decodeAvatar("data:image/png;base64," + PNG).type, "image/png");
  assert.throws(() => decodeAvatar("data:image/svg+xml;base64,PHN2Zz4="), /PNG, JPEG o WebP/);
  assert.equal(initials("  maría  josé lópez "), "MJ");
  assert.equal(initials("😀 Emoji"), "😀E");
});
