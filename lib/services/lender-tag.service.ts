import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { notificationService } from "@/lib/services/notification.service";

export type LenderTagSuggestion = {
  lenderId: string;
  userId: string;
  email: string;
  fullName: string;
  institutionName: string | null;
  priorDeals: number;
  reason: string;
};

export class LenderTagService {
  async getTagsForRequest(financingRequestId: string) {
    return prisma.financingRequestLenderTag.findMany({
      where: { financingRequestId },
      include: {
        lender: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
        taggedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Suggest lenders based on prior sponsorship (investment) history:
   * same buyer, same merchant/property owner, or same property type.
   */
  async getSuggestedLenders(financingRequestId: string): Promise<LenderTagSuggestion[]> {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        property: { select: { landlordId: true, propertyType: true } },
        lenderTags: { select: { lenderId: true } },
      },
    });
    if (!request) throw new AppError("Financing request not found", 404);

    const alreadyTagged = new Set(request.lenderTags.map((t) => t.lenderId));

    const priorInvestments = await prisma.investment.findMany({
      where: {
        financingRequest: {
          OR: [
            { tenantId: request.tenantId },
            { property: { landlordId: request.property.landlordId } },
            { property: { propertyType: request.property.propertyType } },
          ],
        },
      },
      include: {
        lender: {
          include: {
            user: { select: { id: true, email: true, isActive: true } },
          },
        },
        financingRequest: {
          include: {
            property: { select: { landlordId: true, propertyType: true } },
          },
        },
      },
    });

    const byLender = new Map<
      string,
      LenderTagSuggestion & { reasons: Set<string> }
    >();

    for (const investment of priorInvestments) {
      if (!investment.lender.user.isActive) continue;
      if (alreadyTagged.has(investment.lenderId)) continue;

      const existing = byLender.get(investment.lenderId);
      const reasons = existing?.reasons ?? new Set<string>();

      if (investment.financingRequest.tenantId === request.tenantId) {
        reasons.add("Previously sponsored this buyer");
      }
      if (investment.financingRequest.property.landlordId === request.property.landlordId) {
        reasons.add("Previously sponsored this merchant's listings");
      }
      if (investment.financingRequest.property.propertyType === request.property.propertyType) {
        reasons.add(`Experience with ${request.property.propertyType} properties`);
      }

      byLender.set(investment.lenderId, {
        lenderId: investment.lenderId,
        userId: investment.lender.userId,
        email: investment.lender.user.email,
        fullName: investment.lender.fullName,
        institutionName: investment.lender.institutionName,
        priorDeals: (existing?.priorDeals ?? 0) + 1,
        reason: Array.from(reasons).join(" · "),
        reasons,
      });
    }

    return Array.from(byLender.values())
      .map((entry) => {
        const { reasons, ...rest } = entry;
        return { ...rest, reason: Array.from(reasons).join(" · ") };
      })
      .sort((a, b) => b.priorDeals - a.priorDeals);
  }

  async tagLenders(
    financingRequestId: string,
    lenderIds: string[],
    adminUserId: string,
    options?: { reason?: string; notify?: boolean }
  ) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: { property: { select: { name: true } } },
    });
    if (!request) throw new AppError("Financing request not found", 404);

    const uniqueLenderIds = [...new Set(lenderIds)];
    if (!uniqueLenderIds.length) {
      throw new AppError("Select at least one lender to tag", 400);
    }

    const lenders = await prisma.lender.findMany({
      where: { id: { in: uniqueLenderIds } },
      include: { user: { select: { id: true, isActive: true } } },
    });
    if (lenders.length !== uniqueLenderIds.length) {
      throw new AppError("One or more lenders were not found", 404);
    }

    const inactive = lenders.filter((l) => !l.user.isActive);
    if (inactive.length) {
      throw new AppError("Cannot tag inactive lender accounts", 400);
    }

    const tags = await prisma.$transaction(
      uniqueLenderIds.map((lenderId) =>
        prisma.financingRequestLenderTag.upsert({
          where: {
            financingRequestId_lenderId: { financingRequestId, lenderId },
          },
          create: {
            financingRequestId,
            lenderId,
            taggedByUserId: adminUserId,
            reason: options?.reason,
          },
          update: {
            taggedByUserId: adminUserId,
            reason: options?.reason,
          },
          include: {
            lender: {
              include: { user: { select: { id: true, email: true } } },
            },
          },
        })
      )
    );

    if (options?.notify !== false) {
      await this.notifyTaggedLenders(financingRequestId, request.property.name);
    }

    return tags;
  }

  async removeTag(financingRequestId: string, lenderId: string) {
    await prisma.financingRequestLenderTag.deleteMany({
      where: { financingRequestId, lenderId },
    });
    return { removed: true };
  }

  async notifyTaggedLenders(financingRequestId: string, propertyName?: string) {
    const tags = await prisma.financingRequestLenderTag.findMany({
      where: { financingRequestId },
      include: {
        lender: { include: { user: { select: { id: true } } } },
        financingRequest: {
          include: { property: { select: { name: true } } },
        },
      },
    });

    const name =
      propertyName ?? tags[0]?.financingRequest.property.name ?? "a property";

    await Promise.all(
      tags.map(async (tag) => {
        if (tag.notifiedAt) return;

        await notificationService.create({
          userId: tag.lender.userId,
          title: "Pay-For-Me request tagged for you",
          body: `An admin tagged you for a Pay-For-Me request on ${name}. Review it in your funding queue.`,
          channel: "IN_APP",
          metadata: {
            financingRequestId,
            type: "LENDER_TAG",
          },
        });

        await prisma.financingRequestLenderTag.update({
          where: { id: tag.id },
          data: { notifiedAt: new Date() },
        });
      })
    );
  }

  async notifyAllLendersRequestPublished(financingRequestId: string) {
    const request = await prisma.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        property: { select: { name: true } },
        lenderTags: {
          include: { lender: { select: { userId: true } } },
        },
      },
    });
    if (!request) return;

    const taggedUserIds = new Set(
      request.lenderTags.map((t) => t.lender.userId)
    );

    const lenders = await prisma.lender.findMany({
      where: { user: { isActive: true } },
      select: { userId: true },
    });

    await Promise.all(
      lenders.map((lender) => {
        const isTagged = taggedUserIds.has(lender.userId);
        return notificationService.create({
          userId: lender.userId,
          title: isTagged
            ? "Priority: Pay-For-Me request for you"
            : "New Pay-For-Me request published",
          body: isTagged
            ? `You were tagged for a new Pay-For-Me request on ${request.property.name}.`
            : `A new Pay-For-Me request on ${request.property.name} is available in the funding queue.`,
          channel: "IN_APP",
          metadata: {
            financingRequestId,
            type: isTagged ? "LENDER_TAG" : "FINANCING_PUBLISHED",
            priority: isTagged,
          },
        });
      })
    );

    await prisma.financingRequestLenderTag.updateMany({
      where: { financingRequestId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
  }
}

export const lenderTagService = new LenderTagService();
