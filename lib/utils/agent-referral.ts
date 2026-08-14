import { AGENT_REFERRAL_COOKIE } from "@/lib/constants/agent-referral-cookie";

export function parseAgentReferralCode(cookieHeader?: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${AGENT_REFERRAL_COOKIE}=`)) {
      const value = decodeURIComponent(part.slice(AGENT_REFERRAL_COOKIE.length + 1));
      return value || null;
    }
  }
  return null;
}

export function getReferralDestinationPath(propertyId?: string | null) {
  return propertyId ? `/properties/${propertyId}` : "/";
}

export function buildReferralUrl(origin: string, code: string) {
  return new URL(`/r/${encodeURIComponent(code)}`, origin).toString();
}

/** @deprecated Use buildReferralUrl — long-form URLs are kept for backwards compatibility. */
export function buildLegacyReferralUrl(origin: string, code: string, propertyId?: string) {
  const base = propertyId ? `${origin}/properties/${propertyId}` : origin;
  const url = new URL(base);
  url.searchParams.set("ref", code);
  return url.toString();
}
