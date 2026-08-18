/**
 * 010 — upgrade the demo account to the Pro plan.
 *
 * Why: the Agents and Pull Requests screens are closed behind
 * `AgentsPlanGate`, which replaces the entire page with a sales insert when
 * the plan does not allow agents. Camille was on `free`:
 *   free → allowAgents: false, allowMembers: false, maxProjects: 2
 *   go   → allowAgents: true,  allowMembers: false
 * pro → allowAgents: true, allowMembers: true, unlimited projects
 *
 * Hence `pro` and not `go`: the demo world shows three assigned people
 * on the boards, what `allowMembers` conditions, and already has two
 * projects — or the exact ceiling of the free plan.
 *
 * HOW, and this is the important point: we write ONLY
 * `admin_override_plan_id`, the column that the diagram provides for this (“offer
 * Pro to a tester"), priority over Stripe in
 * `resolvePlanFromBillingAccount`. No Stripe clients are created, no
 * subscription, no payment, no webhook. The `stripe_*` columns remain
 * entirely zero.
 *
 * Idempotent: if the override is already set, the script does not affect anything.
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

  // Control: the override is set, and NOTHING of Stripe has been touched.
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
