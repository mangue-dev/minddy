/**
 * 011 — des adresses crédibles pour les votants du board de retours.
 *
 * Pour quelle capture : `feedbackInbox`. La vue équipe affiche l'auteur d'un
 * retour sous la forme « Auteur : <email> » (feedback-team-page.tsx). Avec les
 * adresses posées par 007, la capture publiée sur la landing portait
 * « captures-demo+voter07@minddy.app » en toutes lettres.
 *
 * CE QUE ÇA NE CHANGE PAS. Les garde-fous ne reconnaissent pas ces lignes à
 * leur adresse : `feedback_users` est ancré par `project_id` (config.mjs), pas
 * par le motif d'email — contrairement aux comptes `auth.users`, qui gardent
 * le leur. Les pseudonymes publics, les votes et les retours ne bougent pas.
 *
 * Les domaines sont fictifs et sans rapport avec des entreprises réelles.
 *
 * Idempotent : une identité qui porte déjà son adresse cible est laissée telle
 * quelle. Relancer 007 ne défait rien — il ne touche qu'aux votants MANQUANTS,
 * reconnus à leur pseudonyme.
 *
 *   node captures/world/seed/011-votants-emails.mjs --dry-run
 *   node captures/world/seed/011-votants-emails.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { requireProject } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const TARGET_PROJECT = "AUR";

/**
 * Une adresse par pseudonyme, dans l'ordre de 007. Des gens qui suivent une
 * page de statut : des équipes techniques, sur des domaines inventés.
 */
const EMAILS = {
  "Amber Otter 41": "maya.kordell@fjordlabs.io",
  "Brave Heron 63": "t.abadie@northwind-systems.com",
  "Cobalt Lynx 28": "priya@lumenstack.dev",
  "Curious Finch 77": "j.okonkwo@bright-anvil.com",
  "Daring Marmot 12": "sofia.renner@quaystone.io",
  "Eager Puffin 55": "dev@harborlight.app",
  "Emerald Gecko 39": "lucas.b@meridian-tools.com",
  "Fair Kestrel 84": "nadia@slateharbor.io",
  "Gentle Bison 21": "ops@cindergrid.com",
  "Golden Raven 66": "e.villalobos@northwind-systems.com",
  "Humble Ibex 47": "kenji.mori@lumenstack.dev",
  "Indigo Falcon 30": "clara@driftwood-analytics.com",
  "Jade Wombat 58": "sam.aldridge@quaystone.io",
  "Keen Ferret 19": "platform@harborlight.app",
  "Lively Condor 72": "ines.faria@bright-anvil.com",
  "Loyal Marten 35": "d.novak@slateharbor.io",
  "Mellow Toucan 90": "ruth@meridian-tools.com",
  "Nimble Quokka 24": "oliver.tan@fjordlabs.io",
  "Noble Osprey 61": "sre@cindergrid.com",
  "Olive Caribou 43": "amelie@driftwood-analytics.com",
  "Patient Seal 16": "h.eriksen@northwind-systems.com",
  "Quiet Jaguar 88": "marco@quaystone.io",
  "Rustic Beaver 52": "team@lumenstack.dev",
  "Silver Crane 37": "yasmin.haddad@slateharbor.io",
};

function describeIntent() {
  const lines = [
    `  • Donner une adresse crédible à ${Object.keys(EMAILS).length} votants du board de retours d'Aurora`,
    `      leur pseudonyme public, leurs votes et leurs retours ne changent pas`,
    `      seule la ligne « Auteur : … » de la vue équipe change d'apparence`,
  ];
  for (const [pseudonym, email] of Object.entries(EMAILS).slice(0, 4)) {
    lines.push(`      - ${pseudonym} → ${email}`);
  }
  lines.push(`      - … et ${Object.keys(EMAILS).length - 4} de plus`);
  return lines.join("\n");
}

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script changerait (rien n'est écrit) :\n");
    console.log(describeIntent());
    return;
  }

  const world = await openDemoWorld();
  const project = requireProject(world, TARGET_PROJECT);

  const { data: voters, error } = await world.admin
    .from("feedback_users")
    .select("id, pseudonym, email")
    .eq("project_id", project.id);
  if (error) throw new Error(`captures: lecture des votants — ${error.message}`);

  const pending = (voters || []).filter(
    (v) => EMAILS[v.pseudonym] && v.email !== EMAILS[v.pseudonym],
  );

  const unknown = (voters || []).filter((v) => !EMAILS[v.pseudonym]);
  if (unknown.length > 0) {
    console.log(
      `  → ${unknown.length} votant(s) hors liste, laissés tels quels : ` +
        unknown.map((v) => v.pseudonym).join(", "),
    );
  }

  if (pending.length === 0) {
    console.log("  → les votants portent déjà leur adresse, rien à faire");
    return;
  }

  const plan = createPlan(world);
  for (const voter of pending) {
    plan.update(
      "feedback_users",
      { id: voter.id },
      { email: EMAILS[voter.pseudonym] },
      `votant « ${voter.pseudonym} »`,
    );
  }

  console.log(describeIntent());
  await plan.apply({ confirmed: true });

  console.log(`  → ${pending.length} adresse(s) mise(s) à jour`);
}

await main();
