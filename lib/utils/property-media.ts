import {
  resolvePropertyImageDisplayUrl,
  withPropertyImageDisplayUrls,
  withPropertyListImageDisplayUrls,
} from "@/lib/utils/property-image-display";
import {
  isLegacyPublicUploadPath,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";

type ImageRecord = { id?: string; url: string };

export function withResolvedPropertyImages<
  T extends { images?: Array<ImageRecord & { alt?: string | null }> | null },
>(property: T) {
  return withPropertyImageDisplayUrls(property);
}

export function withResolvedPropertyListImages<
  T extends { images?: Array<ImageRecord> | null },
>(properties: T[]) {
  return withPropertyListImageDisplayUrls(properties);
}

export const resolvePropertyImageUrl = resolvePropertyImageDisplayUrl;

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
