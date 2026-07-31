import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  compressIconFile,
  IconFileError,
  MAX_ICON_UPLOAD_BYTES,
} from "./project-icon";

/**
 * La compression est la promesse faite à l'utilisateur : il envoie ce qu'il a,
 * le serveur en fait une icône. Ces tests tiennent les trois choses dont dépend
 * cette promesse — le format de sortie, ce qui est refusé, et le fait qu'on ne
 * dégrade jamais une image déjà petite.
 */

const png = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 30, b: 90, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

describe("compressIconFile", () => {
  it("ramène une grande image à un carré WebP de 256 px", async () => {
    const source = await png(1600, 1200);
    const out = await compressIconFile(source);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(out.byteLength).toBeLessThan(source.byteLength);
    // Le brouillon du wizard porte cette image en data URL dans sessionStorage.
    expect(out.byteLength).toBeLessThan(100 * 1024);
  });

  it("n'agrandit pas une image plus petite que la cible", async () => {
    const meta = await sharp(await compressIconFile(await png(48, 48))).metadata();
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(48);
  });

  it("carre une image large en la contenant, sans la rogner", async () => {
    const meta = await sharp(await compressIconFile(await png(600, 200))).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it("carre une petite image large sans l'agrandir", async () => {
    const meta = await sharp(await compressIconFile(await png(120, 40))).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(120);
  });

  it("lit le format et non l'extension : un SVG passe", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#09f"/></svg>'
    );
    const meta = await sharp(await compressIconFile(svg)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
  });

  it("refuse ce qui n'est pas une image", async () => {
    await expect(compressIconFile(Buffer.from("pas une image"))).rejects.toThrow(
      IconFileError
    );
    await expect(compressIconFile(Buffer.alloc(0))).rejects.toMatchObject({
      key: "invalidFile",
    });
  });

  it("refuse au-delà du garde-fou mémoire, sans toucher à libvips", async () => {
    await expect(
      compressIconFile(Buffer.alloc(MAX_ICON_UPLOAD_BYTES + 1))
    ).rejects.toMatchObject({ key: "tooLarge" });
  });
});
