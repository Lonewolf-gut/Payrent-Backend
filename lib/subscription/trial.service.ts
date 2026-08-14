import { prisma } from "@/lib/db/prisma";
import { loadSubscriptionAccess } from "@/lib/subscription/access";
import { isUnlimitedPlan } from "@/lib/subscription-limits";

export async function suspendListingsAfterTrial(userId: string) {
  const access = await loadSubscriptionAccess(userId);
  if (access.isPaid || isUnlimitedPlan(access.plan)) {
    return { suspended: 0 };
  }

  if (!access.trialExpired) {
    return { suspended: 0 };
  }

  const landlord = await prisma.landlord.findUnique({ where: { userId } });
  if (!landlord) return { suspended: 0 };

  const result = await prisma.property.updateMany({
    where: {
      landlordId: landlord.id,
      status: { in: ["ACTIVE", "RENTED"] },
    },
    data: { status: "TRIAL_SUSPENDED" },
  });

  return { suspended: result.count };
}

export async function reactivateTrialSuspendedListings(userId: string) {
  const landlord = await prisma.landlord.findUnique({ where: { userId } });
  if (!landlord) return { reactivated: 0 };

  const result = await prisma.property.updateMany({
    where: {
      landlordId: landlord.id,
      status: "TRIAL_SUSPENDED",
    },
    data: { status: "ACTIVE" },
  });

  return { reactivated: result.count };
}

export async function processExpiredTrials() {
  return { processed: 0, suspendedListings: 0 };
}
