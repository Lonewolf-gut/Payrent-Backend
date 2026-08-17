import type { PrismaClient, PropertyType } from "@prisma/client";

/** Landscape crop for listing cards (avoids tall/portrait thumbnails). */
function demoImage(photoId: string) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=800&h=533&q=80`;
}

type DemoListingSeed = {
  name: string;
  propertyType: PropertyType;
  region: string;
  city: string;
  area: string;
  location: string;
  monthlyRent: number;
  annualRent: number;
  description: string;
  amenities: string[];
  imageUrl: string;
  stockQuantity?: number;
  deliveryTerms?: string;
  warrantyDetails?: string;
  attributes?: Record<string, string | number>;
};

export const DEMO_CAR_LISTINGS: DemoListingSeed[] = [
  {
    name: "[Demo] Toyota Camry 2020",
    propertyType: "CAR",
    region: "Greater Accra",
    city: "Accra",
    area: "Airport Residential",
    location: "Airport Residential, Accra",
    monthlyRent: 125000,
    annualRent: 125000,
    description:
      "Demo listing — well-maintained Toyota Camry 2020 with full service history. Ideal for hire-purchase or wallet purchase.",
    amenities: ["Automatic", "AC", "Bluetooth", "Reverse camera"],
    imageUrl: demoImage("photo-1550355291-bbee04a92027"),
    stockQuantity: 1,
    deliveryTerms: "Pickup from Accra showroom within 3 business days.",
    warrantyDetails: "3-month engine and transmission warranty.",
    attributes: { make: "Toyota", model: "Camry", year: 2020, mileageKm: 42000 },
  },
  {
    name: "[Demo] Honda CR-V 2021",
    propertyType: "CAR",
    region: "Ashanti",
    city: "Kumasi",
    area: "Nhyiaeso",
    location: "Nhyiaeso, Kumasi",
    monthlyRent: 185000,
    annualRent: 185000,
    description:
      "Demo listing — Honda CR-V 2021 SUV with leather interior and low mileage. Available for financing.",
    amenities: ["SUV", "4WD", "Sunroof", "Parking sensors"],
    imageUrl: demoImage("photo-1609521263047-f8f205293bb4"),
    stockQuantity: 1,
    deliveryTerms: "Delivery within Greater Kumasi available.",
    warrantyDetails: "6-month limited warranty.",
    attributes: { make: "Honda", model: "CR-V", year: 2021, mileageKm: 28000 },
  },
  {
    name: "[Demo] Hyundai Elantra 2019",
    propertyType: "CAR",
    region: "Greater Accra",
    city: "Tema",
    area: "Community 25",
    location: "Community 25, Tema",
    monthlyRent: 95000,
    annualRent: 95000,
    description:
      "Demo listing — fuel-efficient Hyundai Elantra 2019, perfect for daily commuting.",
    amenities: ["Automatic", "AC", "USB", "Keyless entry"],
    imageUrl: demoImage("photo-1552519507-da3b142c6e3d"),
    stockQuantity: 2,
    deliveryTerms: "Pickup in Tema or Accra.",
    attributes: { make: "Hyundai", model: "Elantra", year: 2019, mileageKm: 55000 },
  },
  {
    name: "[Demo] Mercedes-Benz C-Class 2018",
    propertyType: "CAR",
    region: "Greater Accra",
    city: "Accra",
    area: "East Legon",
    location: "East Legon, Accra",
    monthlyRent: 245000,
    annualRent: 245000,
    description:
      "Demo listing — premium Mercedes-Benz C-Class 2018 with executive package.",
    amenities: ["Leather", "Navigation", "Premium sound", "Cruise control"],
    imageUrl: demoImage("photo-1618843479313-40f8afb4b4d8"),
    stockQuantity: 1,
    deliveryTerms: "Viewing by appointment in East Legon.",
    warrantyDetails: "90-day dealer warranty.",
    attributes: { make: "Mercedes-Benz", model: "C-Class", year: 2018, mileageKm: 61000 },
  },
  {
    name: "[Demo] Nissan Sentra 2022",
    propertyType: "CAR",
    region: "Western",
    city: "Takoradi",
    area: "Airport Ridge",
    location: "Airport Ridge, Takoradi",
    monthlyRent: 110000,
    annualRent: 110000,
    description:
      "Demo listing — nearly new Nissan Sentra 2022 with manufacturer service records.",
    amenities: ["Automatic", "AC", "Apple CarPlay", "Lane assist"],
    imageUrl: demoImage("photo-1492144534655-ae79ce96cda9"),
    stockQuantity: 1,
    deliveryTerms: "Ships from Takoradi within 5 days.",
    attributes: { make: "Nissan", model: "Sentra", year: 2022, mileageKm: 15000 },
  },
];

export const DEMO_APPLIANCE_LISTINGS: DemoListingSeed[] = [
  {
    name: "[Demo] Samsung 450L Double Door Fridge",
    propertyType: "APPLIANCE",
    region: "Greater Accra",
    city: "Accra",
    area: "Osu",
    location: "Osu, Accra",
    monthlyRent: 4200,
    annualRent: 4200,
    description:
      "Demo listing — Samsung double-door refrigerator with inverter technology and water dispenser.",
    amenities: ["Inverter", "Water dispenser", "Frost free"],
    imageUrl: demoImage("photo-1635755076115-73c36a93563e"),
    stockQuantity: 3,
    deliveryTerms: "Free delivery within Accra for orders confirmed before Friday.",
    warrantyDetails: "1-year manufacturer warranty.",
    attributes: { brand: "Samsung", capacityLitres: 450 },
  },
  {
    name: "[Demo] LG 55\" Smart TV",
    propertyType: "APPLIANCE",
    region: "Greater Accra",
    city: "Accra",
    area: "Dzorwulu",
    location: "Dzorwulu, Accra",
    monthlyRent: 5800,
    annualRent: 5800,
    description:
      "Demo listing — LG 55-inch 4K smart TV with webOS and wall-mount kit included.",
    amenities: ["4K UHD", "Smart TV", "Wall mount"],
    imageUrl: demoImage("photo-1593784991095-a205069470b6"),
    stockQuantity: 5,
    deliveryTerms: "Same-week delivery in Greater Accra.",
    warrantyDetails: "2-year panel warranty.",
    attributes: { brand: "LG", screenInches: 55 },
  },
  {
    name: "[Demo] Hisense 8kg Washing Machine",
    propertyType: "APPLIANCE",
    region: "Ashanti",
    city: "Kumasi",
    area: "Adum",
    location: "Adum, Kumasi",
    monthlyRent: 2800,
    annualRent: 2800,
    description:
      "Demo listing — Hisense front-load 8kg washing machine, energy efficient and quiet.",
    amenities: ["Front load", "8kg", "Energy efficient"],
    imageUrl: demoImage("photo-1626806787461-102c1bfaaea1"),
    stockQuantity: 4,
    deliveryTerms: "Pickup or delivery in Kumasi metro.",
    attributes: { brand: "Hisense", capacityKg: 8 },
  },
  {
    name: "[Demo] Midea 1.5HP Air Conditioner",
    propertyType: "APPLIANCE",
    region: "Greater Accra",
    city: "Tema",
    area: "Spintex",
    location: "Spintex, Tema",
    monthlyRent: 3500,
    annualRent: 3500,
    description:
      "Demo listing — Midea split AC 1.5HP with installation kit. Ideal for bedroom or office.",
    amenities: ["Split unit", "1.5HP", "Remote control"],
    imageUrl: demoImage("photo-1585771725724-a2757cf49553"),
    stockQuantity: 6,
    deliveryTerms: "Installation available in Tema and Accra.",
    warrantyDetails: "12-month compressor warranty.",
    attributes: { brand: "Midea", horsepower: 1.5 },
  },
  {
    name: "[Demo] Philips Multi-Cooker Set",
    propertyType: "APPLIANCE",
    region: "Greater Accra",
    city: "Accra",
    area: "Madina",
    location: "Madina, Accra",
    monthlyRent: 950,
    annualRent: 950,
    description:
      "Demo listing — Philips rice cooker and multi-cooker bundle for home kitchens.",
    amenities: ["Multi-cook", "Non-stick", "Keep warm"],
    imageUrl: demoImage("photo-1556909215-d1b3f9d1b3bf"),
    stockQuantity: 10,
    deliveryTerms: "Courier delivery nationwide within 7 days.",
    attributes: { brand: "Philips", capacityLitres: 5 },
  },
];

async function upsertDemoListing(
  prisma: PrismaClient,
  landlordId: string,
  listing: DemoListingSeed
) {
  const existing = await prisma.property.findFirst({
    where: { landlordId, name: listing.name },
    select: { id: true },
  });

  const data = {
    name: listing.name,
    propertyType: listing.propertyType,
    region: listing.region,
    city: listing.city,
    area: listing.area,
    location: listing.location,
    monthlyRent: listing.monthlyRent,
    annualRent: listing.annualRent,
    description: listing.description,
    amenities: listing.amenities,
    status: "ACTIVE" as const,
    stockQuantity: listing.stockQuantity ?? 1,
    deliveryTerms: listing.deliveryTerms,
    warrantyDetails: listing.warrantyDetails,
    attributes: listing.attributes,
  };

  if (existing) {
    await prisma.property.update({
      where: { id: existing.id },
      data,
    });

    const coverImage = await prisma.propertyImage.findFirst({
      where: { propertyId: existing.id },
      orderBy: { order: "asc" },
    });

    if (coverImage) {
      await prisma.propertyImage.update({
        where: { id: coverImage.id },
        data: { url: listing.imageUrl },
      });
    } else {
      await prisma.propertyImage.create({
        data: {
          propertyId: existing.id,
          url: listing.imageUrl,
          order: 0,
        },
      });
    }

    return { id: existing.id, created: false, name: listing.name };
  }

  const created = await prisma.property.create({
    data: {
      landlordId,
      ...data,
      images: {
        create: [{ url: listing.imageUrl, order: 0 }],
      },
    },
  });

  return { id: created.id, created: true, name: listing.name };
}

export async function seedDemoCategoryListings(
  prisma: PrismaClient,
  landlordId: string
) {
  const listings = [...DEMO_CAR_LISTINGS, ...DEMO_APPLIANCE_LISTINGS];
  const results = [];

  for (const listing of listings) {
    results.push(await upsertDemoListing(prisma, landlordId, listing));
  }

  return results;
}
