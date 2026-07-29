const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");
const examplePath = path.join(__dirname, "..", ".env.example");

function generateSecret() {
  return crypto.randomBytes(32).toString("base64");
}

if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error("Missing .env.example");
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.example");
}

let content = fs.readFileSync(envPath, "utf8");
const secret = generateSecret();

const placeholders = [
  'AUTH_SECRET="replace-with-openssl-rand-base64-32"',
  "AUTH_SECRET=replace-with-openssl-rand-base64-32",
  'JWT_ACCESS_SECRET="replace-with-min-32-char-secret"',
  'JWT_REFRESH_SECRET="replace-with-min-32-char-secret"',
  'CRON_SECRET="replace-with-openssl-rand-base64-32"',
];

for (const key of ["AUTH_SECRET", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CRON_SECRET"]) {
  const placeholder = `${key}="replace-with`;
  if (!new RegExp(`^\\s*${key}=.+$`, "m").test(content)) {
    content += `\n${key}="${generateSecret()}"\n`;
    continue;
  }
  if (content.includes(`${key}="replace-with`) || content.includes(`${key}=replace-with`)) {
    content = content.replace(new RegExp(`${key}=.*`), `${key}="${generateSecret()}"`);
  }
}

fs.writeFileSync(envPath, content);

console.log("");
console.log("Backend .env is ready.");
console.log("IMPORTANT: Copy AUTH_SECRET from PayRent-Frontend/.env into this file if you already set up the frontend.");
console.log("Both apps must use the SAME AUTH_SECRET.");
console.log("");
