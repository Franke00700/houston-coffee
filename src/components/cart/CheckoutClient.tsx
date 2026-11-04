"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { orderFingerprint, quoteFingerprint, wallTimeToIso, wallTimeValue } from "@/lib/client/checkout";
import { emptySettings, formatMoney, toPayload, type Fulfillment, type PublicSettings, type Quote } from "@/lib/client/types";

const PENDING_ORDER_KEY = "houston-coffee-pending-order-v1";

type Confirmation = { orderNumber: string; totalMinor: number; currency: string; status?: string };
type ApiFailure = { error?: { code?: string; message?: string; details?: unknown } };

export function CheckoutClient() {
  const { items, hydrated, quote, quotePending, quoteError, updateQuantity, removeItem, refreshQuote, clear } = useCart();
  const [settings, setSettings] = useState<PublicSettings>(emptySettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requestedFor, setRequestedFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [priceConfirmationRequired, setPriceConfirmationRequired] = useState(false);
  const [priceReviewMessage, setPriceReviewMessage] = useState<string | null>(null);
  const [reviewedQuoteFingerprint, setReviewedQuoteFingerprint] = useState("");
  const [minimumRequestedFor, setMinimumRequestedFor] = useState(() => wallTimeValue(new Date(), emptySettings.timeZone ?? "Europe/Moscow"));
  const idempotencyKey = useRef("");
  const idempotencyFingerprint = useRef("");
  const settingsController = useRef<AbortController | null>(null);

  const loadSettings = useCallback(() => {
    settingsController.current?.abort();
    const controller = new AbortController();
    settingsController.current = controller;
    setSettingsReady(false);
    setSettingsError(null);
    fetch("/api/public/menu", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: { settings?: PublicSettings } = await response.json();
        const next = data.settings ?? emptySettings;
        setSettings(next);
        setMinimumRequestedFor(wallTimeValue(new Date(), next.timeZone ?? "Europe/Moscow"));
        setFulfillment((current) => {
          if (current === "PICKUP" && next.pickupEnabled) return current;
          if (current === "DELIVERY" && next.deliveryEnabled) return current;
          return next.pickupEnabled ? "PICKUP" : next.deliveryEnabled ? "DELIVERY" : "PICKUP";
        });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSettings(emptySettings);
        setSettingsError("Не удалось проверить способы получения. Повторите загрузку перед оформлением.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettingsReady(true);
      });
    return controller;
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => loadSettings(), 0);
    return () => {
      window.clearTimeout(task);
      settingsController.current?.abort();
    };
  }, [loadSettings]);

  const invalidateReview = () => {
    setReviewedQuoteFingerprint("");
    setPriceConfirmationRequired(false);
    setPriceReviewMessage(null);
  };

  const quoteContext = () => ({
    items: toPayload(items), fulfillment,
    deliveryAddress: fulfillment === "DELIVERY" ? deliveryAddress : undefined,
    requestedFor: wallTimeToIso(requestedFor, settings.timeZone ?? "Europe/Moscow"),
  });

  const verify = async () => {
    setSubmitError(null);
    const requestedAt = wallTimeToIso(requestedFor, settings.timeZone ?? "Europe/Moscow");
    if (!requestedAt) return setSubmitError("Выберите время получения заказа.");
    const checked = await refreshQuote(fulfillment, deliveryAddress, requestedAt);
    if (!checked || checked.issues?.length) return;
    setReviewedQuoteFingerprint(quoteFingerprint(quoteContext(), checked));
    setPriceConfirmationRequired(false);
    setPriceReviewMessage("Актуальная сумма и время получения проверены сервером.");
  };

  function idempotencyFor(fingerprint: string) {
    try {
      const stored = window.sessionStorage.getItem(PENDING_ORDER_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && "fingerprint" in parsed && "key" in parsed && parsed.fingerprint === fingerprint && typeof parsed.key === "string") return parsed.key;
      }
    } catch {
      window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    }
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ fingerprint, key }));
    return key;
  }

  function clearPendingOrder() {
    window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    idempotencyKey.current = "";
    idempotencyFingerprint.current = "";
  }

  async function reviewChangedPrice(previousQuote: Quote | null) {
    const requestedAt = wallTimeToIso(requestedFor, settings.timeZone ?? "Europe/Moscow");
    if (!requestedAt) return;
    const actual = await refreshQuote(fulfillment, deliveryAddress, requestedAt);
    if (!actual || actual.issues?.length) return;
    setReviewedQuoteFingerprint(quoteFingerprint(quoteContext(), actual));
    setPriceConfirmationRequired(true);
    setPriceReviewMessage(previousQuote && previousQuote.totalMinor !== actual.totalMinor
      ? `Сумма изменилась с ${formatMoney(previousQuote.totalMinor, previousQuote.currency)} на ${formatMoney(actual.totalMinor, actual.currency)}. Проверьте её и подтвердите заказ ещё раз.`
      : `Актуальная сумма — ${formatMoney(actual.totalMinor, actual.currency)}. Проверьте её и подтвердите заказ ещё раз.`);
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setUncertain(false);
    setPriceReviewMessage(null);
    const form = new FormData(event.currentTarget);
    const customer = { name: String(form.get("name") ?? "").trim(), phone: String(form.get("phone") ?? "").trim() };
    const requestedAt = wallTimeToIso(requestedFor, settings.timeZone ?? "Europe/Moscow");
    if (customer.name.length < 2 || customer.phone.length < 7) return setSubmitError("Укажите имя и телефон, по которому можно связаться по заказу.");
    if (fulfillment === "DELIVERY" && deliveryAddress.trim().length < 8) return setSubmitError("Укажите адрес доставки подробнее.");
    if (!requestedAt) return setSubmitError("Выберите время получения заказа.");
    setSubmitting(true);
    try {
      const previousQuote = quote;
      const checked = await refreshQuote(fulfillment, deliveryAddress, requestedAt);
      if (!checked || checked.issues?.length) throw new Error("Исправьте состав, способ или время получения заказа перед отправкой.");
      const checkedFingerprint = quoteFingerprint(quoteContext(), checked);
      if (reviewedQuoteFingerprint !== checkedFingerprint) {
        setReviewedQuoteFingerprint(checkedFingerprint);
        setPriceConfirmationRequired(true);
        setPriceReviewMessage(previousQuote && previousQuote.totalMinor !== checked.totalMinor
          ? `Сумма изменилась с ${formatMoney(previousQuote.totalMinor, previousQuote.currency)} на ${formatMoney(checked.totalMinor, checked.currency)}. Проверьте её и подтвердите заказ ещё раз.`
          : `Сервер рассчитал итог ${formatMoney(checked.totalMinor, checked.currency)}. Проверьте сумму и подтвердите заказ ещё раз.`);
        return;
      }
      const orderPayload = {
        items: toPayload(items), fulfillment, requestedFor: requestedAt, expectedTotalMinor: checked.totalMinor,
        deliveryAddress: fulfillment === "DELIVERY" ? deliveryAddress.trim() : undefined,
        customer, comment: String(form.get("comment") ?? "").trim() || undefined,
      };
      const fingerprint = orderFingerprint(orderPayload);
      if (!idempotencyKey.current || idempotencyFingerprint.current !== fingerprint) {
        idempotencyKey.current = idempotencyFor(fingerprint);
        idempotencyFingerprint.current = fingerprint;
      }
      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: fingerprint,
      });
      const payload: Confirmation & ApiFailure = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.error?.code === "PRICE_CHANGED") {
          clearPendingOrder();
          await reviewChangedPrice(checked);
          return;
        }
        throw new Error(payload.error?.message || "Заказ не удалось создать.");
      }
      setConfirmation(payload);
      clear();
      clearPendingOrder();
    } catch (reason) {
      setUncertain(reason instanceof TypeError);
      setSubmitError(reason instanceof Error ? reason.message : "Не удалось отправить заказ.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) return (
    <main id="main-content" className="checkout-page confirmation-page"><section className="confirmation-card" aria-labelledby="confirmation-title">
      <p className="eyebrow">Заказ создан</p><h1 id="confirmation-title">Спасибо.<br /><em>Номер {confirmation.orderNumber}</em></h1>
      <p>Сохраните номер заказа. Сотрудник увидит заказ в очереди.</p><strong>{formatMoney(confirmation.totalMinor, confirmation.currency)}</strong><Link className="pill" href="/">Вернуться на главную</Link>
    </section></main>
  );
  if (!hydrated) return <main id="main-content" className="checkout-page"><div className="menu-state" role="status">Загружаем корзину…</div></main>;
  if (!items.length) return <main id="main-content" className="checkout-page"><section className="empty-cart"><p className="eyebrow">Корзина</p><h1>Пока пусто.</h1><p>Выберите напиток и настройте его под себя.</p><Link className="pill" href="/menu">Открыть меню</Link></section></main>;

  return (
    <main id="main-content" className="checkout-page">
      <header className="page-hero compact"><p className="eyebrow">Гостевой заказ</p><h1>Твоя<br /><em>корзина.</em></h1><p>Регистрация не нужна. Итоговую стоимость всегда подтверждает сервер.</p></header>
      <div className="checkout-layout">
        <section className="cart-lines" aria-labelledby="cart-title"><h2 id="cart-title">Состав заказа</h2>
          {items.map((item) => <article className="cart-line" key={item.lineId}>
            <div><h3>{item.productName}</h3><p>{[item.sizeName, item.milkName, ...item.addOnNames].filter(Boolean).join(" · ") || "По рецепту"}</p><small>Предварительно {formatMoney(item.previewPriceMinor * item.quantity, item.currency)}</small></div>
            <div className="quantity-control"><button type="button" onClick={() => { invalidateReview(); updateQuantity(item.lineId, item.quantity - 1); }} aria-label={`Уменьшить количество ${item.productName}`}>−</button><output aria-live="polite">{item.quantity}</output><button type="button" onClick={() => { invalidateReview(); updateQuantity(item.lineId, item.quantity + 1); }} aria-label={`Увеличить количество ${item.productName}`}>+</button></div>
            <button className="remove-button" type="button" onClick={() => { invalidateReview(); removeItem(item.lineId); }}>Удалить</button>
          </article>)}
        </section>
        <form className="checkout-form" onSubmit={submit}>
          <fieldset disabled={!settingsReady || submitting || Boolean(settingsError)}><legend>Как получить</legend><div className="fulfillment-grid">
            <label className={fulfillment === "PICKUP" ? "selected" : ""}><input type="radio" name="fulfillment" checked={fulfillment === "PICKUP"} disabled={!settings.pickupEnabled} onChange={() => { invalidateReview(); setFulfillment("PICKUP"); }} /><span>Самовывоз</span></label>
            <label className={fulfillment === "DELIVERY" ? "selected" : ""}><input type="radio" name="fulfillment" checked={fulfillment === "DELIVERY"} disabled={!settings.deliveryEnabled} onChange={() => { invalidateReview(); setFulfillment("DELIVERY"); }} /><span>Доставка{!settings.deliveryEnabled ? " · выключена" : ""}</span></label>
          </div></fieldset>
          {fulfillment === "DELIVERY" && <label>Адрес доставки<input name="address" autoComplete="street-address" value={deliveryAddress} onChange={(event) => { invalidateReview(); setDeliveryAddress(event.target.value); }} required /></label>}
          <label>Время получения<input name="requestedFor" type="datetime-local" value={requestedFor} min={minimumRequestedFor} onChange={(event) => { invalidateReview(); setRequestedFor(event.target.value); }} required aria-describedby="schedule-hint" /></label>
          <p id="schedule-hint" className="field-hint">Введите время по часовому поясу кофейни ({settings.timeZone ?? "Europe/Moscow"}). Сервер проверит его по актуальному расписанию.</p>
          {settings.schedule?.length ? <details className="schedule-summary"><summary>Показать расписание</summary><dl>{settings.schedule.map((day) => <div key={`${day.dayOfWeek ?? day.label}`}><dt>{day.label}</dt><dd>{day.value}</dd></div>)}</dl></details> : null}
          <label>Имя<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>
          <label>Телефон<input name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={30} required /></label>
          <label>Комментарий<textarea name="comment" rows={3} maxLength={500} /></label>
          {settingsError && <div className="form-error" role="alert"><p>{settingsError}</p><button className="line-button" type="button" onClick={() => loadSettings()} disabled={!settingsReady}>Повторить загрузку условий</button></div>}
          <button className="line-button quote-button" type="button" onClick={() => void verify()} disabled={quotePending || submitting || Boolean(settingsError)}>{quotePending ? "Проверяем…" : "Пересчитать на сервере"}</button>
          {quoteError && <p className="form-error" role="alert">{quoteError}</p>}
          {quote && <div className="order-total" aria-live="polite"><span>Подытог <strong>{formatMoney(quote.subtotalMinor, quote.currency)}</strong></span><span>Доставка <strong>{formatMoney(quote.deliveryFeeMinor, quote.currency)}</strong></span><span className="grand-total">Итого <strong>{formatMoney(quote.totalMinor, quote.currency)}</strong></span>{quote.issues?.map((issue) => <p className="form-error" key={`${issue.lineId}-${issue.code}`}>{issue.message}</p>)}</div>}
          {priceReviewMessage && <p className={priceConfirmationRequired ? "price-review warning" : "price-review"} role="status">{priceReviewMessage}</p>}
          {submitError && <p className="form-error" role="alert">{uncertain ? "Связь прервалась после отправки. Повторите отправку: для неизменённого заказа используется тот же ключ и дубликат не появится. " : ""}{submitError}</p>}
          <button className="pill submit-order" type="submit" disabled={submitting || !settingsReady || Boolean(settingsError) || !settings.ordersEnabled}>{submitting ? "Проверяем и создаём…" : settings.ordersEnabled ? priceConfirmationRequired ? `Подтвердить сумму · ${quote ? formatMoney(quote.totalMinor, quote.currency) : ""}` : `Создать заказ${quote ? ` · ${formatMoney(quote.totalMinor, quote.currency)}` : ""}` : "Онлайн-заказ недоступен"}</button>
          <p className="privacy-note">Контакт используется только для обработки этого заказа.</p>
        </form>
      </div>
    </main>
  );
}
