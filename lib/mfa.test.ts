import { describe, expect, it } from "vitest";

import {
  MFA_ENABLED_CLAIM,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_LENGTH,
  decodeJwtPayload,
  hasMfaEnabled,
  needsMfaChallenge,
  normalizeRecoveryCode,
} from "@/lib/mfa";

/**
 * `needsMfaChallenge` is the security predicate of the second factor (MIN-132):
 * it is he, and he alone, who decides if a request passes. The proxy and
 * `getAuthedUser` both call it — so an error here doesn't open
 * one route, it opens everything.
 *
 * What these cases mostly keep: the flag is ONLY `true` literal. A
 * string `"false"`, a `0`, a `"true"` copied from a form — all of that
 * is truthy in JavaScript, and would leave an account without a factor requiring a `aal2`
 * that it doesn't cannot produce, that is to say locked outside.
 */

describe("hasMfaEnabled", () => {
  it("n'accepte que le booléen true", () => {
    expect(hasMfaEnabled({ [MFA_ENABLED_CLAIM]: true })).toBe(true);
    expect(hasMfaEnabled({ [MFA_ENABLED_CLAIM]: false })).toBe(false);
    expect(hasMfaEnabled({ [MFA_ENABLED_CLAIM]: "true" })).toBe(false);
    expect(hasMfaEnabled({ [MFA_ENABLED_CLAIM]: 1 })).toBe(false);
    expect(hasMfaEnabled({})).toBe(false);
    expect(hasMfaEnabled(null)).toBe(false);
    expect(hasMfaEnabled(undefined)).toBe(false);
    expect(hasMfaEnabled("nope")).toBe(false);
  });
});

describe("needsMfaChallenge", () => {
  const enabled = { [MFA_ENABLED_CLAIM]: true };

  it("requires aal2 as soon as a factor is enrolled", () => {
    expect(needsMfaChallenge({ aal: "aal1", app_metadata: enabled })).toBe(true);
    expect(needsMfaChallenge({ aal: "aal2", app_metadata: enabled })).toBe(false);
  });

  it("laisse passer un compte sans second facteur", () => {
    expect(needsMfaChallenge({ aal: "aal1", app_metadata: {} })).toBe(false);
    expect(needsMfaChallenge({ aal: "aal1" })).toBe(false);
    expect(needsMfaChallenge(null)).toBe(false);
  });

  it("refuse un `aal` absent ou inattendu sur un compte protégé", () => {
    // Defect closed: anything not literally "aal2" is a challenge
    // to pass, not a permission.
    expect(needsMfaChallenge({ app_metadata: enabled })).toBe(true);
    expect(needsMfaChallenge({ aal: "", app_metadata: enabled })).toBe(true);
    expect(needsMfaChallenge({ aal: "aal3", app_metadata: enabled })).toBe(true);
  });
});

describe("decodeJwtPayload", () => {
  it("lit un payload base64url, y compris non-ASCII", () => {
    const payload = { aal: "aal2", email: "chloé@exemple.fr" };
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(decodeJwtPayload(`header.${b64}.signature`)).toEqual(payload);
  });

  it("returns null for an unreadable token instead of throwing", () => {
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("pas-un-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
    // A valid but scalar JSON payload is not a claims set.
    const scalar = Buffer.from('"aal2"', "utf8").toString("base64url");
    expect(decodeJwtPayload(`a.${scalar}.c`)).toBeNull();
  });
});

describe("normalizeRecoveryCode", () => {
  it("rattrape la casse, les espaces et les tirets manquants", () => {
    expect(normalizeRecoveryCode("abcd-2345-6789")).toBe("ABCD-2345-6789");
    expect(normalizeRecoveryCode("ABCD23456789")).toBe("ABCD-2345-6789");
    expect(normalizeRecoveryCode(" abcd 2345 6789 ")).toBe("ABCD-2345-6789");
  });

  it("rejects values that cannot be a code", () => {
    expect(normalizeRecoveryCode("")).toBeNull();
    expect(normalizeRecoveryCode("ABCD-2345-678")).toBeNull();
    expect(normalizeRecoveryCode("ABCD-2345-67890")).toBeNull();
    // The short format before MIN-347: 40 bits, it no longer exists in base.
    expect(normalizeRecoveryCode("ABCD-2345")).toBeNull();
    // I, L, O and U are not in the alphabet: accepting them would amount to
    // query the database for an entry that cannot match anything.
    expect(normalizeRecoveryCode("ABCI-2345-6789")).toBeNull();
    expect(normalizeRecoveryCode("ABCO-2345-6789")).toBeNull();
  });

  it("carries 60 bits — a slow KDF cannot make up for missing entropy", () => {
    expect(RECOVERY_CODE_LENGTH).toBe(12);
    expect(RECOVERY_CODE_ALPHABET.length).toBe(32);
    expect(RECOVERY_CODE_LENGTH * Math.log2(RECOVERY_CODE_ALPHABET.length)).toBe(60);
  });
});
