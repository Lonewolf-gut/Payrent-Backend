"use client";

import { SubscriptionUpgradeProvider } from "@/components/subscription/subscription-upgrade-provider";
import { SubscriptionUpgradeDialog } from "@/components/dashboard/subscription-upgrade-dialog";

export function MarketingSubscriptionShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionUpgradeProvider>
      {children}
      <SubscriptionUpgradeDialog />
    </SubscriptionUpgradeProvider>
  );
}
