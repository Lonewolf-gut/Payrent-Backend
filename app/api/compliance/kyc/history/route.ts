import { kycService } from "@/lib/services/kyc.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

export const GET = withAuth(
  async () => {
    const history = await kycService.getApprovedKycHistory();
    return apiResponse(history, 200, "Approved KYC history retrieved.");
  },
  { roles: ["COMPLIANCE_OFFICER"], permission: "compliance:kyc" }
);
