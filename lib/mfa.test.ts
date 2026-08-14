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
 * `needsMfaChallenge` est le prédicat de sécurité du second facteur (MIN-132) :
 * c'est lui, et lui seul, qui décide si une requête passe. Le proxy et
 * `getAuthedUser` l'appellent tous les deux — donc une erreur ici n'ouvre pas
 * une route, elle ouvre tout.
 *
 * Ce que ces cas gardent surtout : le drapeau ne vaut QUE `true` littéral. Une
 * chaîne `"false"`, un `0`, un `"true"` recopié depuis un formulaire — tout ça
 * est truthy en JavaScript, et laisserait un compte sans facteur exiger un `aal2`
 * qu'il ne peut pas produire, c'est-à-dire enfermé dehors.
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

  it("exige aal2 dès qu'un facteur est enrôlé", () => {
    expect(needsMfaChallenge({ aal: "aal1", app_metadata: enabled })).toBe(true);
    expect(needsMfaChallenge({ aal: "aal2", app_metadata: enabled })).toBe(false);
  });

  it("laisse passer un compte sans second facteur", () => {
    expect(needsMfaChallenge({ aal: "aal1", app_metadata: {} })).toBe(false);
    expect(needsMfaChallenge({ aal: "aal1" })).toBe(false);
    expect(needsMfaChallenge(null)).toBe(false);
  });

  it("refuse un `aal` absent ou inattendu sur un compte protégé", () => {
    // Défaut fermé : tout ce qui n'est pas littéralement "aal2" est un challenge
    // à passer, pas une permission.
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

  it("renvoie null sur un jeton illisible plutôt que de lever", () => {
    expect(decodeJwtPayload("")).toBeNull();
    expect(decodeJwtPayload("pas-un-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
    // Un payload JSON valide mais scalaire n'est pas un jeu de claims.
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

  it("rejette ce qui ne peut pas être un code", () => {
    expect(normalizeRecoveryCode("")).toBeNull();
    expect(normalizeRecoveryCode("ABCD-2345-678")).toBeNull();
    expect(normalizeRecoveryCode("ABCD-2345-67890")).toBeNull();
    // Le format court d'avant MIN-347 : 40 bits, il n'en existe plus en base.
    expect(normalizeRecoveryCode("ABCD-2345")).toBeNull();
    // I, L, O et U ne sont pas dans l'alphabet : les accepter reviendrait à
    // interroger la base pour une saisie qui ne peut rien matcher.
    expect(normalizeRecoveryCode("ABCI-2345-6789")).toBeNull();
    expect(normalizeRecoveryCode("ABCO-2345-6789")).toBeNull();
  });

  it("porte 60 bits — le KDF lent ne rattrape pas une entropie manquante", () => {
    expect(RECOVERY_CODE_LENGTH).toBe(12);
    expect(RECOVERY_CODE_ALPHABET.length).toBe(32);
    expect(RECOVERY_CODE_LENGTH * Math.log2(RECOVERY_CODE_ALPHABET.length)).toBe(60);
  });
});
