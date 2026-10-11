import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command = "build", ...args] = process.argv.slice(2);
if (!["build", "dev", "start"].includes(command)) throw new Error("Expected build, dev or start.");
const cli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const result = spawnSync(process.execPath, [cli, command, ...args, ...(command === "dev" ? ["--hostname", "127.0.0.1"] : []), ...(command === "start" ? [] : ["--webpack"])], {
  stdio: "inherit", env: { ...process.env, UML_PLATFORM: "vercel", NEXT_TELEMETRY_DISABLED: "1" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
