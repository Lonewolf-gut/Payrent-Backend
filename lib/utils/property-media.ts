import {
  isLegacyPublicUploadPath,
  isStorageKey,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";
import { getPublicFileUrl } from "@/lib/storage/index";

type ImageRecord = { id?: string; url: string };

/**
 * Property images are stored in the PropertyImage table (url column).
 * We expose them through /api/files/property-image/:id so the backend reads
 * the database row on every request (works in split repos via API proxy).
 */
export function resolvePropertyImageUrl(image: ImageRecord): string {
  if (image.id) {
    return `/api/files/property-image/${image.id}`;
  }

  return resolvePublicMediaUrl(image.url) ?? image.url;
}

/**
 * Turn a stored file reference into a browser-loadable URL when no image id exists.
 */
export function resolvePublicMediaUrl(
  storedUrl: string | null | undefined
): string | null {
  if (!storedUrl?.trim()) return null;

  const trimmed = storedUrl.trim();

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/api/files/")
  ) {
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
  T extends { images?: Array<{ id?: string; url: string }> | null },
>(property: T): T {
  if (!property.images?.length) return property;

  return {
    ...property,
    images: property.images.map((image) => ({
      ...image,
      url: resolvePropertyImageUrl(image),
    })),
  };
}

export function withResolvedPropertyListImages<
  T extends { images?: Array<{ id?: string; url: string }> | null },
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
