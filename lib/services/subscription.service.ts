import { prisma, runTransaction } from "@/lib/db/prisma";
import type { SubscriptionPlan, BillingCycle, UserRole } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { getPlanLimits } from "@/lib/subscription-limits";
import { PLAN_CATALOG, normalizeSubscriptionPlan } from "@/lib/subscription/plans";
import { walletService } from "@/lib/services/wallet.service";
import {
  getSubscriptionPrice,
  PLAN_PRICES,
} from "@/lib/subscription/pricing";
import { reactivateTrialSuspendedListings, suspendListingsAfterTrial } from "@/lib/subscription/trial.service";
import { roleRequiresSubscription } from "@/lib/subscription/roles";

export { getSubscriptionPrice, PLAN_PRICES };

function getPlanLabel(plan: SubscriptionPlan) {
  return PLAN_CATALOG[normalizeSubscriptionPlan(plan)].name;
}

function hasActivePaidPlan(plan?: SubscriptionPlan | null, status?: string | null) {
  if (!plan || status !== "ACTIVE") return false;
  return plan !== "FREE";
}

function assertSubscriptionEligibleRole(role: UserRole) {
  if (!roleRequiresSubscription(role)) {
    throw new AppError(
      "Subscriptions are available for merchant, affiliate, and lender accounts.",
      403,
      "SUBSCRIPTION_NOT_AVAILABLE"
    );
  }
}

export class SubscriptionService {
  async getCurrent(userId: string) {
    const active = await prisma.subscription.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    if (!active.length) return null;

    const paidPlan = active.find((subscription) => subscription.plan !== "FREE");
    return paidPlan ?? active[0];
  }

  async upgradeWithPaystack(
    userId: string,
    role: UserRole,
    plan: SubscriptionPlan,
    billingCycle: BillingCycle
  ) {
    if (plan === "FREE") {
      throw new AppError("Use cancel to return to the free plan");
    }

    assertSubscriptionEligibleRole(role);

    const current = await this.getCurrent(userId);
    if (hasActivePaidPlan(current?.plan, current?.status) && current?.plan === plan) {
      throw new AppError(`You already have an active ${getPlanLabel(plan)} subscription`);
    }

    const walletType = getWalletTypeForRole(role);
    if (!walletType) {
      throw new AppError("Your account role cannot purchase a subscription");
    }

    const { paystackPaymentService } = await import(
      "@/lib/services/payment/paystack-payment.service"
    );

    return paystackPaymentService.requestSubscriptionPayment({
      userId,
      role,
      plan,
      billingCycle,
    });
  }

  async upgradeWithMomo(
    userId: string,
    role: UserRole,
    plan: SubscriptionPlan,
    billingCycle: BillingCycle,
    bankAccountId: string
  ) {
    if (plan === "FREE") {
      throw new AppError("Use cancel to return to the free plan");
    }

    assertSubscriptionEligibleRole(role);

    const current = await this.getCurrent(userId);
    if (hasActivePaidPlan(current?.plan, current?.status) && current?.plan === plan) {
      throw new AppError(`You already have an active ${getPlanLabel(plan)} subscription`);
    }

    const { momoPaymentService } = await import(
      "@/lib/services/payment/momo-payment.service"
    );

    return momoPaymentService.requestSubscriptionPayment({
      userId,
      role,
      plan,
      billingCycle,
      bankAccountId,
    });
  }

  async upgradeWithPayment(
    _userId: string,
    _role: UserRole,
    _plan: SubscriptionPlan,
    _billingCycle: BillingCycle
  ) {
    throw new AppError(
      "Subscriptions cannot be paid from your wallet. Use Mobile Money instead.",
      400,
      "WALLET_SUBSCRIPTION_DISABLED"
    );
  }

