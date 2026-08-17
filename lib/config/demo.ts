import { getPaymentProvider } from "@/lib/services/payment/provider";

export { DEMO_PROVIDER_LABEL, DEMO_SETTLEMENT_NOTE } from "@/constants/demo";

/** Demo / staging flows without live bank or payment API partners. */
export function isDemoMode() {
  if (process.env.DEMO_MODE?.trim().toLowerCase() === "true") return true;
  return getPaymentProvider() === "demo";
}

export function isDemoPaymentProvider() {
  return getPaymentProvider() === "demo";
}
