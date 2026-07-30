import { NextRequest } from "next/server";
import { z } from "zod";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { lenderTagService } from "@/lib/services/lender-tag.service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";

const tagBodySchema = z.object({
  lenderIds: z.array(z.string().min(1)).min(1),
  reason: z.string().max(500).optional(),
  notify: z.boolean().optional(),
});

export const GET = withAuth(
  async (_req: NextRequest, context) => {
    const { id } = await context.params;
    const [tags, suggestions, allLenders] = await Promise.all([
      lenderTagService.getTagsForRequest(id),
      lenderTagService.getSuggestedLenders(id),
      prisma.lender.findMany({
        where: { user: { isActive: true } },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { fullName: "asc" },
      }),
    ]);
    return apiResponse({ tags, suggestions, allLenders });
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);

export const POST = withAuth(
  async (req: NextRequest, context, session) => {
    const { id } = await context.params;
    const json = await req.json().catch(() => null);
    const parsed = tagBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError("Invalid tag payload", 400);
    }

    const tags = await lenderTagService.tagLenders(
      id,
      parsed.data.lenderIds,
      session.user.id,
      { reason: parsed.data.reason, notify: parsed.data.notify }
    );

    return apiResponse({ tags }, 201, "Lenders tagged successfully.");
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);

const deleteBodySchema = z.object({
  lenderId: z.string().min(1),
});

export const DELETE = withAuth(
  async (req: NextRequest, context) => {
    const { id } = await context.params;
    const json = await req.json().catch(() => null);
    const parsed = deleteBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError("lenderId is required", 400);
    }

    const result = await lenderTagService.removeTag(id, parsed.data.lenderId);
    return apiResponse(result, 200, "Lender tag removed.");
  },
  { roles: ["ADMIN"], permission: "admin:transactions" }
);
