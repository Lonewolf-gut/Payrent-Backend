import { NextRequest } from "next/server";
import { apiResponse, withPublicHandler } from "@/lib/api/handler";
import { agentReferralService } from "@/lib/services/agent-referral.service";
export const GET = withPublicHandler(async (_req: NextRequest, context) => {
  const { code } = await context.params;
  const resolved = await agentReferralService.resolveReferralDestination(code);

  if (!resolved) {
    return apiResponse({ redirectPath: "/", tracked: false }, 404, "Referral link not found.");
  }

  await agentReferralService.trackClick(resolved.code);

  return apiResponse({
    redirectPath: resolved.redirectPath,
    code: resolved.code,
    propertyId: resolved.propertyId,
    tracked: true,
  });
});
