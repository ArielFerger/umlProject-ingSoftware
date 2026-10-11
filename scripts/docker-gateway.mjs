import http from "node:http";

const IDENTITY_HEADERS = [
  "oai-authenticated-user-id", "oai-authenticated-user-email",
  "oai-authenticated-user-full-name", "oai-authenticated-user-full-name-encoding",
];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Only the Docker entrypoint uses this single-user adapter. Sites authentication
// and the production Worker remain dispatch-owned and unchanged.
export function createLocalGateway({ upstreamPort = 8787 } = {}) {
  return http.createServer((request, response) => {
    const host = request.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) {
      response.writeHead(403).end("Este espacio local sólo admite conexiones desde localhost.");
      return;
    }
    if (WRITE_METHODS.has(request.method) && request.headers.origin && request.headers.origin !== `http://${host}`) {
      response.writeHead(403).end("La operación debe iniciarse desde este espacio local.");
      return;
    }
    const url = new URL(request.url, `http://${host}`);
    if (url.pathname === "/signin-with-chatgpt" || url.pathname === "/signout-with-chatgpt") {
      const destination = url.searchParams.get("return_to") || "/";
      const safe = destination.startsWith("/") && !destination.startsWith("//") && !destination.includes("\\") && !/[\r\n]/.test(destination);
      response.writeHead(302, { Location: safe ? destination : "/", "Cache-Control": "no-store" }).end();
      return;
    }
    // Health checks exercise D1 as well as the Worker, not just the proxy socket.
    const health = url.pathname === "/healthz";
    const headers = { ...request.headers, host };
    for (const header of IDENTITY_HEADERS) delete headers[header];
    delete headers["forwarded"];
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-proto"];
    Object.assign(headers, {
      "oai-authenticated-user-id": "docker_local",
      "oai-authenticated-user-email": "local@uml-studio.test",
      "oai-authenticated-user-full-name": "Espacio%20local",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    });
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: health ? "/api/diagrams" : request.url, method: health ? "GET" : request.method, headers }, result => {
      if (health) {
        result.resume();
        const ok = result.statusCode === 200;
        response.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ status: ok ? "ok" : "unavailable", mode: "local" }));
      } else {
        response.writeHead(result.statusCode || 502, result.headers);
        result.pipe(response);
      }
    });
    upstream.setTimeout(30_000, () => upstream.destroy(new Error("Worker timeout")));
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "El espacio local está iniciando. Volvé a intentarlo en unos segundos." }));
    });
    request.on("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
}
