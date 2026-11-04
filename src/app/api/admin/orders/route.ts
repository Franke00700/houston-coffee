import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { currentStaff } from "@/lib/server/security";

const statusSchema = z.enum(["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]);
export async function GET(request: Request) {
  try {
    await currentStaff(); const status = new URL(request.url).searchParams.get("status");
    const orders = await db.order.findMany({ where: status ? { status: statusSchema.parse(status) } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { items: true, statusEvents: { orderBy: { createdAt: "asc" } } } });
    return NextResponse.json({ orders });
  } catch (error) { return jsonError(error); }
}
