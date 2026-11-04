import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "./http";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const MAX_PIXELS = 36_000_000;
const MAX_DIMENSION = 12_000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

function uploadRoot() {
  const configured = process.env.UPLOAD_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), "uploads");
}

function safePath(storageKey: string) {
  if (!/^[a-f0-9]{32}\.webp$/.test(storageKey)) throw new ApiError(404, "IMAGE_NOT_FOUND", "Изображение не найдено");
  return path.join(/* turbopackIgnore: true */ uploadRoot(), storageKey);
}

export async function normalizeImage(file: File) {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new ApiError(400, "IMAGE_SIZE", "Размер изображения должен быть не больше 5 МБ");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ApiError(400, "IMAGE_TYPE", "Разрешены JPEG, PNG и WebP");
  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { failOn: "error", limitInputPixels: MAX_PIXELS });
  const metadata = await image.metadata().catch(() => { throw new ApiError(400, "IMAGE_INVALID", "Файл не является корректным изображением"); });
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) throw new ApiError(400, "IMAGE_FORMAT", "Фактический формат должен быть JPEG, PNG или WebP");
  if ((metadata.pages ?? 1) !== 1) throw new ApiError(400, "IMAGE_ANIMATED", "Анимированные и многостраничные изображения не поддерживаются");
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION || metadata.width * metadata.height > MAX_PIXELS) {
    throw new ApiError(400, "IMAGE_DIMENSIONS", "Изображение слишком большое");
  }
  // sharp omits EXIF/IPTC/XMP unless metadata is explicitly retained; rotate applies EXIF orientation before stripping it.
  const result = await image.rotate().webp({ quality: 86, effort: 4 }).toBuffer({ resolveWithObject: true });
  const storageKey = `${randomBytes(16).toString("hex")}.webp`;
  await mkdir(uploadRoot(), { recursive: true });
  await writeFile(safePath(storageKey), result.data, { flag: "wx" });
  return { storageKey, mimeType: "image/webp", width: result.info.width, height: result.info.height, bytes: result.info.size };
}

export async function loadImage(storageKey: string) {
  return readFile(safePath(storageKey)).catch(() => { throw new ApiError(404, "IMAGE_NOT_FOUND", "Изображение не найдено"); });
}

export async function removeImage(storageKey: string) {
  await unlink(safePath(storageKey)).catch(() => undefined);
}
