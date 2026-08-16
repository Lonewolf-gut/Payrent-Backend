import { NextRequest, NextResponse } from "next/server";
import { AGENT_REFERRAL_COOKIE } from "@/lib/constants/agent-referral-cookie";
import { resolveReferralRedirect } from "@/lib/utils/referral-resolve-client";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const resolved = await resolveReferralRedirect(req, code);

  if (!resolved) {
    return NextResponse.redirect(new URL("/referral/unavailable", req.url));
  }

  const destination = new URL(resolved.redirectPath, req.url);
  if (resolved.code) {
    destination.searchParams.set("ref", resolved.code);
  }
  const response = NextResponse.redirect(destination);

  response.cookies.set(AGENT_REFERRAL_COOKIE, resolved.code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}
