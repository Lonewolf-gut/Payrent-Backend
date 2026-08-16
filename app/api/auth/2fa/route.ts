import { NextRequest } from "next/server";
import { z } from "zod";
import { twoFactorService } from "@/lib/services/two-factor.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(async (_req, _ctx, session) => {
  const status = await twoFactorService.getStatus(session.user.id);
  return apiResponse(status);
});

export const POST = withAuth(async (req: NextRequest, _ctx, session) => {
  const body = await req.json();
  const schema = z.object({
    action: z.enum(["enable", "verify", "disable"]),
    token: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiResponse({ error: "Invalid input. Choose enable, verify, or disable." }, 400, "Invalid input.");
  }

  if (parsed.data.action === "enable") {
    const result = await twoFactorService.enable(session.user.id, session.user.email);
    return apiResponse(result);
  }

  if (!parsed.data.token) {
    return apiResponse({ error: "Enter the 6-digit code from your authenticator app." }, 400, "Token required.");
  }

  if (parsed.data.action === "verify") {
    await twoFactorService.verify(session.user.id, parsed.data.token);
    return apiResponse({ enabled: true });
  }

  await twoFactorService.disable(session.user.id, parsed.data.token);
  return apiResponse({ enabled: false });
});
