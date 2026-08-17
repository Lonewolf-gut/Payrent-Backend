import { NextRequest } from "next/server";
import { getPaymentProvider, isPaymentCollectionConfigured } from "@/lib/services/payment/provider";
import { isDemoMode, DEMO_PROVIDER_LABEL, DEMO_SETTLEMENT_NOTE } from "@/lib/config/demo";
import { apiResponse } from "@/lib/api/handler";

export async function GET() {
  const provider = getPaymentProvider();

  return apiResponse({
    provider,
    isDemo: provider === "demo" || isDemoMode(),
    collectionConfigured: isPaymentCollectionConfigured(),
    demoProviderLabel: DEMO_PROVIDER_LABEL,
    settlementNote: DEMO_SETTLEMENT_NOTE,
    usesCheckoutForListings: provider === "demo",
    usesWalletForListings: provider !== "demo",
  });
}
