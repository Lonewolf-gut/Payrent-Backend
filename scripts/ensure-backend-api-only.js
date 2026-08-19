/**
 * PayRent-Backend split repo: swap in API-only root page before build/dev.
 * Run automatically when BACKEND_ONLY=true (see package.json prebuild/predev).
 */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const backendOnly = process.env.BACKEND_ONLY === "true";

if (!backendOnly) {
  console.log("[backend-only] BACKEND_ONLY is not set — keeping marketing root page.");
  process.exit(0);
}

const templatePath = path.join(__dirname, "templates", "app-page.backend.tsx");
const targetPath = path.join(projectRoot, "app", "page.tsx");
const markerPath = path.join(projectRoot, "app", ".page-marketing-backup.tsx");

const template = fs.readFileSync(templatePath, "utf8");
const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";

if (current.includes("BackendApiLanding") && current.includes("PayRent-Backend split repo")) {
  console.log("[backend-only] API-only root page already active.");
  process.exit(0);
}

if (current && !fs.existsSync(markerPath) && !current.includes("BackendApiLanding")) {
  fs.writeFileSync(markerPath, current, "utf8");
  console.log("[backend-only] Backed up marketing app/page.tsx to app/.page-marketing-backup.tsx");
}

fs.writeFileSync(targetPath, template, "utf8");
console.log("[backend-only] Installed API-only app/page.tsx for BACKEND_ONLY build.");
