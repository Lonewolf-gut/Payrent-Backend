import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { assertEligibleAgent } from "@/lib/services/agent-assignment.service";
import { buildReferralUrl, getReferralDestinationPath } from "@/lib/utils/agent-referral";

function generateReferralCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export class AgentReferralService {
  async createLink(
    agentProfileId: string,
    options?: { propertyId?: string; label?: string }
  ) {
    await assertEligibleAgent(agentProfileId);

    if (!options?.propertyId) {
      throw new AppError("Select a listing before creating a promotion link.", 400);
    }

    const property = await prisma.property.findFirst({
      where: {
        id: options.propertyId,
        status: "ACTIVE",
        agentUserId: agentProfileId,
      },
    });
    if (!property) {
      throw new AppError(
        "Claim this listing before creating a promotion link. Free Affiliates can promote 1 listing at a time.",
        400
      );
    }

    let code = generateReferralCode();
    while (await prisma.agentReferralLink.findUnique({ where: { code } })) {
      code = generateReferralCode();
    }

    return prisma.agentReferralLink.create({
      data: {
        agentProfileId,
        propertyId: options?.propertyId,
        label: options?.label,
        code,
      },
      include: {
        property: { select: { id: true, name: true } },
      },
    });
  }

  async listLinks(agentProfileId: string) {
    return prisma.agentReferralLink.findMany({
      where: { agentProfileId },
      include: {
        property: { select: { id: true, name: true, propertyType: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolveReferralCode(code?: string | null) {
    if (!code?.trim()) return null;
    const link = await prisma.agentReferralLink.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        property: { select: { id: true, status: true } },
        agent: { include: { user: { select: { id: true, isActive: true, role: true } } } },
      },
    });
    if (!link?.agent.user.isActive || link.agent.user.role !== "MARKETER") {
      return null;
    }
    return link;
  }

  async resolveReferralDestination(code?: string | null) {
    const link = await this.resolveReferralCode(code);
    if (!link) return null;

    let propertyId = link.propertyId;

    if (propertyId) {
      const property =
        link.property ??
        (await prisma.property.findFirst({
          where: { id: propertyId, status: "ACTIVE" },
          select: { id: true, status: true },
        }));
      if (!property || property.status !== "ACTIVE") return null;
    } else {
      const promoted = await prisma.property.findFirst({
        where: { agentUserId: link.agentProfileId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (!promoted) return null;
      propertyId = promoted.id;
    }

    return {
      redirectPath: getReferralDestinationPath(propertyId),
      code: link.code,
      propertyId,
    };
  }

  async resolveAgentProfileId(code?: string | null) {
    const link = await this.resolveReferralCode(code);
    return link?.agentProfileId ?? null;
  }

  async trackClick(code: string) {
    const link = await this.resolveReferralCode(code);
    if (!link) return null;
    return prisma.agentReferralLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });
  }

  formatLinkUrl(origin: string, code: string, propertyId?: string | null) {
    return buildReferralUrl(origin, code, propertyId);
  }
}

export const agentReferralService = new AgentReferralService();
