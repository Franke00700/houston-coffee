import { db } from "./db";
import type { PricedProduct, PricingSettings } from "@/lib/domain/order";

const businessTimeZone = process.env.BUSINESS_TIME_ZONE ?? "Europe/Moscow";

export const menuInclude = {
  variants: { where: { archived: false }, orderBy: { sortOrder: "asc" as const } },
  modifierGroups: { orderBy: { sortOrder: "asc" as const }, include: { group: { include: { options: { where: { archived: false }, orderBy: { sortOrder: "asc" as const } } } } } },
  image: true,
} as const;

export async function pricingContext() {
  const [records, rawSettings, schedule] = await Promise.all([
    db.product.findMany({ where: { published: true, archived: false }, include: menuInclude }),
    db.siteSettings.findUnique({ where: { id: 1 } }),
    db.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);
  const settings: PricingSettings = { ...(rawSettings ?? { ordersEnabled: false, pickupEnabled: false, deliveryEnabled: false, deliveryFeeMinor: 0, deliveryMinimumMinor: 0, currency: "RUB" }), timeZone: businessTimeZone, schedule };
  const products: PricedProduct[] = records.map((product) => ({
    id: product.id, name: product.name, available: product.available, delivery: product.delivery,
    variants: product.variants.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })),
    modifierGroups: product.modifierGroups.map(({ group }) => ({
      kind: group.kind, minSelect: group.minSelect, maxSelect: group.maxSelect,
      options: group.options.map(({ id, name, priceMinor, available }) => ({ id, name, priceMinor, available })),
    })),
  }));
  return { products, settings };
}

export async function publicMenu() {
  const [categories, settings, schedule] = await Promise.all([
    db.category.findMany({ where: { published: true, archived: false }, orderBy: { sortOrder: "asc" }, include: { products: { where: { published: true, archived: false }, orderBy: { sortOrder: "asc" }, include: menuInclude } } }),
    db.siteSettings.findUnique({ where: { id: 1 } }),
    db.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);
  return {
    categories: categories.map((category) => ({ id: category.id, name: category.name, slug: category.slug, products: category.products.map((product) => {
      const activeVariants = product.variants.filter((variant) => variant.available);
      const basePriceMinor = activeVariants.length ? Math.min(...activeVariants.map((variant) => variant.priceMinor)) : 0;
      const sizes = activeVariants.map((variant) => ({ id: variant.id, name: variant.name, priceDeltaMinor: variant.priceMinor - basePriceMinor, available: variant.available }));
      const milks = product.modifierGroups.filter(({ group }) => group.kind === "MILK").flatMap(({ group }) => group.options.filter((option) => option.available).map((option) => ({ id: option.id, name: option.name, priceDeltaMinor: option.priceMinor, available: option.available })));
      const addOns = product.modifierGroups.filter(({ group }) => group.kind === "ADD_ON").flatMap(({ group }) => group.options.filter((option) => option.available).map((option) => ({ id: option.id, name: option.name, priceDeltaMinor: option.priceMinor, available: option.available })));
      return { id: product.id, categoryId: category.id, name: product.name, description: product.description, imageUrl: product.image ? `/api/media/${product.image.storageKey}` : undefined, available: product.available, basePriceMinor, currency: settings?.currency ?? "RUB", options: { sizes, milks, addOns } };
    }) })),
    settings: {
      ordersEnabled: settings?.ordersEnabled ?? false, pickupEnabled: settings?.pickupEnabled ?? false, deliveryEnabled: settings?.deliveryEnabled ?? false,
      contact: settings ? { phone: settings.phone, address: settings.address, routeUrl: settings.routeUrl, instagram: settings.instagramUrl, telegram: settings.telegramUrl } : undefined,
      timeZone: businessTimeZone,
      schedule: schedule.map((entry) => ({ dayOfWeek: entry.dayOfWeek, opensAt: entry.opensAt, closesAt: entry.closesAt, closed: entry.closed, label: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][entry.dayOfWeek] ?? String(entry.dayOfWeek), value: entry.closed ? "Закрыто" : `${entry.opensAt} — ${entry.closesAt}` })),
      deliveryNote: settings?.notice,
    },
  };
}
