/**
 * 010 — passer le compte de démo en plan Pro.
 *
 * Pourquoi : les écrans Agents et Pull Requests sont fermés derrière
 * `AgentsPlanGate`, qui remplace la page entière par un encart de vente quand
 * le plan n'autorise pas les agents. Camille était sur `free` :
 *   free → allowAgents: false, allowMembers: false, maxProjects: 2
 *   go   → allowAgents: true,  allowMembers: false
 *   pro  → allowAgents: true,  allowMembers: true,  projets illimités
 *
 * D'où `pro` et pas `go` : le monde de démo montre trois personnes assignées
 * sur les boards, ce que `allowMembers` conditionne, et compte déjà deux
 * projets — soit le plafond exact du plan gratuit.
 *
 * COMMENT, et c'est le point important : on écrit UNIQUEMENT
 * `admin_override_plan_id`, la colonne que le schéma prévoit pour ça (« offrir
 * Pro à un testeur »), prioritaire sur Stripe dans
 * `resolvePlanFromBillingAccount`. Aucun client Stripe n'est créé, aucun
 * abonnement, aucun paiement, aucun webhook. Les colonnes `stripe_*` restent
 * intégralement nulles.
 *
 * Idempotent : si l'override est déjà posé, le script ne touche à rien.
 *
 *   node captures/world/seed/010-plan-pro.mjs --dry-run
 *   node captures/world/seed/010-plan-pro.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, PEOPLE } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const PLAN_ID = "pro";
const NOTE = "Compte de démo des captures (captures/) — accès agents et pull requests. Aucun abonnement Stripe.";

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script ferait (rien n'est écrit) :\n");
    console.log(`  • Passer le compte de Camille Roy en plan « ${PLAN_ID} »`);
    console.log("      par l'override administrateur, pas par un abonnement");
    console.log("      → débloque les écrans Agents et Pull Requests");
    console.log("      → aucune donnée Stripe créée ni modifiée");
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);

  const { data: existing, error } = await world.admin
    .from("billing_accounts")
    .select("user_id, admin_override_plan_id, stripe_customer_id, stripe_subscription_id")
    .eq("user_id", people.camille)
    .maybeSingle();
  if (error) throw new Error(`captures: lecture du compte de facturation — ${error.message}`);

  if (existing?.admin_override_plan_id === PLAN_ID) {
    console.log(`  → Camille est déjà en plan « ${PLAN_ID} », rien à faire`);
    return;
  }

  const plan = createPlan(world);
  if (existing) {
    plan.update(
      "billing_accounts",
      { user_id: people.camille },
      { admin_override_plan_id: PLAN_ID, admin_override_note: NOTE },
      `plan de Camille → ${PLAN_ID}`,
    );
  } else {
    plan.insert(
      "billing_accounts",
      [{
        user_id: people.camille,
        email: PEOPLE.camille,
        admin_override_plan_id: PLAN_ID,
        admin_override_note: NOTE,
      }],
      "compte de facturation",
    );
  }
  console.log(plan.describe());
  await plan.apply({ confirmed: true });

  // Contrôle : l'override est posé, et RIEN de Stripe n'a été touché.
  const { data: after } = await world.admin
    .from("billing_accounts")
    .select("admin_override_plan_id, stripe_customer_id, stripe_subscription_id, stripe_plan_id, stripe_subscription_status")
    .eq("user_id", people.camille)
    .maybeSingle();

  const stripeTouched = [
    after?.stripe_customer_id,
    after?.stripe_subscription_id,
    after?.stripe_plan_id,
    after?.stripe_subscription_status,
  ].filter(Boolean);

  console.log(`  → plan résolu : ${after?.admin_override_plan_id} (override administrateur)`);
  console.log(
    stripeTouched.length === 0
      ? "  → colonnes Stripe : toutes nulles, comme attendu"
      : `  → ATTENTION : des colonnes Stripe sont renseignées (${stripeTouched.join(", ")})`,
  );
  if (stripeTouched.length > 0) {
    throw new Error("captures: l'override ne doit toucher aucune donnée Stripe.");
  }
}

await main();
