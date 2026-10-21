import { describe, expect, it } from "vitest";

import {
  legacyCloudProfileDiagnostic,
  resolveAppEnv,
  resolveDeploymentEdition,
  resolveSignupHref,
} from "@/lib/env";

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

describe("resolveSignupHref", () => {
  it("sends preview sign-ups to the production site, query included", () => {
    expect(resolveSignupHref("preview")).toBe("https://www.minddy.app/signup");
    expect(resolveSignupHref("preview", "/signup?redirect=%2Fdocs")).toBe(
      "https://www.minddy.app/signup?redirect=%2Fdocs",
    );
  });

  it("keeps the local sign-up page in production and development", () => {
    expect(resolveSignupHref("production")).toBe("/signup");
    expect(resolveSignupHref("development", "/signup?invite=x")).toBe("/signup?invite=x");
  });

  it("resolves a self-hosted instance outside preview", () => {
    expect(resolveSignupHref(resolveAppEnv({ NODE_ENV: "production" }))).toBe("/signup");
  });
});

describe("legacyCloudProfileDiagnostic", () => {
  it("warns about a legacy Cloud-shaped deployment without selecting its edition", () => {
    expect(legacyCloudProfileDiagnostic({
      VERCEL: "1",
      MINDDY_PUBLIC_APP_URL: "https://www.minddy.app",
    })).toMatch(/MINDDY_EDITION=cloud/);
    expect(legacyCloudProfileDiagnostic({
      MINDDY_EDITION: "self-hosted",
      VERCEL: "1",
      MINDDY_PUBLIC_APP_URL: "https://www.minddy.app",
    })).toBeNull();
  });
});

describe("resolveDeploymentEdition", () => {
  it("defaults to the self-hosted edition", () => {
    expect(resolveDeploymentEdition({})).toBe("self-hosted");
  });

  it("accepts only the explicit Cloud and self-hosted values", () => {
    expect(resolveDeploymentEdition({ MINDDY_EDITION: "cloud" })).toBe("cloud");
    expect(resolveDeploymentEdition({ MINDDY_EDITION: "self-hosted" })).toBe("self-hosted");
    expect(() => resolveDeploymentEdition({ MINDDY_EDITION: "vercel" })).toThrow(
      /MINDDY_EDITION/,
    );
  });
});
