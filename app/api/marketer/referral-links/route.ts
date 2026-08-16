import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { agentReferralService } from "@/lib/services/agent-referral.service";
import { prisma } from "@/lib/db/prisma";
import { getCustomerAppOrigin } from "@/lib/utils/app-origin";

const createLinkSchema = z.object({
  propertyId: z.string().min(1, "Listing is required"),
  label: z.string().max(120).optional(),
});

export const GET = withAuth(
  async (_req: NextRequest, _ctx, session) => {
    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!agent) return apiResponse({ error: "Affiliate profile required" }, 403);

    const links = await agentReferralService.listLinks(agent.id);
    const origin = getCustomerAppOrigin(_req);
    const fallbackProperty = await prisma.property.findFirst({
      where: { agentUserId: agent.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    const enriched = links.map((link) => {
      const propertyId = link.propertyId ?? fallbackProperty?.id ?? null;
      return {
        ...link,
        url: agentReferralService.formatLinkUrl(origin, link.code, propertyId),
      };
    });
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
    const origin = getCustomerAppOrigin(req);
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
