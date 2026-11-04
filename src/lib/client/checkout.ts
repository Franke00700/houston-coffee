import type { CartPayloadItem, Fulfillment, Quote } from "./types";

export type QuoteContext = {
  items: CartPayloadItem[];
  fulfillment: Fulfillment;
  deliveryAddress?: string;
  requestedFor?: string;
};

export function quoteFingerprint(context: QuoteContext, quote: Quote): string {
  return JSON.stringify({
    context: {
      ...context,
      deliveryAddress: context.fulfillment === "DELIVERY" ? context.deliveryAddress?.trim() : undefined,
    },
    quote: {
      items: quote.items,
      subtotalMinor: quote.subtotalMinor,
      deliveryFeeMinor: quote.deliveryFeeMinor,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      issues: quote.issues,
    },
  });
}

export function orderFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function offsetMinutesAt(timestamp: number, timeZone: string) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(timestamp)).find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new RangeError(`Не удалось определить смещение часового пояса ${timeZone}`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export function wallTimeToIso(value: string, timeZone: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const nominal = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let timestamp = nominal - offsetMinutesAt(nominal, timeZone) * 60_000;
  timestamp = nominal - offsetMinutesAt(timestamp, timeZone) * 60_000;
  return new Date(timestamp).toISOString();
}

export function wallTimeValue(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
