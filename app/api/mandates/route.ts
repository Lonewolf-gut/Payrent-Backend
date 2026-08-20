import { NextRequest } from "next/server";
import { createMandateSchema, submitMandateSchema } from "@/lib/validations/mandate";
import { mandateService } from "@/lib/services/mandate.service";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async (req: NextRequest, _ctx, session) => {
    if (session.user.role === "BUYER") {
      const tenant = await prisma.tenant.findUnique({
        where: { userId: session.user.id },
      });
      if (!tenant) return apiResponse([]);
      const mandates = await mandateService.listForTenant(tenant.id);
      return apiResponse(mandates, 200, "Mandates retrieved.");
    }

    if (session.user.role === "ADMIN") {
      const scope = req.nextUrl.searchParams.get("scope");
      const mandates =
        scope === "pending"
          ? await mandateService.listPendingReview()
          : await mandateService.listAllForAdmin();
      return apiResponse(mandates, 200, "Mandates retrieved.");
    }

    return apiResponse([]);
  },
  { roles: ["BUYER", "ADMIN"] }
);

export const POST = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const body = await req.json();
    const parsed = createMandateSchema.safeParse(body);
    if (!parsed.success) return apiResponse(null, 400, "Validation failed.");

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse(null, 403, "Customer profile required.");

    const mandate = await mandateService.create(
      tenant.id,
      session.user.id,
      parsed.data
    );

    return apiResponse(mandate, 201, "Mandate created.");
  },
  { roles: ["BUYER"], permission: "mandate:create" }
);

export const PATCH = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const body = await req.json();
    const { mandateId, ...rest } = body;
    const parsed = submitMandateSchema.safeParse(rest);
    if (!parsed.success || !mandateId) {
      return apiResponse(null, 400, "Validation failed.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse(null, 403, "Customer profile required.");

    const mandate = await mandateService.submit(
      mandateId,
      tenant.id,
      session.user.id,
      parsed.data
    );

    return apiResponse(mandate, 200, "Mandate submitted.");
  },
  { roles: ["BUYER"], permission: "mandate:create" }
);
