import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { agentReferralService } from "@/lib/services/agent-referral.service";
import { prisma } from "@/lib/db/prisma";
import { getAppOrigin } from "@/lib/utils/app-origin";

const createLinkSchema = z.object({
  propertyId: z.string().optional(),
  label: z.string().max(120).optional(),
});

export const GET = withAuth(
  async (_req: NextRequest, _ctx, session) => {
    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!agent) return apiResponse({ error: "Affiliate profile required" }, 403);

    const links = await agentReferralService.listLinks(agent.id);
    const origin = getAppOrigin(_req);
    const enriched = links.map((link) => ({
      ...link,
      url: agentReferralService.formatLinkUrl(origin, link.code, link.propertyId),
    }));
    return apiResponse(enriched);
  },
  { roles: ["MARKETER"] }
);

export const POST = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!agent) return apiResponse({ error: "Affiliate profile required" }, 403);

    const body = await req.json();
    const parsed = createLinkSchema.safeParse(body);
    if (!parsed.success) {
      return apiResponse({ error: parsed.error.flatten() }, 400);
    }

    const link = await agentReferralService.createLink(agent.id, parsed.data);
    const origin = getAppOrigin(req);
    return apiResponse(
      {
        ...link,
        url: agentReferralService.formatLinkUrl(origin, link.code, link.propertyId),
      },
      201
    );
  },
  { roles: ["MARKETER"] }
);
