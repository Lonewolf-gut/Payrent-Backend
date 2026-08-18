import { apiResponse, withAuth } from "@/lib/api/handler";
import { financingRequestDocService } from "@/lib/services/financing-request-doc.service";

export const GET = withAuth(
  async () => {
    const data = await financingRequestDocService.listApprovedRecords();
    return apiResponse(data);
  },
  { roles: ["ADMIN"] }
);
