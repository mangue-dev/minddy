import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { oklchToRgb, projectOrbStyle } from "@/lib/project-orb-colors";
import {
  ORB_IMAGE_PX,
  orbStyleParam,
  parseOrbStyleParam,
  projectOrbImagePath,
  renderOrbPixels,
  renderOrbPng,
} from "./project-orb-image";

const orbRoute = await import("@/app/og/orb/route");

const SEED = "07b14964-0def-4941-8ddf-686572d6345d";

/** Read back the RGBA rows of a PNG written by `encodePng` (filter 0 only). */
function decodePng(png: Buffer): { size: number; pixels: Uint8Array } {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  let offset = 8;
  let size = 0;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") size = body.readUInt32BE(0);
    if (type === "IDAT") data.push(body);
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data));
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    expect(rows[y * (size * 4 + 1)]).toBe(0);
    rows.copy(pixels, y * size * 4, y * (size * 4 + 1) + 1, (y + 1) * (size * 4 + 1));
  }
  return { size, pixels };
}

describe("orb image", () => {
  it("encodes a valid square RGBA PNG at twice the email size", () => {
    const style = projectOrbStyle(SEED);
    const { size, pixels } = decodePng(renderOrbPng(style));
    expect(size).toBe(ORB_IMAGE_PX);
    expect(pixels).toEqual(renderOrbPixels(style));
  });

  it("leaves the corners transparent and the middle opaque", () => {
    const pixels = renderOrbPixels(projectOrbStyle(SEED));
    const alphaAt = (x: number, y: number) => pixels[(y * ORB_IMAGE_PX + x) * 4 + 3];
    const last = ORB_IMAGE_PX - 1;
    expect([alphaAt(0, 0), alphaAt(last, 0), alphaAt(0, last), alphaAt(last, last)]).toEqual([0, 0, 0, 0]);
    expect(alphaAt(ORB_IMAGE_PX / 2, ORB_IMAGE_PX / 2)).toBe(255);
    expect(alphaAt(ORB_IMAGE_PX / 2, 0)).toBe(255);
  });

  it("paints the project's colors, not a fixed palette", () => {
    const seeds = [SEED, "11111111-1111-4111-8111-111111111111"];
    const averages = seeds.map((seed) => {
      const pixels = renderOrbPixels(projectOrbStyle(seed));
      const sum = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) {
        for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
      }
      return sum.map((value) => value / (pixels.length / 4) / 255);
    });
    // Each orb averages closer to the solid color the app paints for its own
    // seed than to the other seed's: the image follows the seed.
    const bases = seeds.map((seed) => {
      const { lightness, chroma, hue } = projectOrbStyle(seed);
      return oklchToRgb(lightness, chroma, hue);
    });
    const distance = (a: number[], b: number[]) => Math.hypot(...a.map((value, c) => value - b[c]));
    expect(distance(averages[0], bases[0])).toBeLessThan(distance(averages[0], bases[1]));
    expect(distance(averages[1], bases[1])).toBeLessThan(distance(averages[1], bases[0]));
  });
});

describe("orb style parameter", () => {
  it("round-trips the drawn traits, so the URL names the same orb", () => {
    const style = projectOrbStyle(SEED);
    const parsed = parseOrbStyleParam(orbStyleParam(style));
    for (const [key, value] of Object.entries(style)) {
      expect(parsed?.[key as keyof typeof style]).toBeCloseTo(value, 3);
    }
  });

  it("carries the traits, never the seed", () => {
    const path = projectOrbImagePath(SEED);
    expect(path).toMatch(/^\/og\/orb\?o=[\d.,]+$/);
    expect(path).not.toContain(SEED);
  });

  it("clamps each trait to the range the app draws from", () => {
    expect(parseOrbStyleParam("999,-5,1,0,720,0,100")).toEqual({
      hue: 360,
      hue2: 0,
      chroma: 0.185,
      lightness: 0.56,
      angle: 360,
      highlightX: 22,
      highlightY: 46,
    });
  });

  it("rejects anything that is not seven numbers", () => {
    for (const raw of [null, "", "1,2,3", "1,2,3,4,5,6,x", "1,2,3,4,5,6,", "1,2,3,4,5,6,7,8"]) {
      expect(parseOrbStyleParam(raw)).toBeNull();
    }
  });
});

describe("GET /og/orb", () => {
  const request = (query: string, ip: string) =>
    new NextRequest(`https://minddy.app/og/orb?${query}`, {
      headers: { "x-forwarded-for": ip },
    });
  const canonical = projectOrbImagePath(SEED).split("?")[1];

  it("serves the PNG with a long immutable cache", async () => {
    const response = await orbRoute.GET(request(canonical, "198.51.100.1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body).toEqual(renderOrbPng(projectOrbStyle(SEED)));
  });

  it("accepts commas an image proxy percent-encoded", async () => {
    const response = await orbRoute.GET(
      request(canonical.replaceAll(",", "%2C"), "198.51.100.2"),
    );
    expect(response.status).toBe(200);
  });

  it("redirects any other spelling to the canonical URL before painting", async () => {
    const response = await orbRoute.GET(request(`${canonical}&cache=1`, "198.51.100.3"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://minddy.app/og/orb?${canonical}`);
  });

  it("answers 404 to a malformed style", async () => {
    const response = await orbRoute.GET(request("o=red", "198.51.100.4"));
    expect(response.status).toBe(404);
  });
});
