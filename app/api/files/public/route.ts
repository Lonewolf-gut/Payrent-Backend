import { NextRequest, NextResponse } from "next/server";
import { getStorageDriver, isS3StorageConfigured } from "@/lib/storage/config";
import { getLocalPublicUrl } from "@/lib/storage/local-storage";
import { normalizePublicPropertyImageRef } from "@/lib/storage/public-assets";
import { getS3SignedUrl } from "@/lib/storage/s3-storage";

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref?.trim()) {
    return NextResponse.json({ success: false, message: "Missing ref." }, { status: 400 });
  }

  const storageKey = normalizePublicPropertyImageRef(ref);
  if (!storageKey) {
    return NextResponse.json({ success: false, message: "Invalid property image reference." }, { status: 400 });
  }

  const driver = getStorageDriver();
  if (driver === "s3" && isS3StorageConfigured()) {
    const signedUrl = await getS3SignedUrl(storageKey);
    return NextResponse.redirect(signedUrl, 307);
  }

  const localPath = getLocalPublicUrl(storageKey);
  if (!localPath) {
    return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });
  }

  return NextResponse.redirect(`${req.nextUrl.origin}${localPath}`, 307);
}