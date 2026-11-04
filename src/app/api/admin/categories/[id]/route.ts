import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ name: z.string().trim().min(2).max(100).optional(), sortOrder: z.number().int().min(0).max(10000).optional(), published: z.boolean().optional(), archived: z.boolean().optional() }).strict();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const { id } = await context.params;
    const before = await db.category.findUniqueOrThrow({ where: { id } });
    const after = await db.category.update({ where: { id }, data: schema.parse(await parseJson(request)) });
    await audit({ actorId: user.id, actorRole: user.role, action: "CATEGORY_UPDATE", entity: "Category", entityId: id, before, after });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
