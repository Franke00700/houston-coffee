"use client";

import { useEffect, useState } from "react";
import type { PublicSettings } from "@/lib/client/types";

export function ContactSection() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/menu", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setSettings(data.settings ?? null);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, []);

  const contact = settings?.contact;
  const hasContact = Boolean(contact?.address || contact?.phone || contact?.instagram || contact?.telegram);

  return (
    <section className="contacts-section" id="contacts" aria-labelledby="contacts-title">
      <div>
        <p className="eyebrow">Контакты</p>
        <h2 id="contacts-title" className="section-title">Загляни<br /><em>на чашку.</em></h2>
        {!settings && !error && <p className="status-note" role="status">Загружаем актуальные контакты…</p>}
        {error && <p className="status-note">Контакты временно не загрузились. Попробуйте обновить страницу позже.</p>}
        {settings && !hasContact && <p className="status-note">Адрес и способы связи пока не опубликованы.</p>}
        {contact?.routeUrl && contact.address && (
          <a className="pill" href={contact.routeUrl} target="_blank" rel="noreferrer">Построить маршрут</a>
        )}
      </div>
      <dl className="contact-list">
        {contact?.address && <div><dt>Адрес</dt><dd>{contact.address}</dd></div>}
        {contact?.phone && <div><dt>Телефон</dt><dd><a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a></dd></div>}
        {contact?.instagram && <div><dt>Instagram</dt><dd>{contact.instagram}</dd></div>}
        {contact?.telegram && <div><dt>Telegram</dt><dd>{contact.telegram}</dd></div>}
        {settings?.schedule?.map((row) => <div key={`${row.label}-${row.value}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
        {settings && <div><dt>Заказы</dt><dd>{settings.ordersEnabled ? "Принимаем онлайн" : "Онлайн-заказ сейчас недоступен"}</dd></div>}
      </dl>
    </section>
  );
}
