import {
  isLegacyPublicUploadPath,
  isStorageKey,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";
import { getPublicFileUrl } from "@/lib/storage/index";

/**
 * Turn a stored file reference (storage key, /uploads path, or absolute URL)
 * into a browser-loadable URL. Uses /api/files/public so split-repo frontends
 * can proxy file reads to PayRent-Backend.
 */
export function resolvePublicMediaUrl(
  storedUrl: string | null | undefined
): string | null {
  if (!storedUrl?.trim()) return null;

  const trimmed = storedUrl.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/api/files/public")) {
    return trimmed;
  }

  let uploadPath: string | null = null;

  if (isLegacyPublicUploadPath(trimmed)) {
    uploadPath = trimmed;
  } else if (trimmed.startsWith("uploads/")) {
    uploadPath = `/${trimmed}`;
  } else if (isStorageKey(trimmed) || trimmed.includes("/")) {
    uploadPath = getPublicFileUrl(normalizeStoredFileReference(trimmed));
  } else {
    uploadPath = getPublicFileUrl(normalizeStoredFileReference(trimmed));
  }

  if (!uploadPath) return null;

  return `/api/files/public?path=${encodeURIComponent(uploadPath)}`;
}

export function withResolvedPropertyImages<
  T extends { images?: Array<{ url: string }> | null },
>(property: T): T {
  if (!property.images?.length) return property;

  return {
    ...property,
    images: property.images.map((image) => ({
      ...image,
      url: resolvePublicMediaUrl(image.url) ?? image.url,
    })),
  };
}

export function withResolvedPropertyListImages<
  T extends { images?: Array<{ url: string }> | null },
>(properties: T[]): T[] {
  return properties.map(withResolvedPropertyImages);
}

export function resolvePublicStorageKeyFromRequest(
  pathParam: string | null,
  keyParam: string | null
): string | null {
  const raw = keyParam?.trim() || pathParam?.trim();
  if (!raw) return null;

  if (keyParam?.trim()) {
    const key = normalizeStoredFileReference(keyParam.trim());
    return key.startsWith("public/") ? key : null;
  }

  const normalizedPath = pathParam!.startsWith("/")
    ? pathParam!.trim()
    : `/${pathParam!.trim()}`;

  if (!isLegacyPublicUploadPath(normalizedPath)) {
    return null;
  }

  const key = legacyPathToStorageKey(normalizedPath);
  return key.startsWith("public/") ? key : null;
}
