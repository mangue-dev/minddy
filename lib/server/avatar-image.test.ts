import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { avatarImagePath, renderAvatarPng } from "./avatar-image";

const avatarRoute = await import("@/app/og/avatar/route");

const SEED = "33333333-3333-4333-8333-333333333333";

describe("avatar image", () => {
  it("paints a round PNG: transparent corners, opaque middle", async () => {
    const png = await renderAvatarPng(SEED);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([48, 48, 4]);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(47, 47)).toBe(0);
    expect(alphaAt(24, 24)).toBe(255);
  });

  it("keeps account ids and arbitrary URLs out of the path", () => {
    expect(avatarImagePath(SEED)).toBe(`/og/avatar?s=${SEED}`);
    expect(avatarImagePath("uploaded:/api/avatars/44444444-4444-4444-8444-444444444444?v=2"))
      .toBe("/api/avatars/44444444-4444-4444-8444-444444444444?v=2");
    expect(avatarImagePath("uploaded:https://tracker.example.test/x.png")).toBeNull();
    expect(avatarImagePath("pseudonym")).toBeNull();
    expect(avatarImagePath(null)).toBeNull();
  });
});

describe("GET /og/avatar", () => {
  const request = (query: string, ip: string) =>
    new NextRequest(`https://minddy.app/og/avatar?${query}`, {
      headers: { "x-forwarded-for": ip },
    });

  it("serves the portrait with a long immutable cache", async () => {
    const response = await avatarRoute.GET(request(`s=${SEED}`, "198.51.100.20"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("redirects any other spelling to the canonical URL", async () => {
    const response = await avatarRoute.GET(request(`s=${SEED}&x=1`, "198.51.100.21"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`https://minddy.app/og/avatar?s=${SEED}`);
  });

  it("answers 404 to anything but a seed", async () => {
    expect((await avatarRoute.GET(request("s=alice", "198.51.100.22"))).status).toBe(404);
  });
});
