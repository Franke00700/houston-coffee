import { db } from "@/lib/server/db";
import { OrderBoard } from "@/components/admin/OrderBoard";

export default async function OrdersPage() {
  const orders = await db.order.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { items: true } });
  const initialOrders = orders.map((order) => ({
    ...order,
    requestedFor: order.requestedFor?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }));
  return <main className="admin-main"><p className="eyebrow">Операционная очередь</p><h1 className="admin-title">Заказы</h1><OrderBoard initialOrders={initialOrders} /></main>;
}
