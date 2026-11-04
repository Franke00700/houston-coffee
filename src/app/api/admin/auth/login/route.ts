import argon2 from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, parseJson } from "@/lib/server/http";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { createSession, verifyOrigin } from "@/lib/server/security";

const schema = z.object({ email: z.email().max(200), password: z.string().min(8).max(200) }).strict();
const DUMMY_HASH = "$argon2id$v=19$m=65536,p=1,t=3$FG8/pgrTJqngs7Gg8j27Nw$aA2beYyHzJdINtQXfeMwYvYFxPT6Uo8FjH50x73BMa4";

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const input = schema.parse(await parseJson(request));
    const email = input.email.trim().toLowerCase();
    rateLimit(clientKey(request, "login"), 30, 15 * 60_000);
    rateLimit(clientKey(request, `login:${email}`), 7, 15 * 60_000);
    const user = await db.staffUser.findUnique({ where: { email } });
    const ok = await argon2.verify(user?.active ? user.passwordHash : DUMMY_HASH, input.password).catch(() => false);
    if (!user || !ok) {
      await audit({ action: "AUTH_LOGIN_FAILED", entity: "StaffUser", success: false });
      return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Неверная почта или пароль" } }, { status: 401 });
    }
    const csrfToken = await createSession(user, request);
    await audit({ actorId: user.id, actorRole: user.role, action: "AUTH_LOGIN", entity: "StaffUser", entityId: user.id });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrfToken });
  } catch (error) { return jsonError(error); }
}
