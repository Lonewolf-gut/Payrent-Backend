/**
 * One-time helper: copy legacy file-based property images into the database as data URLs.
 * Run from PayRent-Backend after pulling the image fix:
 *   node scripts/materialize-property-images.js
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs/promises");
const path = require("path");

const prisma = new PrismaClient();
const PUBLIC_ROOT = path.join(process.cwd(), "public", "uploads");
const PRIVATE_ROOT = path.join(process.cwd(), "storage", "private");
const DATA_URL_MAX_BYTES = 3 * 1024 * 1024;

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function storageKeyFromUrl(url) {
  const trimmed = url.trim();
  if (trimmed.startsWith("public/")) return trimmed;
  if (trimmed.startsWith("/uploads/")) return `public/${trimmed.replace(/^\/uploads\//, "")}`;
  if (trimmed.startsWith("uploads/")) return `public/${trimmed.replace(/^uploads\//, "")}`;
  return null;
}

async function readStorageKey(key) {
  const relative = key.replace(/^public\//, "");
  const filePath = path.join(PUBLIC_ROOT, relative);
  return fs.readFile(filePath);
}

async function main() {
  const images = await prisma.propertyImage.findMany({
    select: { id: true, url: true },
  });

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const image of images) {
    const url = image.url?.trim() ?? "";
    if (!url || url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
      skipped += 1;
      continue;
    }

    const key = storageKeyFromUrl(url);
    if (!key) {
      skipped += 1;
      continue;
    }

    try {
      const buffer = await readStorageKey(key);
      if (buffer.length > DATA_URL_MAX_BYTES) {
        console.log(`Skip ${image.id}: file too large (${buffer.length} bytes)`);
        skipped += 1;
        continue;
      }

      const ext = path.extname(key).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "image/jpeg";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

      await prisma.propertyImage.update({
        where: { id: image.id },
        data: { url: dataUrl },
      });

      updated += 1;
      console.log(`Updated ${image.id}`);
    } catch {
      missing += 1;
      console.log(`Missing file for ${image.id}: ${url}`);
    }
  }

  console.log("");
  console.log(`Done. Updated ${updated}, skipped ${skipped}, missing files ${missing}.`);
  console.log("If missing > 0, re-upload those listing photos from the merchant dashboard.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
