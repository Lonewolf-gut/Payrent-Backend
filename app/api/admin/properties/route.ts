import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { propertyRepository } from "@/lib/repositories/property.repository";
import { notifyUserInAppAndEmail } from "@/lib/services/verification-notifications";
import { auditService } from "@/lib/services/audit.service";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { merchantHasMarketplaceListingVisibility } from "@/lib/subscription/listing-access";
import { apiResponse, withAuth } from "@/lib/api/handler";
import type { PropertyStatus } from "@prisma/client";

export const GET = withAuth(
  async (req: NextRequest) => {
    const status = req.nextUrl.searchParams.get("status");
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
    const limit = 30;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status: status as PropertyStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { location: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: limit,
        include: {
          landlord: {
            select: {
              fullName: true,
              identityVerified: true,
              profileStatus: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  phone: true,
                  verifications: {
                    where: { type: "IDENTITY" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { status: true },
                  },
                },
              },
            },
          },
          images: true,
          videos: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.property.count({ where }),
    ]);

    return apiResponse({ properties, total, page, limit });
  },
  { roles: ["ADMIN"], permission: "admin:properties" }
);

export const PATCH = withAuth(
  async (req: NextRequest, _ctx, session) => {
    const { propertyId, status, reason } = await req.json();

    if (!propertyId || !status) {
      return apiResponse(
        { error: "propertyId and status are required" },
        400,
        "propertyId and status are required"
      );
    }

    const existing = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { landlord: { include: { user: { select: { id: true } } } } },
    });

    if (!existing) {
      return apiResponse({ error: "Property not found" }, 404, "Property not found");
    }

    const property = await propertyRepository.updateStatus(propertyId, status);

    const landlordUserId = existing.landlord.user.id;

    if (status === "ACTIVE" && existing.status !== "ACTIVE") {
      const access = await getSubscriptionAccess(landlordUserId);
      const marketplaceVisible = merchantHasMarketplaceListingVisibility(access);

      await notifyUserInAppAndEmail(
        landlordUserId,
        "Listing approved",
        marketplaceVisible
          ? `Your listing "${existing.name}" is now live on the marketplace.`
          : `Your listing "${existing.name}" has been approved. Subscribe to Pro or Max at /pricing to make it visible on the public properties page.`
      );
    }

    if (
      status === "INACTIVE" &&
      (existing.status === "PENDING_VERIFICATION" || existing.status === "ACTIVE")
    ) {
      const reasonText =
        typeof reason === "string" && reason.trim()
          ? reason.trim()
          : "Please review your listing details and resubmit.";

      await notifyUserInAppAndEmail(
        landlordUserId,
        existing.status === "PENDING_VERIFICATION"
          ? "Listing not approved"
          : "Listing suspended",
        `Your listing "${existing.name}" was ${
          existing.status === "PENDING_VERIFICATION" ? "not approved" : "suspended"
        }: ${reasonText}`
      );
    }

    await auditService.log({
      userId: session.user.id,
      action: `PROPERTY_STATUS_${status}`,
      entity: "Property",
      entityId: propertyId,
      metadata: {
        previousStatus: existing.status,
        newStatus: status,
        reason: typeof reason === "string" ? reason : undefined,
        landlordUserId,
      },
    });

    return apiResponse(property);
  },
  { roles: ["ADMIN"], permission: "admin:properties" }
);
