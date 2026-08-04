import { Prisma, WalletType, TransactionType } from "@prisma/client";
import { prisma, runTransaction } from "@/lib/db/prisma";
import type { PrismaClient } from "@prisma/client";
import { walletRepository } from "@/lib/repositories/wallet.repository";
import { commissionService } from "@/lib/services/commission.service";
import { AppError } from "@/lib/errors";
import { v4 as uuidv4 } from "uuid";

export class WalletService {
  async getOrCreateWallet(userId: string, type: WalletType) {
    let wallet = await walletRepository.findByUserAndType(userId, type);
    if (!wallet) {
      wallet = await walletRepository.create({
        user: { connect: { id: userId } },
        type,
        balance: 0,
      });
    }
    return wallet;
  }

  async deposit(
    userId: string,
    type: WalletType,
    amount: number,
    description?: string,
    reference?: string
  ) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const wallet = await this.getOrCreateWallet(userId, type);
    const fees = commissionService.calculateFees(amount);
    const netAmount = amount - fees.totalFee;
    const txnReference =
      reference ?? `DEP-${uuidv4().slice(0, 8).toUpperCase()}`;

    return runTransaction(async (db) => {
      const updated = await db.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: netAmount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fees.totalFee),
          commission: new Prisma.Decimal(fees.commissionFee),
          netAmount: new Prisma.Decimal(netAmount),
          reference: txnReference,
          description: description ?? "Wallet deposit",
        },
      });

      await this.creditPlatformWallet(db, fees.totalFee, transaction.id);
      return { wallet: updated, transaction };
    });
  }

  async transfer(
    fromUserId: string,
    fromType: WalletType,
    toUserId: string,
    toType: WalletType,
    amount: number,
    description?: string
  ) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const fromWallet = await this.getOrCreateWallet(fromUserId, fromType);
    const toWallet = await this.getOrCreateWallet(toUserId, toType);

    if (Number(fromWallet.balance) < amount) {
      throw new AppError("Insufficient balance", 400, "INSUFFICIENT_FUNDS");
    }

    const fees = commissionService.calculateFees(amount);
    const netAmount = amount - fees.totalFee;
    const reference = `TRF-${uuidv4().slice(0, 8).toUpperCase()}`;

    return runTransaction(async (db) => {
      await db.wallet.update({
        where: { id: fromWallet.id },
        data: { balance: { decrement: amount } },
      });

      const updatedTo = await db.wallet.update({
        where: { id: toWallet.id },
        data: { balance: { increment: netAmount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: fromWallet.id,
          type: "TRANSFER",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fees.totalFee),
          commission: new Prisma.Decimal(fees.commissionFee),
          netAmount: new Prisma.Decimal(netAmount),
          reference,
          description: description ?? "Wallet transfer",
          counterpartyId: toWallet.id,
        },
      });

      await db.walletTransaction.create({
        data: {
          walletId: toWallet.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(netAmount),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(netAmount),
          reference: `${reference}-IN`,
          description: `Transfer from ${fromType}`,
        },
      });

      await this.creditPlatformWallet(db, fees.totalFee, transaction.id);
      return { wallet: updatedTo, transaction };
    });
  }

  private async creditPlatformWallet(
    db: PrismaClient,
    feeAmount: number,
    sourceTransactionId: string
  ) {
    let platform = await db.wallet.findFirst({ where: { type: "PLATFORM" } });
    if (!platform) {
      platform = await db.wallet.create({
        data: { type: "PLATFORM", balance: 0 },
      });
    }

    await db.wallet.update({
      where: { id: platform.id },
      data: { balance: { increment: feeAmount } },
    });

    const fees = commissionService.calculateFees(feeAmount);
    await db.commission.create({
      data: {
        transactionId: sourceTransactionId,
        serviceFee: new Prisma.Decimal(fees.serviceFee),
        commissionFee: new Prisma.Decimal(fees.commissionFee),
        processingFee: new Prisma.Decimal(fees.processingFee),
        totalFee: new Prisma.Decimal(feeAmount),
      },
    });
  }

  async getOrCreatePlatformWallet() {
    let platform = await walletRepository.getPlatformWallet();
    if (!platform) {
      platform = await prisma.wallet.create({
        data: { type: "PLATFORM", balance: 0 },
      });
    }
    return platform;
  }

  async getBalance(userId: string, type: WalletType) {
    const wallet = await this.getOrCreateWallet(userId, type);
    const breakdown = await this.getWithdrawableBreakdown(wallet.id, Number(wallet.balance));
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      walletId: wallet.id,
      ...breakdown,
    };
  }

  async getWithdrawableBreakdown(walletId: string, totalBalance: number) {
    const lockedTransactions = await prisma.walletTransaction.findMany({
      where: {
        walletId,
        status: "COMPLETED",
        OR: [
          { type: "FUNDING" },
          {
            type: "DEPOSIT",
            metadata: {
              path: ["nonWithdrawable"],
              equals: true,
            },
          },
        ],
      },
      select: { netAmount: true },
    });

    const financedBalance = lockedTransactions.reduce(
      (sum, txn) => sum + Number(txn.netAmount),
      0
    );
    const withdrawableBalance = Math.max(0, totalBalance - financedBalance);

    return {
      withdrawableBalance,
      financedBalance,
    };
  }

  async depositFinanced(
    userId: string,
    type: WalletType,
    amount: number,
    description: string,
    reference?: string
  ) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const wallet = await this.getOrCreateWallet(userId, type);
    const txnReference =
      reference ?? `FIN-${uuidv4().slice(0, 8).toUpperCase()}`;

    return runTransaction(async (db) => {
      const updated = await db.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "FUNDING",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(amount),
          reference: txnReference,
          description,
          metadata: {
            nonWithdrawable: true,
            source: "FINANCING_DISBURSEMENT",
          },
        },
      });

      return { wallet: updated, transaction };
    });
  }

  async getPlatformBalance() {
    const wallet = await this.getOrCreatePlatformWallet();
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      walletId: wallet.id,
    };
  }

  async withdraw(
    userId: string,
    type: WalletType,
    amount: number,
    description?: string,
    reference?: string
  ) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const wallet = await this.getOrCreateWallet(userId, type);
    if (Number(wallet.balance) < amount) {
      throw new AppError("Insufficient balance", 400, "INSUFFICIENT_FUNDS");
    }

    const fees = commissionService.calculateFees(amount);
    const netAmount = amount;
    const txnReference =
      reference ?? `WDR-${uuidv4().slice(0, 8).toUpperCase()}`;

    const existing = await prisma.walletTransaction.findUnique({
      where: { reference: txnReference },
    });
    if (existing?.status === "COMPLETED") {
      return { wallet, transaction: existing };
    }

    return runTransaction(async (db) => {
      const updated = await db.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAWAL",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fees.totalFee),
          commission: new Prisma.Decimal(fees.commissionFee),
          netAmount: new Prisma.Decimal(netAmount - fees.totalFee),
          reference: txnReference,
          description: description ?? "Bank withdrawal",
        },
      });

      await this.creditPlatformWallet(db, fees.totalFee, transaction.id);
      return { wallet: updated, transaction };
    });
  }

  async getHistory(userId: string, type: WalletType, page = 1, limit = 20) {
    const wallet = await this.getOrCreateWallet(userId, type);
    return this.getHistoryForWallet(wallet.id, page, limit);
  }

  async getPlatformHistory(page = 1, limit = 20) {
    const wallet = await this.getOrCreatePlatformWallet();
    return this.getHistoryForWallet(wallet.id, page, limit);
  }

  private async getHistoryForWallet(walletId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      walletRepository.getTransactions(walletId, skip, limit),
      prisma.walletTransaction.count({ where: { walletId } }),
    ]);
    return { transactions, total, page, limit };
  }

  async payToPlatform(
    userId: string,
    type: WalletType,
    amount: number,
    description: string,
    reference?: string
  ) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const wallet = await this.getOrCreateWallet(userId, type);
    if (Number(wallet.balance) < amount) {
      throw new AppError(
        "Insufficient wallet balance. Top up your wallet to continue.",
        400,
        "INSUFFICIENT_FUNDS"
      );
    }

    const txnReference =
      reference ?? `PAY-${uuidv4().slice(0, 8).toUpperCase()}`;

    return runTransaction(async (db) => {
      await db.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      let platform = await db.wallet.findFirst({ where: { type: "PLATFORM" } });
      if (!platform) {
        platform = await db.wallet.create({
          data: { type: "PLATFORM", balance: 0 },
        });
      }

      await db.wallet.update({
        where: { id: platform.id },
        data: { balance: { increment: amount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "PAYMENT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(amount),
          reference: txnReference,
          description,
        },
      });

      await db.walletTransaction.create({
        data: {
          walletId: platform.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(amount),
          reference: `${txnReference}-PLT`,
          description,
        },
      });

      return transaction;
    });
  }

  async withdrawFromPlatform(amount: number, description?: string) {
    if (amount <= 0) throw new AppError("Amount must be positive");

    const wallet = await this.getOrCreatePlatformWallet();
    if (Number(wallet.balance) < amount) {
      throw new AppError("Insufficient balance", 400, "INSUFFICIENT_FUNDS");
    }

    const fees = commissionService.calculateFees(amount);
    const reference = `WDR-${uuidv4().slice(0, 8).toUpperCase()}`;

    return runTransaction(async (db) => {
      const updated = await db.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      const transaction = await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAWAL",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fees.totalFee),
          commission: new Prisma.Decimal(fees.commissionFee),
          netAmount: new Prisma.Decimal(amount - fees.totalFee),
          reference,
          description: description ?? "Platform withdrawal",
        },
      });

      return { wallet: updated, transaction };
    });
  }
}

export const walletService = new WalletService();
