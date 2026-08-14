import type { NextRequest } from "next/server";

export function getAppOrigin(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
}
