"use client";

import { useState } from "react";
import { adminRequest } from "./api";

type Settings = { ordersEnabled: boolean; pickupEnabled: boolean; deliveryEnabled: boolean; deliveryFeeMinor: number; deliveryMinimumMinor: number; phone: string | null; address: string | null; routeUrl: string | null; instagramUrl: string | null; telegramUrl: string | null; notice: string | null };
type Day = { dayOfWeek: number; opensAt: string | null; closesAt: string | null; closed: boolean };
const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

export function SettingsManager({ initialSettings, initialSchedule }: { initialSettings: Settings; initialSchedule: Day[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [message, setMessage] = useState("");
  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("Сохраняем…");
    try { const saved = await adminRequest<Settings>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(settings) }); setSettings(saved); setMessage("Настройки сохранены"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения"); }
  }
  async function saveDay(day: Day) {
    setMessage(`Сохраняем: ${dayNames[day.dayOfWeek]}…`);
    try { const saved = await adminRequest<Day>(`/api/admin/schedule/${day.dayOfWeek}`, { method: "PUT", body: JSON.stringify({ opensAt: day.closed ? null : day.opensAt, closesAt: day.closed ? null : day.closesAt, closed: day.closed }) }); setSchedule((current) => current.map((item) => item.dayOfWeek === saved.dayOfWeek ? saved : item)); setMessage("Расписание сохранено"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка сохранения"); }
  }
  return <div className="admin-settings-grid">
    <form className="admin-panel" onSubmit={saveSettings}><h2>Заказы и контакты</h2>
      <label className="admin-check"><input type="checkbox" checked={settings.ordersEnabled} onChange={(event) => setSettings({ ...settings, ordersEnabled: event.target.checked })} /> Принимать онлайн-заказы</label>
      <label className="admin-check"><input type="checkbox" checked={settings.pickupEnabled} onChange={(event) => setSettings({ ...settings, pickupEnabled: event.target.checked })} /> Самовывоз</label>
      <label className="admin-check"><input type="checkbox" checked={settings.deliveryEnabled} onChange={(event) => setSettings({ ...settings, deliveryEnabled: event.target.checked })} /> Доставка</label>
      <label>Стоимость доставки, ₽<input type="number" min="0" step="1" value={settings.deliveryFeeMinor / 100} onChange={(event) => setSettings({ ...settings, deliveryFeeMinor: Math.round(Number(event.target.value) * 100) })} /></label>
      <label>Минимум доставки, ₽<input type="number" min="0" step="1" value={settings.deliveryMinimumMinor / 100} onChange={(event) => setSettings({ ...settings, deliveryMinimumMinor: Math.round(Number(event.target.value) * 100) })} /></label>
      {(["phone", "address", "routeUrl", "instagramUrl", "telegramUrl", "notice"] as const).map((key) => <label key={key}>{({ phone: "Телефон", address: "Адрес", routeUrl: "Ссылка маршрута", instagramUrl: "Instagram URL", telegramUrl: "Telegram URL", notice: "Условия доставки / объявление" } as const)[key]}<input value={settings[key] ?? ""} onChange={(event) => setSettings({ ...settings, [key]: event.target.value || null })} /></label>)}
      <button className="admin-action" type="submit">Сохранить настройки</button>
    </form>
    <section className="admin-panel"><h2>Расписание</h2>{schedule.map((day) => <div className="schedule-editor" key={day.dayOfWeek}><strong>{dayNames[day.dayOfWeek]}</strong><label className="admin-check"><input type="checkbox" checked={day.closed} onChange={(event) => setSchedule((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, closed: event.target.checked } : item))} /> Закрыто</label><input aria-label={`Открытие, ${dayNames[day.dayOfWeek]}`} type="time" disabled={day.closed} value={day.opensAt ?? "09:00"} onChange={(event) => setSchedule((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, opensAt: event.target.value } : item))} /><input aria-label={`Закрытие, ${dayNames[day.dayOfWeek]}`} type="time" disabled={day.closed} value={day.closesAt ?? "21:00"} onChange={(event) => setSchedule((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, closesAt: event.target.value } : item))} /><button type="button" onClick={() => void saveDay(day)}>Сохранить день</button></div>)}</section>
    <p className="admin-live" aria-live="polite">{message}</p>
  </div>;
}
