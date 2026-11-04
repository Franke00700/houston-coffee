import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { ApiError, jsonError, parseJson } from "@/lib/server/http";
import { currentStaff, verifyStaffMutation } from "@/lib/server/security";

const createSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
  role: z.enum(["ADMIN", "OPERATOR"]),
}).strict();

const publicFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  try {
    await currentStaff(["ADMIN"]);
    const staff = await db.staffUser.findMany({ select: publicFields, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return NextResponse.json({ staff });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user: actor } = await verifyStaffMutation(request, ["ADMIN"]);
    const input = createSchema.parse(await parseJson(request));
    const email = input.email.trim().toLowerCase();
    if (await db.staffUser.findUnique({ where: { email }, select: { id: true } })) {
      throw new ApiError(409, "STAFF_EMAIL_EXISTS", "Сотрудник с такой почтой уже существует");
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 });
    const created = await db.staffUser.create({
      data: { email, name: input.name, passwordHash, role: input.role },
      select: publicFields,
    });
    await audit({ actorId: actor.id, actorRole: actor.role, action: "STAFF_CREATE", entity: "StaffUser", entityId: created.id, after: created });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return jsonError(error); }
}
