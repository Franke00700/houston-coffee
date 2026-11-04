"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductCustomizer } from "@/components/public/ProductCustomizer";
import { emptySettings, formatMoney, type MenuProduct, type PublicMenu } from "@/lib/client/types";

function isPublicMenu(value: unknown): value is PublicMenu {
  return Boolean(value && typeof value === "object" && "categories" in value && Array.isArray((value as PublicMenu).categories));
}

export function MenuClient() {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const customizerTrigger = useRef<HTMLButtonElement | null>(null);
  const { count } = useCart();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/public/menu", { cache: "no-store" });
      if (!response.ok) throw new Error("Меню временно недоступно.");
      const payload: unknown = await response.json();
      if (!isPublicMenu(payload)) throw new Error("Сервер вернул меню в неизвестном формате.");
      setMenu({ ...payload, settings: payload.settings ?? emptySettings });
      const focus = new URLSearchParams(window.location.search).get("focus")?.toLowerCase();
      if (focus) {
        const normalized = focus.replace(/-/g, " ");
        const product = payload.categories.flatMap((category) => category.products).find((item) => item.name.toLowerCase().includes(normalized.split(" ")[0]));
        if (product?.available && payload.settings?.ordersEnabled) setSelected(product);
      }
    } catch (reason) {
      setMenu(null);
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить меню.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const categories = menu?.categories ?? [];
  const hasProducts = categories.some((category) => category.products.length > 0);

  return (
    <main id="main-content" className="menu-page">
      <header className="page-hero">
        <p className="eyebrow">Актуальное меню</p>
        <h1>Выбери свою<br /><em>чашку.</em></h1>
        <p>Объём, молоко и добавки показываются только там, где они доступны для конкретного напитка.</p>
      </header>

      {loading && <section className="menu-state" role="status"><span className="loader" aria-hidden="true" /><h2>Загружаем меню</h2><p>Проверяем позиции и наличие.</p></section>}
      {error && <section className="menu-state" role="alert"><h2>Меню не загрузилось</h2><p>{error}</p><button className="pill" type="button" onClick={() => void load()}>Попробовать снова</button></section>}
      {menu && !menu.settings.ordersEnabled && <div className="service-notice"><strong>Онлайн-заказы сейчас не принимаются.</strong><span>Меню можно посмотреть, но добавление в корзину временно недоступно.</span></div>}
      {menu && !hasProducts && <section className="menu-state"><Image src="/brand/menu-print.png" width={205} height={242} alt="Фирменное меню Houston" /><h2>Меню готовится к публикации</h2><p>Мы не показываем демонстрационные цены. Актуальные позиции появятся после настройки сотрудником.</p></section>}

      {hasProducts && <>
        <nav className="category-nav" aria-label="Категории меню">{categories.filter((category) => category.products.length).map((category) => <a key={category.id} href={`#category-${category.slug}`}>{category.name}</a>)}</nav>
        <div className="catalog">
          {categories.map((category, categoryIndex) => category.products.length > 0 && (
            <section className="category-section" id={`category-${category.slug}`} key={category.id} aria-labelledby={`category-title-${category.id}`}>
              <div className="category-heading"><span>0{categoryIndex + 1}</span><div><h2 id={`category-title-${category.id}`}>{category.name}</h2>{category.description && <p>{category.description}</p>}</div></div>
              <div className="product-grid">{category.products.map((product, index) => (
                <article className={`product-card tone-${(categoryIndex + index) % 3}`} key={product.id}>
                  <div className="product-art"><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><Image src={product.imageUrl ?? (index % 2 ? "/brand/character-cup.png" : "/brand/symbol.png")} width={220} height={220} alt={product.imageUrl ? product.name : ""} /></div>
                  <div className="product-info">
                    <p className="eyebrow">{product.available ? "В наличии" : "Сегодня закончилось"}</p>
                    <h3>{product.name}</h3>
                    {product.description && <p>{product.description}</p>}
                    <div><strong>от {formatMoney(product.basePriceMinor, product.currency)}</strong><button type="button" className="line-button" disabled={!product.available || menu?.settings.ordersEnabled !== true} onClick={(event) => { customizerTrigger.current = event.currentTarget; setSelected(product); }}>{product.available ? "Настроить ↗" : "Недоступно"}</button></div>
                  </div>
                </article>
              ))}</div>
            </section>
          ))}
        </div>
      </>}

      {count > 0 && <Link className="floating-cart" href="/checkout"><span>Корзина</span><strong>{count}</strong><span>Оформить ↗</span></Link>}
      {selected && <ProductCustomizer product={selected} returnFocusRef={customizerTrigger} onClose={() => setSelected(null)} />}
    </main>
  );
}
