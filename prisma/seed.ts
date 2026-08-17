import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemoCategoryListings } from "./demo-listings";

const prisma = new PrismaClient();

async function upsertDemoUser(params: {
  email: string;
  role: UserRole;
  passwordHash: string;
  phone?: string;
}) {
  if (params.phone) {
    await prisma.user.updateMany({
      where: {
        phone: params.phone,
        NOT: { email: params.email },
      },
      data: { phone: null, phoneVerified: null },
    });
  }

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      role: params.role,
      passwordHash: params.passwordHash,
      emailVerified: new Date(),
      isActive: true,
      ...(params.phone
        ? { phone: params.phone, phoneVerified: new Date() }
        : {}),
    },
    create: {
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
      emailVerified: new Date(),
      isActive: true,
      ...(params.phone
        ? { phone: params.phone, phoneVerified: new Date() }
        : {}),
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  await prisma.wallet.upsert({
    where: { id: "platform-wallet" },
    update: {},
    create: {
      id: "platform-wallet",
      type: "PLATFORM",
      balance: 0,
      currency: "GHS",
    },
  });

  await prisma.businessRuleConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      rules: {
        agentCommissionPercent: 2.5,
        platformFinancingFeePercent: 2.5,
        serviceFeePercent: 1.5,
        commissionFeePercent: 2.0,
        processingFeePercent: 0.5,
        minRepaymentMonths: 6,
        maxRepaymentMonths: 60,
        maxInterestRatePercent: 30,
        lenderFreeFinancingLimit: 100,
        merchantListingRequiresPaidPlan: true,
      },
    },
  });

  const admin = await upsertDemoUser({
    email: "admin@payforme.com",
    role: "ADMIN",
    passwordHash,
    phone: "+233201000001",
  });

  const tenantUser = await upsertDemoUser({
    email: "tenant@payforme.com",
    role: "BUYER",
    passwordHash,
    phone: "+233201000002",
  });

  const tenant = await prisma.tenant.upsert({
    where: { userId: tenantUser.id },
    update: {
      fullName: "Demo Buyer",
      kycVerified: true,
      addressVerified: true,
      employmentVerified: true,
      profileStatus: "KYC_VERIFIED",
    },
    create: {
      userId: tenantUser.id,
      fullName: "Demo Buyer",
      employmentStatus: "EMPLOYED",
      monthlyIncome: 5000,
      kycVerified: true,
      addressVerified: true,
      employmentVerified: true,
      profileStatus: "KYC_VERIFIED",
    },
  });

  await prisma.subscription.upsert({
    where: { id: "demo-sub" },
    update: { userId: tenantUser.id, status: "ACTIVE" },
    create: {
      id: "demo-sub",
      userId: tenantUser.id,
      plan: "FREE",
      status: "ACTIVE",
      billingCycle: "MONTHLY",
    },
  });

  await prisma.bankAccount.upsert({
    where: { id: "demo-tenant-bank" },
    update: {
      userId: tenantUser.id,
      isVerified: true,
      validationStatus: "VERIFIED",
      isDefault: true,
    },
    create: {
      id: "demo-tenant-bank",
      userId: tenantUser.id,
      bankName: "Demo Bank Ghana",
      bankCode: "DEMO",
      accountNumber: "0123456789",
      accountNumberMasked: "****6789",
      accountName: "Demo Buyer",
      isVerified: true,
      validationStatus: "VERIFIED",
      isDefault: true,
    },
  });

  const landlordUser = await upsertDemoUser({
    email: "landlord@payforme.com",
    role: "MERCHANT",
    passwordHash,
    phone: "+233201000003",
  });

  const landlord = await prisma.landlord.upsert({
    where: { userId: landlordUser.id },
    update: { fullName: "Demo Merchant" },
    create: {
      userId: landlordUser.id,
      fullName: "Demo Merchant",
      identityVerified: true,
    },
  });

  const lenderUser = await upsertDemoUser({
    email: "lender@payforme.com",
    role: "LENDER",
    passwordHash,
    phone: "+233201000004",
  });

  await prisma.lender.upsert({
    where: { userId: lenderUser.id },
    update: { fullName: "Demo Lender" },
    create: {
      userId: lenderUser.id,
      fullName: "Demo Lender",
      institutionName: "Demo Finance Ghana",
      kycVerified: true,
      identityVerified: true,
      profileStatus: "PROFILE_COMPLETED",
    },
  });

  const agentUser = await upsertDemoUser({
    email: "agent@payforme.com",
    role: "MARKETER",
    passwordHash,
    phone: "+233201000005",
  });

  await prisma.agentProfile.upsert({
    where: { userId: agentUser.id },
    update: { fullName: "Demo Affiliate" },
    create: {
      userId: agentUser.id,
      fullName: "Demo Affiliate",
      agencyName: "Accra Property Partners",
      region: "Greater Accra",
      profileStatus: "PROFILE_COMPLETED",
    },
  });

  const complianceUser = await upsertDemoUser({
    email: "compliance@payforme.com",
    role: "COMPLIANCE_OFFICER",
    passwordHash,
    phone: "+233201000006",
  });

  for (const [userId, type] of [
    [tenantUser.id, "BUYER"],
    [landlordUser.id, "MERCHANT"],
    [lenderUser.id, "LENDER"],
    [agentUser.id, "MARKETER"],
  ] as const) {
    const existing = await prisma.wallet.findFirst({
      where: { userId, type },
    });
    if (!existing) {
      await prisma.wallet.create({
        data: { userId, type, balance: 10000, currency: "GHS" },
      });
    }
  }

  const existingProperty = await prisma.property.findFirst({
    where: { landlordId: landlord.id },
  });

  if (!existingProperty) {
    const agentProfile = await prisma.agentProfile.findUnique({
      where: { userId: agentUser.id },
    });

    await prisma.property.create({
      data: {
        landlordId: landlord.id,
        agentUserId: agentProfile?.id,
        name: "Modern 2BR Apartment - East Legon",
        propertyType: "APARTMENT",
        region: "Greater Accra",
        city: "Accra",
        area: "East Legon",
        monthlyRent: 3500,
        annualRent: 42000,
        location: "East Legon, Accra",
        latitude: 5.635,
        longitude: -0.17,
        description:
          "Spacious 2-bedroom apartment with modern finishes, 24/7 security, and parking. Close to shopping and business districts.",
        amenities: ["Parking", "Security", "AC", "Balcony", "Gym"],
        status: "ACTIVE",
        isPremium: true,
        images: {
          create: [
            {
              url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800",
              order: 0,
            },
          ],
        },
        agent: {
          create: {
            name: "Kwame Asante",
            phone: "+233244000000",
            email: "kwame@payforme.com",
          },
        },
      },
    });
  }

  const demoListingResults = await seedDemoCategoryListings(prisma, landlord.id);

  const demoFinancingProperties = await prisma.property.findMany({
    where: {
      landlordId: landlord.id,
      OR: [
        { name: "Modern 2BR Apartment - East Legon" },
        { name: { startsWith: "[Demo]" } },
      ],
    },
    select: { id: true, name: true },
    take: 3,
  });

  for (const docType of ["PAYSLIP", "BANK_STATEMENT"] as const) {
    await prisma.tenantFinancingDocument.upsert({
      where: {
        tenantId_documentType: { tenantId: tenant.id, documentType: docType },
      },
      update: {
        status: "PENDING",
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
      },
      create: {
        tenantId: tenant.id,
        documentType: docType,
        fileName: `demo-${docType.toLowerCase()}.pdf`,
        fileUrl: `/uploads/demo/${docType.toLowerCase()}.pdf`,
        status: "PENDING",
      },
    });
  }

  for (const property of demoFinancingProperties) {
    const existingApp = await prisma.propertyApplication.findFirst({
      where: {
        tenantId: tenant.id,
        propertyId: property.id,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
      },
    });

    if (!existingApp) {
      await prisma.propertyApplication.create({
        data: {
          tenantId: tenant.id,
          propertyId: property.id,
          status: "SUBMITTED",
          notes: "Demo application — merchant review required",
        },
      });
    }
  }

  console.log("Seed completed:", {
    admin: admin.email,
    buyer: tenantUser.email,
    merchant: landlordUser.email,
    marketer: agentUser.email,
    lender: lenderUser.email,
    compliance: complianceUser.email,
  });
  console.log(
    `Demo category listings: ${demoListingResults.length} (5 cars + 5 appliances, prefixed [Demo])`
  );
  console.log(
    `Demo financing listings seeded for ${tenantUser.email} — applications and documents require merchant/admin review`
  );
  console.log("Demo password for all: Password123!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
