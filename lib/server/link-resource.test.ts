import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-742 — a link resource carries its page's og:image as a small WebP
 * thumbnail, shrunk to the card's figure and kept in the row like the
 * favicon. An image sharp cannot read leaves the link without one.
 */

const preview = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/favicon", () => ({
  resolveLinkPreview: vi.fn(async () => preview.value),
}));

const { resolveLinkResource } = await import("./link-resource");
const { resolveLinkPreview } = await import("@/lib/server/favicon");

const cover = await sharp({
  create: { width: 800, height: 400, channels: 3, background: { r: 30, g: 90, b: 200 } },
}).png().toBuffer();

beforeEach(() => {
  preview.value = { url: "https://exemple.com/", title: "Exemple", icon: null, image: null };
});

describe("resolveLinkResource", () => {
  it("asks for the social image and stores a thumbnail that fits the card", async () => {
    preview.value = {
      url: "https://exemple.com/", title: "Exemple", icon: null,
      image: { url: "https://exemple.com/cover.png", contentType: "image/png", bytes: cover },
    };
    const link = await resolveLinkResource("exemple.com");
    expect(resolveLinkPreview).toHaveBeenCalledWith("exemple.com", { withImage: true });
    expect(link.preview_data_url).toMatch(/^data:image\/webp;base64,/);
    const bytes = Buffer.from(link.preview_data_url!.split(",")[1], "base64");
    const { width, height } = await sharp(bytes).metadata();
    expect([width, height]).toEqual([192, 96]);
  });

  it("leaves the thumbnail out when the image is unreadable or missing", async () => {
    expect((await resolveLinkResource("exemple.com")).preview_data_url).toBeNull();
    preview.value = {
      url: "https://exemple.com/", title: "Exemple", icon: null,
      image: { url: "https://exemple.com/x.png", contentType: "image/png", bytes: Buffer.from("not an image") },
    };
    expect((await resolveLinkResource("exemple.com")).preview_data_url).toBeNull();
  });
});
