/**
 * 008 — un run de l'agent de code sur un ticket.
 *
 * Pour quelle capture : `workflowAgent` — « un run d'agent : fil d'exécution
 * avec appels d'outils (lecture de fichiers, édition), et l'issue rattachée en
 * en-tête ».
 *
 * LE STATUT N'EST PAS LIBRE. Le run est semé en `completed` + `awaiting_input`,
 * c'est-à-dire « l'agent a fini son tour et attend la suite » — le fil est
 * complet, le composer est prêt. Les deux statuts qui ressembleraient
 * davantage à « en cours » sont interdits ici :
 *   - `queued`  : le cron de drain le réclamerait au prochain passage ;
 *   - `running` : `requeueStuckRuns` remet en file tout run démarré depuis plus
 *                 de 6 minutes (lib/server/agent/runs.ts).
 * Dans les deux cas l'agent serait RÉELLEMENT lancé : microVM, appels LLM
 * facturés, et tentative d'écriture sur un dépôt. Un état au repos est le seul
 * qui tienne dans la durée.
 *
 * Pas de pull request : `pr_number` reste nul. Le diff affiché par minddy est
 * lu EN DIRECT chez GitHub/GitLab (app/api/agent-runs/[runId]/pr) — aucune
 * donnée en base ne peut le fabriquer.
 *
 * Idempotent : un run existant sur le ticket visé est laissé tel quel.
 *
 *   node captures/world/seed/008-agent.mjs --dry-run
 *   node captures/world/seed/008-agent.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/** Le ticket travaillé : celui qui porte déjà un plan d'implémentation. */
const TARGET = { project: "AUR", number: 2 };

const RUN = {
  model: "anthropic/claude-sonnet-4.5",
  base_branch: "main",
  branch_name: "numo/aur-2-palette-shortcuts",
  prompt: "Start with the global listener, and keep the sequence handling out of the row component.",
};

/**
 * Le fil d'exécution. Les formes de `payload` sont celles qu'émet la boucle
 * de l'agent (lib/server/agent/agent-loop.ts) : `tool_call` porte l'argument
 * résumé par `toolArgSummary`, `tool_result` un aperçu tronqué.
 */
const EVENTS = [
  { type: "status", payload: { status: "running", continuation: 0 } },
  {
    type: "thinking",
    payload: {
      text: "The palette already keeps its actions in one registry, so the shortcut should live on the action rather than in a separate map. Let me find where actions are declared.",
    },
  },
  { type: "tool_call", payload: { id: "t_01", name: "glob", pattern: "**/palette/**/*.{ts,tsx}" } },
  {
    type: "tool_result",
    payload: {
      id: "t_01",
      name: "glob",
      success: true,
      preview: "lib/palette/actions.ts\nlib/palette/registry.ts\ncomponents/palette/provider.tsx\ncomponents/palette/row.tsx\ncomponents/palette/help-sheet.tsx",
    },
  },
  { type: "tool_call", payload: { id: "t_02", name: "read_file", path: "lib/palette/actions.ts" } },
  {
    type: "tool_result",
    payload: {
      id: "t_02",
      name: "read_file",
      success: true,
      preview: "export interface PaletteAction {\n  id: string;\n  label: string;\n  group: PaletteGroup;\n  run: (ctx: PaletteContext) => void | Promise<void>;\n}",
    },
  },
  { type: "tool_call", payload: { id: "t_03", name: "read_file", path: "components/palette/provider.tsx" } },
  {
    type: "tool_result",
    payload: {
      id: "t_03",
      name: "read_file",
      success: true,
      preview: "export function PaletteProvider({ children }: { children: ReactNode }) {\n  const [open, setOpen] = useState(false);\n  // ⌘K only — no per-action bindings yet.",
    },
  },
  {
    type: "thinking",
    payload: {
      text: "The provider owns the only keyboard listener today, so that is where a per-action binding belongs. The row component just needs to render the hint it is handed.",
    },
  },
  {
    type: "tool_call",
    payload: {
      id: "t_04",
      name: "apply_edits",
      count: 3,
      paths: ["lib/palette/actions.ts", "components/palette/row.tsx", "components/palette/provider.tsx"],
    },
  },
  {
    type: "tool_result",
    payload: { id: "t_04", name: "apply_edits", success: true, preview: "3 files changed" },
  },
  {
    type: "files_changed",
    payload: {
      files: [
        { path: "lib/palette/actions.ts", status: "modified", additions: 6, deletions: 1 },
        { path: "components/palette/row.tsx", status: "modified", additions: 14, deletions: 2 },
        { path: "components/palette/provider.tsx", status: "modified", additions: 38, deletions: 4 },
      ],
      truncated: false,
    },
  },
  {
    type: "tool_call",
    payload: { id: "t_05", name: "run_command", command: "pnpm vitest run palette" },
  },
  {
    type: "tool_result",
    payload: {
      id: "t_05",
      name: "run_command",
      success: true,
      preview: "✓ lib/palette/actions.test.ts (7)\n✓ components/palette/provider.test.tsx (11)\n\nTest Files  2 passed (2)\n     Tests  18 passed (18)",
    },
  },
  {
    type: "summary",
    payload: {
      text: "Shortcuts are now declared on the action itself, and the provider binds them globally while ignoring events coming from inputs and textareas. Hints render on the right of each row. Two-key sequences are not handled yet — want me to add the reset timer now, or open the PR first?",
    },
  },
];

