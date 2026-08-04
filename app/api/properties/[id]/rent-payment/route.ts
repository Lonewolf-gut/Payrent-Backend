import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { propertyRentPaymentService } from "@/lib/services/property-rent-payment.service";
import { AppError } from "@/lib/errors";

const bodySchema = z.object({
  applicationId: z.string().cuid().optional(),
});

export const POST = withAuth(
  async (req: NextRequest, context, session) => {
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiResponse({ error: parsed.error.flatten() }, 400);
    }

    try {
      const payment = await propertyRentPaymentService.payRent(
        session.user.id,
        id,
        parsed.data.applicationId
      );
      return apiResponse(payment, 201, "Rent payment completed successfully.");
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
