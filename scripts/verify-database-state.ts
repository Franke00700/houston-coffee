import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  const [settings, schedule, staff, orders, products] = await Promise.all([
    prisma.siteSettings.count(),
    prisma.scheduleEntry.count(),
    prisma.staffUser.count(),
    prisma.order.count(),
    prisma.product.count(),
  ]);

  process.stdout.write(
    `${JSON.stringify({ settings, schedule, staff, orders, products })}\n`,
  );
} finally {
  await prisma.$disconnect();
}
