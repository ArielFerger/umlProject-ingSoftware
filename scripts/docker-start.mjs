import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import "./sites-env.mjs";
import { createLocalGateway } from "./docker-gateway.mjs";
import { createOnlineGateway } from "./online-gateway.mjs";

if (process.env.DOCKER_LOCAL_MODE !== "1") {
  throw new Error("Este adaptador se usa exclusivamente en Docker con DOCKER_LOCAL_MODE=1.");
}
const original = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
const configPath = "dist/server/wrangler.docker.json";
writeFileSync(configPath, JSON.stringify({ ...original, d1_databases: original.d1_databases.map(binding => ({ ...binding, migrations_dir: "../../drizzle" })) }));
const wrangler = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js"];
const common = ["--config", configPath, "--persist-to", ".wrangler/state"];

await new Promise((resolve, reject) => {
  const migration = spawn(process.execPath, [...wrangler, "d1", "migrations", "apply", "DB", "--local", ...common], { stdio: "inherit" });
  migration.once("error", reject);
  migration.once("exit", code => code === 0 ? resolve() : reject(new Error(`La migración local falló (${code}).`)));
});
const worker = spawn(process.execPath, [...wrangler, "dev", "--local", ...common, "--ip", "127.0.0.1", "--port", "8787", "--inspector-port", "0"], { stdio: "inherit" });
const online = process.env.UML_MODE === "online";
const gateway = online ? createOnlineGateway({ publicOrigin: process.env.UML_PUBLIC_ORIGIN }) : createLocalGateway();
let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  gateway.close();
  worker.kill(signal);
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop("SIGINT"));
worker.once("error", error => { console.error(error); stop(); process.exitCode = 1; });
worker.once("exit", code => { gateway.close(); if (!stopping) process.exitCode = code || 1; });

let ready = false;
for (let attempt = 0; attempt < 120 && worker.exitCode === null && !stopping; attempt++) {
  try { const response = await fetch("http://127.0.0.1:8787/api/study-profile"); if (response.status === 401) { ready = true; break; } } catch { /* Wait for workerd to bind. */ }
  await delay(500);
}
if (!ready) { stop(); throw new Error("El Worker local no inició a tiempo."); }
gateway.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log(online ? "UML Studio online: " + process.env.UML_PUBLIC_ORIGIN : "UML Studio — espacio local: http://localhost:3000"));