  async upgrade(
    userId: string,
    plan: SubscriptionPlan,
    billingCycle: BillingCycle,
    options?: { skipCancelCheck?: boolean }
  ) {
    if (plan === "FREE") {
      throw new AppError("Use cancel to return to the free plan");
    }

    const current = await this.getCurrent(userId);

    if (
      !options?.skipCancelCheck &&
      hasActivePaidPlan(current?.plan, current?.status) &&
      current?.plan === plan
    ) {
      throw new AppError(`You already have an active ${getPlanLabel(plan)} subscription`);
    }

    if (current) {
      await prisma.subscription.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    const endDate = new Date();
    if (billingCycle === "MONTHLY") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        billingCycle,
        status: "ACTIVE",
        autoRenew: true,
        endDate,
      },
    });

    await reactivateTrialSuspendedListings(userId);

    return subscription;
  }

  async cancel(userId: string) {
    const current = await this.getCurrent(userId);
    if (!current) throw new AppError("No active subscription");

    await prisma.subscription.update({
      where: { id: current.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), autoRenew: false },
    });

    const subscription = await prisma.subscription.create({
      data: { userId, plan: "FREE", status: "ACTIVE" },
    });

    await suspendListingsAfterTrial(userId);

    return subscription;
  }

  async expireDueSubscriptions() {
    const now = new Date();
    const due = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        plan: { in: ["PRO", "MAX", "PREMIUM"] },
        endDate: { lte: now },
      },
      select: { id: true, userId: true, plan: true },
    });

    let expired = 0;
    for (const sub of due) {
      await runTransaction(async (db) => {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "EXPIRED", autoRenew: false },
        });

        const hasFree = await db.subscription.findFirst({
          where: { userId: sub.userId, status: "ACTIVE", plan: "FREE" },
        });

        if (!hasFree) {
          await db.subscription.create({
            data: { userId: sub.userId, plan: "FREE", status: "ACTIVE" },
          });
        }
      });

      await notificationService.create({
        userId: sub.userId,
        title: `${getPlanLabel(sub.plan)} subscription expired`,
        body: "Your paid plan has ended. Upgrade again anytime from the pricing page.",
        channel: "IN_APP",
      });

      await suspendListingsAfterTrial(sub.userId);

      expired += 1;
    }

    return { expired };
  }

  getPlanFeatures(plan: SubscriptionPlan) {
    const normalized = normalizeSubscriptionPlan(plan);
    const catalog = PLAN_CATALOG[normalized];
    return {
      plan,
      features: catalog.features,
      pricing: PLAN_PRICES[plan] ?? PLAN_PRICES[normalized],
    };
  }

  getFreeLimits() {
    return getPlanLimits("FREE")!;
  }

  async adminGrantPremium(userId: string, days = 30) {
    return this.adminGrantPlan(userId, "MAX", days);
  }

  async adminGrantPlan(userId: string, plan: SubscriptionPlan, days = 30) {
    const current = await this.getCurrent(userId);
    if (hasActivePaidPlan(current?.plan, current?.status) && current?.plan === plan) {
      const base = current.endDate && current.endDate > new Date() ? current.endDate : new Date();
      const endDate = new Date(base);
      endDate.setDate(endDate.getDate() + days);
      return prisma.subscription.update({
        where: { id: current.id },
        data: { endDate, status: "ACTIVE" },
      });
    }

    if (current) {
      await prisma.subscription.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        billingCycle: "MONTHLY",
        status: "ACTIVE",
        autoRenew: false,
        endDate,
      },
    });

    await reactivateTrialSuspendedListings(userId);

    return subscription;
  }

  async adminExtendSubscription(subscriptionId: string, days: number) {
    const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new AppError("Subscription not found", 404);

    const base = sub.endDate && sub.endDate > new Date() ? sub.endDate : new Date();
    const endDate = new Date(base);
    endDate.setDate(endDate.getDate() + days);

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { endDate, status: "ACTIVE" },
    });
  }

  async adminCancel(userId: string) {
    return this.cancel(userId);
  }
}

export const subscriptionService = new SubscriptionService();
