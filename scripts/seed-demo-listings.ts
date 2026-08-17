import { PrismaClient } from "@prisma/client";
import { seedDemoCategoryListings } from "../prisma/demo-listings";

const prisma = new PrismaClient();

async function main() {
  const landlord = await prisma.landlord.findFirst({
    where: { user: { email: "landlord@payforme.com" } },
    select: { id: true, fullName: true },
  });

  if (!landlord) {
    throw new Error(
      "Demo merchant not found. Run npm run db:seed first to create landlord@payforme.com."
    );
  }

  const results = await seedDemoCategoryListings(prisma, landlord.id);
  const created = results.filter((row) => row.created).length;
  const updated = results.length - created;

  console.log(`Demo listings ready for ${landlord.fullName}:`);
  console.log(`  ${created} created, ${updated} updated (${results.length} total)`);
  console.log("  5 cars + 5 home appliances (names start with [Demo])");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
