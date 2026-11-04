import { SettingsManager } from "@/components/admin/SettingsManager";
import { db } from "@/lib/server/db";
import { currentStaff } from "@/lib/server/security";

export default async function SettingsPage() {
  await currentStaff(["ADMIN"]);
  const [stored, scheduleRows] = await Promise.all([db.siteSettings.findUnique({ where: { id: 1 } }), db.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } })]);
  const settings = stored ?? { ordersEnabled: false, pickupEnabled: true, deliveryEnabled: false, deliveryFeeMinor: 0, deliveryMinimumMinor: 0, phone: null, address: null, routeUrl: null, instagramUrl: null, telegramUrl: null, notice: null };
  const schedule = Array.from({ length: 7 }, (_, dayOfWeek) => scheduleRows.find((item) => item.dayOfWeek === dayOfWeek) ?? { dayOfWeek, opensAt: null, closesAt: null, closed: true });
  return <main className="admin-main"><p className="eyebrow">Публичные данные</p><h1 className="admin-title">Настройки</h1><p>Неподтверждённые поля можно оставить пустыми — сайт не подставит демонстрационные сведения.</p><SettingsManager initialSettings={settings} initialSchedule={schedule} /></main>;
}
