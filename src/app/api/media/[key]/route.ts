import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { jsonError, ApiError } from "@/lib/server/http";
import { loadImage } from "@/lib/server/images";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const image = await db.productImage.findUnique({ where: { storageKey: key } });
    if (!image) throw new ApiError(404, "IMAGE_NOT_FOUND", "Изображение не найдено");
    const body = await loadImage(key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) { return jsonError(error); }
}
