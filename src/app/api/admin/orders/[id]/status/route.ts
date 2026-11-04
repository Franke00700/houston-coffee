import { NextResponse } from "next/server";
import { z } from "zod";
import { canTransition } from "@/lib/domain/order";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { ApiError, jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ status: z.enum(["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]), reason: z.string().trim().max(300).optional() }).strict();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN", "OPERATOR"]); const { id } = await context.params; const input = schema.parse(await parseJson(request));
    const before = await db.order.findUniqueOrThrow({ where: { id } });
    if (!canTransition(before.status, input.status)) throw new ApiError(409, "STATUS_TRANSITION", "Недопустимый переход статуса");
    if (input.status === "CANCELLED" && !input.reason) throw new ApiError(400, "CANCEL_REASON", "Укажите причину отмены");
    const after = await db.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id, status: before.status }, data: { status: input.status } });
      if (changed.count !== 1) throw new ApiError(409, "STATUS_CONFLICT", "Статус заказа уже изменился");
      await tx.orderStatusEvent.create({ data: { orderId: id, actorId: user.id, from: before.status, to: input.status, reason: input.reason } });
      return tx.order.findUniqueOrThrow({ where: { id } });
    });
    await audit({ actorId: user.id, actorRole: user.role, action: "ORDER_STATUS", entity: "Order", entityId: id, before: { status: before.status }, after: { status: after.status, reason: input.reason } });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
