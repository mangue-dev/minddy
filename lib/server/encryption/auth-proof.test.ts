import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticationProof } from "./auth-proof";

afterEach(() => vi.unstubAllEnvs());

describe("database-independent authentication proofs", () => {
  it("separates purposes and structured inputs and changes with the server secret", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret-with-at-least-forty-characters");
    const proof = authenticationProof("feedback_otp", ["id", "123456"]);
    expect(proof).toHaveLength(64);
    expect(proof).toBe(authenticationProof("feedback_otp", ["id", "123456"]));
    expect(proof).not.toBe(createHash("sha256").update("id:123456").digest("hex"));
    expect(proof).not.toBe(authenticationProof("share_unlock", ["id", "123456"]));
    expect(authenticationProof("feedback_otp", ["a:b", "c"]))
      .not.toBe(authenticationProof("feedback_otp", ["a", "b:c"]));
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "rotated-service-role-secret-with-at-least-forty-characters");
    expect(proof).not.toBe(authenticationProof("feedback_otp", ["id", "123456"]));
  });

  it("fails closed when no strong server secret is configured", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => authenticationProof("share_unlock", ["token", "hash"])).toThrow();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "short");
    expect(() => authenticationProof("feedback_otp", ["id", "123456"])).toThrow();
  });
});
