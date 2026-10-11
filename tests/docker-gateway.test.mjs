import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createLocalGateway } from "../scripts/docker-gateway.mjs";

test("Docker confines its single-user identity to the local gateway", async t => {
  const upstream = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ path: request.url, headers: request.headers }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const gateway = createLocalGateway({ upstreamPort: upstream.address().port });
  await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
  t.after(() => { gateway.closeAllConnections(); upstream.closeAllConnections(); gateway.close(); upstream.close(); });
  const base = `http://127.0.0.1:${gateway.address().port}`;

  const response = await fetch(`${base}/api/diagrams`, { headers: { "oai-authenticated-user-id": "forged", "x-forwarded-host": "attacker.test" } });
  const result = await response.json();
  assert.equal(result.headers["oai-authenticated-user-id"], "docker_local");
  assert.equal(result.headers["x-forwarded-host"], undefined);
  assert.equal(result.path, "/api/diagrams");

  assert.equal((await fetch(`${base}/api/diagrams`, { method: "POST", headers: { Origin: "https://attacker.test" } })).status, 403);
  assert.equal((await fetch(`${base}/api/diagrams`, { method: "POST", headers: { Origin: base } })).status, 200);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(base, { headers: { Host: "attacker.test" } }, response => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject);
  });
  assert.equal(foreignHostStatus, 403);
  const redirect = await fetch(`${base}/signin-with-chatgpt?return_to=${encodeURIComponent("//attacker.test")}`, { redirect: "manual" });
  assert.equal(redirect.headers.get("location"), "/");
  const localRedirect = await fetch(`${base}/signin-with-chatgpt?return_to=%2Festudio`, { redirect: "manual" });
  assert.equal(localRedirect.headers.get("location"), "/estudio");
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: "ok", mode: "local" });
});
