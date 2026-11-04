import { db } from "@/lib/server/db";
import { currentStaff } from "@/lib/server/security";

export default async function AuditPage() {
  await currentStaff(["ADMIN"]);
  const events = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return <main className="admin-main"><p className="eyebrow">Только чтение</p><h1 className="admin-title">Журнал действий</h1><div className="audit-table" role="table" aria-label="Важные действия"><div className="audit-row audit-head" role="row"><span>Время</span><span>Действие</span><span>Объект</span><span>Роль</span><span>Результат</span></div>{events.map((event) => <div className="audit-row" role="row" key={event.id}><time>{event.createdAt.toLocaleString("ru-RU")}</time><span>{event.action}</span><span>{event.entity}{event.entityId ? ` · ${event.entityId}` : ""}</span><span>{event.actorRole ?? "SYSTEM"}</span><span>{event.success ? "Успешно" : "Ошибка"}</span></div>)}</div>{!events.length && <p>Журнал пока пуст.</p>}</main>;
}
