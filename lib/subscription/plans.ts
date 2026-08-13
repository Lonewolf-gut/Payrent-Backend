import type { SubscriptionPlan } from "@prisma/client";
import { PLAN_PRICES, getSubscriptionPrice } from "@/lib/subscription/pricing";

export type CheckoutPlanId = "FREE" | "PRO" | "MAX";

export const CHECKOUT_PLANS: CheckoutPlanId[] = ["FREE", "PRO", "MAX"];

export function normalizeSubscriptionPlan(
  plan?: string | null
): CheckoutPlanId {
  if (plan === "PRO") return "PRO";
  if (plan === "MAX" || plan === "PREMIUM") return "MAX";
  return "FREE";
}

export function isPaidPlan(plan?: string | null) {
  const normalized = normalizeSubscriptionPlan(plan);
  return normalized === "PRO" || normalized === "MAX";
}

export function isUnlimitedTier(plan?: string | null) {
  return normalizeSubscriptionPlan(plan) === "MAX";
}

export function toSubscriptionPlan(plan: CheckoutPlanId): SubscriptionPlan {
  return plan;
}

export const PLAN_CATALOG: Record<
  CheckoutPlanId,
  {
    id: CheckoutPlanId;
    name: string;
    tagline: string;
    highlight: boolean;
    features: string[];
    includesLabel?: string;
  }
> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "Get started on PayForMe",
    highlight: false,
    features: [
      "Merchants: list unlimited products; marketplace visibility requires Pro or Max",
      "Affiliates: 1 house, 1 car, 1 appliance (3 total) after trial",
      "Lenders: finance up to 100 properties free",
      "7-day full-access trial for merchants and affiliates",
      "Email support",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "For growing merchants and Affiliates",
    highlight: true,
    includesLabel: "Everything in Free, and:",
    features: [
      "Up to 10 houses or rooms (merchants) or assignments (Affiliates)",
      "Up to 5 cars",
      "Up to 5 home appliances",
      "Priority listing review",
      "Affiliate assignment & advertising",
    ],
  },
  MAX: {
    id: "MAX",
    name: "Max",
    tagline: "Unlimited scale for merchants, affiliates, and lenders",
    highlight: false,
    includesLabel: "Everything in Pro, plus:",
    features: [
      "Unlimited listings or assigned listings",
      "Unlimited lender financing opportunities",
      "Unlimited cars and appliances",
      "Premium search placement",
      "Priority Affiliate promotion",
      "Priority support",
    ],
  },
};

export function formatPlanPrice(plan: CheckoutPlanId, billingCycle: "MONTHLY" | "ANNUAL") {
  if (plan === "FREE") return "GHS 0";
  const amount = getSubscriptionPrice(plan, billingCycle);
  return `GHS ${amount.toFixed(2)}`;
}

export function getAnnualSavingsPercent(plan: CheckoutPlanId) {
  if (plan === "FREE") return 0;
  const monthly = PLAN_PRICES[plan].monthly * 12;
  const annual = PLAN_PRICES[plan].annual;
  if (monthly <= 0) return 0;
  return Math.round(((monthly - annual) / monthly) * 100);
}

export function getRenewalDate(billingCycle: "MONTHLY" | "ANNUAL") {
  const date = new Date();
  if (billingCycle === "ANNUAL") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
