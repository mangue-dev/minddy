/**
 * 008 — a code agent run on a ticket, delegated by Numo.
 *
 * For which capture: `workflowAgent` — “Numo gathers the project context and
 * delegates repository work to a code worker… Follow the work in the
 * conversation”. The dedicated `/agents` page is RETIRED: a run now lives in
 * a Numo conversation as delegated work — a `launch_code_agent` tool call in
 * the parent thread renders the delegated-work card, and the worker's own
 * thread stays one "View" click away. The seed therefore builds both halves:
 * the run (below), and the parent conversation that delegates to it.
 *
 * THE STATUS IS NOT FREE. The run is seeded in `completed` + `awaiting_input`,
 * that is to say “the agent has finished his turn and is waiting for the continuation” — the thread is
 * complete, the composer is ready. The two statuses which would resemble
 * more than “in progress” are prohibited here:
 * - `queued`: the drain cron would request it on the next pass;
 * - `running`: `requeueStuckRuns` re-queues any run started more recently
 *                 de 6 minutes (lib/server/agent/runs.ts).
 * In both cases the agent would REALLY be launched: microVM, LLM calls
 * billed, and attempt to write to a deposit. A state at rest is the only
 * which lasts over time.
 *
 * No pull request: `pr_number` remains null. The diff displayed by minddy is
 * read LIVE at GitHub/GitLab (app/api/agent-runs/[runId]/pr) — none
 * given in base cannot manufacture it.
 *
 * The parent conversation's tool result is NOT free either: the
 * `numo_work_origins` view (migration 20270106670000) only links a worker to
 * its parent when the `launch_code_agent` tool row carries
 * `metadata.success = "true"`, a `launched: true` result and the run id —
 * and `run.created_by` must equal the conversation's user. Without that link
 * the run keeps a standalone conversation in the list and the card never
 * appears.
 *
 * Idempotent: an existing run on the targeted ticket is left as is, and an
 * existing delegation conversation is left as is.
 *
 *   node captures/world/seed/008-agent.mjs --dry-run
 *   node captures/world/seed/008-agent.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

/** The worked ticket: the one that already has an implementation plan. */
const TARGET = { project: "AUR", number: 2 };

const RUN = {
  model: "anthropic/claude-sonnet-4.5",
  base_branch: "main",
  branch_name: "numo/aur-2-palette-shortcuts",
  prompt: "Start with the global listener, and keep the sequence handling out of the row component.",
  /** Stamped on the run like the real titler does; the delegated-work card
      prefers it over the raw launch objective. */
  title: "Add keyboard shortcuts to the command palette",
};

/**
 * The parent Numo conversation that delegates to the run. Same title as the
 * run it carries: once the origin link exists, the worker's standalone
 * conversation leaves the list and this one carries the topic.
 */
const DELEGATION = {
  title: "Add keyboard shortcuts to the command palette",
  user:
    "Implement AUR-2 for me — add the keyboard shortcuts on the command palette, following the issue's plan.",
  narration: "Reading the issue, its plan and the palette sources first.",
  objective:
    "Implement the keyboard shortcuts on the command palette (AUR-2), following the issue's plan: declare the shortcut on each action, render the hint on the right of every row, and bind the global listener.",
};

