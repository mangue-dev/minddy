/**
 * 016 — agent routines on Aurora, seeded DISABLED.
 *
 * For which capture: `routines` — “the Routines tab: two or three routines
 * in the list, one selected with its schedule line under the title and the
 * list of its runs with their statuses”.
 *
 * DISABLED IS THE WHOLE POINT. Demo routines must never run for real: the
 * scheduler (lib/server/routines.ts) only claims rows where `enabled` is
 * true and `next_run_at` is due. Every routine here is inserted with
 * `enabled: false` and `next_run_at: null` — the exact state the UI renders
 * as “paused”, and the only one that can never trigger a billed agent
 * passage, even though the demo account is on a plan that includes
 * automations. Never flip these rows to enabled.
 *
 * No run history: routine runs used `agent_runs`, the coding agent's table
 * removed in MIN-721, which the guards no longer whitelist.
 *
 * Idempotent: an existing Aurora routine with the same title is left as is;
 * runs are only added when the routine has none yet.
 *
 *   node captures/world/seed/016-routines.mjs --dry-run
 *   node captures/world/seed/016-routines.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const PROJECT = "AUR";
const OWNER = "camille";
const TIMEZONE = "Europe/Paris";

/**
 * Three routines, varied cadences. The weekly security review is the one
 * the landing capture selects: it carries the run history.
 */
const ROUTINES = [
  {
    title: "Weekly security review",
    prompt:
      "Review the open issues and last week's repository changes for security implications. Flag anything that could expose user data, and propose a concrete fix for each finding.",
    frequency: "weekly",
    weekdays: [1],
    hour: 9,
    minute: 0,
    days_of_month: [],
  },
  {
    title: "Monthly dependency inventory",
    prompt:
      "List outdated or abandoned dependencies in the repository, note which open issues they affect, and suggest which ones deserve an upgrade ticket this month.",
    frequency: "monthly",
    weekdays: [],
    hour: 8,
    minute: 0,
    days_of_month: [1],
  },
  {
    title: "Daily issue triage",
    prompt:
      "Scan newly opened issues, label obvious bugs versus features, and flag the ones that look urgent with a one-line reason.",
    frequency: "daily",
    weekdays: [],
    hour: 8,
    minute: 30,
    days_of_month: [],
  },
];

function describeIntent() {
  const lines = [
    `  • Créer ${ROUTINES.length} routines de démo sur ${PROJECT}, toutes EN PAUSE`,
    "      (enabled: false, aucun prochain passage — elles ne se déclencheront jamais)",
  ];
  for (const routine of ROUTINES) {
    lines.push(`      - ${routine.title} (${routine.frequency}, ${String(routine.hour).padStart(2, "0")}:${String(routine.minute).padStart(2, "0")} ${TIMEZONE})`);
  }
  return lines.join("\n");
}

async function main() {
  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(describeIntent());
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, PROJECT);

  const { data: existing, error: routineError } = await world.admin
    .from("agent_routines")
    .select("id, title, enabled, next_run_at")
    .eq("project_id", project.id);
  if (routineError) throw new Error(`captures: lecture des routines — ${routineError.message}`);

  const createdRoutines = [];
  for (const routine of ROUTINES) {
    const already = (existing || []).find((r) => r.title === routine.title);
    if (already) {
      console.log(`  → la routine « ${routine.title} » existe déjà, laissée telle quelle`);
      createdRoutines.push(already);
      continue;
    }
    const plan = createPlan(world);
    plan.insert(
      "agent_routines",
      [{
        project_id: project.id,
        owner_id: people[OWNER],
        title: routine.title,
        prompt: routine.prompt,
        prompt_mentions: [],
        base_branch: null,
        max_spend_percent: 15,
        // DISABLED, always: the scheduler can never claim these rows.
        trigger_type: "schedule", trigger: { type: "schedule" }, trigger_revision: 1,
        enabled: false,
        next_run_at: null,
        frequency: routine.frequency,
        hour: routine.hour,
        minute: routine.minute,
        weekdays: routine.weekdays,
        days_of_month: routine.days_of_month,
        timezone: TIMEZONE,
      }],
      `routine « ${routine.title} » (en pause)`,
    );
    console.log(plan.describe());
    const inserted = await plan.apply({ confirmed: true });
    createdRoutines.push(inserted.agent_routines[0]);
  }

  // Run history is no longer seeded: routine runs used `agent_runs`, the
  // table of the coding agent removed in MIN-721, which the guards no longer
  // whitelist. The routine list and editor need no run.
  console.log(`  → ${createdRoutines.length} routine(s) en pause sur ${PROJECT}`);
}

await main();
