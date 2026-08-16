import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { getStorageDriver, isS3StorageConfigured } from "@/lib/storage/config";
import { getPublicFileUrl } from "@/lib/storage/index";
import {
  isLegacyPublicUploadPath,
  isStorageKey,
  legacyPathToStorageKey,
  normalizeStoredFileReference,
} from "@/lib/storage/keys";
import { readLocalFile } from "@/lib/storage/local-storage";
import {
  bufferToDataUrl,
  DATA_URL_MAX_BYTES,
  mimeFromStorageKey,
} from "@/lib/storage/property-image-url";
import { getS3PublicUrl } from "@/lib/storage/s3-storage";
import {
  expandSupabaseStorageUrl,
  normalizeDbImageUrl,
  normalizeSupabasePublicUrl,
} from "@/lib/utils/property-image-display";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function looksLikeBase64(value: string) {
  return value.length > 128 && /^[A-Za-z0-9+/=\r\n]+$/.test(value.slice(0, 256));
}

function parseDataUrl(url: string) {
  if (!url.startsWith("data:")) return null;

  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return null;

  const meta = url.slice(0, commaIndex);
  const data = url.slice(commaIndex + 1);
  const mime = meta.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg";
  const buffer = meta.includes(";base64")
    ? Buffer.from(data.replace(/\s/g, ""), "base64")
    : Buffer.from(decodeURIComponent(data));

  return { buffer, mime };
}

function storageKeyFromDbUrl(url: string): string | null {
  const trimmed = url.trim();

  if (isLegacyPublicUploadPath(trimmed)) {
    const key = legacyPathToStorageKey(trimmed);
    return key.startsWith("public/") ? key : null;
  }

  if (trimmed.startsWith("uploads/")) {
    const key = legacyPathToStorageKey(`/${trimmed}`);
    return key.startsWith("public/") ? key : null;
  }

  if (isStorageKey(trimmed)) {
    return trimmed.startsWith("public/") ? trimmed : null;
  }

  const normalized = normalizeStoredFileReference(trimmed);
  return normalized.startsWith("public/") ? normalized : null;
}

function imageResponse(buffer: Buffer, mime: string) {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

async function serveStorageKey(storageKey: string) {
  if (getStorageDriver() === "s3" && isS3StorageConfigured()) {
    const s3Url = getS3PublicUrl(storageKey);
    if (s3Url) return NextResponse.redirect(s3Url, 307);
  }

  const body = await readLocalFile(storageKey);
  const mime = mimeFromStorageKey(storageKey);
  return imageResponse(body, MIME_BY_EXT[path.extname(storageKey).toLowerCase()] ?? mime);
}

async function materializeLegacyImage(id: string, storageKey: string) {
  const body = await readLocalFile(storageKey);
  const mime = MIME_BY_EXT[path.extname(storageKey).toLowerCase()] ?? mimeFromStorageKey(storageKey);

  if (body.length <= DATA_URL_MAX_BYTES) {
    const dataUrl = bufferToDataUrl(body, mime);
    await prisma.propertyImage.update({
      where: { id },
      data: { url: dataUrl },
    });
  }

  return imageResponse(body, mime);
}

async function fetchRemoteImage(url: string) {
  const normalized = normalizeSupabasePublicUrl(url);
  const response = await fetch(normalized, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Remote image fetch failed (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mime =
    response.headers.get("content-type")?.split(";")[0]?.trim() ??
    MIME_BY_EXT[path.extname(new URL(normalized).pathname).toLowerCase()] ??
    "image/jpeg";

  return imageResponse(buffer, mime);
}

function resolveRemoteUrl(url: string): string | null {
  const raw = normalizeDbImageUrl(url);
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return normalizeSupabasePublicUrl(raw);
  }

  const expanded = expandSupabaseStorageUrl(raw);
  if (/^https?:\/\//i.test(expanded)) {
    return expanded;
  }

  const publicUrl = getPublicFileUrl(normalizeStoredFileReference(raw));
  if (publicUrl?.startsWith("http")) {
    return normalizeSupabasePublicUrl(publicUrl);
  }

  return null;
}

/** Load a property image using the url stored on the PropertyImage database row. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const image = await prisma.propertyImage.findUnique({
    where: { id },
    select: { url: true },
  });

  if (!image?.url?.trim()) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const url = normalizeDbImageUrl(image.url);

  const remoteUrl = resolveRemoteUrl(url);
  if (remoteUrl) {
    try {
      return await fetchRemoteImage(remoteUrl);
    } catch {
      return NextResponse.redirect(remoteUrl, 307);
    }
  }

  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return imageResponse(dataUrl.buffer, dataUrl.mime);
  }

  if (looksLikeBase64(url)) {
    return imageResponse(Buffer.from(url.replace(/\s/g, ""), "base64"), "image/jpeg");
  }

  const storageKey = storageKeyFromDbUrl(url);
  if (storageKey) {
    try {
      return await materializeLegacyImage(id, storageKey);
    } catch {
      try {
        return await serveStorageKey(storageKey);
      } catch {
        const publicPath = getPublicFileUrl(storageKey);
        if (publicPath?.startsWith("http")) {
          try {
            return await fetchRemoteImage(publicPath);
          } catch {
            return NextResponse.redirect(publicPath, 307);
          }
        }
      }
    }
  }

  const publicPath = getPublicFileUrl(normalizeStoredFileReference(url));
  if (publicPath?.startsWith("http")) {
    try {
      return await fetchRemoteImage(publicPath);
    } catch {
      return NextResponse.redirect(publicPath, 307);
    }
  }

  if (publicPath?.startsWith("/uploads/")) {
    const key = legacyPathToStorageKey(publicPath);
    if (key.startsWith("public/")) {
      try {
        return await materializeLegacyImage(id, key);
      } catch {
        try {
          return await serveStorageKey(key);
        } catch {
          // fall through
        }
      }
    }
  }

  return NextResponse.json(
    {
      error:
        "Image file missing on server. Edit the listing and re-upload the photos once.",
    },
    { status: 404 }
  );
}
