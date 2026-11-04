import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { currentStaff, verifyStaffMutation } from "@/lib/server/security";

const createSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,80}$/), name: z.string().trim().min(2).max(100), sortOrder: z.number().int().min(0).max(10000).default(0), published: z.boolean().default(false) }).strict();

export async function GET() {
  try { await currentStaff(); return NextResponse.json({ categories: await db.category.findMany({ where: { archived: false }, orderBy: { sortOrder: "asc" } }) }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]);
    const created = await db.category.create({ data: createSchema.parse(await parseJson(request)) });
    await audit({ actorId: user.id, actorRole: user.role, action: "CATEGORY_CREATE", entity: "Category", entityId: created.id, after: created });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return jsonError(error); }
}
