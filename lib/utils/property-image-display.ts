/** Client-safe property image URL helper (no Node storage imports). */

export type PropertyImageRecord = {
  id?: string;
  url: string;
};

function backendPublicOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(":3000", ":3001")
  )?.replace(/\/$/, "");
}

/**
 * Build the URL the browser should load for a PropertyImage row.
 * Uses the database `url` column directly when it is already absolute or a data URL.
 */
export function resolvePropertyImageDisplayUrl(image: PropertyImageRecord): string {
  const raw = image.url?.trim() ?? "";
  if (!raw) return "";

  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/api/files/")) {
    return raw;
  }

  const backend = backendPublicOrigin();

  if (raw.startsWith("/uploads/")) {
    return backend ? `${backend}${raw}` : fallbackApiImageUrl(image);
  }

  if (raw.startsWith("uploads/")) {
    const path = `/${raw}`;
    return backend ? `${backend}${path}` : fallbackApiImageUrl(image);
  }

  if (raw.startsWith("public/")) {
    const uploadPath = `/uploads/${raw.replace(/^public\//, "")}`;
    return backend ? `${backend}${uploadPath}` : fallbackApiImageUrl(image);
  }

  return fallbackApiImageUrl(image) || raw;
}

function fallbackApiImageUrl(image: PropertyImageRecord) {
  if (!image.id) return "";
  return `/api/files/property-image/${image.id}`;
}

export function withPropertyImageDisplayUrls<
  T extends { images?: Array<PropertyImageRecord & { alt?: string | null }> | null },
>(property: T): T {
  if (!property.images?.length) return property;

  return {
    ...property,
    images: property.images.map((image) => ({
      ...image,
      displayUrl: resolvePropertyImageDisplayUrl(image),
    })),
  };
}

export function withPropertyListImageDisplayUrls<
  T extends { images?: Array<PropertyImageRecord> | null },
>(properties: T[]) {
  return properties.map(withPropertyImageDisplayUrls);
}
