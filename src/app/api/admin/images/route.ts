import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { jsonError, ApiError } from "@/lib/server/http";
import { MAX_IMAGE_REQUEST_BYTES, normalizeImage, removeImage } from "@/lib/server/images";
import { verifyStaffMutation, currentStaff } from "@/lib/server/security";

export async function GET() {
  try {
    await currentStaff();
    return NextResponse.json({ images: await db.productImage.findMany({ orderBy: { createdAt: "desc" } }) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new ApiError(415, "CONTENT_TYPE", "Ожидается multipart/form-data");
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_REQUEST_BYTES) throw new ApiError(413, "IMAGE_SIZE", "Запрос с изображением слишком большой");
    const data = await request.formData();
    const file = data.get("file");
    const alt = String(data.get("alt") ?? "").trim();
    if (!(file instanceof File)) throw new ApiError(400, "IMAGE_FILE", "Выберите изображение");
    if (alt.length < 2 || alt.length > 180) throw new ApiError(400, "IMAGE_ALT", "Добавьте краткое альтернативное описание");
    const normalized = await normalizeImage(file);
    const image = await db.productImage.create({ data: { ...normalized, alt } }).catch(async (error) => {
      await removeImage(normalized.storageKey);
      throw error;
    });
    await audit({ actorId: user.id, actorRole: user.role, action: "IMAGE_UPLOAD", entity: "ProductImage", entityId: image.id, after: { mimeType: image.mimeType, width: image.width, height: image.height, bytes: image.bytes, alt: image.alt } });
    return NextResponse.json(image, { status: 201 });
  } catch (error) { return jsonError(error); }
}
