/** Client-safe property image URL helper (no Node storage imports). */

import {
  expandStorageKeyToPublicUrl,
  normalizeDbImageUrl,
  resolvePublicObjectUrl,
} from "@/lib/utils/public-storage-url";
import { isPropertyImageStorageReference } from "@/lib/utils/property-image-storage";

export type PropertyImageRecord = {
  id?: string;
  url: string;
};

export { normalizeDbImageUrl };

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

  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1 && normalized.includes("/storage/v1/object/")) {
    normalized = normalized.slice(0, queryIndex);
  }

  return normalized;
}

/** Expand partial Supabase Storage paths to a full public URL (optional). */
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
 * Storage keys always go through the API route so the backend can read R2/S3 with credentials.
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

  // Storage key or legacy path — backend serves bytes (works with private R2 buckets).
  if (isPropertyImageStorageReference(raw) && image.id) {
    return propertyImageApiPath(image.id);
  }

  const cdnUrl = resolvePublicObjectUrl(raw);
  if (cdnUrl) {
    return cdnUrl;
  }

  const supabaseUrl = expandSupabaseStorageUrl(raw);
  if (/^https?:\/\//i.test(supabaseUrl) && supabaseUrl !== raw) {
    return supabaseUrl;
  }

  if (raw.startsWith("/uploads/") || raw.startsWith("uploads/")) {
    if (image.id) return propertyImageApiPath(image.id);
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  if (raw.startsWith("public/")) {
    const fromKey = expandStorageKeyToPublicUrl(raw);
    if (fromKey) return fromKey;
    if (image.id) return propertyImageApiPath(image.id);
  }

  if (image.id) {
    return propertyImageApiPath(image.id);
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

export { expandStorageKeyToPublicUrl, resolvePublicObjectUrl };
