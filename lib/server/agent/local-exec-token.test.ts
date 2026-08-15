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
 * MIN-355 — LE JETON QUI REMPLACE LE FIREWALL, et ce qu'il refuse.
 *
 * Sur le chemin cloud, il n'y a rien à vérifier : le `runId` est dérivé d'un claim
 * que la plateforme signe après la sortie de la VM. Ici, tout est à vérifier —
 * c'est le renversement complet, et chacune des lignes ci-dessous ferme une porte
 * qu'un jeton mal lu ouvrirait sur la ligne d'un run.
 *
 * PUR, donc testable sans base, sans HTTP et sans microVM : c'est précisément pour
 * ça que l'admission vit dans ce module et pas dans la route
 * (`vitest.config.ts` ne lit que `lib/**`).
 */

const SECRET = "s3cret-de-test";
const RUN_ID = "11111111-2222-4333-8444-555555555555";
/** Une seconde fixe : deux `Date.now()` dans un même test rendraient les bornes
 *  illisibles, et c'est justement des bornes qu'on parle. */
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
    // Le geste évident d'un porteur de jeton : garder la signature, changer le
    // run. C'est la seule chose que le HMAC existe pour empêcher.
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
    // `alg: none` est l'attaque de manuel : sans ce refus, une charge utile nue
    // suffirait. On la fabrique complète, signature comprise, pour prouver que
    // c'est bien l'en-tête qui la refuse et pas le HMAC.
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
    // Un `exp` à un an, signé avec la bonne clé : c'est ce que produirait un
    // signeur devenu trop généreux — et c'est exactement ce que le plafond posé
    // dans le signeur seul ne saurait plus refuser.
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
    // Le même refus que `runIdFromSandboxName` côté cloud, et pour la même raison :
    // ce champ part en requête Postgrest.
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
    // Changer la clé de service (ou le label, notre bouton de rotation) révoque
    // tous les jetons en vol : c'est ce que dit cette inégalité.
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
    // Un 403 n'est pas retenté (cf. `retryable`) : le harness doit pouvoir
    // distinguer « demande un jeton frais à l'app » de « tu n'as rien à faire ici ».
    const expired = signLocalExecToken({ runId: RUN_ID, gen: 0, ttlSeconds: 1 }, SECRET, 1_000);
    expect(admitLocalCaller(`Bearer ${expired}`, SECRET)).toEqual({
      ok: false,
      status: 403,
      error: "local execution token: expired",
    });
  });

  it("ferme la voie en 503 quand le déploiement ne sait pas signer", () => {
    // Jamais un passe-droit : un plan de contrôle qui ne peut pas vérifier ne
    // vérifie pas — même conduite que le locataire manquant côté cloud.
    expect(admitLocalCaller(bearer(), null)).toEqual({
      ok: false,
      status: 503,
      error: "local execution secret not configured",
    });
  });
});
