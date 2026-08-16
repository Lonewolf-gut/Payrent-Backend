/** Client-safe property image URL helper (no Node storage imports). */

export type PropertyImageRecord = {
  id?: string;
  url: string;
};

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

function supabaseProjectUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");
}

/** Prefer public Supabase Storage URLs (authenticated/sign URLs fail in img tags). */
export function normalizeSupabasePublicUrl(url: string): string {
  if (!url || !url.includes("supabase.co")) return url;

  let normalized = url.replace("/storage/v1/object/authenticated/", "/storage/v1/object/public/");
  normalized = normalized.replace("/storage/v1/object/sign/", "/storage/v1/object/public/");

  // Drop query params from signed URLs so the public object path is used.
  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1 && normalized.includes("/storage/v1/object/")) {
    normalized = normalized.slice(0, queryIndex);
  }

  return normalized;
}

/** Expand partial Supabase Storage paths to a full public URL. */
export function expandSupabaseStorageUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return normalizeSupabasePublicUrl(url);

  const project = supabaseProjectUrl();
  if (!project) return url;

  if (url.includes("/storage/v1/object/")) {
    const absolute = url.startsWith("/") ? `${project}${url}` : `${project}/${url}`;
    return normalizeSupabasePublicUrl(absolute);
  }

  const bucket =
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ??
    process.env.SUPABASE_STORAGE_BUCKET ??
    "property-images";

  const objectPath = url.replace(/^\/+/, "");
  if (objectPath.startsWith("storage/v1/object/")) {
    return normalizeSupabasePublicUrl(`${project}/${objectPath}`);
  }

  return normalizeSupabasePublicUrl(
    `${project}/storage/v1/object/public/${bucket}/${objectPath}`
  );
}

export function isDirectlyLoadableImageUrl(url: string): boolean {
  if (!url) return false;
  if (/^data:/i.test(url)) return true;
  if (/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("/uploads/")) return true;
  if (url.startsWith("/api/files/property-image/")) return true;
  return false;
}

export function propertyImageApiPath(imageId: string) {
  return `/api/files/property-image/${imageId}`;
}

/**
 * Final browser URL for a PropertyImage row.
 * Uses loadable URLs from the database when possible; otherwise the API route by id.
 */
export function resolvePropertyImageDisplayUrl(image: PropertyImageRecord): string {
  const raw = normalizeDbImageUrl(image.url);
  if (!raw) {
    return image.id ? propertyImageApiPath(image.id) : "";
  }

  if (/^data:/i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    return normalizeSupabasePublicUrl(raw);
  }

  const supabaseUrl = expandSupabaseStorageUrl(raw);
  if (/^https?:\/\//i.test(supabaseUrl) && supabaseUrl !== raw) {
    return supabaseUrl;
  }
  if (/^https?:\/\//i.test(supabaseUrl)) {
    return supabaseUrl;
  }

  if (raw.startsWith("/uploads/") || raw.startsWith("uploads/")) {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  if (image.id) {
    return propertyImageApiPath(image.id);
  }

  if (/^https?:\/\//i.test(supabaseUrl)) {
    return supabaseUrl;
  }

  return raw;
}

export function withPropertyImageDisplayUrls<
  T extends { images?: Array<PropertyImageRecord & { alt?: string | null }> | null },
>(property: T): T {
  if (!property.images?.length) return property;

  return {
    ...property,
    images: property.images.map((image) => {
      const src = resolvePropertyImageDisplayUrl(image);
      return {
        ...image,
        src,
        displayUrl: src,
      };
    }),
  };
}

export function withPropertyListImageDisplayUrls<
  T extends { images?: Array<PropertyImageRecord> | null },
>(properties: T[]) {
  return properties.map(withPropertyImageDisplayUrls);
}
