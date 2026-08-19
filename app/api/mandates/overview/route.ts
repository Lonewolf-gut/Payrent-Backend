import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth } from "@/lib/api/handler";
import { loadMandatePreviewsForTenant } from "@/lib/services/mandate-preview.service";

export const GET = withAuth(
  async (_req, _ctx, session) => {
    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
    });
    if (!tenant) return apiResponse([]);

    const previews = await loadMandatePreviewsForTenant(tenant.id, session.user.id);
    return apiResponse(previews);
  },
  { roles: ["BUYER"] }
);
