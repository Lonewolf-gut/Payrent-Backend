import { momoService } from "@/lib/services/payment/momo.service";
import { momoPaymentService } from "@/lib/services/payment/momo-payment.service";
import { hubtelPaymentService } from "@/lib/services/payment/hubtel-payment.service";
import { paystackPaymentService } from "@/lib/services/payment/paystack-payment.service";
import { demoPaymentService } from "@/lib/services/payment/demo-payment.service";
import {
  getPaymentProvider,
  isPaymentCollectionConfigured,
} from "@/lib/services/payment/provider";
import type { WalletType } from "@prisma/client";

export type WalletTopUpRequest = {
  userId: string;
  walletType: WalletType;
  amount: number;
  phone?: string;
  bankAccountId?: string;
  description?: string;
};

export type WalletDepositRequest = {
  userId: string;
  walletType: WalletType;
  amount: number;
  bankAccountId: string;
  description?: string;
};

export class PaymentService {
  async requestWalletDeposit(input: WalletDepositRequest) {
    const provider = getPaymentProvider();

    if (provider === "demo") {
      return demoPaymentService.requestWalletDeposit(input);
    }

    if (provider === "momo") {
      return momoPaymentService.requestWalletDepositFromAccount(input);
    }

    if (provider === "paystack") {
      return paystackPaymentService.requestWalletDepositFromAccount(input);
    }

    if (provider === "hubtel") {
      return hubtelPaymentService.requestWalletDepositFromAccount(input);
    }

    if (provider === "log" || (process.env.NODE_ENV === "development" && !isPaymentCollectionConfigured())) {
      return {
        provider: "sandbox" as const,
        reference: `LOG-${Date.now()}`,
        status: "PENDING" as const,
        message: "Configure PAYMENT_PROVIDER=momo and MoMo credentials for live deposits.",
      };
    }

    throw new Error(`Deposits require momo when PAYMENT_PROVIDER=${provider}`);
  }

  async requestWalletTopUp(input: WalletTopUpRequest) {
    if (input.bankAccountId) {
      return this.requestWalletDeposit({
        userId: input.userId,
        walletType: input.walletType,
        amount: input.amount,
        bankAccountId: input.bankAccountId,
        description: input.description,
      });
    }

    const provider = getPaymentProvider();

    if (provider === "demo") {
      return demoPaymentService.requestWalletDeposit({
        userId: input.userId,
        walletType: input.walletType,
        amount: input.amount,
        description: input.description,
      });
    }

    if (provider === "momo") {
      if (!input.phone) {
        throw new Error("Add a verified MoMo account in Settings before depositing.");
      }
      const payment = await momoService.requestPayment({
        amount: input.amount,
        phone: input.phone,
        description: input.description ?? "PayForMe wallet top-up",
      });

      return {
        provider: "momo" as const,
        reference: payment.reference,
        status: payment.status,
        message:
          payment.message ??
          "Approve the MoMo prompt on your phone. You will receive a notification when the deposit completes.",
        externalId: payment.externalId,
      };
    }

    if (provider === "paystack") {
      if (!input.phone) {
        throw new Error("Phone number is required for Mobile Money top-up.");
      }
      return paystackPaymentService.requestWalletTopUp({
        ...input,
        phone: input.phone,
      });
    }

    if (provider === "hubtel") {
      if (!input.phone) {
        throw new Error("Phone number is required for Mobile Money top-up.");
      }
      return hubtelPaymentService.requestWalletTopUp({
        ...input,
        phone: input.phone,
      });
    }

    if (provider === "log" || (process.env.NODE_ENV === "development" && !isPaymentCollectionConfigured())) {
      return {
        provider: "sandbox" as const,
        reference: `LOG-${Date.now()}`,
        status: "PENDING" as const,
        message: "Configure PAYMENT_PROVIDER=momo for live collections.",
      };
    }

    throw new Error(`Payment provider "${provider}" is not supported`);
  }

  async verifyWalletTopUp(reference: string) {
    const provider = getPaymentProvider();

    if (provider === "momo") {
      return momoPaymentService.verifyCollection(reference);
    }

    if (provider === "paystack") {
      return paystackPaymentService.verifyCollection(reference);
    }

    if (provider === "hubtel") {
      return hubtelPaymentService.verifyCollection(reference);
    }

    if (provider === "demo") {
      return demoPaymentService.verifyCollection(reference);
    }

    return {
      provider: "sandbox" as const,
      reference,
      status: "PENDING" as const,
    };
  }
}

export const paymentService = new PaymentService();
