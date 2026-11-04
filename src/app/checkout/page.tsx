import type { Metadata } from "next";
import { CheckoutClient } from "@/components/cart/CheckoutClient";

export const metadata: Metadata = { title: "Оформление заказа" };

export default function CheckoutPage() {
  return <CheckoutClient />;
}
