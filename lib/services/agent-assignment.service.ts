import { prisma } from "@/lib/db/prisma";
import { kycService } from "@/lib/services/kyc.service";
import { notificationService } from "@/lib/services/notification.service";
import { AppError } from "@/lib/errors";
import { isApprovedListingStatus } from "@/lib/constants/property-listing-status";
import { assertPlatformAccess } from "@/lib/subscription/access";
import { assertAgentAssignmentLimit } from "@/lib/subscription/listing-access";

export async function assertEligibleAgent(agentProfileId: string) {
  const agent = await prisma.agentProfile.findUnique({
    where: { id: agentProfileId },
    include: { user: { select: { id: true, role: true, isActive: true, email: true, phone: true, image: true } } },
  });

  if (!agent?.user.isActive || agent.user.role !== "MARKETER") {
    throw new AppError("Affiliate not found or inactive", 404);
  }

  const status = await kycService.getVerificationStatus(agent.user.id, "MARKETER");
  if (!status.identityVerified) {
    throw new AppError("Selected Affiliate must complete identity verification", 400);
  }
  if (!agent.user.image) {
    throw new AppError("Selected Affiliate must upload a profile photo", 400);
  }

  return agent;
}

export async function syncPropertyAgentContact(propertyId: string, agentProfileId: string) {
  const agent = await prisma.agentProfile.findUnique({
    where: { id: agentProfileId },
    include: { user: { select: { email: true, phone: true, image: true } } },
  });
  if (!agent) return;

  await prisma.agent.upsert({
    where: { propertyId },
    create: {
      propertyId,
      name: agent.fullName,
      phone: agent.user.phone ?? "",
      email: agent.user.email,
      image: agent.user.image,
    },
    update: {
      name: agent.fullName,
      phone: agent.user.phone ?? "",
      email: agent.user.email,
      image: agent.user.image,
    },
  });
}

export async function assignAgentToProperty(
  propertyId: string,
  agentProfileId: string | null,
  landlordUserId: string
) {
  const landlord = await prisma.landlord.findUnique({ where: { userId: landlordUserId } });
  if (!landlord) throw new AppError("Merchant profile required", 403);

  const property = await prisma.property.findFirst({
    where: { id: propertyId, landlordId: landlord.id },
  });
  if (!property) throw new AppError("Property not found", 404);

  if (isApprovedListingStatus(property.status)) {
    throw new AppError(
      "Affiliate assignment cannot be changed after a listing is approved.",
      403
    );
  }

  if (agentProfileId) {
    await assertPlatformAccess(landlordUserId, "assign an Affiliate to advertise listings");
    const agent = await assertEligibleAgent(agentProfileId);
    await assertAgentAssignmentLimit(agent.user.id);
    await prisma.property.update({
      where: { id: propertyId },
      data: { agentUserId: agentProfileId },
    });
    await syncPropertyAgentContact(propertyId, agentProfileId);

    await notificationService.create({
      userId: agent.user.id,
      title: "Assigned to a listing",
      body: `You were assigned as an Affiliate for "${property.name}". Buyers can contact you about this listing.`,
      metadata: { propertyId },
    });

    return agent;
  }

  await prisma.property.update({
    where: { id: propertyId },
    data: { agentUserId: null },
  });

  return null;
}
