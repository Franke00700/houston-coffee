import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { currentStaff, verifyStaffMutation } from "@/lib/server/security";
import { menuInclude } from "@/lib/server/menu";

const variant = z.object({ name: z.string().trim().min(1).max(80), priceMinor: z.number().int().min(0).max(10_000_000), sortOrder: z.number().int().min(0).max(1000).default(0) }).strict();
const schema = z.object({ categoryId: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]{2,80}$/), name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).default(""), published: z.boolean().default(false), available: z.boolean().default(false), delivery: z.boolean().default(true), sortOrder: z.number().int().min(0).max(10000).default(0), variants: z.array(variant).min(1).max(20) }).strict();

export async function GET() {
  try { await currentStaff(); return NextResponse.json({ products: await db.product.findMany({ where: { archived: false }, include: menuInclude, orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }] }) }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const input = schema.parse(await parseJson(request));
    const created = await db.product.create({ data: { ...input, variants: { create: input.variants } }, include: menuInclude });
    await audit({ actorId: user.id, actorRole: user.role, action: "PRODUCT_CREATE", entity: "Product", entityId: created.id, after: created });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return jsonError(error); }
}
