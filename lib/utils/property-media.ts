import { getPublicAssetBaseUrl } from "@/lib/storage/config";
import { getPublicFileUrl } from "@/lib/storage/index";
import {
  expandSupabaseStorageUrl,
  isDirectlyLoadableImageUrl,
  normalizeDbImageUrl,
  normalizeSupabasePublicUrl,
  propertyImageApiPath,
  resolvePropertyImageDisplayUrl,
} from "@/lib/utils/property-image-display";
import { isPropertyImageStorageReference } from "@/lib/utils/property-image-storage";
import { resolvePublicObjectUrl } from "@/lib/utils/public-storage-url";
import {
  isLegacyPublicUploadPath,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";

type ImageRecord = { id?: string; url: string };

/** Server-side resolver: API route for storage keys; CDN/https for direct links. */
export function resolvePropertyImageUrlForResponse(image: ImageRecord): string {
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

  if (isPropertyImageStorageReference(raw) && image.id) {
    return propertyImageApiPath(image.id);
  }

  const cdnUrl = resolvePublicObjectUrl(raw);
  if (cdnUrl) {
    return cdnUrl;
  }

  const supabaseUrl = expandSupabaseStorageUrl(raw);
  if (/^https?:\/\//i.test(supabaseUrl)) {
    return supabaseUrl;
  }

  const publicUrl = getPublicFileUrl(normalizeStoredFileReference(raw));
  if (publicUrl && isDirectlyLoadableImageUrl(publicUrl)) {
    return publicUrl.startsWith("http") ? normalizeSupabasePublicUrl(publicUrl) : publicUrl;
  }

  if (image.id) {
    return propertyImageApiPath(image.id);
  }

  return resolvePropertyImageDisplayUrl(image);
}

function mapPropertyImages<
  T extends { images?: Array<ImageRecord & { alt?: string | null }> | null },
>(property: T): T {
  if (!property.images?.length) return property;

  return {
    ...property,
    images: property.images.map((image) => {
      const src = resolvePropertyImageUrlForResponse(image);
      return {
        ...image,
        src,
        displayUrl: src,
      };
    }),
  };
}

export function withResolvedPropertyImages<
  T extends { images?: Array<ImageRecord & { alt?: string | null }> | null },
>(property: T) {
  return mapPropertyImages(property);
}

export function withResolvedPropertyListImages<
  T extends { images?: Array<ImageRecord> | null },
>(properties: T[]) {
  return properties.map(mapPropertyImages);
}

export const resolvePropertyImageUrl = resolvePropertyImageUrlForResponse;

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

export function getPropertyImageCdnBaseUrl() {
  return getPublicAssetBaseUrl();
}

export { isPropertyImageStorageReference } from "@/lib/utils/property-image-storage";
