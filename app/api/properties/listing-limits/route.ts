import { prisma } from "@/lib/db/prisma";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { merchantHasMarketplaceListingVisibility } from "@/lib/subscription/listing-access";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async (_req, _ctx, session) => {
    const access = await getSubscriptionAccess(session.user.id);
    const marketplaceVisible = merchantHasMarketplaceListingVisibility(access);

    let hiddenApprovedCount = 0;
    if (session.user.role === "MERCHANT" && !marketplaceVisible) {
      const landlord = await prisma.landlord.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });

      if (landlord) {
        hiddenApprovedCount = await prisma.property.count({
          where: {
            landlordId: landlord.id,
            status: { in: ["ACTIVE", "RENTED"] },
          },
        });
      }
    }

    return apiResponse({
      plan: access.plan,
      trialActive: access.trialActive,
      trialEndsAt: access.trialEndsAt,
      hasFullAccess: access.hasFullAccess,
      marketplaceVisible,
      hiddenApprovedCount,
    });
  },
  { roles: ["MERCHANT", "MARKETER"] }
);
