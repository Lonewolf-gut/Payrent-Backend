import { completeWalletDeposit } from "@/lib/services/payment/payment-completion.service";
import { completeSubscriptionPayment } from "@/lib/services/payment/subscription-completion.service";
import { propertyPurchaseService } from "@/lib/services/property-purchase.service";
import {
  deletePendingPayment,
  getCompletedPayment,
  getPendingPayment,
  markPaymentCompleted,
  type ListingPurchasePendingSession,
} from "@/lib/services/payment/pending-payment.store";
import { settlementAccountService } from "@/lib/services/payment/settlement-account.service";
import { logger } from "@/lib/logger";

export type DemoCompletionResult = {
  purpose: "WALLET_DEPOSIT" | "SUBSCRIPTION" | "LISTING_PURCHASE";
  alreadyProcessed?: boolean;
  checkoutUrl?: string;
  settlementAccount?: {
    bankName: string;
    accountName: string;
    accountNumberMasked: string;
  };
};

export async function completeDemoPayment(
  clientReference: string,
  userId: string
): Promise<DemoCompletionResult> {
  const session = await getPendingPayment(clientReference);

  if (!session) {
    const completed = await getCompletedPayment<{ purpose?: string }>(clientReference);
    if (completed) {
      return {
        purpose: (completed.purpose as DemoCompletionResult["purpose"]) ?? "WALLET_DEPOSIT",
        alreadyProcessed: true,
      };
    }
    throw new Error("Payment session not found or expired");
  }

  if (session.userId !== userId) {
    throw new Error("Payment session does not belong to this account");
  }

  const settlementAccount = await settlementAccountService.getDefaultAccount();
  const settlementMeta = settlementAccount
    ? {
        bankName: settlementAccount.bankName,
        accountName: settlementAccount.accountName,
        accountNumberMasked: `****${settlementAccount.accountNumber.slice(-4)}`,
      }
    : {
        bankName: "Demo Collection Bank",
        accountName: "PayForMe Platform Admin",
        accountNumberMasked: "****0001",
      };

  if (session.purpose === "WALLET_DEPOSIT") {
    const result = await completeWalletDeposit({
      clientReference,
      amount: session.amount,
      provider: "demo",
      description: `Demo checkout deposit — ${clientReference}`,
      metadata: {
        demo: true,
        settlementAccount: settlementMeta,
      },
      userId: session.userId,
      walletType: session.walletType,
    });

    await markPaymentCompleted(clientReference, { purpose: "WALLET_DEPOSIT" });

    return {
      purpose: "WALLET_DEPOSIT",
      alreadyProcessed: result.alreadyProcessed,
      settlementAccount: settlementMeta,
    };
  }

  if (session.purpose === "SUBSCRIPTION") {
    const result = await completeSubscriptionPayment({
      clientReference,
      amount: session.amount,
      provider: "demo",
      metadata: {
        demo: true,
        settlementAccount: settlementMeta,
      },
    });

    return {
      purpose: "SUBSCRIPTION",
      alreadyProcessed: result.alreadyProcessed,
      settlementAccount: settlementMeta,
    };
  }

  if (session.purpose === "LISTING_PURCHASE") {
    const listingSession = session as ListingPurchasePendingSession;
    const completed = await getCompletedPayment<{ propertyId: string }>(clientReference);
    if (completed) {
      return {
        purpose: "LISTING_PURCHASE",
        alreadyProcessed: true,
        settlementAccount: settlementMeta,
      };
    }

    const purchase = await propertyPurchaseService.purchaseViaProvider(
      listingSession.userId,
      listingSession.propertyId,
      clientReference,
      listingSession.referredAgentProfileId
    );

    await markPaymentCompleted(clientReference, {
      purpose: "LISTING_PURCHASE",
      propertyId: listingSession.propertyId,
      purchaseReference: purchase.reference,
    });
    await deletePendingPayment(clientReference);

    logger.info("Demo listing purchase completed", {
      clientReference,
      propertyId: listingSession.propertyId,
      amount: listingSession.amount,
    });

    return {
      purpose: "LISTING_PURCHASE",
      settlementAccount: settlementMeta,
    };
  }

  throw new Error("Unsupported payment session");
}

export async function getDemoPaymentSession(clientReference: string, userId: string) {
  const session = await getPendingPayment(clientReference);
  if (!session || session.userId !== userId) return null;

  const settlementAccount = await settlementAccountService.getDefaultAccount();

  return {
    reference: clientReference,
    purpose: session.purpose,
    amount: session.amount,
    provider: "demo" as const,
    settlementAccount: settlementAccount
      ? {
          bankName: settlementAccount.bankName,
          accountName: settlementAccount.accountName,
          accountNumberMasked: `****${settlementAccount.accountNumber.slice(-4)}`,
        }
      : {
          bankName: "Demo Collection Bank",
          accountName: "PayForMe Platform Admin",
          accountNumberMasked: "****0001",
        },
    propertyName:
      session.purpose === "LISTING_PURCHASE"
        ? (session as ListingPurchasePendingSession).propertyName
        : undefined,
    plan: session.purpose === "SUBSCRIPTION" ? session.plan : undefined,
  };
}
