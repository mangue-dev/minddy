/**
 * The capture administrator — preview only.
 *
 * The instance administration figures of the manual need a session that the
 * admin console accepts: `app_metadata.role = "admin"`, a verified TOTP factor
 * and an aal2 session (lib/server/admin.ts). This script creates that account
 * on the PREVIEW database and nowhere else. It is a dedicated capture account,
 * never a real administrator.
 *
 * Credentials never leave the local `.env`: the address
 * (`CAPTURES_ADMIN_EMAIL`), the password (`CAPTURES_ADMIN_PASSWORD`) and the
 * TOTP secret (`CAPTURES_ADMIN_TOTP_SECRET`) are generated when missing,
 * appended to `.env` and never printed. `captures/lib/admin-session.mjs` then
 * reads them from the environment to save a browser session.
 *
 *   node captures/world/admin-account.mjs            # describe what would change
 *   node captures/world/admin-account.mjs --apply    # create or repair the account
 *   node captures/world/admin-account.mjs --apply --reset
 *       # delete and recreate it, for example when `.env` lost its secrets
 *
 * Idempotent: with the account in place and its secrets in `.env`, a rerun
 * only checks the role and the factor.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL_DEFAULT, ADMIN_EMAIL_PATTERN } from "../lib/config.mjs";
import { assertNonProductionDatabase } from "../lib/database-target.mjs";
import { appendEnvValues, loadEnv, requireEnv } from "../lib/env.mjs";
import { totpCode, totpRemainingMs } from "../lib/totp.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const reset = args.has("--reset");

loadEnv();
const supabaseUrl = requireEnv("MINDDY_PUBLIC_SUPABASE_URL");
assertNonProductionDatabase(supabaseUrl, "the capture admin");

const email = (process.env.CAPTURES_ADMIN_EMAIL || ADMIN_EMAIL_DEFAULT).trim().toLowerCase();
if (!ADMIN_EMAIL_PATTERN.test(email)) {
  throw new Error(
    "captures: CAPTURES_ADMIN_EMAIL must be captures-admin@minddy.app or captures-admin+xxx@minddy.app.",
  );
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), clientOptions);

async function findAccount() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`captures: listing accounts — ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) {
      // Listings omit MFA factors; the single-account read includes them.
      const { data: full, error: readError } = await service.auth.admin.getUserById(found.id);
      if (readError) throw new Error(`captures: reading the capture admin — ${readError.message}`);
      return full.user;
    }
    if (data.users.length < 200) return null;
  }
}

/** Waits for a fresh TOTP window so two verifications never share one code. */
async function freshCode(secret) {
  if (totpRemainingMs() < 5_000) await new Promise((r) => setTimeout(r, totpRemainingMs() + 250));
  return totpCode(secret);
}

async function enrollFactor(password) {
  const user = createClient(supabaseUrl, requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), clientOptions);
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`captures: capture admin sign-in — ${signInError.message}`);

  const { data: enrolled, error: enrollError } = await user.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "captures",
  });
  if (enrollError) throw new Error(`captures: TOTP enrollment — ${enrollError.message}`);

  const secret = enrolled.totp.secret;
  const { error: verifyError } = await user.auth.mfa.challengeAndVerify({
    factorId: enrolled.id,
    code: await freshCode(secret),
  });
  if (verifyError) throw new Error(`captures: TOTP verification — ${verifyError.message}`);
  await user.auth.signOut();
  return secret;
}

async function grantAdminRole(account) {
  const { error } = await service.auth.admin.updateUserById(account.id, {
    app_metadata: { ...account.app_metadata, role: "admin", mfa_enabled: true },
  });
  if (error) throw new Error(`captures: granting the admin role — ${error.message}`);
}

const ref = new URL(supabaseUrl).hostname;
let account = await findAccount();
const hasPassword = Boolean(process.env.CAPTURES_ADMIN_PASSWORD);
const hasTotpSecret = Boolean(process.env.CAPTURES_ADMIN_TOTP_SECRET);
const verified = account?.factors?.some((factor) => factor.factor_type === "totp" && factor.status === "verified");
const isAdmin = account?.app_metadata?.role === "admin" && account?.app_metadata?.mfa_enabled === true;

console.log(`Capture admin on ${ref}:`);
console.log(`  account   ${account ? "present" : "absent"}`);
console.log(`  .env      password ${hasPassword ? "set" : "missing"} · TOTP secret ${hasTotpSecret ? "set" : "missing"}`);
if (account) console.log(`  factor    ${verified ? "verified TOTP" : "none"} · role ${isAdmin ? "admin" : "missing"}`);

// Every refusal happens before the first write: `.env` values are never
// overwritten, so a state they cannot describe is reset explicitly.
if (reset && (hasPassword || hasTotpSecret)) {
  throw new Error(
    "captures: remove CAPTURES_ADMIN_PASSWORD and CAPTURES_ADMIN_TOTP_SECRET from .env before --reset.",
  );
}
if (!reset && !account && hasTotpSecret) {
  throw new Error("captures: .env holds a TOTP secret for an account that does not exist. Remove it and rerun.");
}
if (!reset && account && !(hasPassword && hasTotpSecret && verified)) {
  throw new Error(
    "captures: the capture admin exists but its password, TOTP secret or factor is missing. " +
      "Remove its CAPTURES_ADMIN_PASSWORD and CAPTURES_ADMIN_TOTP_SECRET lines, then rerun with --apply --reset.",
  );
}
if (account && !reset && isAdmin) {
  console.log("Nothing to change.");
  process.exit(0);
}
if (!apply) {
  console.log("\nDry run: rerun with --apply to create or repair the capture admin.");
  process.exit(0);
}

if (account && reset) {
  const { error } = await service.auth.admin.deleteUser(account.id);
  if (error) throw new Error(`captures: deleting the previous capture admin — ${error.message}`);
  account = null;
}

if (!account) {
  const password = process.env.CAPTURES_ADMIN_PASSWORD || randomBytes(24).toString("base64url");
  // The password reaches .env before the account exists, so an interruption
  // never leaves an account nobody can sign in to.
  appendEnvValues({ CAPTURES_ADMIN_EMAIL: email, CAPTURES_ADMIN_PASSWORD: password });
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Capture Admin" },
  });
  if (error) throw new Error(`captures: creating the capture admin — ${error.message}`);
  account = data.user;
  appendEnvValues({ CAPTURES_ADMIN_TOTP_SECRET: await enrollFactor(password) });
}

await grantAdminRole(account);
console.log("\nCapture admin ready; its credentials are in .env.");
console.log("Save its session next: CAPTURE_BASE_URL=https://preview.minddy.app node captures/lib/admin-session.mjs");
