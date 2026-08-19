import { NextRequest } from "next/server";
import { addressVerifySchema } from "@/lib/validations/kyc";
import { kycService } from "@/lib/services/kyc.service";
import { apiResponse, withAuth } from "@/lib/api/handler";

function getFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export const POST = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const formData = await req.formData();
    const parsed = addressVerifySchema.safeParse({
      entityType: formData.get("entityType")?.toString() ?? "INDIVIDUAL",
      address: formData.get("address")?.toString(),
      billType: formData.get("billType")?.toString(),
      latitude: formData.get("latitude")?.toString(),
      longitude: formData.get("longitude")?.toString(),
    });
    if (!parsed.success) {
      return apiResponse(null, 400, parsed.error.issues[0]?.message ?? "Validation failed.");
    }

    const addressProof = getFile(formData, "addressProof");
    if (!addressProof) {
      return apiResponse(null, 400, "Address proof document is required.");
    }

    if (
      parsed.data.entityType === "INDIVIDUAL" &&
      (parsed.data.latitude == null || parsed.data.longitude == null)
    ) {
      return apiResponse(null, 400, "Capture your residential GPS location before submitting.");
    }

    const result = await kycService.submitManualAddress(
      session.user.id,
      session.user.role,
      parsed.data,
      { addressProof }
    );

    return apiResponse(result, 200, "Address proof submitted for administrator review.");
  },
  { permission: "kyc:manage" }
);
