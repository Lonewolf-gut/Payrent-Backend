import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { financingService } from "@/lib/services/financing.service";

export const POST = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const body = await req.json().catch(() => ({}));
    const financingRequestId =
      typeof body.financingRequestId === "string" ? body.financingRequestId : null;

    if (!financingRequestId) {
      return apiResponse(null, 400, "financingRequestId is required.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse(null, 403, "Customer profile required.");

    const mandate = await financingService.syncMandateDraftForRequest(
      tenant.id,
      session.user.id,
      financingRequestId
    );

    if (!mandate) {
      return apiResponse(
        null,
        400,
        "Could not prepare a mandate for this request. Check that a verified bank account is selected."
      );
    }

    return apiResponse({ mandateId: mandate.id }, 200, "Mandate prepared.");
  },
  { roles: ["BUYER"], permission: "mandate:create" }
);
