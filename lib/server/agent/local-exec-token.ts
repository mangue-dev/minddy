import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LE JETON D'EXÉCUTION LOCALE (MIN-355) — comment un tour qui vit sur la machine
 * de l'utilisateur prouve QUEL RUN il est, alors que rien ne signe pour lui.
 *
 * Dans une microVM, le `runId` n'est jamais reçu : il est DÉRIVÉ du claim
 * `sandbox_name` d'un OIDC que le firewall de Vercel Sandbox pose après la sortie
 * de la VM ([network-policy.ts](network-policy.ts)). Sur un Mac, il n'y a pas de
 * firewall, donc pas de signature à dériver — la machine doit porter quelque
 * chose, et c'est le renversement complet de la doctrine du chemin cloud.
 *
 * HS256 AUTO-PORTEUR `{rid, gen, exp}`, patron exact de
 * [sso-jwt.ts](../../feedback/sso-jwt.ts) : HS256 seul (aucune confusion
 * d'algorithme possible), comparaison en temps constant, `exp` obligatoire, et le
 * plafond de durée de vie imposé À LA VÉRIFICATION — le seul endroit qui tourne
 * chez nous, et donc le seul qui garantisse quoi que ce soit.
 *
 * POURQUOI PAS UN JETON OPAQUE HACHÉ, qui serait révocable par nature :
 * `POST /stream` est servi SANS lire la ligne du run, délibérément — ~4 appels/s,
 * ~29 000 par tour de deux heures ([control-plane.ts](control-plane.ts), le
 * commentaire du court-circuit). Un hash imposerait un lookup par requête,
 * c'est-à-dire exactement la charge que ce court-circuit existe pour supprimer.
 * La révocation se paie donc ailleurs, et elle est gratuite : le claim `gen` est
 * opposé à `agent_runs.local_exec_gen` là où la ligne est DÉJÀ lue, c'est-à-dire
 * partout sauf sur ce direct-là.
 *
 * CE QUE CE JETON NE PRÉTEND PAS ÊTRE. Il vit sur un disque que le modèle peut
 * lire, et aucune discipline de code ne changera ça. Ce qui est traité, ce n'est
 * donc pas sa confidentialité, c'est son POUVOIR : pas de `/repo-auth` sur le
 * chemin local, et `status = 'running'` exigé sur toutes les surfaces qui lisent
 * la ligne du run (cf. `handleControlPlaneRequest`). Le jeu de TOOLS, lui, ne
 * bouge pas — le pourquoi est écrit sur place.
 */

/**
 * Durée de vie maximale, IMPOSÉE À LA VÉRIFICATION. Quinze minutes glissantes :
 * assez pour qu'un tour de plusieurs heures ne se réveille pas sur un refus entre
 * deux renouvellements, assez court pour qu'un jeton recopié d'un `job.json`
 * cesse de valoir quelque chose avant qu'on ait fini de le lire.
 */
export const LOCAL_EXEC_MAX_TTL_SECONDS = 900;

/**
 * Écart d'horloge toléré SUR LE PLAFOND, et sur lui seul. Nous signons et nous
 * vérifions, mais pas depuis la même invocation : deux fonctions dont les
 * horloges diffèrent de quelques secondes refuseraient un jeton parfaitement
 * frais, pour la seule raison qu'il paraît trop neuf. L'expiration, elle, reste
 * stricte — la tolérance y allongerait la fenêtre au lieu de la corriger.
 */
export const LOCAL_EXEC_CLOCK_SKEW_SECONDS = 30;

/** Le préfixe du schéma d'authentification, tel que le harness le pose. */
const BEARER = /^bearer\s+(.+)$/i;

/**
 * Le format d'un identifiant de run, exigé comme il l'est sur le chemin cloud
 * (`runIdFromSandboxName`, network-policy.ts) et pour la même raison : `rid` part
 * en requête Postgrest, et une chaîne arbitraire n'a rien à y faire — même si la
 * signature l'a couverte, c'est NOTRE clé qui signe, donc c'est un bug de chez
 * nous qui la produirait.
 */
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LocalExecVerifyResult =
  | { ok: true; runId: string; gen: number; expiresAt: number }
  | {
      ok: false;
      error: "malformed" | "bad_signature" | "expired" | "ttl_too_long" | "bad_claims";
    };

/**
 * Le secret, DÉRIVÉ de la clé de service — pas une variable d'environnement de
 * plus à tenir.
 *
 * Même geste que `hashIp` ([feedback/otp.ts](../feedback/otp.ts)) : c'est le seul
 * secret dont ce chemin dispose déjà, et sans lequel il n'aurait de toute façon
 * ni base ni plan de contrôle. Une variable dédiée n'ajouterait pas de sécurité
 * (qui lit l'une lit l'autre) mais ajouterait un déploiement où la fonctionnalité
 * est silencieusement morte parce que personne ne l'a posée.
 *
 * HMAC et pas concaténation : le label sépare cet usage de tout autre, et le
 * changer révoque d'un coup tous les jetons en vol — c'est notre bouton de
 * rotation, et il ne coûte rien à personne (quinze minutes de fenêtre).
 *
 * `null` quand la clé manque, et l'appelant en fait un **503, pas un
 * passe-droit** : un plan de contrôle qui ne sait pas vérifier ne vérifie pas.
 */
export function resolveLocalExecSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return createHmac("sha256", serviceKey).update("minddy/agent-local-exec/v1").digest("hex");
}

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface SignLocalExecInput {
  /** Le run que ce jeton désigne, et le seul (claim `rid`). */
  runId: string;
  /** La génération du bail au moment de l'émission (claim `gen`). */
  gen: number;
  /** Durée de vie ; bornée à {@link LOCAL_EXEC_MAX_TTL_SECONDS}. */
  ttlSeconds?: number;
}

