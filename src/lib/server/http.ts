import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export function jsonError(error: unknown) {
  const requestId = crypto.randomUUID();
  if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details, requestId } }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Проверьте введённые данные", details: error.issues, requestId } }, { status: 400 });
  console.error("request_failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Не удалось выполнить запрос", requestId } }, { status: 500 });
}

export async function parseJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "CONTENT_TYPE", "Ожидается application/json");
  try { return await request.json(); } catch { throw new ApiError(400, "INVALID_JSON", "Некорректный JSON"); }
}
