import { Prisma } from "@prisma/client";
import { prisma, runTransaction } from "@/lib/db/prisma";
import { walletService } from "@/lib/services/wallet.service";
import { notificationService } from "@/lib/services/notification.service";
import { agentCommissionService } from "@/lib/services/agent-commission.service";
import { calculateAgentCommission } from "@/lib/constants/agent-commission";
import { AppError } from "@/lib/errors";
import { isSaleListing } from "@/lib/subscription-limits";
import { v4 as uuidv4 } from "uuid";

export class PropertyPurchaseService {
  async purchase(
    tenantUserId: string,
    propertyId: string,
    referredAgentProfileId?: string | null
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
      throw new AppError("Property is not available for purchase", 400);
    }

    if (!isSaleListing(property.propertyType)) {
      throw new AppError("This listing is not available for direct purchase", 400);
    }

    const price = Number(property.discountedPrice ?? property.monthlyRent);
    if (price <= 0) throw new AppError("Invalid listing price", 400);

    const tenantWallet = await walletService.getOrCreateWallet(tenantUserId, "BUYER");
    if (Number(tenantWallet.balance) < price) {
      throw new AppError(
        "Insufficient wallet balance. Deposit funds to complete this purchase.",
        400,
        "INSUFFICIENT_FUNDS"
      );
    }

    const commissionAgent = await agentCommissionService.resolveCommissionAgent(
      propertyId,
      referredAgentProfileId
    );

    const landlordWallet = await walletService.getOrCreateWallet(
      property.landlord.userId,
      "MERCHANT"
    );
    const agentWallet = commissionAgent
      ? await walletService.getOrCreateWallet(commissionAgent.user.id, "MARKETER")
      : null;

    const agentCommission =
      agentWallet && commissionAgent
        ? calculateAgentCommission(price)
        : 0;
    const landlordNet = price - agentCommission;
    const reference = `BUY-${uuidv4().slice(0, 8).toUpperCase()}`;

    const result = await runTransaction(async (db) => {
      await db.wallet.update({
        where: { id: tenantWallet.id },
        data: { balance: { decrement: price } },
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
          amount: new Prisma.Decimal(price),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(price),
          reference,
          description: `Purchase: ${property.name}`,
          metadata: referredAgentProfileId
            ? { referredAgentProfileId }
            : undefined,
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
          description: `Sale proceeds: ${property.name}`,
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
            grossAmount: price,
            type: "SALE",
            reference,
          },
          agentCommission
        );
      }

      await db.property.update({
        where: { id: propertyId },
        data: { status: "INACTIVE" },
      });

      return { price, agentCommission, landlordNet, reference };
    });

    await notificationService.create({
      userId: property.landlord.userId,
      title: "Property sold",
      body: `"${property.name}" was purchased for GHS ${price.toLocaleString()}.`,
      metadata: { propertyId, reference: result.reference },
    });

    if (commissionAgent && agentCommission > 0) {
      await notificationService.create({
        userId: commissionAgent.user.id,
        title: "Sale commission earned",
        body: `You earned GHS ${agentCommission.toLocaleString()} commission on "${property.name}".`,
        metadata: { propertyId, commission: agentCommission },
      });
    } else if (commissionAgent) {
      await notificationService.create({
        userId: commissionAgent.user.id,
        title: "Promoted listing sold",
        body: `"${property.name}" was sold through your promotion.`,
        metadata: { propertyId },
      });
    }

    await notificationService.create({
      userId: tenantUserId,
      title: "Purchase complete",
      body: `You successfully purchased "${property.name}" for GHS ${price.toLocaleString()}.`,
      metadata: { propertyId, reference: result.reference },
    });

    return result;
  }

  /** External checkout (service provider) — buyer wallet is not debited; platform records collection. */
  async purchaseViaProvider(
    tenantUserId: string,
    propertyId: string,
    paymentReference: string,
    referredAgentProfileId?: string | null
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
      throw new AppError("Property is not available for purchase", 400);
    }

    if (!isSaleListing(property.propertyType)) {
      throw new AppError("This listing is not available for direct purchase", 400);
    }

    const price = Number(property.discountedPrice ?? property.monthlyRent);
    if (price <= 0) throw new AppError("Invalid listing price", 400);

    const commissionAgent = await agentCommissionService.resolveCommissionAgent(
      propertyId,
      referredAgentProfileId
    );

    const platformWallet = await walletService.getOrCreatePlatformWallet();
    const landlordWallet = await walletService.getOrCreateWallet(
      property.landlord.userId,
      "MERCHANT"
    );
    const agentWallet = commissionAgent
      ? await walletService.getOrCreateWallet(commissionAgent.user.id, "MARKETER")
      : null;

    const agentCommission =
      agentWallet && commissionAgent ? calculateAgentCommission(price) : 0;
    const landlordNet = price - agentCommission;
    const reference = paymentReference.startsWith("DEMO-")
      ? paymentReference
      : `BUY-${uuidv4().slice(0, 8).toUpperCase()}`;

    const result = await runTransaction(async (db) => {
      await db.wallet.update({
        where: { id: platformWallet.id },
        data: { balance: { increment: price } },
      });

      await db.walletTransaction.create({
        data: {
          walletId: platformWallet.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: new Prisma.Decimal(price),
          fee: 0,
          commission: 0,
          netAmount: new Prisma.Decimal(price),
          reference,
          description: `Listing checkout: ${property.name}`,
          metadata: {
            buyerUserId: tenantUserId,
            propertyId,
            provider: "demo",
            channel: "CHECKOUT",
          },
        },
      });

      await db.wallet.update({
        where: { id: landlordWallet.id },
        data: { balance: { increment: landlordNet } },
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
          description: `Sale proceeds: ${property.name}`,
          metadata: { buyerUserId: tenantUserId, checkoutReference: reference },
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
            grossAmount: price,
            type: "SALE",
            reference,
          },
          agentCommission
        );
      }

      await db.property.update({
        where: { id: propertyId },
        data: { status: "INACTIVE" },
      });

      return { price, agentCommission, landlordNet, reference };
    });

    await notificationService.create({
      userId: property.landlord.userId,
      title: "Property sold",
      body: `"${property.name}" was purchased for GHS ${price.toLocaleString()} via checkout.`,
      metadata: { propertyId, reference: result.reference },
    });

    if (commissionAgent && agentCommission > 0) {
      await notificationService.create({
        userId: commissionAgent.user.id,
        title: "Sale commission earned",
        body: `You earned GHS ${agentCommission.toLocaleString()} commission on "${property.name}".`,
        metadata: { propertyId, commission: agentCommission },
      });
    }

    await notificationService.create({
      userId: tenantUserId,
      title: "Purchase complete",
      body: `You successfully purchased "${property.name}" for GHS ${price.toLocaleString()}.`,
      metadata: { propertyId, reference: result.reference },
    });

    return result;
  }
}

export const propertyPurchaseService = new PropertyPurchaseService();
