"use client";

import { useMemo, useState } from "react";
import { adminRequest } from "./api";

type Status = "NEW" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
type OrderView = {
  id: string; number: string; status: Status; fulfillment: "PICKUP" | "DELIVERY"; customerName: string;
  customerPhone: string; deliveryAddress: string | null; comment: string | null; totalMinor: number; currency: string; createdAt: string; requestedFor: string | null;
  items: Array<{ id: string; productName: string; variantName: string; quantity: number; lineTotalMinor: number; modifiersSnapshot: unknown }>;
};
const labels: Record<Status, string> = { NEW: "Новый", CONFIRMED: "Подтверждён", PREPARING: "Готовится", READY: "Готов", COMPLETED: "Завершён", CANCELLED: "Отменён" };
const transitions: Record<Status, Status[]> = { NEW: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["PREPARING", "CANCELLED"], PREPARING: ["READY", "CANCELLED"], READY: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };

export function OrderBoard({ initialOrders }: { initialOrders: OrderView[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [message, setMessage] = useState("");
  const visible = useMemo(() => filter === "ALL" ? orders : orders.filter((item) => item.status === filter), [orders, filter]);
  async function move(order: OrderView, status: Status) {
    const reason = status === "CANCELLED" ? window.prompt("Причина отмены")?.trim() : undefined;
    if (status === "CANCELLED" && !reason) return;
    setMessage("");
    try {
      const updated = await adminRequest<OrderView>(`/api/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: updated.status } : item));
      setMessage(`Заказ ${order.number}: ${labels[updated.status]}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить статус"); }
  }
  return <>
    <div className="admin-filters" aria-label="Фильтр заказов"><button onClick={() => setFilter("ALL")} aria-pressed={filter === "ALL"}>Все</button>{(Object.keys(labels) as Status[]).map((status) => <button key={status} onClick={() => setFilter(status)} aria-pressed={filter === status}>{labels[status]} ({orders.filter((item) => item.status === status).length})</button>)}</div>
    <p className="admin-live" aria-live="polite">{message}</p>
    <div className="admin-order-grid">{visible.map((order) => <article className="admin-order-card" key={order.id}>
      <header><div><span className={`status status-${order.status.toLowerCase()}`}>{labels[order.status]}</span><h2>{order.number}</h2></div><time>{new Date(order.createdAt).toLocaleString("ru-RU")}</time></header>
      <p><strong>{order.customerName}</strong> · {order.customerPhone}</p>
      <p>{order.fulfillment === "DELIVERY" ? `Доставка: ${order.deliveryAddress}` : "Самовывоз"}</p>
      <p><strong>Ко времени:</strong> {order.requestedFor ? <time dateTime={order.requestedFor}>{new Date(order.requestedFor).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</time> : "не указано для исторического заказа"}</p>
      {order.comment && <p>Комментарий: {order.comment}</p>}
      <ul>{order.items.map((item) => <li key={item.id}>{item.quantity} × {item.productName}, {item.variantName} — {(item.lineTotalMinor / 100).toFixed(2)} {order.currency}</li>)}</ul>
      <strong>Итого: {(order.totalMinor / 100).toFixed(2)} {order.currency}</strong>
      <footer>{transitions[order.status].map((status) => <button key={status} className={status === "CANCELLED" ? "danger" : "admin-action"} onClick={() => void move(order, status)}>{labels[status]}</button>)}</footer>
    </article>)}{!visible.length && <p>Заказов с этим статусом нет.</p>}</div>
  </>;
}
