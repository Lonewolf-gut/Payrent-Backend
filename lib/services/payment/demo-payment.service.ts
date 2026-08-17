import { v4 as uuidv4 } from "uuid";
import type { BillingCycle, SubscriptionPlan, UserRole, WalletType } from "@prisma/client";
import { savePendingPayment } from "@/lib/services/payment/pending-payment.store";
import { getSubscriptionPrice } from "@/lib/subscription/pricing";
import { DEMO_PROVIDER_LABEL, DEMO_SETTLEMENT_NOTE } from "@/constants/demo";

export type DemoCollectionResult = {
  provider: "demo";
  reference: string;
  status: "PENDING";
  checkoutUrl: string;
  message: string;
  settlementNote: string;
  method: "CHECKOUT";
};

function buildReference(prefix: string) {
  return `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

function checkoutUrl(reference: string) {
  return `/payment/demo?reference=${encodeURIComponent(reference)}`;
}

function baseResult(reference: string, message: string): DemoCollectionResult {
  return {
    provider: "demo",
    reference,
    status: "PENDING",
    checkoutUrl: checkoutUrl(reference),
    message,
    settlementNote: DEMO_SETTLEMENT_NOTE,
    method: "CHECKOUT",
  };
}

export class DemoPaymentService {
  async requestWalletDeposit(input: {
    userId: string;
    walletType: WalletType;
    amount: number;
    description?: string;
  }): Promise<DemoCollectionResult> {
    const reference = buildReference("DEMO-WAL");
    await savePendingPayment(reference, {
      purpose: "WALLET_DEPOSIT",
      userId: input.userId,
      walletType: input.walletType,
      amount: input.amount,
      bankAccountId: "demo-checkout",
      method: "CHECKOUT",
      provider: "demo",
    });

    return baseResult(
      reference,
      `Continue to ${DEMO_PROVIDER_LABEL} to add GHS ${input.amount.toLocaleString()} to your wallet.`
    );
  }

  async requestSubscriptionPayment(input: {
    userId: string;
    role: UserRole;
    plan: SubscriptionPlan;
    billingCycle: BillingCycle;
  }): Promise<DemoCollectionResult> {
    const amount = getSubscriptionPrice(input.plan, input.billingCycle);
    const reference = buildReference("DEMO-SUB");

    await savePendingPayment(reference, {
      purpose: "SUBSCRIPTION",
      userId: input.userId,
      amount,
      provider: "demo",
      plan: input.plan,
      billingCycle: input.billingCycle,
      role: input.role,
    });

    return baseResult(
      reference,
      `Continue to ${DEMO_PROVIDER_LABEL} to pay GHS ${amount.toLocaleString()} for your subscription.`
    );
  }

  async requestListingPurchase(input: {
    userId: string;
    propertyId: string;
    propertyName: string;
    amount: number;
    referredAgentProfileId?: string | null;
  }): Promise<DemoCollectionResult> {
    const reference = buildReference("DEMO-BUY");

    await savePendingPayment(reference, {
      purpose: "LISTING_PURCHASE",
      userId: input.userId,
      amount: input.amount,
      provider: "demo",
      propertyId: input.propertyId,
      propertyName: input.propertyName,
      referredAgentProfileId: input.referredAgentProfileId,
      method: "CHECKOUT",
    });

    return baseResult(
      reference,
      `Continue to ${DEMO_PROVIDER_LABEL} to pay GHS ${input.amount.toLocaleString()} for "${input.propertyName}".`
    );
  }

  verifyCollection(reference: string) {
    return {
      provider: "demo" as const,
      reference,
      status: "PENDING" as const,
    };
  }
}

export const demoPaymentService = new DemoPaymentService();
