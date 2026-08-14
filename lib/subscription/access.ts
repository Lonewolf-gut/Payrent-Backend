import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getBusinessRules } from "@/lib/services/business-rules.service";
import { subscriptionService } from "@/lib/services/subscription.service";
import { isPaidPlan, normalizeSubscriptionPlan } from "@/lib/subscription/plans";
import {
  roleHasFreePlatformAccess,
  roleRequiresSubscription,
  roleUsesLenderFinancingLimit,
} from "@/lib/subscription/roles";
import { TRIAL_DAYS } from "@/lib/subscription/pricing";
import type { UserRole } from "@prisma/client";

export { TRIAL_DAYS };

export type SubscriptionAccess = {
  plan: ReturnType<typeof normalizeSubscriptionPlan>;
  isPaid: boolean;
  trialEndsAt: Date | null;
  trialActive: boolean;
  trialExpired: boolean;
  hasFullAccess: boolean;
  requiresSubscription: boolean;
};

export async function loadSubscriptionAccess(userId: string): Promise<SubscriptionAccess> {
  const [user, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { trialEndsAt: true, createdAt: true, role: true },
    }),
    subscriptionService.getCurrent(userId),
  ]);

  const plan = normalizeSubscriptionPlan(sub?.plan ?? "FREE");
  const isPaid = isPaidPlan(plan);
  const role = user?.role ?? "BUYER";
  const requiresSubscription = roleRequiresSubscription(role);

  if (roleHasFreePlatformAccess(role)) {
    return {
      plan,
      isPaid,
      trialEndsAt: null,
      trialActive: false,
      trialExpired: false,
      hasFullAccess: true,
      requiresSubscription: false,
    };
  }

  if (roleUsesLenderFinancingLimit(role)) {
    return {
      plan,
      isPaid,
      trialEndsAt: null,
      trialActive: false,
      trialExpired: false,
      hasFullAccess: isPaid,
      requiresSubscription: false,
    };
  }

  if (role === "MERCHANT" || role === "MARKETER") {
    return {
      plan,
      isPaid,
      trialEndsAt: null,
      trialActive: false,
      trialExpired: false,
      hasFullAccess: isPaid,
      requiresSubscription: true,
    };
  }

  return {
    plan,
    isPaid,
    trialEndsAt: null,
    trialActive: false,
    trialExpired: false,
    hasFullAccess: isPaid,
    requiresSubscription,
  };
}

export async function getSubscriptionAccess(userId: string): Promise<SubscriptionAccess> {
  return loadSubscriptionAccess(userId);
}

export async function assertPlatformAccess(
  userId: string,
  feature: string,
  role?: UserRole
): Promise<SubscriptionAccess> {
  const resolvedRole =
    role ??
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      })
    )?.role;

  if (resolvedRole && roleHasFreePlatformAccess(resolvedRole)) {
    return loadSubscriptionAccess(userId);
  }

  if (resolvedRole === "MERCHANT" || resolvedRole === "MARKETER") {
    return getSubscriptionAccess(userId);
  }

  const access = await getSubscriptionAccess(userId);
  if (access.isPaid) return access;

  throw new AppError(
    `Upgrade at /pricing to ${feature}.`,
    403,
    "SUBSCRIPTION_REQUIRED"
  );
}

export function hasUnlimitedListingAccess(access: SubscriptionAccess) {
  return access.plan === "MAX";
}
