/** Client-safe helpers to turn storage keys into public CDN URLs (Cloudflare R2, S3, etc.). */

/** Strip wrapping quotes sometimes stored in the database. */
export function normalizeDbImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  let value = url.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function publicCdnBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_S3_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_CDN_URL ??
    ""
  ).replace(/\/$/, "");
}

/** Strip `public/` prefix used in storage keys before joining to CDN base. */
export function storageKeyToObjectPath(storageKey: string) {
  return storageKey.replace(/^public\//, "");
}

/** Build a public CDN URL from a storage key like `public/properties/images/...`. */
export function expandStorageKeyToPublicUrl(storageKey: string): string {
  const base = publicCdnBaseUrl();
  if (!base) return "";

  const objectPath = storageKeyToObjectPath(storageKey.replace(/^\/+/, ""));
  if (!objectPath) return "";

  return `${base}/${objectPath}`;
}

/**
 * Resolve a value stored in PropertyImage.url to a browser-loadable https URL when possible.
 * Handles full CDN links, storage keys, and legacy `/uploads/` paths.
 */
export function resolvePublicObjectUrl(rawUrl: string): string {
  const raw = normalizeDbImageUrl(rawUrl);
  if (!raw) return "";

  if (/^data:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith("public/")) {
    return expandStorageKeyToPublicUrl(raw);
  }

  if (raw.startsWith("/uploads/") || raw.startsWith("uploads/")) {
    const legacyKey = raw.startsWith("/")
      ? `public/${raw.replace(/^\/uploads\//, "")}`
      : `public/${raw.replace(/^uploads\//, "")}`;
    return expandStorageKeyToPublicUrl(legacyKey);
  }

  // Bare object path stored in DB (e.g. properties/images/user/file.jpg).
  if (
    raw.includes("properties/images/") ||
    raw.includes("profiles/") ||
    raw.startsWith("properties/")
  ) {
    const key = raw.startsWith("public/") ? raw : `public/${raw.replace(/^\/+/, "")}`;
    return expandStorageKeyToPublicUrl(key);
  }

  return "";
}
