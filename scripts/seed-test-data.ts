import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const password = process.env.HOUSTON_TEST_PASSWORD;
if (!connectionString || !/\/houston(?:_[a-z0-9]+)*_test(?:\?|$)/i.test(connectionString)) {
  throw new Error("Refusing to seed: DATABASE_URL must target a database whose name ends in _test");
}
if (!password || password.length < 12) throw new Error("HOUSTON_TEST_PASSWORD must contain at least 12 characters");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

await prisma.$transaction(async (tx) => {
  await tx.siteSettings.upsert({
    where: { id: 1 },
    update: { ordersEnabled: true, pickupEnabled: true, deliveryEnabled: true, deliveryFeeMinor: 10_000, deliveryMinimumMinor: 0, currency: "RUB", phone: null, address: null, routeUrl: null, instagramUrl: null, telegramUrl: null, notice: "Только изолированная тестовая среда" },
    create: { id: 1, ordersEnabled: true, pickupEnabled: true, deliveryEnabled: true, deliveryFeeMinor: 10_000, deliveryMinimumMinor: 0, currency: "RUB", notice: "Только изолированная тестовая среда" },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await tx.scheduleEntry.upsert({ where: { dayOfWeek }, update: { closed: false, opensAt: "00:00", closesAt: "23:59" }, create: { dayOfWeek, closed: false, opensAt: "00:00", closesAt: "23:59" } });
  }

  for (const user of [
    { id: "test-admin", email: "admin@example.test", name: "Тестовый администратор", role: "ADMIN" as const },
    { id: "test-operator", email: "operator@example.test", name: "Тестовый оператор", role: "OPERATOR" as const },
  ]) {
    await tx.staffUser.upsert({ where: { email: user.email }, update: { name: user.name, role: user.role, active: true, passwordHash, tokenVersion: { increment: 1 } }, create: { ...user, passwordHash, active: true } });
  }

  await tx.category.upsert({ where: { slug: "test-coffee" }, update: { name: "Тестовый кофе", published: true, archived: false, sortOrder: 0 }, create: { id: "test-category-coffee", slug: "test-coffee", name: "Тестовый кофе", published: true, sortOrder: 0 } });
  await tx.modifierGroup.upsert({ where: { id: "test-milk-group" }, update: { name: "Тестовое молоко", kind: "MILK", minSelect: 0, maxSelect: 1, archived: false }, create: { id: "test-milk-group", name: "Тестовое молоко", kind: "MILK", minSelect: 0, maxSelect: 1 } });
  await tx.modifierOption.upsert({ where: { id: "test-oat" }, update: { groupId: "test-milk-group", name: "Тестовое овсяное", priceMinor: 4_000, available: true, archived: false }, create: { id: "test-oat", groupId: "test-milk-group", name: "Тестовое овсяное", priceMinor: 4_000, available: true } });
  await tx.modifierGroup.upsert({ where: { id: "test-addon-group" }, update: { name: "Тестовые добавки", kind: "ADD_ON", minSelect: 0, maxSelect: 2, archived: false }, create: { id: "test-addon-group", name: "Тестовые добавки", kind: "ADD_ON", minSelect: 0, maxSelect: 2 } });
  await tx.modifierOption.upsert({ where: { id: "test-syrup" }, update: { groupId: "test-addon-group", name: "Тестовый сироп", priceMinor: 3_000, available: true, archived: false }, create: { id: "test-syrup", groupId: "test-addon-group", name: "Тестовый сироп", priceMinor: 3_000, available: true } });
  await tx.product.upsert({
    where: { slug: "test-latte" },
    update: { categoryId: "test-category-coffee", name: "Тестовый латте", description: "Фиктивная позиция для интеграционной проверки", published: true, available: true, delivery: true, archived: false },
    create: { id: "test-product-latte", categoryId: "test-category-coffee", slug: "test-latte", name: "Тестовый латте", description: "Фиктивная позиция для интеграционной проверки", published: true, available: true, delivery: true },
  });
  await tx.productVariant.upsert({ where: { id: "test-variant-medium" }, update: { productId: "test-product-latte", name: "Тестовый 300 мл", sku: "TEST-LATTE-300", priceMinor: 29_000, available: true, archived: false }, create: { id: "test-variant-medium", productId: "test-product-latte", name: "Тестовый 300 мл", sku: "TEST-LATTE-300", priceMinor: 29_000, available: true } });
  await tx.productModifierGroup.upsert({ where: { productId_groupId: { productId: "test-product-latte", groupId: "test-milk-group" } }, update: { sortOrder: 0 }, create: { productId: "test-product-latte", groupId: "test-milk-group", sortOrder: 0 } });
  await tx.productModifierGroup.upsert({ where: { productId_groupId: { productId: "test-product-latte", groupId: "test-addon-group" } }, update: { sortOrder: 1 }, create: { productId: "test-product-latte", groupId: "test-addon-group", sortOrder: 1 } });
});

await prisma.auditEvent.create({ data: { actorRole: "ADMIN", action: "TEST_DATA_SEEDED", entity: "TestEnvironment", success: true } });
await prisma.$disconnect();
process.stdout.write("Seeded isolated Houston Coffee test data (admin/operator/catalog/schedule).\n");
