/**
 * 001 — les comptes du monde de démo.
 *
 * Crée le compte principal et deux collègues fictifs. Les écrans de minddy
 * montrent des assignations, des avatars et de l'activité : il faut plusieurs
 * personnes pour que le board ait l'air vivant.
 *
 * Idempotent : relancé, il renvoie les comptes existants sans rien recréer.
 *
 * Le mot de passe est généré au premier passage et affiché UNE fois. Il doit
 * être collé à la main dans `.env` sous `CAPTURES_DEMO_PASSWORD` — il n'est
 * écrit dans aucun fichier versionné, ni dans le registre.
 *
 * Accord de l'utilisateur : lot « compte + projet + board », données en anglais.
 */
import { randomBytes } from "node:crypto";
import { createDemoUser } from "../../lib/guards.mjs";
import { loadEnv } from "../../lib/env.mjs";

loadEnv();

/** La famille de démo. Tous les emails suivent le motif reconnu par les garde-fous. */
export const DEMO_ACCOUNTS = [
  { email: "captures-demo@minddy.app", fullName: "Camille Roy", role: "owner" },
  { email: "captures-demo+alice@minddy.app", fullName: "Alice Fontaine", role: "member" },
  { email: "captures-demo+tom@minddy.app", fullName: "Tom Berger", role: "member" },
];

/** Mot de passe partagé par la famille : une seule variable à tenir dans `.env`. */
function resolvePassword() {
  const existing = process.env.CAPTURES_DEMO_PASSWORD;
  if (existing) return { password: existing, generated: false };
  // 32 caractères base64url : assez long pour ne pas être devinable, assez
  // simple pour être collé sans échappement.
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
