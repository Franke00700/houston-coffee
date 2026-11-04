import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

await prisma.siteSettings.upsert({
  where: { id: 1 },
  update: {},
  create: {
    id: 1,
    ordersEnabled: true,
    pickupEnabled: true,
    deliveryEnabled: false,
    notice: "Контакты и условия доставки ещё не опубликованы.",
  },
});
for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
  await prisma.scheduleEntry.upsert({
    where: { dayOfWeek }, update: {}, create: { dayOfWeek, closed: true },
  });
}
await prisma.$disconnect();
