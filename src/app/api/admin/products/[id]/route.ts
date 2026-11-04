import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(1000).optional(), categoryId: z.string().min(1).optional(), imageId: z.string().nullable().optional(), published: z.boolean().optional(), available: z.boolean().optional(), delivery: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10000).optional(), archived: z.boolean().optional() }).strict();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const input = schema.parse(await parseJson(request));
    const onlyAvailability = Object.keys(input).every((key) => key === "available");
    const { user } = await verifyStaffMutation(request, onlyAvailability ? ["ADMIN", "OPERATOR"] : ["ADMIN"]);
    const before = await db.product.findUniqueOrThrow({ where: { id } });
    const after = await db.product.update({ where: { id }, data: input });
    await audit({ actorId: user.id, actorRole: user.role, action: onlyAvailability ? "PRODUCT_AVAILABILITY" : "PRODUCT_UPDATE", entity: "Product", entityId: id, before, after });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
