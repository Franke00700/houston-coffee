import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { currentStaff, verifyStaffMutation } from "@/lib/server/security";

const schema = z.object({ ordersEnabled: z.boolean().optional(), pickupEnabled: z.boolean().optional(), deliveryEnabled: z.boolean().optional(), deliveryFeeMinor: z.number().int().min(0).max(10_000_000).optional(), deliveryMinimumMinor: z.number().int().min(0).max(100_000_000).optional(), phone: z.string().trim().max(40).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), routeUrl: z.url().nullable().optional(), instagramUrl: z.url().nullable().optional(), telegramUrl: z.url().nullable().optional(), notice: z.string().trim().max(500).nullable().optional() }).strict();
export async function GET() {
  try { await currentStaff(); return NextResponse.json({ settings: await db.siteSettings.findUnique({ where: { id: 1 } }), schedule: await db.scheduleEntry.findMany({ orderBy: { dayOfWeek: "asc" } }) }); }
  catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]); const input = schema.parse(await parseJson(request));
    const before = await db.siteSettings.findUnique({ where: { id: 1 } });
    const after = await db.siteSettings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
    await audit({ actorId: user.id, actorRole: user.role, action: "SETTINGS_UPDATE", entity: "SiteSettings", entityId: "1", before, after });
    return NextResponse.json(after);
  } catch (error) { return jsonError(error); }
}
