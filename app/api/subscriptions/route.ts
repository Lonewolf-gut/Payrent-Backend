import { NextRequest } from "next/server";
import { z } from "zod";
import { subscriptionService } from "@/lib/services/subscription.service";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { roleRequiresSubscription } from "@/lib/subscription/roles";
import { AppError } from "@/lib/errors";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { getPaymentProvider } from "@/lib/services/payment/provider";
import type { SubscriptionPlan, BillingCycle } from "@prisma/client";

export const GET = withAuth(async (_req, _ctx, session) => {
  const [sub, access] = await Promise.all([
    subscriptionService.getCurrent(session.user.id),
    getSubscriptionAccess(session.user.id),
  ]);
  const features = subscriptionService.getPlanFeatures(sub?.plan ?? "FREE");
  return apiResponse({ subscription: sub, access, ...features });
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const body = await req.json();
  const schema = z.object({
    action: z.enum(["upgrade", "cancel"]),
    plan: z.enum(["PRO", "MAX", "PREMIUM"]).optional(),
    billingCycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
    paymentMethod: z.enum(["momo"]).optional(),
    bankAccountId: z.string().cuid().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiResponse({ error: "Invalid input" }, 400);

  if (parsed.data.action === "cancel") {
    if (!roleRequiresSubscription(session.user.role)) {
      throw new AppError("Your account does not use subscriptions.", 403, "SUBSCRIPTION_NOT_AVAILABLE");
    }
    const result = await subscriptionService.cancel(session.user.id);
    return apiResponse(result);
  }

  if (!roleRequiresSubscription(session.user.role)) {
    throw new AppError(
      "Subscriptions are available for merchant and marketer accounts only.",
      403,
      "SUBSCRIPTION_NOT_AVAILABLE"
    );
  }

  const plan = (parsed.data.plan ?? "PRO") as SubscriptionPlan;
  const billingCycle = (parsed.data.billingCycle ?? "MONTHLY") as BillingCycle;
  const provider = getPaymentProvider();

  if (provider === "demo") {
    const checkout = await subscriptionService.upgradeWithDemo(
      session.user.id,
      session.user.role,
      plan,
      billingCycle
    );

    return apiResponse(
      { checkout },
      202,
      checkout.message ?? "Continue to demo checkout to activate your subscription."
    );
  }

  if (!parsed.data.bankAccountId) {
    throw new AppError(
      "Add a verified Mobile Money account in Settings before subscribing.",
      400,
      "PAYMENT_METHOD_REQUIRED"
    );
  }

  const checkout = await subscriptionService.upgradeWithMomo(
    session.user.id,
    session.user.role,
    plan,
    billingCycle,
    parsed.data.bankAccountId
  );

  return apiResponse(
    { checkout },
    checkout.status === "FAILED" ? 400 : 202,
    checkout.message ??
      "Approve the MoMo prompt on your phone to activate your subscription."
  );
});
