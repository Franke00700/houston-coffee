import { NextResponse } from "next/server";
import { orderRequestSchema } from "@/lib/domain/order";
import { createOrder } from "@/lib/server/orders";
import { ApiError, jsonError, parseJson } from "@/lib/server/http";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const configuredLimit = Number(process.env.ORDER_RATE_LIMIT ?? "10");
    if (!Number.isInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 1_000) {
      throw new ApiError(503, "RATE_LIMIT_CONFIG", "Некорректный ORDER_RATE_LIMIT");
    }
    rateLimit(clientKey(request, "order"), configuredLimit, 10 * 60_000);
    const key = request.headers.get("idempotency-key");
    if (!key) throw new ApiError(400, "IDEMPOTENCY_KEY", "Отсутствует Idempotency-Key");
    const { replayed, ...result } = await createOrder(orderRequestSchema.parse(await parseJson(request)), key);
    return NextResponse.json(result, { status: replayed ? 200 : 201 });
  } catch (error) { return jsonError(error); }
}
