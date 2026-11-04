import type { Metadata } from "next";
import { MenuClient } from "@/components/public/MenuClient";

export const metadata: Metadata = { title: "Меню" };

export default function MenuPage() {
  return <MenuClient />;
}
