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
import { getS3PublicUrl } from "@/lib/storage/s3-storage";

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

async function serveStorageKey(storageKey: string) {
  if (getStorageDriver() === "s3" && isS3StorageConfigured()) {
    const s3Url = getS3PublicUrl(storageKey);
    if (s3Url) return NextResponse.redirect(s3Url, 307);
  }

  const body = await readLocalFile(storageKey);
  const ext = path.extname(storageKey).toLowerCase();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

/** Load a property image using the url stored on the PropertyImage database row. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const image = await prisma.propertyImage.findUnique({
    where: { id },
    select: { url: true, alt: true },
  });

  if (!image?.url?.trim()) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const url = image.url.trim();

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return NextResponse.redirect(url, 307);
  }

  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return new NextResponse(dataUrl.buffer, {
      status: 200,
      headers: {
        "Content-Type": dataUrl.mime,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  if (looksLikeBase64(url)) {
    return new NextResponse(Buffer.from(url.replace(/\s/g, ""), "base64"), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  const storageKey = storageKeyFromDbUrl(url);
  if (storageKey) {
    try {
      return await serveStorageKey(storageKey);
    } catch {
      // Fall through to public URL helper below.
    }
  }

  const publicPath = getPublicFileUrl(normalizeStoredFileReference(url));
  if (publicPath?.startsWith("http")) {
    return NextResponse.redirect(publicPath, 307);
  }

  if (publicPath?.startsWith("/uploads/")) {
    const key = legacyPathToStorageKey(publicPath);
    if (key.startsWith("public/")) {
      try {
        return await serveStorageKey(key);
      } catch {
        return NextResponse.json({ error: "Image file not found." }, { status: 404 });
      }
    }
  }

  return NextResponse.json({ error: "Unsupported image reference." }, { status: 404 });
}
