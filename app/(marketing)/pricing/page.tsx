import { Suspense } from "react";
import { SubscriptionCheckoutPage } from "@/components/subscription/subscription-checkout-page";

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-emerald-900/60">Loading plans…</div>}>
      <SubscriptionCheckoutPage />
    </Suspense>
  );
}
