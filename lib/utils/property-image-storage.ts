import {
  isLegacyPublicUploadPath,
  isStorageKey,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";
import { normalizeDbImageUrl } from "@/lib/utils/public-storage-url";

/** True when PropertyImage.url is a storage key/path (not a loadable https or data URL). */
export function isPropertyImageStorageReference(url: string | null | undefined): boolean {
  const raw = normalizeDbImageUrl(url);
  if (!raw) return false;
  if (/^data:/i.test(raw)) return false;
  if (/^https?:\/\//i.test(raw)) return false;
  return true;
}

/**
 * Normalize any property-image reference to an object storage key (public/...).
 * Returns null for data URLs, https URLs, or unrecognised values.
 */
export function normalizePropertyImageStorageKey(url: string | null | undefined): string | null {
  const raw = normalizeDbImageUrl(url);
  if (!raw || /^data:/i.test(raw) || /^https?:\/\//i.test(raw)) {
    return null;
  }

  if (isStorageKey(raw)) {
    return raw.startsWith("public/") ? raw : null;
  }

  if (isLegacyPublicUploadPath(raw) || raw.startsWith("uploads/")) {
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    const key = legacyPathToStorageKey(path);
    return key.startsWith("public/") ? key : null;
  }

  if (raw.includes("properties/images/") || raw.startsWith("properties/")) {
    const key = raw.startsWith("public/") ? raw : `public/${raw.replace(/^\/+/, "")}`;
    return key.startsWith("public/") ? key : null;
  }

  const normalized = normalizeStoredFileReference(raw);
  return normalized.startsWith("public/") ? normalized : null;
}

/** Reverse a CDN URL built from S3_PUBLIC_URL + object path back to a storage key. */
export function storageKeyFromCdnBaseUrl(url: string, cdnBase: string): string | null {
  const base = cdnBase.replace(/\/$/, "");
  if (!base || !url.startsWith(base)) return null;

  const objectPath = url.slice(base.length).replace(/^\/+/, "");
  if (!objectPath) return null;

  return `public/${objectPath}`;
}

export function getPropertyImageCdnBaseUrl() {
  return (
    process.env.S3_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_S3_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_CDN_URL ??
    ""
  ).replace(/\/$/, "");
}

/** Extract a storage key from a public CDN URL path when CDN base is unknown. */
export function storageKeyFromHttpsPath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+/, "");
    const marker = "properties/images/";
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return `public/${pathname.slice(index)}`;
  } catch {
    return null;
  }
}
