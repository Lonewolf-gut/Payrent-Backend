import { prisma } from "@/lib/db/prisma";
import {
  getAffiliatePlanLimits,
  getPlanLimits,
  getPropertyCategory,
  isUnlimitedPlan,
} from "@/lib/subscription-limits";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { getBusinessRulesSync } from "@/lib/services/business-rules.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async (_req, _ctx, session) => {
    const access = await getSubscriptionAccess(session.user.id);
    const unlimited = isUnlimitedPlan(access.plan);
    const limits =
      session.user.role === "MARKETER"
        ? getAffiliatePlanLimits(access.plan)
        : getPlanLimits(access.plan);

    const usage = { residential: 0, car: 0, appliance: 0, total: 0 };

    if (session.user.role === "MERCHANT") {
      const landlord = await prisma.landlord.findUnique({
        where: { userId: session.user.id },
      });

      if (landlord) {
        const existing = await prisma.property.findMany({
          where: { landlordId: landlord.id, status: { not: "INACTIVE" } },
          select: { propertyType: true },
        });

        usage.total = existing.length;
        for (const property of existing) {
          usage[getPropertyCategory(property.propertyType)] += 1;
        }
      }
    }

    if (session.user.role === "MARKETER") {
      const agent = await prisma.agentProfile.findUnique({
        where: { userId: session.user.id },
      });

      if (agent) {
        const existing = await prisma.property.findMany({
          where: { agentUserId: agent.id, status: { not: "INACTIVE" } },
          select: { propertyType: true },
        });

        usage.total = existing.length;
        for (const property of existing) {
          usage[getPropertyCategory(property.propertyType)] += 1;
        }
      }
    }

    return apiResponse({
      plan: access.plan,
      unlimited,
      trialActive: access.trialActive,
      trialEndsAt: access.trialEndsAt,
      hasFullAccess: access.hasFullAccess,
      agentCommissionPercent: getBusinessRulesSync().agentCommissionPercent,
      usage,
      limits: unlimited
        ? {
            residential: null,
            cars: null,
            appliances: null,
            total: null,
          }
        : limits,
    });
  },
  { roles: ["MERCHANT", "MARKETER"] }
);
