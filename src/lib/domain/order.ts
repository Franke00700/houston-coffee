import { createHash } from "node:crypto";
import { z } from "zod";

export const cartItemSchema = z.object({
  lineId: z.string().min(1).max(100),
  productId: z.string().min(1).max(100),
  sizeId: z.string().min(1).max(100).optional(),
  milkId: z.string().min(1).max(100).optional(),
  addOnIds: z.array(z.string().min(1).max(100)).max(12).default([]),
  quantity: z.number().int().min(1).max(20),
}).strict();

export const quoteRequestSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(30),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]),
  requestedFor: z.iso.datetime({ offset: true }),
  deliveryAddress: z.string().trim().min(5).max(300).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.fulfillment === "DELIVERY" && !value.deliveryAddress) {
    ctx.addIssue({ code: "custom", path: ["deliveryAddress"], message: "Укажите адрес доставки" });
  }
});

export const orderRequestSchema = quoteRequestSchema.safeExtend({
  expectedTotalMinor: z.number().int().min(0).max(100_000_000),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,24}$/),
  }).strict(),
  comment: z.string().trim().max(500).optional(),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type QuoteInput = z.infer<typeof quoteRequestSchema>;

export type PricedProduct = {
  id: string;
  name: string;
  available: boolean;
  delivery: boolean;
  variants: Array<{ id: string; name: string; priceMinor: number; available: boolean }>;
  modifierGroups: Array<{
    kind: "MILK" | "ADD_ON";
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; name: string; priceMinor: number; available: boolean }>;
  }>;
};

export type PricingSettings = {
  ordersEnabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFeeMinor: number;
  deliveryMinimumMinor: number;
  currency: string;
  timeZone: string;
  schedule: Array<{ dayOfWeek: number; opensAt: string | null; closesAt: string | null; closed: boolean }>;
};

export type QuoteIssue = { lineId?: string; code: string; message: string };
export type PricedLine = {
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitBasePriceMinor: number;
  unitTotalMinor: number;
  lineTotalMinor: number;
  modifiers: Array<{ id: string; name: string; priceMinor: number }>;
};

const weekdayNumber = new Map([
  ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6],
]);

function localDayAndTime(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return { dayOfWeek: weekday ? weekdayNumber.get(weekday) : undefined, time: hour && minute ? `${hour}:${minute}` : undefined };
}

export function fulfillmentTimeIssue(
  requestedFor: string,
  settings: Pick<PricingSettings, "timeZone" | "schedule">,
  now = new Date(),
): QuoteIssue | null {
  const requested = new Date(requestedFor);
  if (!Number.isFinite(requested.getTime())) return { code: "INVALID_TIME", message: "Укажите корректное время получения" };
  if (requested.getTime() < now.getTime()) return { code: "TIME_IN_PAST", message: "Время получения уже прошло" };
  if (requested.getTime() > now.getTime() + 7 * 24 * 60 * 60 * 1000) return { code: "TIME_TOO_FAR", message: "Заказ можно запланировать не более чем на 7 дней вперёд" };
  let local: ReturnType<typeof localDayAndTime>;
  try {
    local = localDayAndTime(requested, settings.timeZone);
  } catch {
    return { code: "SCHEDULE_CONFIGURATION", message: "Расписание временно недоступно" };
  }
  const slot = settings.schedule.find((entry) => entry.dayOfWeek === local.dayOfWeek);
  if (!slot || slot.closed || !slot.opensAt || !slot.closesAt || !local.time) return { code: "CLOSED", message: "Кофейня закрыта в выбранное время" };
  if (local.time < slot.opensAt || local.time >= slot.closesAt) return { code: "OUTSIDE_HOURS", message: `Выберите время с ${slot.opensAt} до ${slot.closesAt}` };
  return null;
}

