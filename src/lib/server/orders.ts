import { randomBytes } from "node:crypto";
import type { QuoteInput } from "@/lib/domain/order";
import { calculateQuote, requestHash } from "@/lib/domain/order";
import { db } from "./db";
import { ApiError } from "./http";
import { menuInclude } from "./menu";

const orderNumber = () => `HC-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${randomBytes(8).toString("hex").toUpperCase()}`;
const businessTimeZone = process.env.BUSINESS_TIME_ZONE ?? "Europe/Moscow";
const idempotencyLock = (keyHash: string) => BigInt.asIntN(64, BigInt(`0x${keyHash.slice(0, 16)}`));
type OrderResponse = { orderNumber: string; totalMinor: number; currency: string; status: string };
export type CreateOrderResult = OrderResponse & { replayed: boolean };

export async function quoteOrder(input: QuoteInput) {
  const [records, raw, schedule] = await Promise.all([
    db.product.findMany({ where: { published: true, archived: false }, include: menuInclude }),
    db.siteSettings.findUnique({ where: { id: 1 } }),
    db.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);
  const settings = { ...(raw ?? { ordersEnabled: false, pickupEnabled: false, deliveryEnabled: false, deliveryFeeMinor: 0, deliveryMinimumMinor: 0, currency: "RUB" }), timeZone: businessTimeZone, schedule };
  return calculateQuote(input, records.map((product) => ({
    id: product.id, name: product.name, available: product.available, delivery: product.delivery,
    variants: product.variants.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })),
    modifierGroups: product.modifierGroups.map(({ group }) => ({ kind: group.kind, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })) })),
  })), settings);
}

export async function createOrder(input: QuoteInput & { expectedTotalMinor: number; customer: { name: string; phone: string }; comment?: string }, idempotencyKey: string): Promise<CreateOrderResult> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new ApiError(400, "IDEMPOTENCY_KEY", "Нужен корректный Idempotency-Key");
  const keyHash = requestHash(idempotencyKey);
  const payloadHash = requestHash(input);
  const found = await db.orderIdempotency.findUnique({ where: { keyHash } });
  if (found) {
    if (found.payloadHash !== payloadHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Этот ключ уже использован для другого заказа");
    return { ...(found.response as OrderResponse), replayed: true };
  }
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: number }>>`
        SELECT 1::int AS locked
        FROM pg_advisory_xact_lock(${idempotencyLock(keyHash)})
      `;
      const duplicate = await tx.orderIdempotency.findUnique({ where: { keyHash } });
      if (duplicate) {
        if (duplicate.payloadHash !== payloadHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Этот ключ уже использован для другого заказа");
        return { ...(duplicate.response as OrderResponse), replayed: true };
      }
      const [records, raw, schedule] = await Promise.all([
        tx.product.findMany({ where: { published: true, archived: false }, include: menuInclude }),
        tx.siteSettings.findUnique({ where: { id: 1 } }),
        tx.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } }),
      ]);
      const settings = { ...(raw ?? { ordersEnabled: false, pickupEnabled: false, deliveryEnabled: false, deliveryFeeMinor: 0, deliveryMinimumMinor: 0, currency: "RUB" }), timeZone: businessTimeZone, schedule };
      const quote = calculateQuote(input, records.map((product) => ({
        id: product.id, name: product.name, available: product.available, delivery: product.delivery,
        variants: product.variants.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })),
        modifierGroups: product.modifierGroups.map(({ group }) => ({ kind: group.kind, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })) })),
      })), settings);
      if (quote.issues.length) throw new ApiError(409, "QUOTE_CHANGED", "Состав или условия заказа изменились", quote.issues);
      if (input.expectedTotalMinor !== quote.totalMinor) throw new ApiError(409, "PRICE_CHANGED", "Стоимость заказа изменилась. Подтвердите актуальную сумму", quote);
      const order = await tx.order.create({ data: {
        number: orderNumber(), fulfillment: input.fulfillment, customerName: input.customer.name, customerPhone: input.customer.phone,
        deliveryAddress: input.fulfillment === "DELIVERY" ? input.deliveryAddress : null, requestedFor: new Date(input.requestedFor), comment: input.comment,
        currency: quote.currency, subtotalMinor: quote.subtotalMinor, deliveryFeeMinor: quote.deliveryFeeMinor, totalMinor: quote.totalMinor,
        items: { create: quote.items.map((line) => ({
          productId: line.productId, variantId: line.variantId, productName: line.productName, variantName: line.variantName,
          quantity: line.quantity, unitBasePriceMinor: line.unitBasePriceMinor, unitTotalMinor: line.unitTotalMinor,
          lineTotalMinor: line.lineTotalMinor, modifiersSnapshot: line.modifiers,
        })) },
        statusEvents: { create: { to: "NEW" } },
      }});
      const response = { orderNumber: order.number, totalMinor: order.totalMinor, currency: order.currency, status: order.status };
      await tx.orderIdempotency.create({ data: { keyHash, payloadHash, orderId: order.id, response } });
      return { ...response, replayed: false };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const raced = await db.orderIdempotency.findUnique({ where: { keyHash } }).catch(() => null);
    if (raced) {
      if (raced.payloadHash !== payloadHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Этот ключ уже использован для другого заказа");
      return { ...(raced.response as OrderResponse), replayed: true };
    }
    throw error;
  }
}
