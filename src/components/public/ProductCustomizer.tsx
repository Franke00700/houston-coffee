"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { formatMoney, type MenuProduct } from "@/lib/client/types";

export function ProductCustomizer({ product, onClose, returnFocusRef }: { product: MenuProduct; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const sizes = product.options?.sizes?.filter((item) => item.available !== false) ?? [];
  const milks = product.options?.milks?.filter((item) => item.available !== false) ?? [];
  const addOns = product.options?.addOns?.filter((item) => item.available !== false) ?? [];
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");
  const [milkId, setMilkId] = useState("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const previouslyFocused = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, returnFocusRef]);

  const size = sizes.find((item) => item.id === sizeId);
  const milk = milks.find((item) => item.id === milkId);
  const selectedAddOns = addOns.filter((item) => addOnIds.includes(item.id));
  const unitPreview = product.basePriceMinor + (size?.priceDeltaMinor ?? 0) + (milk?.priceDeltaMinor ?? 0) + selectedAddOns.reduce((sum, item) => sum + item.priceDeltaMinor, 0);

  const submit = () => {
    addItem({
      productId: product.id,
      productName: product.name,
      sizeId: size?.id,
      sizeName: size?.name,
      milkId: milk?.id,
      milkName: milk?.name,
      addOnIds,
      addOnNames: selectedAddOns.map((item) => item.name),
      quantity,
      previewPriceMinor: unitPreview,
      currency: product.currency,
    });
    setAdded(true);
  };

  return (
    <div className="customizer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="product-customizer" role="dialog" aria-modal="true" aria-labelledby="customizer-title" tabIndex={-1} ref={panelRef}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Закрыть настройку">×</button>
        <p className="eyebrow">Настрой свой напиток</p>
        <h2 id="customizer-title">{product.name}</h2>
        {product.description && <p>{product.description}</p>}

        {sizes.length > 0 && <fieldset><legend>Объём</legend><div className="option-grid">{sizes.map((item) => (
          <label key={item.id} className={sizeId === item.id ? "option-chip selected" : "option-chip"}>
            <input type="radio" name="size" value={item.id} checked={sizeId === item.id} onChange={() => setSizeId(item.id)} />
            <span>{item.name}{item.priceDeltaMinor ? ` · +${formatMoney(item.priceDeltaMinor, product.currency)}` : ""}</span>
          </label>
        ))}</div></fieldset>}

        {milks.length > 0 && <fieldset><legend>Молоко</legend><div className="option-grid">
          <label className={!milkId ? "option-chip selected" : "option-chip"}><input type="radio" name="milk" value="" checked={!milkId} onChange={() => setMilkId("")} /><span>По рецепту</span></label>
          {milks.map((item) => <label key={item.id} className={milkId === item.id ? "option-chip selected" : "option-chip"}>
            <input type="radio" name="milk" value={item.id} checked={milkId === item.id} onChange={() => setMilkId(item.id)} />
            <span>{item.name}{item.priceDeltaMinor ? ` · +${formatMoney(item.priceDeltaMinor, product.currency)}` : ""}</span>
          </label>)}
        </div></fieldset>}

        {addOns.length > 0 && <fieldset><legend>Добавки</legend><div className="option-grid">{addOns.map((item) => {
          const checked = addOnIds.includes(item.id);
          return <label key={item.id} className={checked ? "option-chip selected" : "option-chip"}>
            <input type="checkbox" checked={checked} onChange={() => setAddOnIds((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} />
            <span>{item.name}{item.priceDeltaMinor ? ` · +${formatMoney(item.priceDeltaMinor, product.currency)}` : ""}</span>
          </label>;
        })}</div></fieldset>}

        <div className="customizer-footer">
          <div className="quantity-control" aria-label="Количество">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Уменьшить количество">−</button>
            <output>{quantity}</output>
            <button type="button" onClick={() => setQuantity((value) => Math.min(20, value + 1))} aria-label="Увеличить количество">+</button>
          </div>
          <button className="pill" type="button" onClick={submit}>Добавить · {formatMoney(unitPreview * quantity, product.currency)}</button>
        </div>
        {added && <p className="success-message" role="status">Добавлено в корзину. Можно продолжить выбор или перейти к оформлению.</p>}
      </div>
    </div>
  );
}
