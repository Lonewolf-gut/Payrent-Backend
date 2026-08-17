import { apiResponse, withAuth } from "@/lib/api/handler";
import { propertyPurchaseService } from "@/lib/services/property-purchase.service";
import { demoPaymentService } from "@/lib/services/payment/demo-payment.service";
import { isDemoPaymentProvider } from "@/lib/config/demo";
import { AppError } from "@/lib/errors";
import { getReferralAgentProfileId } from "@/lib/utils/agent-referral-request";
import { prisma } from "@/lib/db/prisma";
import { isSaleListing } from "@/lib/subscription-limits";
import type { NextRequest } from "next/server";

export const POST = withAuth(
  async (req: NextRequest, context, session) => {
    const { id } = await context.params;

    if (isDemoPaymentProvider()) {
      const property = await prisma.property.findUnique({ where: { id } });
      if (!property || property.status !== "ACTIVE") {
        throw new AppError("Property is not available for purchase", 400);
      }
      if (!isSaleListing(property.propertyType)) {
        throw new AppError("This listing is not available for direct purchase", 400);
      }

      const price = Number(property.discountedPrice ?? property.monthlyRent);
      const referredAgentProfileId = await getReferralAgentProfileId(req);

      const checkout = await demoPaymentService.requestListingPurchase({
        userId: session.user.id,
        propertyId: id,
        propertyName: property.name,
        amount: price,
        referredAgentProfileId,
      });

      return apiResponse(
        { checkout },
        202,
        checkout.message
      );
    }

    const referredAgentProfileId = await getReferralAgentProfileId(req);
    try {
      const purchase = await propertyPurchaseService.purchase(
        session.user.id,
        id,
        referredAgentProfileId
      );
      return apiResponse(purchase, 201, "Purchase completed successfully.");
    } catch (error) {
      if (error instanceof AppError && error.code === "INSUFFICIENT_FUNDS") {
        return apiResponse(
          {
            error: error.message,
            code: "INSUFFICIENT_FUNDS",
            depositUrl: `/dashboard/buyer/wallet`,
          },
          400
        );
      }
      throw error;
    }
  },
  { roles: ["BUYER"] }
);
