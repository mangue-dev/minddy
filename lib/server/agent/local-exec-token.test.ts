import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  admitLocalCaller,
  LOCAL_EXEC_MAX_TTL_SECONDS,
  resolveLocalExecSecret,
  signLocalExecToken,
  verifyLocalExecToken,
} from "./local-exec-token";

/**
 * MIN-355 — THE TOKEN THAT REPLACES THE FIREWALL, and what it refuses.
 *
 * On the cloud path, there is nothing to check: the `runId` is derived from a claim
 * that the platform signs after the release of the VM. Here, everything has to be verified —
 * it is the complete reversal, and each of the lines below closes a door
 * that a misread token would open on the line of a run.
 *
 * PUR, therefore testable without base, without HTTP and without microVM: it is precisely for
 * that admission lives in this module and not in the route
 * (`vitest.config.ts` only reads `lib/**`).
 */

const SECRET = "s3cret-de-test";
const RUN_ID = "11111111-2222-4333-8444-555555555555";
/** A fixed second: two `Date.now()` in the same test would make the terminals
 * unreadable, and it is precisely the terminals that we are talking about. */
const NOW = 1_800_000_000;

describe("le jeton d'exécution locale", () => {
  it("fait l'aller-retour en portant le run et la génération du bail", () => {
    const token = signLocalExecToken({ runId: RUN_ID, gen: 3 }, SECRET, NOW);
    const verified = verifyLocalExecToken(token, SECRET, NOW);
    expect(verified).toEqual({
      ok: true,
      runId: RUN_ID,
      gen: 3,
      expiresAt: NOW + LOCAL_EXEC_MAX_TTL_SECONDS,
    });
  });

  it("refuse une signature faite avec une AUTRE clé", () => {
    const token = signLocalExecToken({ runId: RUN_ID, gen: 0 }, "une-autre-cle", NOW);
    expect(verifyLocalExecToken(token, SECRET, NOW)).toEqual({
      ok: false,
      error: "bad_signature",
    });
  });

  it("refuse une charge utile réécrite sous une signature valide", () => {
    // The obvious gesture of a token holder: keep the signature, change the
    //run. This is the only thing HMAC exists to prevent.
    const [header, , signature] = signLocalExecToken(
      { runId: RUN_ID, gen: 0 },
      SECRET,
      NOW,
    ).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        rid: "99999999-8888-4777-8666-555555555555",
        gen: 0,
        exp: NOW + 60,
      }),
    ).toString("base64url");
    expect(verifyLocalExecToken(`${header}.${forged}.${signature}`, SECRET, NOW).ok).toBe(false);
  });

  it("n'accepte QUE HS256 — aucune confusion d'algorithme possible", () => {
    // `alg: none` is the textbook attack: without this denial, a bare payload
    // would suffice. We make it complete, signature included, to prove that
    // it is indeed the header which refuses it and not the HMAC.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ rid: RUN_ID, gen: 0, exp: NOW + 60 }),
    ).toString("base64url");
    expect(verifyLocalExecToken(`${header}.${payload}.`, SECRET, NOW)).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("refuse un jeton périmé, à la seconde près", () => {
    const token = signLocalExecToken({ runId: RUN_ID, gen: 1, ttlSeconds: 60 }, SECRET, NOW);
    expect(verifyLocalExecToken(token, SECRET, NOW + 59).ok).toBe(true);
    expect(verifyLocalExecToken(token, SECRET, NOW + 60)).toEqual({ ok: false, error: "expired" });
  });

  it("borne la durée de vie à la SIGNATURE, quoi qu'on demande", () => {
    const token = signLocalExecToken({ runId: RUN_ID, gen: 0, ttlSeconds: 86_400 }, SECRET, NOW);
    const verified = verifyLocalExecToken(token, SECRET, NOW);
    expect(verified.ok && verified.expiresAt).toBe(NOW + LOCAL_EXEC_MAX_TTL_SECONDS);
  });

  it("impose le plafond À LA VÉRIFICATION, seul endroit qui tourne chez nous", () => {
    // A `exp` at one year, signed with the correct key: this is what a
    // signer become too generous — and that's exactly what the ceiling posed
    // in the signer alone can no longer refuse.
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ rid: RUN_ID, gen: 0, exp: NOW + 365 * 24 * 3600 }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(verifyLocalExecToken(`${header}.${payload}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      error: "ttl_too_long",
    });
  });

  it("exige un `rid` qui ait la forme d'un identifiant de run", () => {
    // The same refusal as `runIdFromSandboxName` on the cloud side, and for the same reason:
    // this field goes into Postgrest request.
    const token = signLocalExecToken({ runId: "../../admin", gen: 0 }, SECRET, NOW);
    expect(verifyLocalExecToken(token, SECRET, NOW)).toEqual({ ok: false, error: "bad_claims" });
  });

  it("exige une génération entière et positive", () => {
    for (const gen of [-1, 1.5, Number.NaN]) {
      const token = signLocalExecToken({ runId: RUN_ID, gen }, SECRET, NOW);
      expect(verifyLocalExecToken(token, SECRET, NOW)).toEqual({ ok: false, error: "bad_claims" });
    }
  });

  it("refuse ce qui n'est pas un jeton", () => {
    for (const junk of ["", "a.b", "a.b.c.d", "pas-un-jeton"]) {
      expect(verifyLocalExecToken(junk, SECRET, NOW)).toEqual({ ok: false, error: "malformed" });
    }
  });
});

describe("le secret, dérivé de la clé de service", () => {
  it("ne rend RIEN sans clé de service — et l'appelant en fait un 503", () => {
    expect(resolveLocalExecSecret({})).toBeNull();
    expect(resolveLocalExecSecret({ SUPABASE_SERVICE_ROLE_KEY: "  " })).toBeNull();
  });

  it("n'est pas la clé de service elle-même, et il est stable", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
    const derived = resolveLocalExecSecret(env);
    expect(derived).not.toBeNull();
    expect(derived).not.toContain("service-role-key");
    expect(resolveLocalExecSecret(env)).toBe(derived);
    // Changing the service key (or label, our spin button) revokes
    // all tokens in flight: that's what this inequality says.
    expect(resolveLocalExecSecret({ SUPABASE_SERVICE_ROLE_KEY: "autre" })).not.toBe(derived);
  });
});

describe("l'admission de la voie locale", () => {
  const bearer = (gen = 0) => `Bearer ${signLocalExecToken({ runId: RUN_ID, gen }, SECRET)}`;

  it("admet un porteur de jeton valide, et rend ce qu'il prétend", () => {
    expect(admitLocalCaller(bearer(7), SECRET)).toEqual({ ok: true, runId: RUN_ID, gen: 7 });
  });

  it("tolère la casse du schéma, pas son absence", () => {
    expect(admitLocalCaller(bearer().replace("Bearer", "bearer"), SECRET).ok).toBe(true);
    const nu = signLocalExecToken({ runId: RUN_ID, gen: 0 }, SECRET);
    expect(admitLocalCaller(nu, SECRET)).toEqual({
      ok: false,
      status: 403,
      error: "not a local agent caller",
    });
  });

  it("refuse en 403 l'absence de jeton — pas une erreur d'appelant, un intrus", () => {
    for (const header of [null, undefined, "", "Bearer "]) {
      const admission = admitLocalCaller(header, SECRET);
      expect(admission.ok).toBe(false);
      expect(admission.ok === false && admission.status).toBe(403);
    }
  });

  it("dit POURQUOI un jeton est refusé — c'est ce qui permet d'en redemander un", () => {
    // A 403 is not retried (see `retryable`): the harness must be able to
    // distinguish “request a fresh token from the app” from “you have nothing to do here”.
    const expired = signLocalExecToken({ runId: RUN_ID, gen: 0, ttlSeconds: 1 }, SECRET, 1_000);
    expect(admitLocalCaller(`Bearer ${expired}`, SECRET)).toEqual({
      ok: false,
      status: 403,
      error: "local execution token: expired",
    });
  });

  it("ferme la voie en 503 quand le déploiement ne sait pas signer", () => {
    // Never a free pass: a control plan which cannot verify does not
    // does not check — same behavior as the missing tenant on the cloud side.
    expect(admitLocalCaller(bearer(), null)).toEqual({
      ok: false,
      status: 503,
      error: "local execution secret not configured",
    });
  });
});
