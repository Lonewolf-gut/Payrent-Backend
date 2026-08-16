import { getMaxUploadBytes } from "@/lib/storage/config";
import { storeUploadedFile } from "@/lib/storage/index";
import { extensionForMime, validateUploadFile } from "@/lib/storage/validation";

const DATA_URL_MAX_BYTES = 3 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function mimeFromStorageKey(storageKey: string) {
  const ext = storageKey.slice(storageKey.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXT[ext] ?? "image/jpeg";
}

/** Persist property photos in the database as data URLs when reasonably sized. */
export async function savePropertyImageUpload(file: File, ownerId: string) {
  const maxBytes = getMaxUploadBytes();
  const { mimeType } = validateUploadFile(file, { kind: "image", maxBytes });
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length <= DATA_URL_MAX_BYTES) {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  const stored = await storeUploadedFile({
    file,
    category: "properties/images",
    ownerId,
    kind: "image",
  });
  return stored.key;
}

export function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export { DATA_URL_MAX_BYTES };
