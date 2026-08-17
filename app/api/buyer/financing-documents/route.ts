import { apiResponse, withAuth } from "@/lib/api/handler";
import { financingRequestDocService } from "@/lib/services/financing-request-doc.service";

/** Lists per-request financing documents for all of the buyer's applications. */
export const GET = withAuth(
  async (_req, _ctx, session) => {
    const data = await financingRequestDocService.listForTenant(session.user.id);
    return apiResponse(data);
  },
  { roles: ["BUYER"] }
);
