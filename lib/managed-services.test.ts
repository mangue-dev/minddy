import { describe, expect, it } from "vitest";
import { resolveManagedServices } from "./managed-services";

const stripe = {
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID_GO: "price_go",
  STRIPE_PRICE_ID_PRO: "price_pro",
  STRIPE_PRICE_ID_GO_YEARLY: "price_go_year",
  STRIPE_PRICE_ID_PRO_YEARLY: "price_pro_year",
};

describe("resolveManagedServices", () => {
  it("keeps an instance self-hosted by default, even when secrets are present", () => {
    expect(resolveManagedServices({ ...stripe, OPENROUTER_API_KEY: "or-key" })).toEqual({
      billing: false,
      ai: false,
      forge: false,
    });
  });

  it("requires an explicit opt-in and a complete provider configuration", () => {
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "cloud",
        MINDDY_MANAGED_BILLING: "1",
        MINDDY_MANAGED_AI: "1",
        ...stripe,
        OPENROUTER_API_KEY: "or-key",
      }),
    ).toEqual({ billing: true, ai: true, forge: false });
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "cloud",
        MINDDY_MANAGED_BILLING: "1",
        MINDDY_MANAGED_AI: "1",
      }),
    ).toEqual({ billing: false, ai: false, forge: false });
  });

  it("does not activate managed services outside the explicit Cloud edition", () => {
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "self-hosted",
        VERCEL: "1",
        MINDDY_PUBLIC_APP_URL: "https://www.minddy.app",
        MINDDY_MANAGED_BILLING: "1",
        MINDDY_MANAGED_AI: "1",
        ...stripe,
        OPENROUTER_API_KEY: "or-key",
      }),
    ).toEqual({ billing: false, ai: false, forge: false });
  });

  it("activates the managed forge relay only with the Cloud flag and a relay URL", () => {
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "cloud",
        MINDDY_MANAGED_FORGE: "1",
      }),
    ).toEqual({ billing: false, ai: false, forge: false });
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "self-hosted",
        MINDDY_MANAGED_FORGE: "1",
        MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      }),
    ).toEqual({ billing: false, ai: false, forge: false });
    expect(
      resolveManagedServices({
        MINDDY_EDITION: "cloud",
        MINDDY_MANAGED_FORGE: "1",
        MINDDY_FORGE_RELAY_URL: "https://forge-relay.minddy.app",
      }),
    ).toEqual({ billing: false, ai: false, forge: true });
  });
});
