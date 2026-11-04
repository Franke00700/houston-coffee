import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "./db";
import { ApiError } from "./http";

const COOKIE = "houston_staff";
const CSRF_COOKIE = "houston_csrf";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

function positiveNumber(value: string | undefined, fallback: number, name: string) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new ApiError(503, "SECURITY_CONFIG", `Некорректная настройка ${name}`);
  return parsed;
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true";
}

export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.TRUSTED_ORIGIN;
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new ApiError(503, "SECURITY_CONFIG", "TRUSTED_ORIGIN обязателен в production");
  }
  let trusted: string;
  try {
    trusted = new URL(configured ?? new URL(request.url).origin).origin;
  } catch {
    throw new ApiError(503, "SECURITY_CONFIG", "TRUSTED_ORIGIN должен быть корректным origin");
  }
  if (configured !== undefined && configured !== trusted) {
    throw new ApiError(503, "SECURITY_CONFIG", "TRUSTED_ORIGIN должен содержать только origin без пути и завершающего слеша");
  }
  if (!origin || origin !== trusted) throw new ApiError(403, "ORIGIN", "Недопустимый источник запроса");
}

export async function createSession(user: { id: string; tokenVersion: number }, request: Request) {
  const token = randomToken();
  const csrf = randomToken();
  const now = Date.now();
  const idleMinutes = positiveNumber(process.env.SESSION_IDLE_MINUTES, 480, "SESSION_IDLE_MINUTES");
  const absoluteHours = positiveNumber(process.env.SESSION_ABSOLUTE_HOURS, 24, "SESSION_ABSOLUTE_HOURS");
  if (idleMinutes > absoluteHours * 60) throw new ApiError(503, "SECURITY_CONFIG", "Idle lifetime сессии не может превышать absolute lifetime");
  await db.staffSession.create({ data: {
    tokenHash: sha256(token), csrfHash: sha256(csrf), userId: user.id, tokenVersion: user.tokenVersion,
    expiresAt: new Date(now + idleMinutes * 60_000), absoluteAt: new Date(now + absoluteHours * 3_600_000),
    userAgent: request.headers.get("user-agent")?.slice(0, 500),
  }});
  const jar = await cookies();
  const secure = cookieSecure();
  jar.set(COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: absoluteHours * 3600 });
  jar.set(CSRF_COOKIE, csrf, { httpOnly: false, secure, sameSite: "strict", path: "/admin", maxAge: absoluteHours * 3600 });
  return csrf;
}

export async function currentStaff(required?: StaffRole[]) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Требуется вход");
  const session = await db.staffSession.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  const now = new Date();
  if (!session || session.expiresAt <= now || session.absoluteAt <= now || !session.user.active || session.tokenVersion !== session.user.tokenVersion) {
    if (session) await db.staffSession.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new ApiError(401, "SESSION_EXPIRED", "Сессия завершена");
  }
  if (session.lastSeenAt.getTime() < now.getTime() - 5 * 60_000) {
    const idleMinutes = Math.max(5, positiveNumber(process.env.SESSION_IDLE_MINUTES, 480, "SESSION_IDLE_MINUTES"));
    const nextExpiry = new Date(Math.min(now.getTime() + idleMinutes * 60_000, session.absoluteAt.getTime()));
    await db.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt: nextExpiry } });
  }
  if (required && !required.includes(session.user.role)) throw new ApiError(403, "FORBIDDEN", "Недостаточно прав");
  return { session, user: session.user };
}

export async function verifyStaffMutation(request: Request, roles?: StaffRole[]) {
  const staff = await currentStaff(roles);
  verifyOrigin(request);
  const supplied = request.headers.get("x-csrf-token") ?? "";
  const actual = sha256(supplied);
  const expected = staff.session.csrfHash;
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new ApiError(403, "CSRF", "Недействительный CSRF-токен");
  return staff;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.staffSession.delete({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
  const secure = cookieSecure();
  jar.set(COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  // Deletion must use the same Path attribute as creation, otherwise the readable CSRF cookie survives logout.
  jar.set(CSRF_COOKIE, "", { httpOnly: false, secure, sameSite: "strict", path: "/admin", maxAge: 0 });
}