export function calculateQuote(
  input: QuoteInput,
  products: PricedProduct[],
  settings: PricingSettings,
  now = new Date(),
): { items: PricedLine[]; subtotalMinor: number; deliveryFeeMinor: number; totalMinor: number; currency: string; issues: QuoteIssue[] } {
  const issues: QuoteIssue[] = [];
  const lines: PricedLine[] = [];
  if (!settings.ordersEnabled) issues.push({ code: "ORDERS_DISABLED", message: "Приём заказов временно выключен" });
  if (input.fulfillment === "PICKUP" && !settings.pickupEnabled) issues.push({ code: "PICKUP_DISABLED", message: "Самовывоз временно недоступен" });
  if (input.fulfillment === "DELIVERY" && !settings.deliveryEnabled) issues.push({ code: "DELIVERY_DISABLED", message: "Доставка временно недоступна" });
  const timeIssue = fulfillmentTimeIssue(input.requestedFor, settings, now);
  if (timeIssue) issues.push(timeIssue);

  for (const requested of input.items) {
    const product = products.find((item) => item.id === requested.productId);
    if (!product || !product.available || (input.fulfillment === "DELIVERY" && !product.delivery)) {
      issues.push({ lineId: requested.lineId, code: "PRODUCT_UNAVAILABLE", message: "Позиция недоступна" });
      continue;
    }
    const availableVariants = product.variants.filter((variant) => variant.available);
    const variant = requested.sizeId
      ? availableVariants.find((item) => item.id === requested.sizeId)
      : availableVariants.length === 1 ? availableVariants[0] : undefined;
    if (!variant) {
      issues.push({ lineId: requested.lineId, code: "SIZE_REQUIRED", message: "Выберите доступный объём" });
      continue;
    }

    const chosenIds = [...(requested.milkId ? [requested.milkId] : []), ...requested.addOnIds];
    if (new Set(chosenIds).size !== chosenIds.length) {
      issues.push({ lineId: requested.lineId, code: "DUPLICATE_OPTION", message: "Добавка выбрана повторно" });
      continue;
    }
    const allowed = new Set(product.modifierGroups.flatMap((group) => group.options.map((option) => option.id)));
    if (chosenIds.some((id) => !allowed.has(id))) {
      issues.push({ lineId: requested.lineId, code: "UNKNOWN_OPTION", message: "Недопустимая добавка" });
      continue;
    }
    const milkIds = new Set(product.modifierGroups.filter((group) => group.kind === "MILK").flatMap((group) => group.options.map((option) => option.id)));
    const addOnIds = new Set(product.modifierGroups.filter((group) => group.kind === "ADD_ON").flatMap((group) => group.options.map((option) => option.id)));
    if ((requested.milkId && !milkIds.has(requested.milkId)) || requested.addOnIds.some((id) => !addOnIds.has(id))) {
      issues.push({ lineId: requested.lineId, code: "OPTION_KIND", message: "Проверьте тип молока и добавок" });
      continue;
    }
    const modifiers: PricedLine["modifiers"] = [];
    let invalid = false;
    for (const group of product.modifierGroups) {
      const selected = group.options.filter((option) => chosenIds.includes(option.id));
      if (selected.length < group.minSelect || selected.length > group.maxSelect || selected.some((option) => !option.available)) {
        issues.push({ lineId: requested.lineId, code: "INVALID_OPTIONS", message: `Проверьте выбор: ${group.kind === "MILK" ? "молоко" : "добавки"}` });
        invalid = true;
      }
      modifiers.push(...selected.map(({ id, name, priceMinor }) => ({ id, name, priceMinor })));
    }
    if (invalid) continue;
    const unitTotalMinor = variant.priceMinor + modifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
    lines.push({
      lineId: requested.lineId,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      variantName: variant.name,
      quantity: requested.quantity,
      unitBasePriceMinor: variant.priceMinor,
      unitTotalMinor,
      lineTotalMinor: unitTotalMinor * requested.quantity,
      modifiers,
    });
  }
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const deliveryFeeMinor = input.fulfillment === "DELIVERY" && settings.deliveryEnabled ? settings.deliveryFeeMinor : 0;
  if (input.fulfillment === "DELIVERY" && subtotalMinor < settings.deliveryMinimumMinor) {
    issues.push({ code: "DELIVERY_MINIMUM", message: "Не достигнута минимальная сумма доставки" });
  }
  return { items: lines, subtotalMinor, deliveryFeeMinor, totalMinor: subtotalMinor + deliveryFeeMinor, currency: settings.currency, issues };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export const statusTransitions = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
} as const;

export type Status = keyof typeof statusTransitions;
export function canTransition(from: Status, to: Status): boolean {
  return (statusTransitions[from] as readonly string[]).includes(to);
}
