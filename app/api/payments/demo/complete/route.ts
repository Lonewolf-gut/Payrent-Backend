import { NextRequest } from "next/server";
import { z } from "zod";
import {
  completeDemoPayment,
  getDemoPaymentSession,
} from "@/lib/services/payment/demo-completion.service";
import { isDemoPaymentProvider } from "@/lib/config/demo";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";

export const GET = withAuth(async (req: NextRequest, _ctx, session) => {
  if (!isDemoPaymentProvider()) {
    throw new AppError("Demo checkout is not enabled", 404, "DEMO_CHECKOUT_DISABLED");
  }

  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) {
    return apiResponse({ error: "reference query param required" }, 400);
  }

  const sessionData = await getDemoPaymentSession(reference, session.user.id);
  if (!sessionData) {
    return apiResponse({ error: "Payment session not found or expired" }, 404);
  }

  return apiResponse({ session: sessionData });
});

const completeSchema = z.object({
  reference: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  if (!isDemoPaymentProvider()) {
    throw new AppError("Demo checkout is not enabled", 404, "DEMO_CHECKOUT_DISABLED");
  }

  const parsed = completeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiResponse({ error: "reference is required" }, 400);
  }

  const result = await completeDemoPayment(parsed.data.reference, session.user.id);

  const messages: Record<string, string> = {
    WALLET_DEPOSIT: "Wallet deposit completed.",
    SUBSCRIPTION: "Subscription activated.",
    LISTING_PURCHASE: "Purchase completed successfully.",
  };

  return apiResponse(result, 200, messages[result.purpose] ?? "Payment completed.");
});
