import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { destroySession, verifyStaffMutation } from "@/lib/server/security";

export async function POST(request: Request) {
  try { await verifyStaffMutation(request); await destroySession(); return new NextResponse(null, { status: 204 }); }
  catch (error) { return jsonError(error); }
}