/**
 * The execution thread. The forms of `payload` are those that the loop emits
 * de l'agent (lib/server/agent/agent-loop.ts) : `tool_call` porte l'argument
 * summarized by `toolArgSummary`, `tool_result` a truncated preview.
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
    .select("id, status, title, conversation_id, started_at, last_activity_at")
    .eq("issue_id", issue.id);
  if (runError) throw new Error(`captures: lecture des runs — ${runError.message}`);

  if ((runs || []).length > 0) {
    const run = runs[0];
    console.log(`  → un run existe déjà sur ${TARGET.project}-${TARGET.number}, laissé tel quel`);
    await seedDelegation(world, people, project, issue, run);
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
      // At rest: neither the drain (which only requires `queued`) nor the sweeper
      // (which only relates to `running`) cannot take it back.
      status: "completed",
      awaiting_input: true,
      triggered_by: "button",
      prompt: RUN.prompt,
      title: RUN.title,
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

  // The events are anchored on the run: they can only leave after it.
  const base = Date.parse(startedAt);
  const eventPlan = createPlan(world);
  eventPlan.insert(
    "agent_run_events",
    EVENTS.map((event, i) => ({
      run_id: run.id,
      seq: i + 1,
      type: event.type,
      payload: event.payload,
      // 40 seconds between each step: a credible agent pace when reading.
      created_at: new Date(base + i * 40_000).toISOString(),
    })),
    "événement",
  );
  console.log(eventPlan.describe());
  await eventPlan.apply({ confirmed: true });

  console.log(
    `  → run créé sur ${TARGET.project}-${TARGET.number} « ${issue.title} » avec ${EVENTS.length} événements`,
  );

  await seedDelegation(world, people, project, issue, run);
}

/**
 * The parent Numo conversation that delegates to the run: a user request, the
 * assistant's `launch_code_agent` narration with the delegated-work card, and
 * the tool result that binds the run. The worker's own thread (prompt +
 * summary, anchored on the run's agent conversation) projects into this same
 * conversation and closes the exchange — no Numo answer of its own: the
 * worker's report is the one that asks the follow-up question.
 */
async function seedDelegation(world, people, project, issue, run) {
  // The titler stamps this title on real runs; stamp it here when missing so
  // the card and its detail sheet carry the topic, not the raw objective.
  if (!run.title) {
    const stamp = createPlan(world);
    stamp.update("agent_runs", { id: run.id }, { title: RUN.title }, "titre du run");
    console.log(stamp.describe());
    await stamp.apply({ confirmed: true });
    console.log(`  → run renommé « ${RUN.title} »`);
  }

  const { data: existing, error } = await world.admin
    .from("conversations")
    .select("id")
    .eq("user_id", people.camille)
    .eq("project_id", project.id)
    .eq("title", DELEGATION.title);
  if (error) throw new Error(`captures: lecture des conversations — ${error.message}`);
  if ((existing || []).length > 0) {
    console.log(`  → conversation « ${DELEGATION.title} » déjà là, contenu laissé tel quel`);
    return;
  }

  const base = Date.parse(run.started_at ?? run.created_at);
  const toolCallId = "call_launch_aur2";

  const conversationPlan = createPlan(world);
  conversationPlan.insert(
    "conversations",
    [{
      project_id: project.id,
      user_id: people.camille,
      title: DELEGATION.title,
      status: "idle",
      created_at: new Date(base - 2 * 60_000).toISOString(),
      updated_at: new Date(base - 30_000).toISOString(),
    }],
    "conversation",
  );
  console.log(conversationPlan.describe());
  const insertedConversation = await conversationPlan.apply({ confirmed: true });
  const conversation = insertedConversation.conversations[0];

  const messagePlan = createPlan(world);
  messagePlan.insert(
    "assistant_messages",
    [
      {
        conversation_id: conversation.id,
        role: "user",
        content: DELEGATION.user,
        metadata: {},
        created_at: new Date(base - 2 * 60_000).toISOString(),
      },
      {
        conversation_id: conversation.id,
        role: "assistant",
        content: DELEGATION.narration,
        tool_calls: [{
          id: toolCallId,
          type: "function",
          function: {
            name: "launch_code_agent",
            arguments: JSON.stringify({
              issue_id: issue.id,
              mode: "implement",
              objective: DELEGATION.objective,
            }),
          },
        }],
        metadata: {},
        created_at: new Date(base - 60_000).toISOString(),
      },
      {
        conversation_id: conversation.id,
        role: "tool",
        tool_call_id: toolCallId,
        tool_name: "launch_code_agent",
        // The exact shape the loop writes (lib/server/assistant/execute-tool.ts);
        // `numo_work_origins` matches `run_id` and `launched` on it, and
        // `metadata.success` opens the link.
        content: JSON.stringify({
          launched: true,
          mode: "implement",
          run_id: run.id,
          conversation_id: run.conversation_id,
          status: "completed",
          model: RUN.model,
        }),
        metadata: { success: true },
        created_at: new Date(base - 30_000).toISOString(),
      },
    ],
    "message",
  );
  console.log(messagePlan.describe());
  await messagePlan.apply({ confirmed: true });
  console.log(`  → conversation « ${DELEGATION.title} » créée : délégation liée au run`);
}

await main();
