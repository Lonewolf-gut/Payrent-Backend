import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getStorageDriver, isS3StorageConfigured } from "@/lib/storage/config";
import { readLocalFile } from "@/lib/storage/local-storage";
import { getS3PublicUrl } from "@/lib/storage/s3-storage";
import { resolvePublicStorageKeyFromRequest } from "@/lib/utils/property-media";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/** Serve public uploads (property images, profile photos) without auth. */
export async function GET(req: NextRequest) {
  const pathParam = req.nextUrl.searchParams.get("path");
  const keyParam = req.nextUrl.searchParams.get("key");

  const storageKey = resolvePublicStorageKeyFromRequest(pathParam, keyParam);
  if (!storageKey) {
    return NextResponse.json({ error: "Invalid public file request." }, { status: 400 });
  }

  if (getStorageDriver() === "s3" && isS3StorageConfigured()) {
    const s3Url = getS3PublicUrl(storageKey);
    if (s3Url) {
      return NextResponse.redirect(s3Url, 307);
    }
  }

  try {
    const body = await readLocalFile(storageKey);
    const ext = path.extname(storageKey).toLowerCase();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
