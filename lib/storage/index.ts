import { randomUUID } from "crypto";
import {
  getMaxUploadBytes,
  getStorageDriver,
  isS3StorageConfigured,
} from "@/lib/storage/config";
import {
  buildStorageKey,
  isLegacyPublicUploadPath,
  isStorageKey,
  type StorageCategory,
} from "@/lib/storage/keys";
import {
  createLocalAccessToken,
  deleteFromLocal,
  getLocalPublicUrl,
  uploadToLocal,
} from "@/lib/storage/local-storage";
import {
  deleteFromS3,
  getS3PublicUrl,
  getS3SignedUrl,
  uploadToS3,
} from "@/lib/storage/s3-storage";
import { extensionForMime, validateUploadFile, type UploadKind } from "@/lib/storage/validation";

export type StoredFile = {
  key: string;
  visibility: "private" | "public";
  contentType: string;
};

function resolveDriver() {
  const driver = getStorageDriver();
  if (driver === "s3" && !isS3StorageConfigured()) {
    throw new Error(
      "STORAGE_DRIVER=s3 but S3 credentials are incomplete. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }
  return driver;
}

export async function storeUploadedFile(params: {
  file: File;
  category: StorageCategory;
  ownerId?: string;
  kind?: UploadKind;
}) {
  const maxBytes = getMaxUploadBytes();
  const kind = params.kind ?? (params.category.includes("profiles") || params.category.includes("images") ? "image" : "document");
  const { mimeType, extension } = validateUploadFile(params.file, { kind, maxBytes });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const key = buildStorageKey(params.category, fileName, params.ownerId);
  const visibility = key.startsWith("private/") ? "private" : "public";
  const body = Buffer.from(await params.file.arrayBuffer());
  const driver = resolveDriver();

  if (driver === "s3") {
    await uploadToS3({ key, body, contentType: mimeType, visibility });
  } else {
    await uploadToLocal({ key, body });
  }

  return {
    key,
    visibility,
    contentType: mimeType,
  } satisfies StoredFile;
}

export async function deleteStoredFile(key: string) {
  if (!isStorageKey(key)) return;
  const driver = resolveDriver();
  if (driver === "s3") {
    await deleteFromS3(key);
    return;
  }
  await deleteFromLocal(key);
}

export async function getPrivateFileAccessUrl(storageKey: string, appBaseUrl: string) {
  const key = isStorageKey(storageKey) ? storageKey : storageKey;
  if (!key.startsWith("private/")) {
    return getPublicFileUrl(key);
  }

  const driver = resolveDriver();
  if (driver === "s3") {
    return getS3SignedUrl(key);
  }

  const token = createLocalAccessToken(key);
  return `${appBaseUrl.replace(/\/$/, "")}/api/files/local?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
}

export function getPublicFileUrl(storageKey: string) {
  if (storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
    return storageKey;
  }

  if (isLegacyPublicUploadPath(storageKey)) {
    return storageKey;
  }

  if (!isStorageKey(storageKey)) {
    return storageKey.startsWith("/") ? storageKey : `/${storageKey}`;
  }

  if (!storageKey.startsWith("public/")) {
    return null;
  }

  const driver = getStorageDriver();
  if (driver === "s3" && isS3StorageConfigured()) {
    return getS3PublicUrl(storageKey);
  }

  return getLocalPublicUrl(storageKey);
}

export function getStoredFileReference(stored: StoredFile) {
  return stored.key;
}

// Backward-compatible helpers for integrations
export async function saveDocumentUpload(
  file: File,
  category: Extract<StorageCategory, "kyc" | "applications" | "financing-docs">,
  ownerId: string
) {
  const stored = await storeUploadedFile({ file, category, ownerId, kind: "document" });
  return stored.key;
}

export async function saveMandateUpload(file: File, ownerId: string) {
  const stored = await storeUploadedFile({ file, category: "mandates", ownerId, kind: "document" });
  return stored.key;
}

export async function savePropertyImageUpload(file: File, ownerId: string) {
  const { savePropertyImageUpload: savePropertyImage } = await import(
    "@/lib/storage/property-image-url"
  );
  return savePropertyImage(file, ownerId);
}

export async function savePropertyDocumentUpload(file: File, ownerId: string) {
  const stored = await storeUploadedFile({
    file,
    category: "properties/documents",
    ownerId,
    kind: "document",
  });
  return stored.key;
}

export async function saveProfileImageUpload(file: File, ownerId: string, _extension: string) {
  const stored = await storeUploadedFile({
    file,
    category: "profiles",
    ownerId,
    kind: "image",
  });
  const publicUrl = getPublicFileUrl(stored.key);
  return publicUrl ?? stored.key;
}
