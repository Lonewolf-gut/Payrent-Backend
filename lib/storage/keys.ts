import path from "path";

export type StorageCategory =
  | "kyc"
  | "applications"
  | "financing-docs"
  | "mandates"
  | "properties/images"
  | "properties/documents"
  | "profiles";

const PRIVATE_CATEGORIES = new Set<StorageCategory>([
  "kyc",
  "applications",
  "financing-docs",
  "mandates",
  "properties/documents",
  "profiles",
]);

export function isPrivateCategory(category: StorageCategory) {
  return PRIVATE_CATEGORIES.has(category);
}

export function buildStorageKey(
  category: StorageCategory,
  fileName: string,
  ownerId?: string
) {
  const visibility = isPrivateCategory(category) ? "private" : "public";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ownerPrefix = ownerId ? `${ownerId}/` : "";
  return `${visibility}/${category}/${ownerPrefix}${safeName}`;
}

export function isStorageKey(value: string) {
  return value.startsWith("private/") || value.startsWith("public/");
}

export function isLegacyPublicUploadPath(value: string) {
  return value.startsWith("/uploads/");
}

export function legacyPathToStorageKey(fileUrl: string) {
  const normalized = fileUrl.replace(/^\/+/, "");
  if (normalized.startsWith("uploads/kyc/")) {
    return `private/kyc/${normalized.replace("uploads/kyc/", "")}`;
  }
  if (normalized.startsWith("uploads/applications/")) {
    return `private/applications/${normalized.replace("uploads/applications/", "")}`;
  }
  if (normalized.startsWith("uploads/financing-docs/")) {
    return `private/financing-docs/${normalized.replace("uploads/financing-docs/", "")}`;
  }
  if (normalized.startsWith("uploads/mandates/")) {
    return `private/mandates/${normalized.replace("uploads/mandates/", "")}`;
  }
  if (normalized.startsWith("uploads/properties/documents/")) {
    return `private/properties/documents/${normalized.replace("uploads/properties/documents/", "")}`;
  }
  if (normalized.startsWith("uploads/")) {
    return `public/${normalized.replace("uploads/", "")}`;
  }
  return normalized;
}

export function normalizeStoredFileReference(fileUrl: string) {
  if (isStorageKey(fileUrl)) return fileUrl;
  if (isLegacyPublicUploadPath(fileUrl)) return legacyPathToStorageKey(fileUrl);
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
  return legacyPathToStorageKey(`/${fileUrl}`);
}

export function fileNameFromKey(storageKey: string) {
  return path.basename(storageKey);
}
