import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiResponse, withAuth } from "@/lib/api/handler";
import { bankPartnerService } from "@/lib/services/payment/bank-partner.service";
import { isPaymentDemoMode } from "@/lib/services/payment/demo-mode";

const schema = z.object({
  amount: z.number().positive(),
});

export const GET = withAuth(async (_req, _ctx, session) => {
  const pending = await bankPartnerService.listUserPendingTransactions(session.user.id);
  return apiResponse({ pending });
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return apiResponse({ error: "Invalid amount" }, 400);
    }

    const instructions = await bankPartnerService.createDepositInstructions(
      session.user.id,
      parsed.data.amount
    );

    if (isPaymentDemoMode()) {
      await bankPartnerService.processDeposit({
        userId: session.user.id,
        amount: parsed.data.amount,
        reference: instructions.reference,
        description: "Demo bank deposit",
        status: "COMPLETED",
      });

      return apiResponse(
        {
          ...instructions,
          status: "COMPLETED",
          demoCompleted: true,
        },
        201,
        "Bank deposit credited immediately (demo mode)."
      );
    }

    return apiResponse(instructions, 201);
  } catch (error) {
    return apiError(error);
  }
});
