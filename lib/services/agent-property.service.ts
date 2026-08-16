import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import {
  assertEligibleAgent,
  syncPropertyAgentContact,
} from "@/lib/services/agent-assignment.service";
import { notificationService } from "@/lib/services/notification.service";
import { assertAgentAssignmentLimit } from "@/lib/subscription/listing-access";
import { withResolvedPropertyImages, withResolvedPropertyListImages } from "@/lib/utils/property-media";

export class AgentPropertyService {
  async listAssigned(agentUserId: string) {
    const agent = await prisma.agentProfile.findUnique({
      where: { userId: agentUserId },
    });
    if (!agent) throw new AppError("Affiliate profile required", 403);

    return withResolvedPropertyListImages(
      await prisma.property.findMany({
      where: { agentUserId: agent.id },
      include: {
        images: { take: 1, orderBy: { order: "asc" } },
        landlord: { select: { fullName: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    );
  }

  async browseAvailable(agentUserId: string) {
    const agent = await prisma.agentProfile.findUniqueOrThrow({
      where: { userId: agentUserId },
    });

    await assertEligibleAgent(agent.id);

    const listings = await prisma.property.findMany({
      where: { status: "ACTIVE" },
      include: {
        images: { take: 1, orderBy: { order: "asc" } },
        landlord: { select: { fullName: true } },
        assignedAgent: { select: { id: true, fullName: true } },
      },
      orderBy: [{ isPremium: "desc" }, { createdAt: "desc" }],
    });

    return withResolvedPropertyListImages(
      listings.map((listing) => ({
        ...listing,
        promotionStatus:
          listing.agentUserId === agent.id
            ? ("yours" as const)
            : listing.agentUserId
              ? ("claimed_by_other" as const)
              : ("available" as const),
      }))
    );
  }

  async claimListing(agentUserId: string, propertyId: string) {
    const agent = await prisma.agentProfile.findUnique({
      where: { userId: agentUserId },
      include: { user: true },
    });
    if (!agent) throw new AppError("Affiliate profile required", 403);

    await assertEligibleAgent(agent.id);
    await assertAgentAssignmentLimit(agentUserId, "affiliate");

    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        status: "ACTIVE",
        agentUserId: null,
      },
      include: { landlord: { include: { user: true } } },
    });

    if (!property) {
      throw new AppError(
        "This listing is not available to claim. It may already have an Affiliate or is inactive.",
        400
      );
    }

    await prisma.property.update({
      where: { id: propertyId },
      data: { agentUserId: agent.id },
    });
    await syncPropertyAgentContact(propertyId, agent.id);

    await notificationService.create({
      userId: agent.user.id,
      title: "Listing claimed for promotion",
      body: `You are now promoting "${property.name}". Share your referral link to earn commission when Customers buy or request financing.`,
      metadata: { propertyId },
    });

    await notificationService.create({
      userId: property.landlord.userId,
      title: "Affiliate promoting your listing",
      body: `${agent.fullName} claimed "${property.name}" to promote on your behalf.`,
      metadata: { propertyId, agentProfileId: agent.id },
    });

    const claimed = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        images: { take: 1, orderBy: { order: "asc" } },
        landlord: { select: { fullName: true } },
      },
    });

    return claimed ? withResolvedPropertyImages(claimed) : null;
  }
}

export const agentPropertyService = new AgentPropertyService();
