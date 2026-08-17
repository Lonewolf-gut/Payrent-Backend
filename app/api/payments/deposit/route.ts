import { NextRequest } from "next/server";
import { z } from "zod";
import { paymentService } from "@/lib/services/payment/payment.service";
import { completeWalletDeposit } from "@/lib/services/payment/payment-completion.service";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { getPaymentProvider } from "@/lib/services/payment/provider";
import {
  canDeposit,
  getWalletTypeForRole,
} from "@/lib/wallet/role-wallet";

const depositSchema = z.object({
  amount: z.number().positive(),
  bankAccountId: z.string().cuid().optional(),
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  if (!canDeposit(session.user.role)) {
    return apiResponse({ error: "Deposits are not available for this role" }, 403);
  }

  const parsed = depositSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiResponse({ error: "Amount and verified payout account are required" }, 400);
  }

  const walletType = getWalletTypeForRole(session.user.role);
  if (!walletType) return apiResponse({ error: "Invalid role" }, 400);

  const provider = getPaymentProvider();
  if (provider !== "demo" && !parsed.data.bankAccountId) {
    return apiResponse({ error: "Amount and verified payout account are required" }, 400);
  }

  const payment = await paymentService.requestWalletDeposit({
    userId: session.user.id,
    walletType,
    amount: parsed.data.amount,
    bankAccountId: parsed.data.bankAccountId ?? "demo-checkout",
    description: "PayRent wallet top-up",
  });

  if (payment.status === "FAILED") {
    return apiResponse({ payment }, 400, payment.message ?? "Deposit failed");
  }

  return apiResponse(
    { payment },
    202,
    payment.message ??
      "MoMo payment initiated — approve the prompt on your phone. You will receive a notification when the deposit completes."
  );
});

export const GET = withAuth(async (req: NextRequest, _ctx, session) => {
  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference) {
    return apiResponse({ error: "reference query param required" }, 400);
  }

  const status = await paymentService.verifyWalletTopUp(reference);

  if (status.status === "SUCCESSFUL") {
    const walletType = getWalletTypeForRole(session.user.role);
    if (!walletType) return apiResponse({ error: "Invalid role" }, 400);

    const result = await completeWalletDeposit({
      clientReference: reference,
      amount: 0,
      provider: status.provider,
      description: `${status.provider} deposit — ${reference}`,
    });

    return apiResponse({ status, wallet: result });
  }

  return apiResponse({ status });
});
