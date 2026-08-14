import type { Prisma, PropertyType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getBusinessRules } from "@/lib/services/business-rules.service";
import { notificationService } from "@/lib/services/notification.service";
import {
  getAffiliatePlanLimits,
  getPlanLimits,
  getPropertyCategory,
  isUnlimitedPlan,
} from "@/lib/subscription-limits";
import { getSubscriptionAccess, type SubscriptionAccess } from "@/lib/subscription/access";
import { isPaidPlan } from "@/lib/subscription/plans";

/** Free merchants can list, but only paid plans appear on the public marketplace. */
export function merchantHasMarketplaceListingVisibility(access: SubscriptionAccess) {
  return access.isPaid;
}

export function merchantListingPublicVisibilityWhere(): Prisma.PropertyWhereInput {
  return {
    landlord: {
      user: {
        subscriptions: {
          some: {
            status: "ACTIVE",
            plan: { in: ["PRO", "MAX", "PREMIUM"] },
          },
        },
      },
    },
  };
}

export async function assertMerchantCanCreateListing(userId: string) {
  const [access, rules] = await Promise.all([
    getSubscriptionAccess(userId),
    getBusinessRules(),
  ]);

  if (rules.merchantListingRequiresPaidPlan && !isPaidPlan(access.plan)) {
    throw new AppError(
      "An active merchant subscription is required before you can list products. Choose Pro or Max at /pricing.",
      403,
      "MERCHANT_SUBSCRIPTION_REQUIRED"
    );
  }
}

export async function getAgentAssignmentUsage(agentUserId: string) {
  const agent = await prisma.agentProfile.findUnique({
    where: { userId: agentUserId },
    select: { id: true },
  });
  if (!agent) return null;

  const existing = await prisma.property.findMany({
    where: {
      agentUserId: agent.id,
      status: { not: "INACTIVE" },
    },
    select: { propertyType: true },
  });

  const counts = {
    residential: 0,
    car: 0,
    appliance: 0,
    total: existing.length,
  };

  for (const property of existing) {
    counts[getPropertyCategory(property.propertyType)] += 1;
  }

  return counts;
}

async function notifyAffiliateUpgradeRequired(agentUserId: string, limit: number) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      userId: agentUserId,
      read: false,
      title: "Upgrade to promote more listings",
      createdAt: { gte: since },
    },
  });
  if (existing) return;

  await notificationService.create({
    userId: agentUserId,
    title: "Upgrade to promote more listings",
    body:
      limit === 1
        ? "Your Free plan includes 1 promoted listing. Upgrade to Pro or Max to claim or accept assignments on additional listings."
        : `You have reached your plan limit of ${limit} promoted listings. Upgrade to Max for unlimited promotion capacity.`,
    channel: "IN_APP",
    sendEmail: false,
    metadata: { type: "UPGRADE_REQUIRED", href: "/pricing" },
  });
}

export async function assertAgentAssignmentLimit(
  agentUserId: string,
  context: "affiliate" | "merchant" = "affiliate"
) {
  const access = await getSubscriptionAccess(agentUserId);
  if (isUnlimitedPlan(access.plan)) return;

  const limits = getAffiliatePlanLimits(access.plan);
  if (!limits) return;

  const counts = await getAgentAssignmentUsage(agentUserId);
  if (!counts) {
    throw new AppError("Affiliate profile required", 403);
  }

  if (counts.total < limits.total) return;

  await notifyAffiliateUpgradeRequired(agentUserId, limits.total);

  const tierLabel = access.plan === "PRO" ? "Pro" : "Free";

  if (context === "merchant") {
    throw new AppError(
      limits.total === 1
        ? "This Affiliate has reached their Free plan limit of 1 promoted listing. They must upgrade before you can assign them to more listings."
        : `This Affiliate has reached their ${tierLabel} plan limit of ${limits.total} promoted listings. Ask them to upgrade for more capacity.`,
      403,
      "AFFILIATE_LISTING_LIMIT"
    );
  }

  throw new AppError(
    limits.total === 1
      ? "Free Affiliates can promote 1 listing and earn commission on it. Upgrade to Pro or Max at /pricing to promote more listings."
      : `You have reached your ${tierLabel} plan limit of ${limits.total} promoted listings. Upgrade to Max for unlimited promotion capacity.`,
    403,
    "AFFILIATE_LISTING_LIMIT"
  );
}

export async function assertLandlordListingLimit(
  userId: string,
  propertyType: PropertyType
) {
  await assertMerchantCanCreateListing(userId);

  const access = await getSubscriptionAccess(userId);
  if (isUnlimitedPlan(access.plan)) return;

  const limits = getPlanLimits(access.plan);
  if (!limits) return;

  const landlord = await prisma.landlord.findUnique({ where: { userId } });
  if (!landlord) throw new AppError("Merchant profile required", 403);

  const existing = await prisma.property.findMany({
    where: { landlordId: landlord.id, status: { not: "INACTIVE" } },
    select: { propertyType: true },
  });

  const counts = {
    residential: 0,
    car: 0,
    appliance: 0,
    total: existing.length,
  };

  for (const property of existing) {
    counts[getPropertyCategory(property.propertyType)] += 1;
  }

  const tierLabel = access.plan === "PRO" ? "Pro" : "Free";

  if (counts.total >= limits.total) {
    throw new AppError(
      `${tierLabel} plan limit reached: maximum ${limits.total} total listings. Upgrade your plan for more access.`,
      403
    );
  }

  const category = getPropertyCategory(propertyType);
  if (category === "residential" && counts.residential >= limits.residential) {
    throw new AppError(
      `${tierLabel} plan limit reached: maximum ${limits.residential} property listings. Upgrade your plan for more access.`,
      403
    );
  }
  if (category === "car" && counts.car >= limits.cars) {
    throw new AppError(
      `${tierLabel} plan limit reached: maximum ${limits.cars} car listings. Upgrade your plan for more access.`,
      403
    );
  }
  if (category === "appliance" && counts.appliance >= limits.appliances) {
    throw new AppError(
      `${tierLabel} plan limit reached: maximum ${limits.appliances} appliance listings. Upgrade your plan for more access.`,
      403
    );
  }
}
