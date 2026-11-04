import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { ApiError, jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), closed: z.boolean() }).strict().refine((value) => value.closed || (value.opensAt !== null && value.closesAt !== null), { message: "Для открытого дня укажите время начала и окончания" });
export async function PUT(request: Request, context: { params: Promise<{ day: string }> }) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const dayOfWeek = Number((await context.params).day);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new ApiError(400, "DAY", "Некорректный день недели");
    const input = schema.parse(await parseJson(request));
    const before = await db.scheduleEntry.findUnique({ where: { dayOfWeek } });
    const after = await db.scheduleEntry.upsert({ where: { dayOfWeek }, update: input, create: { dayOfWeek, ...input } });
    await audit({ actorId: user.id, actorRole: user.role, action: "SCHEDULE_UPDATE", entity: "ScheduleEntry", entityId: String(dayOfWeek), before, after });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
