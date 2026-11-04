import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { orderRequestSchema } from "../src/lib/domain/order";
import { ApiError } from "../src/lib/server/http";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/\/houston(?:_[a-z0-9]+)*_test(?:\?|$)/i.test(connectionString)) {
  throw new Error("Refusing integration test: DATABASE_URL must target a database whose name ends in _test");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
await prisma.order.deleteMany();
await prisma.product.update({ where: { id: "test-product-latte" }, data: { name: "Тестовый латте", available: true, published: true, archived: false } });
await prisma.productVariant.update({ where: { id: "test-variant-medium" }, data: { name: "Тестовый 300 мл", priceMinor: 29_000, available: true, archived: false } });
await prisma.modifierOption.updateMany({ where: { id: { in: ["test-oat", "test-syrup"] } }, data: { available: true, archived: false } });

const { createOrder, quoteOrder } = await import("../src/lib/server/orders");
const requestedFor = new Date(Date.now() + 30 * 60_000).toISOString();
const items = [{ lineId: "line-1", productId: "test-product-latte", sizeId: "test-variant-medium", milkId: "test-oat", addOnIds: ["test-syrup"], quantity: 1 }];
const base = { items, fulfillment: "PICKUP" as const, requestedFor, expectedTotalMinor: 36_000, customer: { name: "Тестовый посетитель", phone: "+70000000000" } };

const forged = orderRequestSchema.safeParse({ ...base, clientPriceMinor: 1 });
assert.equal(forged.success, false, "forged client price must be rejected by the strict HTTP schema");

const quote = await quoteOrder(base);
assert.equal(quote.totalMinor, 36_000, "server catalog must determine price");
assert.deepEqual(quote.issues, []);

const sequentialKey = `seq_${randomUUID().replaceAll("-", "")}`;
const first = await createOrder(base, sequentialKey);
const second = await createOrder(base, sequentialKey);
assert.equal(first.replayed, false);
assert.equal(second.replayed, true);
assert.equal(second.orderNumber, first.orderNumber, "sequential replay must return the stored response");
assert.equal(await prisma.order.count({ where: { number: first.orderNumber } }), 1);

await assert.rejects(
  () => createOrder({ ...base, comment: "different payload" }, sequentialKey),
  (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT",
  "same key with a different payload must conflict",
);

const concurrentKey = `con_${randomUUID().replaceAll("-", "")}`;
const concurrent = await Promise.all(Array.from({ length: 8 }, () => createOrder(base, concurrentKey)));
assert.equal(new Set(concurrent.map((result) => result.orderNumber)).size, 1, "concurrent replay must return one order");
assert.equal(concurrent.filter((result) => !result.replayed).length, 1, "exactly one concurrent request must create the order");
assert.equal(await prisma.order.count({ where: { number: concurrent[0].orderNumber } }), 1);

await prisma.productVariant.update({ where: { id: "test-variant-medium" }, data: { priceMinor: 31_000 } });
await assert.rejects(
  () => createOrder(base, `price_${randomUUID().replaceAll("-", "")}`),
  (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "PRICE_CHANGED" && (error.details as { totalMinor: number }).totalMinor === 38_000,
  "changed server price must require confirmation",
);

const confirmed = await createOrder({ ...base, expectedTotalMinor: 38_000 }, `confirmed_${randomUUID().replaceAll("-", "")}`);
const confirmedRow = await prisma.order.findUniqueOrThrow({ where: { number: confirmed.orderNumber }, include: { items: true } });
await prisma.product.update({ where: { id: "test-product-latte" }, data: { name: "Новое имя после заказа" } });
await prisma.productVariant.update({ where: { id: "test-variant-medium" }, data: { name: "Новый вариант после заказа", priceMinor: 40_000 } });
const snapshot = await prisma.order.findUniqueOrThrow({ where: { id: confirmedRow.id }, include: { items: true } });
assert.equal(snapshot.items[0].productName, "Тестовый латте");
assert.equal(snapshot.items[0].variantName, "Тестовый 300 мл");
assert.equal(snapshot.items[0].unitBasePriceMinor, 31_000);
assert.equal((snapshot.items[0].modifiersSnapshot as Array<{ name: string }>)[0].name, "Тестовое овсяное");

await prisma.product.update({ where: { id: "test-product-latte" }, data: { available: false } });
const unavailable = await quoteOrder(base);
assert(unavailable.issues.some((issue) => issue.code === "PRODUCT_UNAVAILABLE"));
await prisma.product.update({ where: { id: "test-product-latte" }, data: { name: "Тестовый латте", available: true } });
await prisma.productVariant.update({ where: { id: "test-variant-medium" }, data: { name: "Тестовый 300 мл", priceMinor: 29_000 } });

const forbidden = await quoteOrder({ ...base, items: [{ ...items[0], addOnIds: ["test-oat"], milkId: undefined }] });
assert(forbidden.issues.some((issue) => issue.code === "OPTION_KIND"));

const requestedDate = new Date(requestedFor);
const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const localWeekday = new Intl.DateTimeFormat("en-US", { timeZone: process.env.BUSINESS_TIME_ZONE ?? "Europe/Moscow", weekday: "short" }).format(requestedDate);
const dayOfWeek = weekday.indexOf(localWeekday);
await prisma.scheduleEntry.update({ where: { dayOfWeek }, data: { closed: true, opensAt: null, closesAt: null } });
const closed = await quoteOrder(base);
assert(closed.issues.some((issue) => issue.code === "CLOSED"), "closed schedule must be enforced server-side");
await prisma.scheduleEntry.update({ where: { dayOfWeek }, data: { closed: false, opensAt: "00:00", closesAt: "23:59" } });

await assert.rejects(
  () => prisma.productVariant.create({ data: { productId: "test-product-latte", name: "Invalid negative price", priceMinor: -1 } }),
  "database CHECK must reject a negative price",
);

await prisma.$disconnect();
const restartedClient = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const persisted = await restartedClient.orderIdempotency.findUnique({ where: { keyHash: (await import("../src/lib/domain/order")).requestHash(sequentialKey) }, include: { order: true } });
assert.equal(persisted?.order.number, first.orderNumber, "idempotency result must survive a fresh database client");
await restartedClient.$disconnect();

process.stdout.write(JSON.stringify({
  ok: true,
  sequentialOrder: first.orderNumber,
  concurrentOrder: concurrent[0].orderNumber,
  snapshotOrder: confirmed.orderNumber,
  assertions: ["server-price", "strict-payload", "sequential-idempotency", "conflict", "concurrent-idempotency", "price-confirmation", "historical-snapshot", "availability", "modifier-allowlist", "schedule", "db-check", "fresh-client-persistence"],
}, null, 2) + "\n");
