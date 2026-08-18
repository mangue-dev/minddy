import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "@/lib/env";

describe("resolveAppEnv", () => {
  it("recognizes a self-hosted Node production without a Vercel variable", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("production");
  });

  it("preserves the distinction between Vercel previews", () => {
    expect(
      resolveAppEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    ).toBe("preview");
  });

  it("keeps local development out of production", () => {
    expect(resolveAppEnv({ NODE_ENV: "development" })).toBe("development");
  });
});
