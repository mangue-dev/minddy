import { describe, expect, it } from "vitest";
import nextConfig, {
  PRIVATE_API_NO_STORE_SOURCE,
  isPrivateApiNoStorePath,
} from "../next.config.mjs";

describe("private API cache policy", () => {
  it("covers the scratchpad and other dynamic user-data surfaces", () => {
    for (const path of [
      "/api/me/scratchpad",
      "/api/projects/project-id/pages/page-id",
      "/api/issues/issue-id",
      "/api/objectives/objective-id",
      "/api/account/agent-preferences",
      "/api/oauth/token",
      "/api/mcp",
    ]) {
      expect(isPrivateApiNoStorePath(path), path).toBe(true);
    }
  });

  it("preserves the explicit public caches", () => {
    expect(isPrivateApiNoStorePath("/api/avatars/user-id")).toBe(false);
    expect(
      isPrivateApiNoStorePath("/api/self-hosting/email-templates/invite")
    ).toBe(false);
  });

  it("sets browser and CDN no-store headers at the router boundary", async () => {
    const entry = (await nextConfig.headers!()).find(
      (candidate) => candidate.source === PRIVATE_API_NO_STORE_SOURCE
    );
    expect(entry).toBeDefined();
    expect(Object.fromEntries(entry!.headers.map(({ key, value }) => [key, value])))
      .toMatchObject({
        "Cache-Control": "private, no-store",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        Pragma: "no-cache",
      });
  });
});
