import {
  savePropertyDocumentUpload,
  savePropertyImageUpload,
} from "@/lib/integrations/documents";
import type { Prisma, PropertyType } from "@prisma/client";
import { NextRequest } from "next/server";
import { propertyFilterSchema, propertySchema, normalizePropertyPayload, parseOptionalFormNumber } from "@/lib/validations/property";
import { parsePropertyFormData } from "@/lib/utils/property-form-payload";
import { cleanAttributesForDb } from "@/lib/utils/property-form";
import { propertyRepository } from "@/lib/repositories/property.repository";
import { prisma } from "@/lib/db/prisma";
import { apiResponse, withAuth, withPublicHandler } from "@/lib/api/handler";
import {
  getUserDisplayName,
  notifyAllAdminsInAppAndEmail,
  notifyUserInAppAndEmail,
} from "@/lib/services/verification-notifications";
import { assignAgentToProperty } from "@/lib/services/agent-assignment.service";
import { assertLandlordListingLimit } from "@/lib/subscription/listing-access";
import { firstZodIssueMessage } from "@/lib/validations/auth";
import type { PropertyAttributes } from "@/lib/constants/property-listing";

async function assertListingLimit(userId: string, propertyType: PropertyType) {
  await assertLandlordListingLimit(userId, propertyType);
}

export const GET = withPublicHandler(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = propertyFilterSchema.safeParse(params);
  const filters = parsed.success ? parsed.data : propertyFilterSchema.parse({});

  // Public browse shows all ACTIVE listings. Plan limits apply to creating/promoting
  // listings (merchant/affiliate dashboards), not what buyers see on /properties.
  const result = await propertyRepository.findMany(filters);
  return apiResponse(result);
});

export const POST = withAuth(
  async (req, _ctx, session) => {
    let parsed;
    let images: File[] = [];
    let surveyPlanFile: File | null = null;
    let agentProfileId: string | undefined;

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await req.formData();
      agentProfileId = formData.get("agentUserId")?.toString() || undefined;
      parsed = parsePropertyFormData(formData);
      images = formData.getAll("images").filter(
        (value): value is File => value instanceof File && Boolean(value.name)
      );
      const rawSurveyPlan = formData.get("surveyPlan");
      surveyPlanFile =
        rawSurveyPlan instanceof File && rawSurveyPlan.name ? rawSurveyPlan : null;
    } else {
      const body = await req.json();
      agentProfileId = body.agentUserId;
      parsed = propertySchema.safeParse(body);
    }

    if (!parsed.success) {
      return apiResponse(
        { error: parsed.error.flatten() },
        400,
        firstZodIssueMessage(
          parsed.error,
          "Please review your listing details and try again."
        )
      );
    }

    const landlord = await prisma.landlord.findUnique({
      where: { userId: session.user.id },
    });
    if (!landlord) {
      return apiResponse({ error: "Merchant profile required" }, 403);
    }

    await assertListingLimit(
      session.user.id,
      parsed.data.propertyType as PropertyType
    );

    const normalized = normalizePropertyPayload(parsed.data);
    let attributes = cleanAttributesForDb(
      normalized.attributes as PropertyAttributes | undefined
    );

    if (surveyPlanFile) {
      const surveyPlanUrl = await savePropertyDocumentUpload(
        surveyPlanFile,
        session.user.id
      );
      attributes = {
        ...(typeof attributes === "object" && attributes ? attributes : {}),
        surveyPlanUrl,
      };
    }

    const propertyData: Prisma.PropertyCreateInput = {
      name: normalized.name,
      propertyType: normalized.propertyType as PropertyType,
      monthlyRent: normalized.monthlyRent,
      annualRent: normalized.annualRent,
      discountedPrice: normalized.discountedPrice ?? undefined,
      location: normalized.location,
      region: normalized.region,
      city: normalized.city,
      area: normalized.area,
      street: normalized.street,
      houseNumber: normalized.houseNumber,
      digitalAddress: normalized.digitalAddress,
      landmark: normalized.landmark,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      description: normalized.description,
      stockQuantity: normalized.stockQuantity ?? 1,
      deliveryTerms: normalized.deliveryTerms ?? null,
      warrantyDetails: normalized.warrantyDetails ?? null,
      amenities: normalized.amenities ?? [],
      attributes,
      availableFrom: normalized.availableFrom
        ? new Date(normalized.availableFrom)
        : undefined,
      landlord: { connect: { id: landlord.id } },
      status: "PENDING_VERIFICATION",
    };

    if (images.length > 0) {
      propertyData.images = {
        create: await Promise.all(
          images.slice(0, 10).map(async (file, index) => ({
            url: await savePropertyImageUpload(file, session.user.id),
            alt: `Property photo ${index + 1}`,
            order: index,
          }))
        ),
      };
    }

    const property = await propertyRepository.create(propertyData);

    if (agentProfileId) {
      await assignAgentToProperty(property.id, agentProfileId, session.user.id);
    }

    const landlordName = await getUserDisplayName(session.user.id);

    await notifyAllAdminsInAppAndEmail(
      "New listing pending review",
      `${landlordName} (${session.user.email}) submitted "${parsed.data.name}" for verification.`
    );

    await notifyUserInAppAndEmail(
      session.user.id,
      "Listing submitted",
      `Your listing "${parsed.data.name}" has been submitted and is pending admin review.`
    );

    return apiResponse(property, 201);
  },
  { roles: ["MERCHANT"], permission: "property:create" }
);
