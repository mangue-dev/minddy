import "server-only";

import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import {
  MFA_ENABLED_CLAIM,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/mfa";

/**
 * Second facteur — le côté serveur (MIN-132).
 *
 * Deux états à tenir cohérents : les facteurs chez GoTrue (`auth.mfa_factors`,
 * atteignables uniquement par l'API admin) et le drapeau `app_metadata.mfa_enabled`
 * que le JWT transporte. Le drapeau est un CACHE du premier, et l'ordre des
 * écritures suit toujours la même règle : à l'activation on pose le drapeau APRÈS
 * avoir constaté un facteur vérifié ; à la désactivation on le retire AVANT de
 * supprimer les facteurs. Une interruption au milieu laisse donc, dans les deux
 * cas, un compte ACCESSIBLE plutôt qu'un compte muré.
 *
 * Aucune de ces fonctions ne fait confiance à ce que le client raconte : l'état
 * réel se lit chez GoTrue, jamais dans le corps de la requête.
 */

export interface MfaStatus {
  enabled: boolean;
  /** Facteurs TOTP vérifiés — 1 en pratique, l'API n'en interdit pas plusieurs. */
  verifiedFactors: number;
  /** Codes de récupération encore consommables. */
  unusedRecoveryCodes: number;
}

async function listFactors(userId: string) {
  const { data, error } = await getServiceClient().auth.admin.mfa.listFactors({
    userId,
  });
  if (error) throw new Error(error.message);
  return data?.factors ?? [];
}

async function countUnusedRecoveryCodes(userId: string): Promise<number> {
  const { count, error } = await getServiceClient()
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Pose le drapeau lu par `getClaims()`, en préservant le reste d'`app_metadata`.
 *
 * Écrit `false` pour désactiver, JAMAIS un `delete` : GoTrue FUSIONNE
 * `app_metadata` au lieu de le remplacer, donc une clé absente du corps est une
 * clé qu'on laisse telle quelle. Retirer la clé côté TS ne retirait donc rien du
 * tout — le compte restait marqué « 2FA active » alors qu'il n'avait plus aucun
 * facteur pour la satisfaire, c'est-à-dire enfermé dehors définitivement. C'est
 * exactement le scénario que les codes de récupération existent pour éviter, et
 * il se produisait au moment de s'en servir.
 */
async function setEnabledFlag(userId: string, enabled: boolean): Promise<void> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error(error?.message ?? "Unknown account");
  const appMetadata = {
    ...data.user.app_metadata,
    [MFA_ENABLED_CLAIM]: enabled,
  } as Record<string, unknown>;

  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    app_metadata: appMetadata,
  });
  if (updateError) throw new Error(updateError.message);
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [factors, unused] = await Promise.all([
    listFactors(userId),
    countUnusedRecoveryCodes(userId),
  ]);
  const verified = factors.filter((f) => f.status === "verified");
  return {
    enabled: verified.length > 0,
    verifiedFactors: verified.length,
    unusedRecoveryCodes: unused,
  };
}

/**
 * Active la 2FA du compte. Le client a déjà fait l'enrôlement et le premier
 * challenge (c'est ce qui lui donne sa session `aal2`) ; ici on CONSTATE le
 * facteur vérifié chez GoTrue, puis on pose le drapeau. Renvoie `false` si aucun
 * facteur vérifié n'existe — auquel cas il n'y a rien à activer.
 */
export async function enableMfa(userId: string): Promise<boolean> {
  const factors = await listFactors(userId);
  if (!factors.some((f) => f.status === "verified")) return false;
  await setEnabledFlag(userId, true);
  return true;
}

/**
 * Désactive tout : drapeau, facteurs, codes de récupération. C'est aussi la
 * sortie empruntée par un code de récupération — d'où le retrait du drapeau EN
 * PREMIER : si la suppression des facteurs échoue à mi-chemin, le compte reste
 * utilisable et la personne peut recommencer, alors que l'ordre inverse la
 * laisserait devant un challenge qu'elle ne peut plus passer.
 */
export async function disableMfa(userId: string): Promise<void> {
  await setEnabledFlag(userId, false);

  const service = getServiceClient();
  const factors = await listFactors(userId);
  for (const factor of factors) {
    const { error } = await service.auth.admin.mfa.deleteFactor({
      userId,
      id: factor.id,
    });
    if (error) throw new Error(error.message);
  }

  const { error } = await service
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Un code au format `XXXX-XXXX-XXXX`, tiré avec `randomInt` (CSPRNG). */
function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return formatRecoveryCode(out);
}

