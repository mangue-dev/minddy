import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  REAUTH_MAX_AGE_SECONDS,
  hasFreshAal2Verification,
  hasFreshPrimaryAuthentication,
  lastAal2VerificationAt,
} from "./reauth";

const NOW = 1_800_000_000;

describe("fresh AAL2 verification", () => {
  it("rejects AAL1 even when the access token was issued recently", () => {
    expect(
      hasFreshAal2Verification(
        { aal: "aal1", amr: [{ method: "totp", timestamp: NOW }], iat: NOW },
        NOW
      )
    ).toBe(false);
  });

  it("rejects stale AAL2 and does not mistake a token refresh for verification", () => {
    expect(
      hasFreshAal2Verification(
        {
          aal: "aal2",
          amr: [{ method: "totp", timestamp: NOW - REAUTH_MAX_AGE_SECONDS - 1 }],
          iat: NOW,
        },
        NOW
      )
    ).toBe(false);
  });

  it("accepts current Supabase second-factor AMR method names", () => {
    expect(
      hasFreshAal2Verification(
        { aal: "aal2", amr: [{ method: "mfa/totp", timestamp: NOW - 30 }] },
        NOW
      )
    ).toBe(true);
    expect(
      lastAal2VerificationAt({
        aal: "aal2",
        amr: [
          { method: "password", timestamp: NOW },
          { method: "totp", timestamp: NOW - 20 },
        ],
      })
    ).toBe(NOW - 20);
  });

  it("requires a fresh primary method before first-factor activation", () => {
    expect(
      hasFreshPrimaryAuthentication(
        {
          amr: [
            { method: "password", timestamp: NOW - 30 },
            { method: "totp", timestamp: NOW },
          ],
        },
        NOW
      )
    ).toBe(true);
    expect(
      hasFreshPrimaryAuthentication(
        {
          amr: [
            { method: "password", timestamp: NOW - 7200 },
            { method: "totp", timestamp: NOW },
          ],
        },
        NOW
      )
    ).toBe(false);
  });
});

const enableMfa = vi.fn(async () => true);
const disableMfa = vi.fn(async () => {});
const issueRecoveryCodes = vi.fn(async () => ["AAAA-BBBB-CCCC"]);
const getMfaStatus = vi.fn(async () => ({
  enabled: true,
  verifiedFactors: 1,
  unusedRecoveryCodes: 10,
}));
let claims: Record<string, unknown> = {};
let userId = "user-1";
let userSequence = 0;

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: userId },
    supabase: {},
    claims,
  }),
}));
vi.mock("@/lib/server/mfa", () => ({
  enableMfa: (...args: unknown[]) => enableMfa(...(args as [])),
  disableMfa: (...args: unknown[]) => disableMfa(...(args as [])),
  issueRecoveryCodes: (...args: unknown[]) => issueRecoveryCodes(...(args as [])),
  getMfaStatus: (...args: unknown[]) => getMfaStatus(...(args as [])),
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: () => {} }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { POST: activateMfa, DELETE: revokeMfa } = await import(
  "@/app/api/account/mfa/route"
);
const { POST: regenerateRecoveryCodes } = await import(
  "@/app/api/account/mfa/recovery-codes/route"
);

function request(path: string, method: "POST" | "DELETE" = "POST"): NextRequest {
  return new NextRequest(`https://www.minddy.app${path}`, { method });
}

beforeEach(() => {
  userId = `user-${++userSequence}`;
  claims = {
    aal: "aal2",
    amr: [
      { method: "password", timestamp: Math.floor(Date.now() / 1000) - 45 },
      { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 30 },
    ],
  };
  enableMfa.mockClear();
  disableMfa.mockClear();
  issueRecoveryCodes.mockClear();
  getMfaStatus.mockClear();
});

describe("MFA mutations", () => {
  it("rejects stale AAL1 before enrollment activation", async () => {
    claims = {
      aal: "aal1",
      amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 7200 }],
    };

    const response = await activateMfa(request("/api/account/mfa"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "reauth_required" });
    expect(enableMfa).not.toHaveBeenCalled();
  });

  it("rejects an attacker-enrolled fresh factor when primary auth is stale", async () => {
    claims = {
      aal: "aal2",
      amr: [
        { method: "password", timestamp: Math.floor(Date.now() / 1000) - 7200 },
        { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 10 },
      ],
    };

    const response = await activateMfa(request("/api/account/mfa"));

    expect(response.status).toBe(403);
    expect(enableMfa).not.toHaveBeenCalled();
  });

  it("rejects stale AAL2 before settings disablement", async () => {
    claims = {
      aal: "aal2",
      amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 7200 }],
    };

    const response = await revokeMfa(request("/api/account/mfa", "DELETE"));

    expect(response.status).toBe(403);
    expect(disableMfa).not.toHaveBeenCalled();
  });

  it("rejects stale AAL2 before replacing recovery codes", async () => {
    claims = {
      aal: "aal2",
      amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 7200 }],
    };

    const response = await regenerateRecoveryCodes(
      request("/api/account/mfa/recovery-codes")
    );

    expect(response.status).toBe(403);
    expect(issueRecoveryCodes).not.toHaveBeenCalled();
  });

  it("keeps normal setup and settings revocation available after fresh AAL2", async () => {
    const activation = await activateMfa(request("/api/account/mfa"));
    const revocation = await revokeMfa(request("/api/account/mfa", "DELETE"));

    expect(activation.status).toBe(200);
    expect(await activation.json()).toEqual({ recoveryCodes: ["AAAA-BBBB-CCCC"] });
    expect(enableMfa).toHaveBeenCalledWith(userId);
    expect(revocation.status).toBe(200);
    expect(disableMfa).toHaveBeenCalledWith(userId);
  });

  it("replaces recovery codes after fresh AAL2", async () => {
    const response = await regenerateRecoveryCodes(
      request("/api/account/mfa/recovery-codes")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recoveryCodes: ["AAAA-BBBB-CCCC"] });
    expect(issueRecoveryCodes).toHaveBeenCalledWith(userId);
  });

  it("rate-limits burst recovery-code regeneration before issuing another set", async () => {
    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(
        await regenerateRecoveryCodes(request("/api/account/mfa/recovery-codes"))
      );
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 429]);
    expect(Number(responses[3].headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(issueRecoveryCodes).toHaveBeenCalledTimes(3);
  });
});
