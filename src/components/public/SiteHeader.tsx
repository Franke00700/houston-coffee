"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { count, hydrated } = useCart();

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Houston Coffee — на главную">
        <Image src="/brand/symbol.png" width={38} height={35} alt="" priority />
        <Image src="/brand/wordmark.png" width={132} height={38} alt="Houston Coffee" priority />
      </Link>
      <button
        className="nav-toggle"
        type="button"
        aria-label={open ? "Закрыть основное меню" : "Открыть основное меню"}
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "Закрыть" : "Меню"}</span>
      </button>
      <nav id="site-navigation" className={open ? "main-nav is-open" : "main-nav"} aria-label="Основная навигация">
        <Link href="/#about" onClick={() => setOpen(false)}>О нас</Link>
        <Link href="/menu" onClick={() => setOpen(false)}>Меню</Link>
        <Link href="/#atmosphere" onClick={() => setOpen(false)}>Атмосфера</Link>
        <Link href="/#contacts" onClick={() => setOpen(false)}>Контакты</Link>
      </nav>
      <Link className="cart-link" href="/checkout">
        Корзина <span aria-label={`${hydrated ? count : 0} товаров`}>{hydrated ? count : 0}</span>
      </Link>
    </header>
  );
}
