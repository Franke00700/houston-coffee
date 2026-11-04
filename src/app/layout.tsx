import type { Metadata } from "next";
import { CartProvider } from "@/components/cart/CartProvider";
import { SiteHeader } from "@/components/public/SiteHeader";
import "./globals.css";

// A fresh CSP nonce is created by src/proxy.ts for every document request.
// Nonces cannot be attached to statically generated framework scripts, so the
// document shell must be rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Houston Coffee — Хьюстон, у нас кофе",
    template: "%s — Houston Coffee",
  },
  description: "Меню и гостевой заказ Houston Coffee.",
  icons: { icon: "/brand/favicon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <a className="skip-link" href="#main-content">К содержанию</a>
          <SiteHeader />
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
