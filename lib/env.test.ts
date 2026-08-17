import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "@/lib/env";

describe("resolveAppEnv", () => {
  it("reconnaît une production Node auto-hébergée sans variable Vercel", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("production");
  });

  it("préserve la distinction des previews Vercel", () => {
    expect(
      resolveAppEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    ).toBe("preview");
  });

  it("garde le développement local hors production", () => {
    expect(resolveAppEnv({ NODE_ENV: "development" })).toBe("development");
  });
});
