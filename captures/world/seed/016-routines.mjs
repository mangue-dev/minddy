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
 * Runs are plain `agent_runs` rows pointing at the routine (`routine_id`,
 * `triggered_by: 'routine'`, no issue). Like 008, they are seeded at rest:
 * `completed` or `failed`, never `queued` nor `running`. No pull request:
 * the diff is read LIVE at the forge (app/api/agent-runs/[runId]/pr) and
 * none can be manufactured in base.
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
    model: "anthropic/claude-sonnet-4.5",
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
    model: null,
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
    model: null,
    frequency: "daily",
    weekdays: [],
    hour: 8,
    minute: 30,
    days_of_month: [],
  },
];

/**
 * History of the weekly security review, read from top to bottom in the
 * runs table (most recent first). `daysAgo` counts back from the capture
 * clock's Sunday (2026-09-06), so every run lands on a MONDAY — the cadence
 * the routine advertises. Durations derive from started_at → completed_at;
 * usage is computed live from cost against the plan.
 */
const RUNS = [
  { daysAgo: 6, minuteOffset: 3, status: "completed", minutes: 7, costUsd: 0.38 },
  { daysAgo: 13, minuteOffset: 7, status: "completed", minutes: 11, costUsd: 0.54 },
  { daysAgo: 20, minuteOffset: 2, status: "failed", minutes: 3, costUsd: 0.12 },
  { daysAgo: 27, minuteOffset: 11, status: "completed", minutes: 8, costUsd: 0.41 },
];

function isoDaysAgo(daysAgo, minuteOffset = 0) {
  // 07:00 UTC ≈ 09:00 under Paris summer time, so the displayed timestamps
  // agree with the routine's “every Monday at 09:00” cadence.
  const base = Date.parse("2026-09-06T00:00:00.000Z") - daysAgo * 86_400_000;
  return new Date(base + 7 * 3_600_000 + minuteOffset * 60_000).toISOString();
}

function describeIntent() {
  const lines = [
    `  • Créer ${ROUTINES.length} routines de démo sur ${PROJECT}, toutes EN PAUSE`,
    "      (enabled: false, aucun prochain passage — elles ne se déclencheront jamais)",
  ];
  for (const routine of ROUTINES) {
    lines.push(`      - ${routine.title} (${routine.frequency}, ${String(routine.hour).padStart(2, "0")}:${String(routine.minute).padStart(2, "0")} ${TIMEZONE})`);
  }
  lines.push(`  • Créer ${RUNS.length} passages historiques sur « ${ROUTINES[0].title} » :`);
  for (const run of RUNS) {
    lines.push(
      `      - il y a ${run.daysAgo} jours — ${run.status}, ${run.minutes} min, ~$${run.costUsd.toFixed(2)}`,
    );
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
        model: routine.model,
        reasoning_level: "medium",
        base_branch: "main",
        // DISABLED, always: the scheduler can never claim these rows.
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

  const weekly = createdRoutines.find((r) => r.title === ROUTINES[0].title);
  if (!weekly) throw new Error("captures: la routine hebdomadaire n'a pas été résolue");

  const { data: existingRuns } = await world.admin
    .from("agent_runs")
    .select("id")
    .eq("routine_id", weekly.id);
  if ((existingRuns || []).length > 0) {
    console.log(`  → ${existingRuns.length} passage(s) existent déjà sur la routine, laissés tels quels`);
    return;
  }

  const runPlan = createPlan(world);
  runPlan.insert(
    "agent_runs",
    RUNS.map((run) => {
      const startedAt = isoDaysAgo(run.daysAgo, run.minuteOffset);
      const completedAt = new Date(Date.parse(startedAt) + run.minutes * 60_000).toISOString();
      return {
        project_id: project.id,
        routine_id: weekly.id,
        created_by: people[OWNER],
        // At rest: neither the drain (which only requires `queued`) nor the
        // sweeper (which only relates to `running`) can take it back.
        status: run.status,
        awaiting_input: false,
        triggered_by: "routine",
        prompt: ROUTINES[0].prompt,
        model: ROUTINES[0].model,
        key_mode: "platform",
        intent: "implement",
        base_branch: "main",
        continuations: 0,
        attempts: 1,
        cost_usd: run.costUsd,
        outcome: run.status === "completed" ? "completed" : "error",
        error_message: run.status === "failed" ? "The sandbox exited before the review finished." : null,
        started_at: startedAt,
        completed_at: run.status === "completed" ? completedAt : null,
        window_started_at: startedAt,
        last_activity_at: completedAt,
        created_at: startedAt,
        updated_at: completedAt,
      };
    }),
    "passage de routine",
  );
  console.log(runPlan.describe());
  await runPlan.apply({ confirmed: true });

  console.log(
    `  → ${RUNS.length} passages créés sur « ${weekly.title} » (3 terminés, 1 en erreur)`,
  );
}

await main();
