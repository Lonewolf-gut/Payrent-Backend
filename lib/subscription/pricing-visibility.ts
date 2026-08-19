import type { UserRole } from "@prisma/client";

/** Subscription/pricing marketing is shown only to merchants and affiliates when signed in. */
export function showMerchantAgentPricing(role?: UserRole | null) {
  return role === "MERCHANT" || role === "MARKETER";
}
