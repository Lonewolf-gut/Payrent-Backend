import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { assertEligibleAgent } from "@/lib/services/agent-assignment.service";
import { buildReferralUrl } from "@/lib/utils/agent-referral";

function generateReferralCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export class AgentReferralService {
  async createLink(
    agentProfileId: string,
    options?: { propertyId?: string; label?: string }
  ) {
    await assertEligibleAgent(agentProfileId);

    if (options?.propertyId) {
      const property = await prisma.property.findFirst({
        where: {
          id: options.propertyId,
          status: "ACTIVE",
          OR: [{ agentUserId: agentProfileId }, { agentUserId: null }],
        },
      });
      if (!property) {
        throw new AppError(
          "You can only create promotion links for active listings you represent or can claim",
          400
        );
      }
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
        agent: { include: { user: { select: { id: true, isActive: true, role: true } } } },
      },
    });
    if (!link?.agent.user.isActive || link.agent.user.role !== "MARKETER") {
      return null;
    }
    return link;
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

  formatLinkUrl(origin: string, code: string, _propertyId?: string | null) {
    return buildReferralUrl(origin, code);
  }
}

export const agentReferralService = new AgentReferralService();
