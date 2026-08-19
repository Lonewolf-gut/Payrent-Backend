/**
 * Safe prebuild entrypoint for monorepo and split repos.
 * Runs only the hooks that apply to this checkout.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

function runScript(relativePath) {
  const scriptPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(scriptPath)) return;

  console.log(`[prebuild] Running ${relativePath}...`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runScript("scripts/ensure-backend-api-only.js");
runScript("scripts/ensure-split-repo-files.js");
