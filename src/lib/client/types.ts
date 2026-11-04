export type Fulfillment = "PICKUP" | "DELIVERY";

export type MenuOption = {
  id: string;
  name: string;
  priceDeltaMinor: number;
  available?: boolean;
};

export type MenuProduct = {
  id: string;
  categoryId?: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  available: boolean;
  featured?: boolean;
  basePriceMinor: number;
  currency: string;
  options?: {
    sizes?: MenuOption[];
    milks?: MenuOption[];
    addOns?: MenuOption[];
  };
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  products: MenuProduct[];
};

export type PublicSettings = {
  ordersEnabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  contact?: {
    address?: string | null;
    phone?: string | null;
    routeUrl?: string | null;
    instagram?: string | null;
    telegram?: string | null;
  };
  timeZone?: string;
  schedule?: Array<{
    dayOfWeek?: number;
    label: string;
    value: string;
    opensAt?: string | null;
    closesAt?: string | null;
    closed?: boolean;
  }>;
  deliveryNote?: string | null;
};

export type PublicMenu = {
  categories: MenuCategory[];
  settings: PublicSettings;
};

export type CartItem = {
  lineId: string;
  productId: string;
  productName: string;
  sizeId?: string;
  sizeName?: string;
  milkId?: string;
  milkName?: string;
  addOnIds: string[];
  addOnNames: string[];
  quantity: number;
  previewPriceMinor: number;
  currency: string;
};

export type CartPayloadItem = Pick<
  CartItem,
  "lineId" | "productId" | "sizeId" | "milkId" | "addOnIds" | "quantity"
>;

export type QuoteIssue = {
  lineId?: string;
  code: string;
  message: string;
};

export type Quote = {
  items: Array<{
    lineId: string;
    name: string;
    configuration?: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }>;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: string;
  issues: QuoteIssue[];
};

export const emptySettings: PublicSettings = {
  ordersEnabled: false,
  pickupEnabled: true,
  deliveryEnabled: false,
  timeZone: "Europe/Moscow",
};

export function formatMoney(minor: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "RUB" ? 0 : 2,
  }).format(minor / 100);
}

export function toPayload(items: CartItem[]): CartPayloadItem[] {
  return items.map(({ lineId, productId, sizeId, milkId, addOnIds, quantity }) => ({
    lineId,
    productId,
    sizeId,
    milkId,
    addOnIds,
    quantity,
  }));
}
