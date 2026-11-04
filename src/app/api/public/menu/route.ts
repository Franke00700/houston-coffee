import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { publicMenu } from "@/lib/server/menu";

export async function GET() {
  try { return NextResponse.json(await publicMenu(), { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }); }
  catch (error) { return jsonError(error); }
}
