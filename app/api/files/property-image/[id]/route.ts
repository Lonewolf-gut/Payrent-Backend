import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { getStorageDriver, isS3StorageConfigured } from "@/lib/storage/config";
import { getPublicFileUrl } from "@/lib/storage/index";
import { legacyPathToStorageKey } from "@/lib/storage/keys";
import { readLocalFile } from "@/lib/storage/local-storage";
import {
  bufferToDataUrl,
  DATA_URL_MAX_BYTES,
  mimeFromStorageKey,
} from "@/lib/storage/property-image-url";
import { getS3PublicUrl, readFromS3 } from "@/lib/storage/s3-storage";
import { normalizeDbImageUrl } from "@/lib/utils/public-storage-url";
import {
  getPropertyImageCdnBaseUrl,
  normalizePropertyImageStorageKey,
  storageKeyFromCdnBaseUrl,
  storageKeyFromHttpsPath,
} from "@/lib/utils/property-image-storage";

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

function imageResponse(buffer: Buffer, mime: string) {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

function mimeForKey(storageKey: string, fallback?: string) {
  return (
    MIME_BY_EXT[path.extname(storageKey).toLowerCase()] ??
    fallback ??
    mimeFromStorageKey(storageKey)
  );
}

async function serveFromS3(storageKey: string) {
  const { buffer, mime } = await readFromS3(storageKey);
  return imageResponse(buffer, mimeForKey(storageKey, mime));
}

async function serveStorageKey(id: string, storageKey: string) {
  const useS3 = getStorageDriver() === "s3" && isS3StorageConfigured();

  if (useS3) {
    try {
      return await serveFromS3(storageKey);
    } catch {
      const cdnUrl = getS3PublicUrl(storageKey);
      if (cdnUrl) {
        try {
          return await fetchRemoteImage(cdnUrl);
        } catch {
          return NextResponse.redirect(cdnUrl, 307);
        }
      }
      throw new Error("Storage object not found.");
    }
  }

  try {
    const body = await readLocalFile(storageKey);
    const mime = mimeForKey(storageKey);
    if (body.length <= DATA_URL_MAX_BYTES) {
      await prisma.propertyImage.update({
        where: { id },
        data: { url: bufferToDataUrl(body, mime) },
      });
    }
    return imageResponse(body, mime);
  } catch {
    throw new Error("Storage object not found.");
  }
}

async function fetchRemoteImage(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Remote image fetch failed (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mime =
    response.headers.get("content-type")?.split(";")[0]?.trim() ??
    MIME_BY_EXT[path.extname(new URL(url).pathname).toLowerCase()] ??
    "image/jpeg";

  return imageResponse(buffer, mime);
}

async function serveHttpsUrl(_id: string, url: string) {
  try {
    return await fetchRemoteImage(url);
  } catch {
    const cdnBase = getPropertyImageCdnBaseUrl();
    const storageKey =
      (cdnBase ? storageKeyFromCdnBaseUrl(url, cdnBase) : null) ??
      storageKeyFromHttpsPath(url);

    if (storageKey && getStorageDriver() === "s3" && isS3StorageConfigured()) {
      try {
        return await serveFromS3(storageKey);
      } catch {
        // fall through
      }
    }
    return NextResponse.redirect(url, 307);
  }
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

  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return imageResponse(dataUrl.buffer, dataUrl.mime);
  }

  if (looksLikeBase64(url)) {
    return imageResponse(Buffer.from(url.replace(/\s/g, ""), "base64"), "image/jpeg");
  }

  if (/^https?:\/\//i.test(url)) {
    return serveHttpsUrl(id, url);
  }

  const storageKey = normalizePropertyImageStorageKey(url);
  if (storageKey) {
    try {
      return await serveStorageKey(id, storageKey);
    } catch {
      const publicPath = getPublicFileUrl(storageKey);
      if (publicPath?.startsWith("http")) {
        return serveHttpsUrl(id, publicPath);
      }
      if (publicPath?.startsWith("/uploads/")) {
        const key = legacyPathToStorageKey(publicPath);
        if (key.startsWith("public/")) {
          try {
            return await serveStorageKey(id, key);
          } catch {
            // fall through
          }
        }
      }
    }
  }

  return NextResponse.json(
    {
      error:
        "Image file missing on server. Check STORAGE_DRIVER and R2 credentials on PayRent-Backend, then re-upload if needed.",
    },
    { status: 404 }
  );
}
