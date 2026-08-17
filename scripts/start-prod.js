const { spawn } = require("node:child_process");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const projectRoot = path.join(__dirname, "..");
loadEnvConfig(projectRoot);

const port = String(process.env.PORT || "3000").replace(/"/g, "");
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

console.log(`Starting production server on http://localhost:${port}`);

const child = spawn(process.execPath, [nextCli, "start", "--hostname", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, PORT: port },
  cwd: projectRoot,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`\nServer stopped (${signal}).`);
  } else if (code && code !== 0) {
    console.error(`\nServer exited with code ${code}.`);
  }
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
