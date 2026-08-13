import { prisma } from "@/lib/db/prisma";
import type { Prisma, PropertyStatus, PropertyType } from "@prisma/client";
import type { PropertyFilterInput } from "@/lib/validations/property";
import { RESIDENTIAL_TYPES } from "@/lib/subscription-limits";
import { merchantListingPublicVisibilityWhere } from "@/lib/subscription/listing-access";

export class PropertyRepository {
  async findById(id: string) {
    return prisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: "asc" } },
        videos: true,
        agent: true,
        assignedAgent: {
          include: {
            user: { select: { id: true, email: true, phone: true, image: true } },
          },
        },
        landlord: {
          include: {
            user: { select: { id: true, email: true, phone: true, image: true } },
          },
        },
      },
    });
  }

  async findMany(filters: PropertyFilterInput) {
    const { search, propertyType, category, minRent, maxRent, location, page, limit } =
      filters;
    const searchType = search?.trim().toUpperCase();
    const knownTypes = [
      ...RESIDENTIAL_TYPES,
      "CAR",
      "APPLIANCE",
    ] as PropertyType[];
    const searchPropertyType =
      searchType && knownTypes.includes(searchType as PropertyType)
        ? (searchType as PropertyType)
        : undefined;

    const categoryFilter =
      propertyType
        ? { propertyType: propertyType as PropertyType }
        : category === "car"
          ? { propertyType: "CAR" as PropertyType }
          : category === "appliance"
            ? { propertyType: "APPLIANCE" as PropertyType }
            : category === "residential"
              ? { propertyType: { in: RESIDENTIAL_TYPES } }
              : {};

    const where: Prisma.PropertyWhereInput = {
      status: "ACTIVE",
      ...merchantListingPublicVisibilityWhere(),
      ...categoryFilter,
      ...(minRent && { monthlyRent: { gte: minRent } }),
      ...(maxRent && { monthlyRent: { lte: maxRent } }),
      ...(location && {
        location: { contains: location, mode: "insensitive" },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
          ...(searchPropertyType ? [{ propertyType: searchPropertyType as Prisma.EnumPropertyTypeFilter }] : []),
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          images: { take: 1, orderBy: { order: "asc" } },
          agent: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isPremium: "desc" }, { createdAt: "desc" }],
      }),
      prisma.property.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async create(data: Prisma.PropertyCreateInput) {
    return prisma.property.create({
      data,
      include: { images: true, videos: true, agent: true },
    });
  }

  async update(id: string, data: Prisma.PropertyUpdateInput) {
    return prisma.property.update({
      where: { id },
      data,
      include: { images: true, videos: true, agent: true },
    });
  }

  async delete(id: string) {
    return prisma.property.delete({ where: { id } });
  }

  async findByLandlord(landlordId: string) {
    return prisma.property.findMany({
      where: { landlordId },
      include: { images: { orderBy: { order: "asc" } }, videos: true, agent: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStatus(id: string, status: PropertyStatus) {
    return prisma.property.update({ where: { id }, data: { status } });
  }
}

export const propertyRepository = new PropertyRepository();
