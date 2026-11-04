import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { ApiError, jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "OPERATOR"]).optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "Нет изменений" });

const publicFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user: actor } = await verifyStaffMutation(request, ["ADMIN"]);
    const { id } = await context.params;
    const input = updateSchema.parse(await parseJson(request));
    const result = await db.$transaction(async (tx) => {
      const before = await tx.staffUser.findUnique({ where: { id }, select: publicFields });
      if (!before) throw new ApiError(404, "STAFF_NOT_FOUND", "Сотрудник не найден");

      const removesActiveAdmin = before.active && before.role === "ADMIN"
        && (input.active === false || (input.role !== undefined && input.role !== "ADMIN"));
      if (removesActiveAdmin) {
        const otherActiveAdmins = await tx.staffUser.count({ where: { id: { not: id }, active: true, role: "ADMIN" } });
        if (otherActiveAdmins === 0) throw new ApiError(409, "LAST_ACTIVE_ADMIN", "Нельзя отключить или изменить роль последнего активного администратора");
      }

      const after = await tx.staffUser.update({
        where: { id },
        data: { ...input, tokenVersion: { increment: 1 } },
        select: publicFields,
      });
      await tx.staffSession.deleteMany({ where: { userId: id } });
      return { before, after };
    }, { isolationLevel: "Serializable" });

    await audit({ actorId: actor.id, actorRole: actor.role, action: "STAFF_ACCESS_UPDATE", entity: "StaffUser", entityId: id, before: result.before, after: result.after });
    return NextResponse.json(result.after);
  } catch (error) { return jsonError(error); }
}
