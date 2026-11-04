import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { currentStaff } from "@/lib/server/security";

export async function GET() {
  try { await currentStaff(["ADMIN"]); return NextResponse.json({ events: await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500 }) }); }
  catch (error) { return jsonError(error); }
}
