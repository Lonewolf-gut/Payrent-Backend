import { NextRequest } from "next/server";
import { respondToClarificationSchema } from "@/lib/validations/application";
import { applicationService } from "@/lib/services/application.service";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const POST = withAuth(
  async (req: NextRequest, ctx, session) => {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = respondToClarificationSchema.safeParse(body);
    if (!parsed.success) {
      return apiResponse(null, 400, "Validation failed.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse(null, 403, "Customer profile required.");

    const application = await applicationService.respondToClarification(
      id,
      tenant.id,
      session.user.id,
      parsed.data
    );

    return apiResponse(application, 200, "Your response was submitted for review.");
  },
  { roles: ["BUYER"], permission: "application:create" }
);
