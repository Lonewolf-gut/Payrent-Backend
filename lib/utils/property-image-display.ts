/** Client-safe property image URL helper (no Node storage imports). */

export type PropertyImageRecord = {
  id?: string;
  url: string;
};

/**
 * Single rule for the browser:
 * 1. data:/https: urls from the database are used directly
 * 2. everything else goes through /api/files/property-image/:id (reads DB on backend)
 */
export function resolvePropertyImageDisplayUrl(image: PropertyImageRecord): string {
  const raw = image.url?.trim() ?? "";
  if (!raw) return "";

  if (/^(https?:|data:)/i.test(raw)) {
    return raw;
  }

  if (image.id) {
    return `/api/files/property-image/${image.id}`;
  }

  return raw;
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
