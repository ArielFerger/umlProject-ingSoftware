import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const scrypt = promisify(scryptCallback);
const hash = value => createHash("sha256").update(value).digest("hex");
const MONTH = 30 * 86400000;
const safePath = value => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value) ? value : "/";
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const IDENTITY = ["oai-authenticated-user-id", "oai-authenticated-user-email", "oai-authenticated-user-full-name", "oai-authenticated-user-full-name-encoding", "x-uml-auth-provider", "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for"];
async function formBody(request) {
  let text = "";
  for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 8192) throw new Error("Formulario demasiado grande."); }
  return new URLSearchParams(text);
}
function authPage({ register, returnTo, error, nonce }) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${register ? "Crear cuenta" : "Ingresar"} · UML Studio</title><style>body{margin:0;background:#f3f7f9;color:#253b48;font:16px/1.5 system-ui;display:grid;min-height:100dvh;place-items:center}main{width:min(400px,calc(100% - 64px));padding:32px;background:white;border:1px solid #dde5e9;border-radius:18px;box-shadow:0 8px 40px #2034400a}h1{font-size:25px;margin:12px 0 4px}p{color:#536874;font-size:14px}label{display:block;font-size:14px;margin:18px 0 0}input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #b7c8d1;border-radius:7px;font:inherit;margin-top:6px}button{width:100%;margin-top:24px;background:#1a647b;color:white;border:0;padding:12px;border-radius:8px;font:600 15px system-ui;cursor:pointer}a{color:#1a647b}small{display:block;color:#536874;margin:14px 0}header{font-weight:750;color:#1a647b;letter-spacing:-.5px}.error{color:#a63d43;padding:10px;background:#fff1f1;border-radius:6px}input:focus,button:focus-visible,a:focus-visible{outline:2px solid #1a647b;outline-offset:3px}</style><main><header>UML Studio / Online</header><h1>${register ? "Tu espacio para diagramar" : "Volvé a tu tablero"}</h1><p>${register ? "Creá una cuenta para guardar y compartir tus diagramas." : "Ingresá para abrir tus diagramas y tableros compartidos."}</p>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}<form method="post" action="/auth/${register ? "register" : "login"}"><input type="hidden" name="return_to" value="${escape(returnTo)}">${register ? '<label>Tu nombre<input name="display_name" autocomplete="name" required maxlength="80"></label>' : ""}<label>Usuario<input name="username" autocomplete="username" required pattern="[A-Za-z0-9_.-]{3,40}" minlength="3" maxlength="40" autocapitalize="none" spellcheck="false"></label><label>Contraseña<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" required ${register ? 'minlength="12"' : ""} maxlength="256"></label>${register ? "<small>Usá al menos 12 caracteres. Tu usuario puede tener letras, números, puntos, guiones y guion bajo.</small>" : ""}<button>${register ? "Crear mi cuenta" : "Ingresar"}</button></form><p>${register ? "¿Ya tenés cuenta?" : "¿Es tu primera vez?"} <a id="switch" href="/auth?mode=${register ? "login" : "register"}&return_to=${encodeURIComponent(returnTo)}">${register ? "Ingresar" : "Crear cuenta"}</a></p><script nonce="${nonce}">if(location.hash){document.querySelector('[name=return_to]').value+=location.hash;document.getElementById('switch').hash=location.hash;}</script></main></html>`;
}

