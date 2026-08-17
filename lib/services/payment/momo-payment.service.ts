import { v4 as uuidv4 } from "uuid";
import type { BillingCycle, SubscriptionPlan, UserRole, WalletType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { momoService } from "@/lib/services/payment/momo.service";
import { getPendingPayment, savePendingPayment } from "@/lib/services/payment/pending-payment.store";
import {
  getDepositPhoneFromAccount,
  getVerifiedUserBankAccount,
} from "@/lib/services/payment/bank-account-payment";
import { getSubscriptionPrice } from "@/lib/subscription/pricing";

export type MomoDepositRequest = {
  userId: string;
  walletType: WalletType;
  amount: number;
  bankAccountId: string;
  description?: string;
};

export type MomoCollectionResult = {
  provider: "momo" | "sandbox";
  reference: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  message?: string;
  externalId?: string;
  method?: "MOMO" | "BANK";
};

export class MomoPaymentService {
  private buildReference(prefix: string) {
    return `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
  }

  async requestWalletDepositFromAccount(
    input: MomoDepositRequest
  ): Promise<MomoCollectionResult> {
    const account = await getVerifiedUserBankAccount(input.userId, input.bankAccountId);
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true },
    });

    const phone = getDepositPhoneFromAccount(account, user?.phone);
    const reference = this.buildReference("MOMO");
    const method = account.accountType === "MOMO" ? "MOMO" : "BANK";

    if (account.accountType !== "MOMO") {
      return {
        provider: "momo",
        reference,
        status: "FAILED",
        method,
        message:
          "Bank deposits are processed through partner bank APIs. Add a verified MoMo account in Settings to deposit via Mobile Money.",
      };
    }

    await savePendingPayment(reference, {
      purpose: "WALLET_DEPOSIT",
      userId: input.userId,
      walletType: input.walletType,
      amount: input.amount,
      bankAccountId: account.id,
      method,
      phone,
      provider: "momo",
      momoReferenceId: payment.momoReferenceId,
    });

    const payment = await momoService.requestPayment({
      amount: input.amount,
      phone,
      reference,
      description: input.description ?? "PayForMe wallet deposit",
    });

    return {
      provider: payment.status === "FAILED" ? "momo" : "momo",
      reference: payment.reference,
      status: payment.status,
      message:
        payment.message ??
        "Approve the MoMo prompt on your phone. You will receive a notification when the deposit completes.",
      externalId: payment.externalId,
      method,
    };
  }

  async requestSubscriptionPayment(input: {
    userId: string;
    role: UserRole;
    plan: SubscriptionPlan;
    billingCycle: BillingCycle;
    bankAccountId: string;
  }) {
    const account = await getVerifiedUserBankAccount(input.userId, input.bankAccountId);
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true },
    });

    if (account.accountType !== "MOMO") {
      throw new Error("Subscriptions are paid via verified Mobile Money accounts only.");
    }

    const phone = getDepositPhoneFromAccount(account, user?.phone);
    const amount = getSubscriptionPrice(input.plan, input.billingCycle);
    const reference = this.buildReference("SUB");

    await savePendingPayment(reference, {
      purpose: "SUBSCRIPTION",
      userId: input.userId,
      amount,
      provider: "momo",
      plan: input.plan,
      billingCycle: input.billingCycle,
      role: input.role,
      momoReferenceId: payment.momoReferenceId,
    });

    const payment = await momoService.requestPayment({
      amount,
      phone,
      reference,
      description: `PayForMe ${input.plan} subscription`,
    });

    return {
      provider: "momo" as const,
      reference: payment.reference,
      status: payment.status,
      message:
        payment.message ??
        "Approve the MoMo prompt on your phone to activate your subscription.",
      externalId: payment.externalId,
      amount,
    };
  }

  async verifyCollection(reference: string) {
    const pending = await getPendingPayment(reference);
    const momoReferenceId = pending?.momoReferenceId ?? reference;
    const payment = await momoService.verifyPayment(momoReferenceId, reference);
    return {
      provider: "momo" as const,
      reference: payment.reference,
      status: payment.status,
      message: payment.message,
      externalId: payment.externalId,
    };
  }
}

export const momoPaymentService = new MomoPaymentService();
