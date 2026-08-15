import type { NextRequest } from "next/server";

/** Public site origin for customer-facing links (always the frontend, not the API server). */
export function getCustomerAppOrigin(req?: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (req) {
    const origin = req.nextUrl.origin;
    if (origin.endsWith(":3001")) {
      return origin.replace(/:3001$/, ":3000");
    }
    return origin;
  }

  return "http://localhost:3000";
}
