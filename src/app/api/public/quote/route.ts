import { NextResponse } from "next/server";
import { quoteRequestSchema } from "@/lib/domain/order";
import { jsonError, parseJson } from "@/lib/server/http";
import { quoteOrder } from "@/lib/server/orders";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    rateLimit(clientKey(request, "quote"), 60, 60_000);
    const quote = await quoteOrder(quoteRequestSchema.parse(await parseJson(request)));
    return NextResponse.json({ ...quote, items: quote.items.map((item) => ({ lineId: item.lineId, name: item.productName, configuration: [item.variantName, ...item.modifiers.map((modifier) => modifier.name)].join(", "), quantity: item.quantity, unitPriceMinor: item.unitTotalMinor, totalMinor: item.lineTotalMinor })) });
  } catch (error) { return jsonError(error); }
}
