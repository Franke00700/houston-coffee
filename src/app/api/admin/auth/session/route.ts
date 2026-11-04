import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/http";
import { currentStaff } from "@/lib/server/security";

export async function GET() {
  try {
    const { user } = await currentStaff();
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { return jsonError(error); }
}
