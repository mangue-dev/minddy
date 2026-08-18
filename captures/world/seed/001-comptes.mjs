/**
 * 001 — demo world accounts.
 *
 * Creates the main account and two fictitious colleagues. minddy's screens
 * show assignments, avatars and activity: it takes several
 * people so that the board looks alive.
 *
 * Idempotent: restarted, it returns the existing accounts without recreating anything.
 *
 * The password is generated on the first pass and displayed ONCE. He must
 * be pasted by hand in `.env` under `CAPTURES_DEMO_PASSWORD` — it is not
 * written to any versioned file or the registry.
 *
 * User agreement: “account + project + board” batch, data in English.
 */
import { randomBytes } from "node:crypto";
import { createDemoUser } from "../../lib/guards.mjs";
import { loadEnv } from "../../lib/env.mjs";

loadEnv();

/** The demo family. All emails follow the pattern recognized by the safeguards. */
export const DEMO_ACCOUNTS = [
  { email: "captures-demo@minddy.app", fullName: "Camille Roy", role: "owner" },
  { email: "captures-demo+alice@minddy.app", fullName: "Alice Fontaine", role: "member" },
  { email: "captures-demo+tom@minddy.app", fullName: "Tom Berger", role: "member" },
];

/** Password shared by the family: a single variable to hold in `.env`. */
function resolvePassword() {
  const existing = process.env.CAPTURES_DEMO_PASSWORD;
  if (existing) return { password: existing, generated: false };
  // 32 base64url characters: long enough not to be guessable, enough
  // simple to be glued without exhaust.
  return { password: randomBytes(24).toString("base64url"), generated: true };
}

export async function seedAccounts() {
  const { password, generated } = resolvePassword();
  const created = [];

  for (const account of DEMO_ACCOUNTS) {
    const result = await createDemoUser({
      email: account.email,
      fullName: account.fullName,
      password,
      confirmed: true,
    });
    created.push({ ...account, ...result });
    console.log(
      `  ${result.created ? "créé " : "déjà là"} — ${account.email} (${account.fullName})`,
    );
  }

  if (generated && created.some((a) => a.created)) {
    console.log("\n──────────────────────────────────────────────────────────");
    console.log("Mot de passe du compte de démo (affiché UNE seule fois) :");
    console.log(`\n  CAPTURES_DEMO_PASSWORD=${password}\n`);
    console.log("Colle cette ligne dans le .env à la racine du repo.");
    console.log("──────────────────────────────────────────────────────────");
  }

  return created;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Comptes du monde de démo :");
  await seedAccounts();
}