export function createOnlineGateway({ upstreamPort = 8787, publicOrigin, databasePath = ".wrangler/state/accounts.sqlite" } = {}) {
  const origin = new URL(publicOrigin);
  const COOKIE = origin.protocol === "https:" ? "__Host-uml_session" : "uml_session";
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || !["https:", "http:"].includes(origin.protocol)) throw new Error("UML_PUBLIC_ORIGIN debe ser el origen público sin rutas.");
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("El servidor online requiere HTTPS.");
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS session_account ON sessions(account_id);`);
  const attempts = new Map();
  let hashing = 0;
  const derive = async (password, salt) => {
    if (hashing >= 3) throw new Error("Intentá de nuevo en unos segundos.");
    hashing++;
    try { return await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); } finally { hashing--; }
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader("Referrer-Policy", "strict-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    const json = (status, value) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
    const redirect = destination => { response.writeHead(303, { Location: destination, "Cache-Control": "no-store" }); response.end(); };
    try {
      const localHealth = request.url === "/healthz" && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || "");
      if (!localHealth && request.headers.host !== origin.host) { json(403, { error: "Origen no permitido." }); return; }
      const url = new URL(request.url, origin);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== origin.origin) { json(403, { error: "La operación debe iniciarse desde UML Studio." }); return; }
      const rawToken = request.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
      const account = rawToken && /^[a-f0-9]{64}$/.test(rawToken) ? db.prepare("SELECT a.id, a.username, a.display_name FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?").get(hash(rawToken), Date.now()) : null;
      if (url.pathname === "/auth/logout" && request.method === "POST") {
        if (rawToken) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(rawToken));
        response.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${origin.protocol === "https:" ? "; Secure" : ""}`); redirect("/auth"); return;
      }
      if (url.pathname === "/signin-with-chatgpt") { redirect(`/auth?return_to=${encodeURIComponent(safePath(url.searchParams.get("return_to")))}`); return; }
      if (url.pathname === "/auth" && request.method === "GET") {
        const register = url.searchParams.get("mode") === "register", returnTo = safePath(url.searchParams.get("return_to"));
        const errors = { invalid: "Usuario o contraseña incorrectos.", unavailable: "No se pudo crear la cuenta. Elegí otro usuario o intentá más tarde.", fields: "Revisá los datos. La contraseña debe tener al menos 12 caracteres.", limited: "Demasiados intentos. Esperá unos minutos e intentá de nuevo." };
        const nonce = randomBytes(16).toString("base64");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` });
        response.end(authPage({ register, returnTo, error: errors[url.searchParams.get("error")], nonce })); return;
      }
      if (["/auth/login", "/auth/register"].includes(url.pathname) && request.method === "POST") {
        const register = url.pathname === "/auth/register", data = await formBody(request), returnTo = safePath(data.get("return_to"));
        const fail = error => redirect(`/auth?mode=${register ? "register" : "login"}&error=${error}&return_to=${encodeURIComponent(returnTo)}`);
        const now = Date.now(), key = request.socket.remoteAddress || "unknown";
        for (const [ip, a] of attempts) if (a.until < now) attempts.delete(ip);
        const attempt = attempts.get(key) || { count: 0, until: now + 5 * 60000 }; attempt.count++; attempts.set(key, attempt);
        if (attempt.count > 25 || hashing >= 3) { fail("limited"); return; }
        const username = (data.get("username") || "").toLowerCase(), password = data.get("password") || "", displayName = (data.get("display_name") || "").trim();
        if (!/^[a-z0-9_.-]{3,40}$/.test(username) || password.length > 256 || !password.length || (register && (password.length < 12 || !displayName || displayName.length > 80))) { fail("fields"); return; }
        let user;
        if (register) {
          const salt = randomBytes(24).toString("hex"), passwordHash = (await derive(password, salt)).toString("hex");
          user = { id: `vps_${randomUUID()}`, username, display_name: displayName };
          try { db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)").run(user.id, username, displayName, passwordHash, salt, now); } catch { fail("unavailable"); return; }
        } else {
          user = db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
          const candidate = await derive(password, user?.salt || "0".repeat(48));
          if (!user || !timingSafeEqual(candidate, Buffer.from(user.password_hash, "hex"))) { fail("invalid"); return; }
        }
        const token = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
        db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash(token), user.id, now + MONTH);
        response.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MONTH / 1000}${origin.protocol === "https:" ? "; Secure" : ""}`);
        redirect(returnTo); return;
      }
      if (url.pathname === "/mcp") { json(404, { error: "El conector de Sites no está disponible en este servidor." }); return; }
      if (!account && !localHealth) {
        if (url.pathname.startsWith("/api/")) { json(401, { error: "Ingresá con tu cuenta para abrir tus tableros." }); return; }
        if (["/", "/join", "/estudio", "/git"].includes(url.pathname)) { redirect(`/auth?return_to=${encodeURIComponent(safePath(request.url))}`); return; }
      }
      const headers = { ...request.headers, host: origin.host };
      for (const name of IDENTITY) delete headers[name];
      delete headers.cookie;
      if (account || localHealth) Object.assign(headers, {
        "oai-authenticated-user-id": account?.id || "healthcheck",
        "oai-authenticated-user-email": `${account?.username || "healthcheck"}@uml.local`,
        "oai-authenticated-user-full-name": encodeURIComponent(account?.display_name || "Salud del servidor"),
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8", "x-uml-auth-provider": "vps",
      });
      const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: localHealth ? "/api/diagrams?id=__healthcheck__" : request.url, method: localHealth ? "GET" : request.method, headers }, result => {
        if (localHealth) { result.resume(); json(result.statusCode === 404 ? 200 : 503, { status: result.statusCode === 404 ? "ok" : "unavailable", mode: "online" }); }
        else { response.writeHead(result.statusCode || 502, { ...result.headers, "Referrer-Policy": "strict-origin", "X-Frame-Options": "DENY" }); result.pipe(response); }
      });
      upstream.setTimeout(30000, () => upstream.destroy(new Error("Worker timeout")));
      upstream.on("error", () => { if (!response.headersSent) json(503, { error: "El servidor está iniciando. Volvé a intentar en unos segundos." }); else response.end(); });
      request.on("aborted", () => upstream.destroy()); request.pipe(upstream);
    } catch { if (!response.headersSent) json(400, { error: "No se pudo completar la solicitud." }); else response.end(); }
  });
  server.on("close", () => db.close());
  return server;
}
