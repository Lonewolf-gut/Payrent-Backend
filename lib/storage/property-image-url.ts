import { getMaxUploadBytes } from "@/lib/storage/config";
import { getPublicFileUrl, storeUploadedFile } from "@/lib/storage/index";
import { validateUploadFile } from "@/lib/storage/validation";

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

/**
 * Persist property photos. Small files become data URLs; larger files go to public
 * object storage (R2/S3/local) and we store a loadable public URL when available.
 */
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

  return getPublicFileUrl(stored.key) ?? stored.key;
}

export function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export { DATA_URL_MAX_BYTES };
