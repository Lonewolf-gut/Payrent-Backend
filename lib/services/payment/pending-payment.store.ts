import type { BillingCycle, SubscriptionPlan, UserRole, WalletType } from "@prisma/client";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis/client";

export type PendingPaymentPurpose = "WALLET_DEPOSIT" | "SUBSCRIPTION" | "LISTING_PURCHASE";
export type PendingPaymentMethod = "MOMO" | "BANK" | "CHECKOUT";

type PendingPaymentBase = {
  userId: string;
  amount: number;
  provider: "hubtel" | "paystack" | "momo" | "demo";
  momoReferenceId?: string;
};

export type WalletDepositPendingSession = PendingPaymentBase & {
  purpose: "WALLET_DEPOSIT";
  walletType: WalletType;
  bankAccountId: string;
  method: PendingPaymentMethod;
  phone?: string;
};

export type SubscriptionPendingSession = PendingPaymentBase & {
  purpose: "SUBSCRIPTION";
  plan: SubscriptionPlan;
  billingCycle: BillingCycle;
  role: UserRole;
};

export type ListingPurchasePendingSession = PendingPaymentBase & {
  purpose: "LISTING_PURCHASE";
  propertyId: string;
  propertyName: string;
  referredAgentProfileId?: string | null;
  method: PendingPaymentMethod;
};

export type PendingPaymentSession =
  | WalletDepositPendingSession
  | SubscriptionPendingSession
  | ListingPurchasePendingSession;

const PREFIX = "payment:pending:";

export async function savePendingPayment(
  clientReference: string,
  session: PendingPaymentSession
) {
  await cacheSet(`${PREFIX}${clientReference}`, session, 60 * 60 * 24);
}

export async function getPendingPayment(clientReference: string) {
  return cacheGet<PendingPaymentSession>(`${PREFIX}${clientReference}`);
}

export async function deletePendingPayment(clientReference: string) {
  await cacheDel(`${PREFIX}${clientReference}`);
}

const COMPLETED_PREFIX = "payment:completed:";

export async function markPaymentCompleted<T>(clientReference: string, result: T) {
  await cacheSet(`${COMPLETED_PREFIX}${clientReference}`, result, 60 * 60 * 24 * 7);
}

export async function getCompletedPayment<T>(clientReference: string) {
  return cacheGet<T>(`${COMPLETED_PREFIX}${clientReference}`);
}
