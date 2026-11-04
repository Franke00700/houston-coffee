import { describe, expect, it } from "vitest";
import { orderFingerprint, quoteFingerprint, wallTimeToIso, wallTimeValue } from "./checkout";
import type { Quote } from "./types";

const quote: Quote = {
  items: [{ lineId: "line-1", name: "Латте", configuration: "300 мл", quantity: 1, unitPriceMinor: 30000, totalMinor: 30000 }],
  subtotalMinor: 30000,
  deliveryFeeMinor: 0,
  totalMinor: 30000,
  currency: "RUB",
  issues: [],
};

const context = {
  items: [{ lineId: "line-1", productId: "latte", sizeId: "medium", addOnIds: [], quantity: 1 }],
  fulfillment: "PICKUP" as const,
};

describe("checkout fingerprints", () => {
  it("changes when the authoritative price changes", () => {
    expect(quoteFingerprint(context, quote)).not.toBe(quoteFingerprint(context, { ...quote, totalMinor: 31000 }));
  });

  it("changes when cart contents change", () => {
    expect(quoteFingerprint(context, quote)).not.toBe(quoteFingerprint({ ...context, items: [{ ...context.items[0], quantity: 2 }] }, quote));
  });

  it("ignores a delivery address for pickup", () => {
    expect(quoteFingerprint({ ...context, deliveryAddress: "Не используется" }, quote)).toBe(quoteFingerprint(context, quote));
  });

  it("keeps an order fingerprint stable for a retry", () => {
    const payload = { ...context, customer: { name: "Тест", phone: "+70000000000" } };
    expect(orderFingerprint(payload)).toBe(orderFingerprint(payload));
  });

  it("interprets the selected wall time in the coffee shop time zone", () => {
    expect(wallTimeToIso("2026-11-04T12:30", "Europe/Moscow")).toBe("2026-11-04T09:30:00.000Z");
    expect(wallTimeValue(new Date("2026-11-04T09:30:00.000Z"), "Europe/Moscow")).toBe("2026-11-04T12:30");
  });
});
