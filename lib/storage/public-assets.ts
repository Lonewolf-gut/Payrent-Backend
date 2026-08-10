import {
  isLegacyPublicUploadPath,
  isStorageKey,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";

export function isPublicPropertyImageKey(key: string) {
  return key.startsWith("public/properties/images/");
}

export function normalizePublicPropertyImageRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  if (isStorageKey(trimmed)) {
    return isPublicPropertyImageKey(trimmed) ? trimmed : null;
  }

  if (isLegacyPublicUploadPath(trimmed)) {
    const key = legacyPathToStorageKey(trimmed);
    return isPublicPropertyImageKey(key) ? key : null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const pathname = new URL(trimmed).pathname.replace(/^\/+/, "");
      if (pathname.startsWith("public/properties/images/")) return pathname;
      if (pathname.startsWith("properties/images/")) return `public/${pathname}`;
    } catch {
      return null;
    }
  }

  const normalized = normalizeStoredFileReference(trimmed);
  if (typeof normalized === "string" && isPublicPropertyImageKey(normalized)) {
    return normalized;
  }

  if (trimmed.startsWith("properties/images/")) {
    const key = `public/${trimmed}`;
    return isPublicPropertyImageKey(key) ? key : null;
  }

  return null;
}