import { db } from "@/lib/server/db";

export default async function AdminPage() {
  const [newOrders, activeProducts, auditEvents] = await Promise.all([db.order.count({ where: { status: "NEW" } }), db.product.count({ where: { archived: false } }), db.auditEvent.count()]);
  const cards = [["Новые заказы", newOrders], ["Товары", activeProducts], ["События журнала", auditEvents]] as const;
  return <main style={{ padding: "48px 4%" }}><p>Операционная сводка</p><h1 style={{ fontFamily: "Georgia,serif", fontSize: 56 }}>Houston сегодня</h1><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 16 }}>{cards.map(([label,value])=><article key={label} style={{ border: "1px solid #40271F", padding: 24 }}><strong style={{ fontSize: 40 }}>{value}</strong><p>{label}</p></article>)}</div></main>;
}
