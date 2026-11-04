import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { currentStaff, verifyStaffMutation } from "@/lib/server/security";

const option = z.object({ name: z.string().trim().min(1).max(100), priceMinor: z.number().int().min(0).max(10_000_000).default(0), sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();
const schema = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(["MILK", "ADD_ON"]), minSelect: z.number().int().min(0).max(20).default(0), maxSelect: z.number().int().min(1).max(20), productIds: z.array(z.string().min(1)).max(100).default([]), options: z.array(option).min(1).max(50) }).strict().refine((value) => value.maxSelect >= value.minSelect, { message: "maxSelect должен быть не меньше minSelect" });
export async function GET() {
  try { await currentStaff(); return NextResponse.json({ groups: await db.modifierGroup.findMany({ where: { archived: false }, include: { options: true, products: true } }) }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const input = schema.parse(await parseJson(request));
    const group = await db.modifierGroup.create({ data: { name: input.name, kind: input.kind, minSelect: input.minSelect, maxSelect: input.maxSelect, options: { create: input.options }, products: { create: input.productIds.map((productId, sortOrder) => ({ productId, sortOrder })) } }, include: { options: true, products: true } });
    await audit({ actorId: user.id, actorRole: user.role, action: "MODIFIER_CREATE", entity: "ModifierGroup", entityId: group.id, after: group });
    return NextResponse.json(group, { status: 201 });
  } catch (error) { return jsonError(error); }
}
