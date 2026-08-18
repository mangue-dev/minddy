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
 * Second factor — the server side (MIN-132).
 *
 * Two states to keep consistent: the factors at GoTrue (`auth.mfa_factors`,
 * only reachable by the admin API) and the flag `app_metadata.mfa_enabled`
 * that the JWT carries. The flag is a CACHE of the first, and the order of
 * entries always follows the same rule: upon activation we set the flag AFTER
 * having observed a verified factor; when deactivated, it is removed BEFORE
 * delete the factors. An interruption in the middle therefore leaves, in both
 * cases, an ACCESSIBLE account rather than a walled account.
 *
 * None of these functions trusts what the client says: the actual status
 * is read in GoTrue, never in the body of the query.
 */

export interface MfaStatus {
  enabled: boolean;
  /** TOTP factors checked — 1 in practice, the API does not prohibit several. */
  verifiedFactors: number;
  /** Recovery codes still consumable. */
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
 * Sets the flag read by `getClaims()`, preserving the rest of `app_metadata`.
 *
 * Writes `false` to disable, NEVER a `delete`: GoTrue MERGE
 * `app_metadata` instead of replacing it, so a key missing from the body is a
 * key that is left as is. Removing the key from the TS side therefore removed nothing from the
 * everything - the account remained marked "2FA active" even though it no longer had any
 * factor to satisfy it, that is to say locked out permanently. This is
 * exactly the scenario that recovery codes exist to prevent, and
 * was happening when you used them.
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
 * Enables account 2FA. The client has already done the enrollment and the first
 * challenge (this is what gives him his `aal2` session); here we OBSERVE the
 * factor verified at GoTrue, then we place the flag. Returns `false` if no
 * checked factor exists — in which case there is nothing to enable.
 */
export async function enableMfa(userId: string): Promise<boolean> {
  const factors = await listFactors(userId);
  if (!factors.some((f) => f.status === "verified")) return false;
  await setEnabledFlag(userId, true);
  return true;
}

/**
 * Disables everything: flag, factors, recovery codes. This is also the
 * exit taken by a recovery code — hence the removal of the EN
 * flag FIRST: if removing the factors fails halfway, the account remains
 * usable and the person can start again, whereas the reverse order
 * would leave a challenge they can no longer handle pass.
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

/** A code in the format `XXXX-XXXX-XXXX`, drawn with `randomInt` (CSPRNG). */
function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return formatRecoveryCode(out);
}

/**
 * Hash of a recovery code: scrypt, SALTED BY CODE (MIN-347).
 *
 * This was a bare sha256, on the argument — written in the migration — that a code
 * carries enough entropy that there is "nothing to guess by force brute
 * offline”. The argument was a password; it doesn't fit here:
 * the codes come from a known alphabet, of a known length, and a leaky base
 * scans offline at a few billion fingerprints per second.
 * Without salt, the ten account codes break in the SAME scan.
 * And these are the codes which BYPASS the second factor: they are worth the
 * factor itself.
 *
 * Stored format: `scrypt$<N>$<selHex>$<empreinteHex>`. The `N` is in the
 * line so that hardening the setting tomorrow doesn't make the
 * codes hit today unreadable — the check reads the one in the line, never a constant from here.
 */
const SCRYPT_N = 1 << 14;
const SCRYPT_KEYLEN = 32;

function hashRecoveryCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Does the code match this line? False on everything that is not in the
 * format above — a remainder of the old bare sha256 can therefore no longer be
 * consumed, it is dead on reading (there are none in the base, the migration
 * which accompanies this change erases them).
 */
function recoveryCodeMatches(code: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  // `N` must be a power of two ≥ 2; limited so that a tampered line
  // does not turn into a denial of service (scrypt at N=2³⁰ does not give up).
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
 * Strikes a new series and CLEARS the previous one — used or not. The clear codes in
 * never come back this way: this is the one and only time that they
 * exist outside the person's head.
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
 * Consumes a code.
 *
 * Salt per code costs the index query: we can no longer ask for "the line
 * whose fingerprint is worth this", we must derive against each line still
 * consumable. Ten lines at most, ten scrypt at worst — on the order of half a
 * second on a gesture you make once. This is the price of salt, and it is paid
 * here rather than by the person whose base was leaked.
 *
 * The mark `used_at` remains placed by a `update … is null`: it is he who does
 * the race, two simultaneous sendings of the same code cannot succeed every
 * two, and Postgres decides — not the order of arrival in the handler.
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
