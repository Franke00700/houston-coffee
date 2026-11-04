import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ name: z.string().trim().min(1).max(100).optional(), priceMinor: z.number().int().min(0).max(10_000_000).optional(), available: z.boolean().optional(), sortOrder: z.number().int().min(0).max(1000).optional(), archived: z.boolean().optional() }).strict();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const { id } = await context.params;
    const before = await db.modifierOption.findUniqueOrThrow({ where: { id } });
    const after = await db.modifierOption.update({ where: { id }, data: schema.parse(await parseJson(request)) });
    await audit({ actorId: user.id, actorRole: user.role, action: "MODIFIER_OPTION_UPDATE", entity: "ModifierOption", entityId: id, before, after });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
