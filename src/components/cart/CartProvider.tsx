"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, Fulfillment, Quote } from "@/lib/client/types";
import { toPayload } from "@/lib/client/types";

const STORAGE_KEY = "houston-coffee-cart-v1";

type CartContextValue = {
  items: CartItem[];
  hydrated: boolean;
  count: number;
  quote: Quote | null;
  quotePending: boolean;
  quoteError: string | null;
  addItem: (item: Omit<CartItem, "lineId">) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  refreshQuote: (fulfillment: Fulfillment, deliveryAddress?: string, requestedFor?: string) => Promise<Quote | null>;
};

const CartContext = createContext<CartContextValue | null>(null);

function validStoredCart(value: unknown): value is CartItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.lineId === "string" &&
        typeof item.productId === "string" &&
        typeof item.productName === "string" &&
        (item.sizeId === undefined || typeof item.sizeId === "string") &&
        (item.sizeName === undefined || typeof item.sizeName === "string") &&
        (item.milkId === undefined || typeof item.milkId === "string") &&
        (item.milkName === undefined || typeof item.milkName === "string") &&
        Array.isArray(item.addOnIds) &&
        item.addOnIds.every((id: unknown) => typeof id === "string") &&
        Array.isArray(item.addOnNames) &&
        item.addOnNames.every((name: unknown) => typeof name === "string") &&
        Number.isInteger(item.previewPriceMinor) &&
        item.previewPriceMinor >= 0 &&
        typeof item.currency === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 20,
    )
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteRequest = useRef(0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (validStoredCart(parsed)) setItems(parsed);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (active) setHydrated(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  const addItem = useCallback((item: Omit<CartItem, "lineId">) => {
    setQuote(null);
    setQuoteError(null);
    setItems((current) => [
      ...current,
      { ...item, lineId: crypto.randomUUID() },
    ]);
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    setQuote(null);
    setQuoteError(null);
    if (quantity <= 0) {
      setItems((current) => current.filter((item) => item.lineId !== lineId));
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.lineId === lineId ? { ...item, quantity: Math.min(quantity, 20) } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setQuote(null);
    setQuoteError(null);
    setItems((current) => current.filter((item) => item.lineId !== lineId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setQuote(null);
    setQuoteError(null);
  }, []);

  const refreshQuote = useCallback(
    async (fulfillment: Fulfillment, deliveryAddress?: string, requestedFor?: string) => {
      const requestId = ++quoteRequest.current;
      setQuotePending(true);
      setQuoteError(null);
      try {
        const response = await fetch("/api/public/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: toPayload(items),
            fulfillment,
            deliveryAddress: fulfillment === "DELIVERY" ? deliveryAddress : undefined,
            requestedFor,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error
            ? String(payload.error.message)
            : "Не удалось проверить заказ. Попробуйте ещё раз.";
          throw new Error(message);
        }
        const nextQuote = payload as Quote;
        if (requestId !== quoteRequest.current) return null;
        setQuote(nextQuote);
        return nextQuote;
      } catch (error) {
        if (requestId !== quoteRequest.current) return null;
        setQuote(null);
        setQuoteError(error instanceof Error ? error.message : "Ошибка проверки заказа.");
        return null;
      } finally {
        if (requestId === quoteRequest.current) setQuotePending(false);
      }
    },
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      hydrated,
      count: items.reduce((total, item) => total + item.quantity, 0),
      quote,
      quotePending,
      quoteError,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refreshQuote,
    }),
    [
      items,
      hydrated,
      quote,
      quotePending,
      quoteError,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refreshQuote,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
