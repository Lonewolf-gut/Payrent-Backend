import { Prisma } from "@prisma/client";
import { prisma, runTransaction } from "@/lib/db/prisma";
import { walletService } from "@/lib/services/wallet.service";
import { notificationService } from "@/lib/services/notification.service";
import { agentCommissionService } from "@/lib/services/agent-commission.service";
import { calculateAgentCommission } from "@/lib/constants/agent-commission";
import { AppError } from "@/lib/errors";
import { isSaleListing } from "@/lib/subscription-limits";
import { v4 as uuidv4 } from "uuid";

export class PropertyRentPaymentService {
  async payRent(
    tenantUserId: string,
    propertyId: string,
    applicationId?: string | null
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { userId: tenantUserId } });
    if (!tenant) throw new AppError("Customer profile required", 403);

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        landlord: { include: { user: true } },
        assignedAgent: { include: { user: true } },
      },
    });

    if (!property || property.status !== "ACTIVE") {
      throw new AppError("Property is not available", 400);
    }

    if (isSaleListing(property.propertyType)) {
      throw new AppError("Use wallet purchase for sale listings", 400);
    }

    const application = applicationId
      ? await prisma.propertyApplication.findFirst({
          where: {
            id: applicationId,
            propertyId,
            tenantId: tenant.id,
          },
        })
      : await prisma.propertyApplication.findFirst({
          where: {
            propertyId,
            tenantId: tenant.id,
          },
          orderBy: { createdAt: "desc" },
        });

    const amount = Number(property.monthlyRent);
    if (amount <= 0) throw new AppError("Invalid rent amount", 400);

    const tenantWallet = await walletService.getOrCreateWallet(tenantUserId, "BUYER");
    if (Number(tenantWallet.balance) < amount) {
      throw new AppError(
        "Insufficient wallet balance. Deposit funds to complete this payment.",
        400,
        "INSUFFICIENT_FUNDS"
      );
    }

    const commissionAgent = await agentCommissionService.resolveCommissionAgent(
      propertyId,
      application?.referredAgentProfileId ?? null
    );

    const landlordWallet = await walletService.getOrCreateWallet(
      property.landlord.userId,
      "MERCHANT"
    );
    const agentWallet = commissionAgent
      ? await walletService.getOrCreateWallet(commissionAgent.user.id, "MARKETER")
      : null;

    const agentCommission =
      agentWallet && commissionAgent ? calculateAgentCommission(amount) : 0;
    const landlordNet = amount - agentCommission;
    const reference = `RENT-${uuidv4().slice(0, 8).toUpperCase()}`;

    const result = await runTransaction(async (db) => {
      await db.wallet.update({
        where: { id: tenantWallet.id },
        data: { balance: { decrement: amount } },
      });

      await db.wallet.update({
        where: { id: landlordWallet.id },
        data: { balance: { increment: landlordNet } },
      });

      await db.walletTransaction.create({
        data: {
          walletId: tenantWallet.id,
          type: "PAYMENT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(amount),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(amount),
          reference,
          description: `Rent payment: ${property.name}`,
          metadata: {
            propertyId,
            ...(application ? { applicationId: application.id } : {}),
          },
        },
      });

      await db.walletTransaction.create({
        data: {
          walletId: landlordWallet.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(landlordNet),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(landlordNet),
          reference: `${reference}-LL`,
          description: `Rent received: ${property.name}`,
        },
      });

      if (agentWallet && commissionAgent && agentCommission > 0) {
        await agentCommissionService.recordCommission(
          db,
          commissionAgent.id,
          agentWallet.id,
          commissionAgent.user.id,
          {
            agentProfileId: commissionAgent.id,
            propertyId,
            propertyName: property.name,
            grossAmount: amount,
            type: "SALE",
            reference,
          },
          agentCommission
        );
      }

      return { amount, agentCommission, landlordNet, reference };
    });

    await notificationService.create({
      userId: property.landlord.userId,
      title: "Rent payment received",
      body: `A Customer paid GHS ${amount.toLocaleString()} rent for "${property.name}".`,
      metadata: { propertyId, reference: result.reference },
    });

    await notificationService.create({
      userId: tenantUserId,
      title: "Rent payment complete",
      body: `You paid GHS ${amount.toLocaleString()} rent for "${property.name}".`,
      metadata: { propertyId, reference: result.reference },
    });

    return result;
  }
}

export const propertyRentPaymentService = new PropertyRentPaymentService();
