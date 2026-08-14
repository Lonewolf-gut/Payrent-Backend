import type { PropertyType } from "@prisma/client";

export const FREE_PLAN_LIMITS = {
  residential: 1,
  cars: 1,
  appliances: 1,
  total: 3,
} as const;

/** Free Affiliates can promote one listing and earn commission on it. */
export const AFFILIATE_FREE_PLAN_LIMITS = {
  residential: 1,
  cars: 1,
  appliances: 1,
  total: 1,
} as const;

export const PRO_PLAN_LIMITS = {
  residential: 10,
  cars: 5,
  appliances: 5,
  total: 20,
} as const;

export type PlanLimits = {
  residential: number;
  cars: number;
  appliances: number;
  total: number;
};

export type PropertyCategory = "residential" | "car" | "appliance";

export const RESIDENTIAL_TYPES: PropertyType[] = [
  "APARTMENT",
  "HOUSE",
  "CONDO",
  "TOWNHOUSE",
  "STUDIO",
  "COMMERCIAL",
  "LAND",
];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  HOUSE: "House",
  CONDO: "Condo",
  TOWNHOUSE: "Townhouse",
  STUDIO: "Studio / Room",
  COMMERCIAL: "Commercial space",
  LAND: "Land",
  CAR: "Car",
  APPLIANCE: "Home appliance",
};

export const PROPERTY_CATEGORIES: Record<
  PropertyCategory,
  {
    label: string;
    description: string;
    types: PropertyType[];
  }
> = {
  residential: {
    label: "Houses & rooms",
    description: "Apartments, houses, studios, and commercial rental spaces",
    types: RESIDENTIAL_TYPES,
  },
  car: {
    label: "Cars",
    description: "Vehicles available for rent or hire-purchase",
    types: ["CAR"],
  },
  appliance: {
    label: "Home appliances",
    description: "Fridges, TVs, furniture, and other rentable appliances",
    types: ["APPLIANCE"],
  },
};

export function getPropertyCategory(
  type: PropertyType
): PropertyCategory {
  if (type === "CAR") return "car";
  if (type === "APPLIANCE") return "appliance";
  return "residential";
}

export function getCategoryForType(type: PropertyType): PropertyCategory {
  return getPropertyCategory(type);
}

export function isSaleListing(type: PropertyType) {
  return type === "CAR" || type === "APPLIANCE";
}

export function normalizePlanTier(plan?: string | null) {
  if (plan === "PRO") return "PRO" as const;
  if (plan === "MAX" || plan === "PREMIUM") return "MAX" as const;
  return "FREE" as const;
}

export function isUnlimitedPlan(plan?: string | null) {
  return normalizePlanTier(plan) === "MAX";
}

export function getPlanLimits(plan?: string | null): PlanLimits | null {
  const tier = normalizePlanTier(plan);
  if (tier === "MAX") return null;
  if (tier === "PRO") return PRO_PLAN_LIMITS;
  return FREE_PLAN_LIMITS;
}

export function getAffiliatePlanLimits(plan?: string | null): PlanLimits | null {
  const tier = normalizePlanTier(plan);
  if (tier === "MAX") return null;
  if (tier === "PRO") return PRO_PLAN_LIMITS;
  return AFFILIATE_FREE_PLAN_LIMITS;
}

export function getLimitKey(category: PropertyCategory): keyof PlanLimits {
  if (category === "car") return "cars";
  if (category === "appliance") return "appliances";
  return "residential";
}