/** Signe le jeton d'un bail. Miroir exact de {@link verifyLocalExecToken}. */
export function signLocalExecToken(
  input: SignLocalExecInput,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const ttl = Math.min(
    Math.max(1, Math.floor(input.ttlSeconds ?? LOCAL_EXEC_MAX_TTL_SECONDS)),
    LOCAL_EXEC_MAX_TTL_SECONDS,
  );
  const headerB64 = encodeSegment({ alg: "HS256", typ: "JWT" });
  const payloadB64 = encodeSegment({
    rid: input.runId,
    gen: input.gen,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  });
  const signature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyLocalExecToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): LocalExecVerifyResult {
  if (typeof token !== "string" || !secret) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64);
  if (!header || header.alg !== "HS256") return { ok: false, error: "malformed" };

  const expected = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureB64, "base64url");
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, error: "bad_signature" };
  }

  const payload = decodeSegment(payloadB64);
  if (!payload) return { ok: false, error: "malformed" };

  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return { ok: false, error: "expired" };
  if (exp <= nowSeconds) return { ok: false, error: "expired" };
  // LE PLAFOND, ICI ET PAS AU SIGNEUR. Le signeur, c'est nous aujourd'hui — mais
  // c'est aussi la seule moitié du contrat qu'un jour de refactor peut déplacer
  // sans que personne ne s'en aperçoive. Un `exp` à un an ne passera jamais.
  if (exp > nowSeconds + LOCAL_EXEC_MAX_TTL_SECONDS + LOCAL_EXEC_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "ttl_too_long" };
  }

  const rid = payload.rid;
  const gen = payload.gen;
  if (typeof rid !== "string" || !RUN_ID_RE.test(rid)) return { ok: false, error: "bad_claims" };
  if (typeof gen !== "number" || !Number.isInteger(gen) || gen < 0) {
    return { ok: false, error: "bad_claims" };
  }

  return { ok: true, runId: rid, gen, expiresAt: exp };
}

/** Ce qu'une admission locale rend — le miroir de `SandboxAdmission`. */
export type LocalAdmission =
  | { ok: true; runId: string; gen: number }
  | { ok: false; status: 403 | 503; error: string };

/**
 * QUI A LE DROIT DE PARLER SANS FIREWALL (MIN-355) — le pendant local
 * d'`admitSandboxCaller` ([network-policy.ts](network-policy.ts)), et le seul
 * garde de la deuxième voie d'admission.
 *
 * PUR, comme son jumeau, et pour la même raison : la route
 * ([app/api/agent-vm/[...path]/route.ts](../../../app/api/agent-vm/[...path]/route.ts))
 * n'est pas exercée par la suite de tests (`vitest.config.ts` ne lit que
 * `lib/**`). Ce qui décide de l'admission doit donc vivre ici, où un test peut le
 * casser.
 *
 * 403 sur tout ce qui n'est pas un jeton valide, sans distinguer l'absence de la
 * fausseté : un appelant sans jeton n'est pas un client qui s'est trompé, c'est
 * quelqu'un qui n'a rien à faire ici. La RAISON, elle, voyage dans le corps —
 * elle est ce qui permet au harness de demander un jeton frais à l'app plutôt que
 * de retenter le sien (un 403 n'est pas retenté, cf. `retryable`).
 */
export function admitLocalCaller(
  authorization: string | null | undefined,
  secret: string | null,
): LocalAdmission {
  if (!secret) {
    return { ok: false, status: 503, error: "local execution secret not configured" };
  }
  const match = BEARER.exec((authorization ?? "").trim());
  if (!match) return { ok: false, status: 403, error: "not a local agent caller" };

  const verified = verifyLocalExecToken(match[1].trim(), secret);
  if (!verified.ok) {
    return { ok: false, status: 403, error: `local execution token: ${verified.error}` };
  }
  return { ok: true, runId: verified.runId, gen: verified.gen };
}
