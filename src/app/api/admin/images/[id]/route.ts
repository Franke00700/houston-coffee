import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { ApiError, jsonError } from "@/lib/server/http";
import { removeImage } from "@/lib/server/images";
import { verifyStaffMutation } from "@/lib/server/security";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await verifyStaffMutation(request, ["ADMIN"]);
    const { id } = await context.params;
    const image = await db.productImage.findUnique({ where: { id }, include: { products: { select: { id: true }, take: 1 } } });
    if (!image) throw new ApiError(404, "IMAGE_NOT_FOUND", "Изображение не найдено");
    if (image.products.length) throw new ApiError(409, "IMAGE_IN_USE", "Сначала уберите изображение из товаров");
    await db.productImage.delete({ where: { id } });
    await removeImage(image.storageKey);
    await audit({ actorId: user.id, actorRole: user.role, action: "IMAGE_DELETE", entity: "ProductImage", entityId: id, before: { alt: image.alt, bytes: image.bytes } });
    return new NextResponse(null, { status: 204 });
  } catch (error) { return jsonError(error); }
}
