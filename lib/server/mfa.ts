import "server-only";

import { randomInt, timingSafeEqual } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";
import {
  MFA_ENABLED_CLAIM,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
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
    ...(data.user.app_metadata ?? {}),
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

/** Un code au format `XXXX-XXXX`, tiré avec `randomInt` (CSPRNG). */
function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
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
    list.map((code) => ({ user_id: userId, code_hash: sha256Hex(code) }))
  );
  if (error) throw new Error(error.message);
  return list;
}

/**
 * Consomme un code. Le `update … is null` fait la course pour nous : deux envois
 * simultanés du même code ne peuvent pas réussir tous les deux, c'est Postgres
 * qui tranche, pas l'ordre d'arrivée dans le handler.
 *
 * La comparaison finale passe par `timingSafeEqual` bien que le hash soit déjà
 * une empreinte : ça ne coûte rien et ça évite d'avoir à raisonner sur ce que la
 * requête d'index a pu laisser filtrer.
 */
export async function consumeRecoveryCode(
  userId: string,
  input: string
): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;

  const hash = sha256Hex(code);
  const service = getServiceClient();
  const { data, error } = await service
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("code_hash", hash)
    .is("used_at", null)
    .select("code_hash")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  const a = Buffer.from(data.code_hash as string);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
