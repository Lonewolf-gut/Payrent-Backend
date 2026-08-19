import {
  savePropertyDocumentUpload,
  savePropertyImageUpload,
} from "@/lib/integrations/documents";
import type { Prisma, PropertyType, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { propertyRepository } from "@/lib/repositories/property.repository";
import { propertyDetailService } from "@/lib/services/property-detail.service";
import { apiResponse, apiError, withAuth, withPublicHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { resolveAppSession } from "@/lib/auth/resolve-session";
import { propertySchema, normalizePropertyPayload } from "@/lib/validations/property";
import { parsePropertyFormData } from "@/lib/utils/property-form-payload";
import { cleanAttributesForDb } from "@/lib/utils/property-form";
import {
  parseAttributesJson,
  type PropertyAttributes,
} from "@/lib/constants/property-listing";
import { firstZodIssueMessage } from "@/lib/validations/auth";

export const GET = withPublicHandler(async (req, context) => {
  const { id } = await context.params;
  const session = await resolveAppSession(req);
  const property = await propertyDetailService.getDetail(
    id,
    session?.user?.id
      ? { userId: session.user.id, role: session.user.role as UserRole }
      : null
  );
  if (!property) return apiError(new AppError("Property not found", 404));
  return apiResponse(property);
});

export const PATCH = withAuth(
  async (req: NextRequest, context, session) => {
    const { id } = await context.params;
    let parsed;
    let images: File[] = [];
    let surveyPlanFile: File | null = null;
    let removedImageIds: string[] = [];

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await req.formData();
      parsed = parsePropertyFormData(formData);
      images = formData.getAll("images").filter(
        (value): value is File => value instanceof File && Boolean(value.name)
      );
      const rawSurveyPlan = formData.get("surveyPlan");
      surveyPlanFile =
        rawSurveyPlan instanceof File && rawSurveyPlan.name ? rawSurveyPlan : null;
      const rawRemoved = formData.get("removedImageIds")?.toString();
      if (rawRemoved) {
        try {
          const parsedRemoved = JSON.parse(rawRemoved);
          if (Array.isArray(parsedRemoved)) {
            removedImageIds = parsedRemoved.filter((id): id is string => typeof id === "string");
          }
        } catch {
          removedImageIds = [];
        }
      }
    } else {
      const body = await req.json();
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
      return apiError(new AppError("Merchant profile required", 403));
    }

    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.landlordId !== landlord.id) {
      return apiError(new AppError("Property not found", 404));
    }

    const normalized = normalizePropertyPayload(parsed.data);
    const existingAttributes =
      parseAttributesJson(
        (property as { attributes?: Prisma.JsonValue | null }).attributes
      ) ?? {};
    let attributes = cleanAttributesForDb({
      ...existingAttributes,
      ...(normalized.attributes as PropertyAttributes | undefined),
    });

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

    const updateData: Prisma.PropertyUpdateInput = {
      name: normalized.name,
      propertyType: normalized.propertyType as PropertyType,
      monthlyRent: normalized.monthlyRent,
      annualRent: normalized.annualRent,
      discountedPrice: normalized.discountedPrice,
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
    };

    if (removedImageIds.length > 0) {
      await prisma.propertyImage.deleteMany({
        where: {
          id: { in: removedImageIds },
          propertyId: id,
        },
      });
    }

    if (images.length > 0) {
      updateData.images = {
        create: await Promise.all(
          images.slice(0, 10).map(async (file, index) => ({
            url: await savePropertyImageUpload(file, session.user.id),
            alt: `Property photo ${index + 1}`,
            order: index,
          }))
        ),
      };
    }

    const updated = await propertyRepository.update(id, updateData);

    return apiResponse(updated);
  },
  { roles: ["MERCHANT"], permission: "property:update" }
);

export const DELETE = withAuth(
  async (_req: NextRequest, context, session) => {
    const { id } = await context.params;

    const landlord = await prisma.landlord.findUnique({
      where: { userId: session.user.id },
    });

    if (!landlord) {
      return apiError(new AppError("Merchant profile required", 403));
    }

    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.landlordId !== landlord.id) {
      return apiError(new AppError("Property not found", 404));
    }

    await prisma.property.delete({ where: { id } });
    return apiResponse({ ok: true });
  },
  { roles: ["MERCHANT"], permission: "property:create" }
);
