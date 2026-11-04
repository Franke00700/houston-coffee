import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { normalizeImage } from "./images";

let testDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  testDirectory = undefined;
});

describe("normalizeImage", () => {
  it("re-encodes to WebP and strips EXIF metadata", async () => {
    testDirectory = await mkdtemp(path.join(tmpdir(), "houston-images-"));
    vi.stubEnv("UPLOAD_DIR", testDirectory);
    const jpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#b76148" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "not-for-output" } })
      .toBuffer();
    const result = await normalizeImage(new File([jpeg], "source.jpg", { type: "image/jpeg" }));
    const output = await readFile(path.join(testDirectory, result.storageKey));
    const metadata = await sharp(output).metadata();
    expect(result.mimeType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("rejects a disallowed actual format even when MIME is spoofed", async () => {
    testDirectory = await mkdtemp(path.join(tmpdir(), "houston-images-"));
    vi.stubEnv("UPLOAD_DIR", testDirectory);
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#40271f" } }).gif().toBuffer();
    await expect(normalizeImage(new File([gif], "fake.jpg", { type: "image/jpeg" }))).rejects.toBeInstanceOf(ApiError);
  });
});
