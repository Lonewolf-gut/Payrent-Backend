import { NextRequest } from "next/server";
import { apiResponse, withPublicHandler } from "@/lib/api/handler";
import { agentReferralService } from "@/lib/services/agent-referral.service";
import { getReferralDestinationPath } from "@/lib/utils/agent-referral";

export const GET = withPublicHandler(async (_req: NextRequest, context) => {
  const { code } = await context.params;
  const link = await agentReferralService.resolveReferralCode(code);

  if (!link) {
    return apiResponse({ redirectPath: "/", tracked: false }, 404, "Referral link not found.");
  }

  await agentReferralService.trackClick(link.code);

  return apiResponse({
    redirectPath: getReferralDestinationPath(link.propertyId),
    code: link.code,
    propertyId: link.propertyId,
    tracked: true,
  });
});