function describeIntent(issueLabel) {
  const lines = [
    `  • Créer 1 run de l'agent sur ${issueLabel}, au repos, en attente de réponse`,
    `      branche ${RUN.base_branch} → ${RUN.branch_name}, modèle ${RUN.model}`,
    `      aucune pull request : le diff se lit chez GitHub, pas en base`,
    `  • Créer ${EVENTS.length} événements de fil d'exécution :`,
  ];
  for (const [i, event] of EVENTS.entries()) {
    const p = event.payload;
    const detail =
      event.type === "tool_call"
        ? `${p.name} ${p.path || p.pattern || p.command || (p.paths || []).join(", ")}`
        : event.type === "tool_result"
          ? `résultat de ${p.name}`
          : event.type === "files_changed"
            ? `${p.files.length} fichiers modifiés`
            : (p.text || p.status || "").slice(0, 70);
    lines.push(`      ${String(i + 1).padStart(2)}. ${event.type} — ${detail}`);
  }
  return lines.join("\n");
}

async function main() {
  const window = currentCycleWindow();

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(describeIntent(`${TARGET.project}-${TARGET.number}`));
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, TARGET.project);

  const { data: issues, error: issueError } = await world.admin
    .from("issues")
    .select("id, number, title")
    .eq("project_id", project.id)
    .eq("number", TARGET.number);
  if (issueError) throw new Error(`captures: lecture du ticket — ${issueError.message}`);
  const issue = (issues || [])[0];
  if (!issue) {
    throw new Error(`captures: le ticket ${TARGET.project}-${TARGET.number} n'existe pas. Lance 002 d'abord.`);
  }

  const { data: runs, error: runError } = await world.admin
    .from("agent_runs")
    .select("id, status")
    .eq("issue_id", issue.id);
  if (runError) throw new Error(`captures: lecture des runs — ${runError.message}`);

  if ((runs || []).length > 0) {
    console.log(`  → un run existe déjà sur ${TARGET.project}-${TARGET.number}, laissé tel quel`);
    return;
  }

  const startedAt = spreadInWindow(window, 1, 15);
  const runPlan = createPlan(world);
  runPlan.insert(
    "agent_runs",
    [{
      project_id: project.id,
      issue_id: issue.id,
      created_by: people.camille,
      // Au repos : ni le drain (qui ne réclame que `queued`) ni le sweeper
      // (qui ne relève que `running`) ne peuvent le reprendre.
      status: "completed",
      awaiting_input: true,
      triggered_by: "button",
      prompt: RUN.prompt,
      model: RUN.model,
      key_mode: "platform",
      base_branch: RUN.base_branch,
      branch_name: RUN.branch_name,
      continuations: 0,
      attempts: 1,
      cost_usd: 0.42,
      outcome: "awaiting_reply",
      started_at: startedAt,
      window_started_at: startedAt,
      last_activity_at: startedAt,
      created_at: startedAt,
      updated_at: startedAt,
    }],
    "run d'agent",
  );
  console.log(runPlan.describe());
  const inserted = await runPlan.apply({ confirmed: true });
  const run = inserted.agent_runs[0];

  // Les événements s'ancrent sur le run : ils ne peuvent partir qu'après lui.
  const base = Date.parse(startedAt);
  const eventPlan = createPlan(world);
  eventPlan.insert(
    "agent_run_events",
    EVENTS.map((event, i) => ({
      run_id: run.id,
      seq: i + 1,
      type: event.type,
      payload: event.payload,
      // 40 s entre chaque étape : un rythme d'agent crédible à la lecture.
      created_at: new Date(base + i * 40_000).toISOString(),
    })),
    "événement",
  );
  console.log(eventPlan.describe());
  await eventPlan.apply({ confirmed: true });

  console.log(
    `  → run créé sur ${TARGET.project}-${TARGET.number} « ${issue.title} » avec ${EVENTS.length} événements`,
  );
}

await main();
