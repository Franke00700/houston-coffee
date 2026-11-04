import { describe, expect, it } from "vitest";
import { calculateQuote, canTransition, orderRequestSchema, requestHash, type PricedProduct } from "./order";

const products: PricedProduct[] = [{
  id: "coffee", name: "Кофе", available: true, delivery: true,
  variants: [{ id: "small", name: "Маленький", priceMinor: 20000, available: true }],
  modifierGroups: [
    { kind: "MILK", minSelect: 0, maxSelect: 1, options: [{ id: "oat", name: "Овсяное", priceMinor: 5000, available: true }] },
    { kind: "ADD_ON", minSelect: 0, maxSelect: 2, options: [{ id: "syrup", name: "Сироп", priceMinor: 3000, available: true }] },
  ],
}];
const now = new Date("2026-11-04T08:00:00.000Z");
const requestedFor = "2026-11-04T12:00:00+03:00";
const settings = {
  ordersEnabled: true, pickupEnabled: true, deliveryEnabled: true, deliveryFeeMinor: 10000, deliveryMinimumMinor: 0, currency: "RUB",
  timeZone: "Europe/Moscow",
  schedule: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: "08:00", closesAt: "22:00", closed: false })),
};

describe("calculateQuote", () => {
  it("считает цену только по серверному каталогу", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", milkId: "oat", addOnIds: ["syrup"], quantity: 2 }], fulfillment: "PICKUP", requestedFor }, products, settings, now);
    expect(quote.issues).toEqual([]);
    expect(quote.totalMinor).toBe(56000);
    expect(quote.items[0].modifiers).toHaveLength(2);
  });
  it("отклоняет чужую добавку и не создаёт рассчитанную строку", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: ["forged"], quantity: 1 }], fulfillment: "PICKUP", requestedFor }, products, settings, now);
    expect(quote.issues.some((issue) => issue.code === "UNKNOWN_OPTION")).toBe(true);
    expect(quote.items).toEqual([]);
  });
  it("не разрешает отключённую доставку", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: [], quantity: 1 }], fulfillment: "DELIVERY", deliveryAddress: "Тестовый адрес", requestedFor }, products, { ...settings, deliveryEnabled: false }, now);
    expect(quote.issues.some((issue) => issue.code === "DELIVERY_DISABLED")).toBe(true);
  });
  it("не позволяет передать молоко как добавку", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: ["oat"], quantity: 1 }], fulfillment: "PICKUP", requestedFor }, products, settings, now);
    expect(quote.issues.some((issue) => issue.code === "OPTION_KIND")).toBe(true);
  });
  it("применяет серверный минимум и стоимость доставки", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: [], quantity: 1 }], fulfillment: "DELIVERY", deliveryAddress: "Тестовый адрес", requestedFor }, products, { ...settings, deliveryMinimumMinor: 30_000 }, now);
    expect(quote.totalMinor).toBe(30_000);
    expect(quote.issues.some((issue) => issue.code === "DELIVERY_MINIMUM")).toBe(true);
  });
  it("отклоняет повтор одной добавки", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: ["syrup", "syrup"], quantity: 1 }], fulfillment: "PICKUP", requestedFor }, products, settings, now);
    expect(quote.issues.some((issue) => issue.code === "DUPLICATE_OPTION")).toBe(true);
  });
  it("отклоняет время вне расписания", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: [], quantity: 1 }], fulfillment: "PICKUP", requestedFor: "2026-11-04T23:00:00+03:00" }, products, settings, now);
    expect(quote.issues.some((issue) => issue.code === "OUTSIDE_HOURS")).toBe(true);
  });
  it("отклоняет уже прошедшее время", () => {
    const quote = calculateQuote({ items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: [], quantity: 1 }], fulfillment: "PICKUP", requestedFor: "2026-11-04T10:00:00+03:00" }, products, settings, now);
    expect(quote.issues.some((issue) => issue.code === "TIME_IN_PAST")).toBe(true);
  });
});

describe("idempotency and state", () => {
  it("принимает полный строгий payload заказа и отвергает клиентскую цену", () => {
    const valid = { items: [{ lineId: "1", productId: "coffee", sizeId: "small", addOnIds: [], quantity: 1 }], fulfillment: "PICKUP", requestedFor, expectedTotalMinor: 20_000, customer: { name: "Тест", phone: "+70000000000" } };
    expect(orderRequestSchema.safeParse(valid).success).toBe(true);
    expect(orderRequestSchema.safeParse({ ...valid, clientPriceMinor: 1 }).success).toBe(false);
  });
  it("даёт одинаковый hash независимо от порядка ключей", () => expect(requestHash({ b: 2, a: 1 })).toBe(requestHash({ a: 1, b: 2 })));
  it("разрешает только переходы state machine", () => {
    expect(canTransition("NEW", "CONFIRMED")).toBe(true);
    expect(canTransition("NEW", "READY")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
});