/**
 * Hachage d'un code de récupération : scrypt, SALÉ PAR CODE (MIN-347).
 *
 * C'était un sha256 nu, sur l'argument — écrit dans la migration — qu'un code
 * porte assez d'entropie pour qu'il n'y ait « rien à deviner par force brute
 * hors ligne ». L'argument tenait pour un mot de passe ; il ne tient pas ici :
 * les codes viennent d'un alphabet connu, d'une longueur connue, et une base
 * qui fuit se balaie hors ligne à quelques milliards d'empreintes par seconde.
 * Sans sel, les dix codes du compte se cassent d'ailleurs dans le MÊME balayage.
 * Et ce sont les codes qui CONTOURNENT le second facteur : ils valent le
 * facteur lui-même.
 *
 * Format stocké : `scrypt$<N>$<selHex>$<empreinteHex>`. Le `N` est dans la
 * ligne pour que durcir le paramètre demain ne rende pas illisibles les codes
 * frappés aujourd'hui — la vérification lit celui de la ligne, jamais une
 * constante d'ici.
 */
const SCRYPT_N = 1 << 14;
const SCRYPT_KEYLEN = 32;

function hashRecoveryCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Le code correspond-il à cette ligne ? Faux sur tout ce qui n'est pas au
 * format ci-dessus — un reliquat de l'ancien sha256 nu ne peut donc plus être
 * consommé, il est mort à la lecture (il n'en existe aucun en base, la migration
 * qui accompagne ce changement les efface).
 */
function recoveryCodeMatches(code: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  // `N` doit être une puissance de deux ≥ 2 ; borné pour qu'une ligne trafiquée
  // ne se transforme pas en déni de service (scrypt à N=2³⁰ ne rend pas la main).
  if (!Number.isInteger(cost) || cost < 2 || cost > 1 << 20 || (cost & (cost - 1)) !== 0) {
    return false;
  }
  let expected: Buffer;
  let computed: Buffer;
  try {
    expected = Buffer.from(parts[3], "hex");
    computed = scryptSync(code, Buffer.from(parts[2], "hex"), expected.length, {
      N: cost,
      r: 8,
      p: 1,
    });
  } catch {
    return false;
  }
  return expected.length > 0 && timingSafeEqual(computed, expected);
}

/**
 * Frappe une série neuve et EFFACE la précédente — utilisés ou non. Les codes en
 * clair ne repassent jamais par ici : c'est la seule et unique fois qu'ils
 * existent hors de la tête de la personne.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(generateRecoveryCode());
  const list = [...codes];

  const service = getServiceClient();
  const { error: purgeError } = await service
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", userId);
  if (purgeError) throw new Error(purgeError.message);

  const { error } = await service.from("mfa_recovery_codes").insert(
    list.map((code) => ({ user_id: userId, code_hash: hashRecoveryCode(code) }))
  );
  if (error) throw new Error(error.message);
  return list;
}

/**
 * Consomme un code.
 *
 * Le sel par code coûte la requête d'index : on ne peut plus demander « la ligne
 * dont l'empreinte vaut ceci », il faut dériver contre chaque ligne encore
 * consommable. Dix lignes au plus, dix scrypt au pire — de l'ordre d'une demi-
 * seconde sur un geste qu'on fait une fois. C'est le prix du sel, et il est payé
 * ici plutôt que par la personne dont la base a fuité.
 *
 * La marque `used_at` reste posée par un `update … is null` : c'est lui qui fait
 * la course, deux envois simultanés du même code ne peuvent pas réussir tous les
 * deux, et c'est Postgres qui tranche — pas l'ordre d'arrivée dans le handler.
 */
export async function consumeRecoveryCode(
  userId: string,
  input: string
): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;

  const service = getServiceClient();
  const { data, error } = await service
    .from("mfa_recovery_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw new Error(error.message);

  const row = ((data ?? []) as { id: string; code_hash: string }[]).find((r) =>
    recoveryCodeMatches(code, r.code_hash)
  );
  if (!row) return false;

  const { data: claimed, error: claimError } = await service
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  return !!claimed;
}
