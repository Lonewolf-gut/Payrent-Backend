import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { otpService } from "@/lib/services/otp.service";
import { walletService } from "@/lib/services/wallet.service";
import { notificationService } from "@/lib/services/notification.service";
import { kycService } from "@/lib/services/kyc.service";
import {
  disburseToBankAccount,
  disburseToMobileMoney,
  isPayoutConfigured,
} from "@/lib/services/payment/payout.service";
import { isBankPartnerApiConfigured } from "@/lib/services/payment/bank-partner-auth";
import { bankPartnerService } from "@/lib/services/payment/bank-partner.service";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { UserRole } from "@prisma/client";
import {
  getWalletTypeForRole,
  usesPlatformWallet,
} from "@/lib/wallet/role-wallet";

export class WithdrawalService {
  private async assertIdentityVerified(userId: string, role: UserRole) {
    if (usesPlatformWallet(role)) return;

    const status = await kycService.getVerificationStatus(userId, role);
    if (!status.identityVerified) {
      throw new AppError("Identity verification required");
    }
  }

  async requestWithdrawal(
    userId: string,
    role: UserRole,
    bankAccountId: string,
    amount: number
  ) {
    const walletType = getWalletTypeForRole(role);
    if (!walletType) throw new AppError("Role cannot withdraw");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { bankAccounts: { where: { id: bankAccountId, isVerified: true } } },
    });

    if (!user?.phoneVerified) {
      throw new AppError("Phone verification required");
    }
    if (!user.bankAccounts.length) {
      throw new AppError("Verified payout account required");
    }

    await this.assertIdentityVerified(userId, role);

    const balance = usesPlatformWallet(role)
      ? await walletService.getPlatformBalance()
      : await walletService.getBalance(userId, walletType);

    const available =
      "withdrawableBalance" in balance
        ? Number(balance.withdrawableBalance)
        : Number(balance.balance);

    if (available < amount) {
      throw new AppError(
        Number(balance.financedBalance ?? 0) > 0 && Number(balance.balance) >= amount
          ? "Financed wallet funds cannot be withdrawn. Only self-funded deposits are withdrawable."
          : "Insufficient balance"
      );
    }

    const payoutAccount = user.bankAccounts[0];
    const payoutLabel =
      payoutAccount.accountType === "MOMO" ? "MoMo withdrawal" : "Bank withdrawal";

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        userId,
        bankAccountId,
        amount: new Prisma.Decimal(amount),
        status: "PENDING",
      },
    });

    const otp = await otpService.create(userId, "WITHDRAWAL");

    await notificationService.create({
      userId,
      title: "Withdrawal OTP",
      body: `Your withdrawal verification code is: ${otp}. It expires in 10 minutes.`,
      channel: "EMAIL",
      sendEmail: true,
      sendSms: true,
    });

    return { ...withdrawal, payoutLabel };
  }

  async verifyOtp(userId: string, withdrawalId: string, code: string) {
    await otpService.verify(userId, code, "WITHDRAWAL");
    return prisma.withdrawalRequest.update({
      where: { id: withdrawalId, userId },
      data: { otpVerified: true, status: "OTP_VERIFIED" },
    });
  }

  async confirmWithdrawal(
    userId: string,
    role: UserRole,
    withdrawalId: string,
    twoFaVerified: boolean
  ) {
    if (!twoFaVerified) throw new AppError("2FA verification required");

    const withdrawal = await prisma.withdrawalRequest.findFirst({
      where: { id: withdrawalId, userId, status: "OTP_VERIFIED" },
      include: { bankAccount: true },
    });
    if (!withdrawal) throw new AppError("Withdrawal not found");

    const walletType = getWalletTypeForRole(role);
    if (!walletType) throw new AppError("Role cannot withdraw");

    const amount = Number(withdrawal.amount);
    const payoutLabel =
      withdrawal.bankAccount.accountType === "MOMO"
        ? "MoMo withdrawal"
        : "Bank withdrawal";

    const useBankPartner =
      isBankPartnerApiConfigured() && withdrawal.bankAccount.accountType === "BANK";

    if (useBankPartner) {
      const instruction = await bankPartnerService.getWithdrawalInstruction(withdrawalId);

      const updated = await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          twoFaVerified: true,
          status: "PROCESSING",
          partnerReference: instruction.reference,
        },
      });

      await notificationService.create({
        userId,
        title: "Withdrawal submitted",
        body: `Your withdrawal of GHS ${amount.toLocaleString()} has been sent to the partner bank for processing.`,
      });

      return { ...updated, bankPartnerInstruction: instruction };
    }

    if (usesPlatformWallet(role)) {
      await walletService.withdrawFromPlatform(amount, payoutLabel);
    } else {
      await walletService.withdraw(userId, walletType, amount, payoutLabel);
    }

    let payoutStatus: "COMPLETED" | "PROCESSING" = "COMPLETED";

    if (isPayoutConfigured()) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            phone: true,
            tenant: { select: { fullName: true } },
            landlord: { select: { fullName: true } },
            lender: { select: { fullName: true } },
            agentProfile: { select: { fullName: true } },
          },
        });

        const recipientName =
          user?.tenant?.fullName ??
          user?.landlord?.fullName ??
          user?.lender?.fullName ??
          user?.agentProfile?.fullName ??
          withdrawal.bankAccount.accountName;

        const payoutReference = `WDR-${withdrawalId.slice(0, 8).toUpperCase()}`;

        if (withdrawal.bankAccount.accountType === "MOMO") {
          const payoutPhone = withdrawal.bankAccount.accountNumber;
          const result = await disburseToMobileMoney({
            amount,
            phone: payoutPhone,
            recipientName: withdrawal.bankAccount.accountName || recipientName,
            bankName: withdrawal.bankAccount.bankName,
            bankCode: withdrawal.bankAccount.bankCode,
            description: payoutLabel,
            reference: payoutReference,
          });
          if (result.status === "FAILED") payoutStatus = "PROCESSING";
        } else {
          const result = await disburseToBankAccount({
            amount,
            accountNumber: withdrawal.bankAccount.accountNumber,
            accountName: withdrawal.bankAccount.accountName,
            bankName: withdrawal.bankAccount.bankName,
            bankCode: withdrawal.bankAccount.bankCode,
            description: payoutLabel,
            reference: payoutReference,
          });
          if (result.status === "FAILED") payoutStatus = "PROCESSING";
        }
      } catch (error) {
        payoutStatus = "PROCESSING";
        logger.error("Withdrawal payout failed", {
          withdrawalId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const updated = await prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        twoFaVerified: true,
        status: payoutStatus,
        processedAt: new Date(),
      },
    });

    await notificationService.create({
      userId,
      title: "Withdrawal Approved",
      body: `Your withdrawal of GHS ${amount.toLocaleString()} has been ${payoutStatus === "COMPLETED" ? "processed" : "submitted for processing"}.`,
    });

    return updated;
  }
}

export const withdrawalService = new WithdrawalService();
