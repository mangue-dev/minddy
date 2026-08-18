/**
 * 006 — a conversation with Numo.
 *
 * For which capture: `numoPanel` — “a user instruction, the
 * response from Numo, and two or three calls for unfolded tools (search for
 * tickets, bulk update)”.
 *
 * The “Ticket in context” badge in the header is NOT data: it is
 * rendered from the page open at capture time
 * (`components/assistant/page-context-badge.tsx`). Just open the
 * panel from a ticket for it to appear.
 *
 * Shape of the lines, imposed by the diagram (20260707160000_assistant):
 *   - `tool_calls` = [{ id, type: 'function', function: { name, arguments } }],
 * `arguments` being SERIALIZED JSON, not an object;
 * - one `role: 'tool'` line per call, carrying `tool_call_id` and `tool_name`.
 *
 * Idempotent: the conversation is recognized by its title.
 *
 *   node captures/world/seed/006-numo.mjs --dry-run
 *   node captures/world/seed/006-numo.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const TITLE = "Sweep the unassigned backlog";

/** Tool calls, with the actual name of Numo's tools (lib/server/assistant/tools.ts). */
const SEARCH_CALL = "call_hxq2r7";
const UPDATE_CALL = "call_m4t8vd";

const SEARCH_RESULT = {
  issues: [
    { identifier: "AUR-10", title: "Slack notifications for mentions", status: "backlog", priority: "medium" },
    { identifier: "AUR-11", title: "Public roadmap page", status: "backlog", priority: "low" },
    { identifier: "AUR-7", title: "Export a project as CSV", status: "todo", priority: "low" },
  ],
  total: 3,
};

/**
 * What the conversation says is also what the database contains: the script
 * applies the same change to tickets. A thread that announces a change
 * that the crazy board is immediately noticed on a capture.
 */
const BUMPED = ["AUR-11", "AUR-7"];
const UPDATE_RESULT = { updated: BUMPED.length, identifiers: BUMPED };

/**
 * The sequence, in SECONDS from the first message.
 *
 * The app displays the duration of a shift (“Worked for…”),
 * `Agent.workedForMinutes`) by subtracting the first timestamp from the last.
 * The thread lasted for twelve full minutes, which is incredible for two
 * searches and a bulk update — and the “and 0 seconds” of a duration
 * tails sounded wrong. One minute three, with unequal intervals: time
 * reading a result is not like writing a sentence.
 */
const TIMELINE = [0, 4, 9, 31, 38, 63];

/** The thread's six timestamps, in order. Shared by creation and
 realignment, so that there is only one definition of the unfolding. */
function timelineFor(window) {
  const base = Date.parse(spreadInWindow(window, 1, 14));
  return TIMELINE.map((seconds) => new Date(base + seconds * 1000).toISOString());
}

/**
 * The thread, in order. It is dated in the current fortnight — the
 * conversation must be recent for the displayed timestamp to look lively.
 */
function buildMessages(conversationId, window) {
  const stamps = timelineFor(window);
  const at = (index) => stamps[index];

  return [
    {
      conversation_id: conversationId,
      role: "user",
      content:
        "Nobody owns anything in the Aurora backlog. Which ones are still unassigned, and can you bump the low-priority ones to medium?",
      created_at: at(0),
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content: "Let me pull the unassigned ones first.",
      tool_calls: [
        {
          id: SEARCH_CALL,
          type: "function",
          function: {
            name: "search_issues",
            arguments: JSON.stringify({ assignee: "unassigned", status: ["backlog", "todo"] }),
          },
        },
      ],
      created_at: at(1),
    },
    {
      conversation_id: conversationId,
      role: "tool",
      tool_call_id: SEARCH_CALL,
      tool_name: "search_issues",
      content: JSON.stringify(SEARCH_RESULT),
      created_at: at(2),
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content:
        "Three are unassigned. AUR-10 is already medium, so I'll leave it. Bumping the other two.",
      tool_calls: [
        {
          id: UPDATE_CALL,
          type: "function",
          function: {
            name: "update_issues",
            arguments: JSON.stringify({ issues: BUMPED, priority: "medium" }),
          },
        },
      ],
      created_at: at(3),
    },
    {
      conversation_id: conversationId,
      role: "tool",
      tool_call_id: UPDATE_CALL,
      tool_name: "update_issues",
      content: JSON.stringify(UPDATE_RESULT),
      created_at: at(4),
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content:
        "Done — AUR-11 and AUR-7 are medium now. Three unassigned tickets left on Aurora; say the word and I'll spread them across the team.",
      created_at: at(5),
    },
  ];
}

/**
 * Redates the messages of a conversation already based on the current progress.
 *
 * The script is idempotent by the TITLE: a conversation already there is left
 * as is, and changing `TIMELINE` would therefore not be enough to correct what
 * is photographed. Same logic as `applyBump`: we realign the existing
 * instead of destroying everything to recreate everything.
 */
async function alignTimeline(world, conversation, window) {
  const { data, error } = await world.admin
    .from("assistant_messages")
    .select("id, role, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`captures: lecture des messages — ${error.message}`);

  const messages = data || [];
  const stamps = timelineFor(window);
  if (messages.length !== stamps.length) {
    throw new Error(
      `captures: la conversation « ${TITLE} » porte ${messages.length} messages, ` +
        `le déroulé en décrit ${stamps.length}. Réaligner à l'aveugle daterait ` +
        `les mauvaises lignes — corriger TIMELINE, ou la conversation.`,
    );
  }

  const drifted = messages
    .map((message, index) => ({ message, want: stamps[index] }))
    .filter(({ message, want }) => Date.parse(message.created_at) !== Date.parse(want));

  // `conversations.updated_at` is NOT ours: the trigger
  // `conversations_set_updated_at` (migration 20260707160000_assistant) on
  // rests at `now()` on each UPDATE. Aiming it wouldn't change anything and would leave
  // the script will claim the same change each time it is run. He doesn't see himself
  // not on the capture - the list puts the conversation under "Today",
  // which `now()` gives anyway.
  if (drifted.length === 0) {
    console.log("  → déroulé déjà à l'heure : rien à redater");
    return;
  }

  const span = (TIMELINE[TIMELINE.length - 1] - TIMELINE[0]) / 60;
  console.log(
    `  Redater le fil sur ${Math.floor(span)} min ${(TIMELINE[TIMELINE.length - 1] % 60)} s ` +
      `(${drifted.length} message(s) à déplacer)`,
  );

  const plan = createPlan(world);
  for (const { message, want } of drifted) {
    plan.update("assistant_messages", { id: message.id }, { created_at: want }, `message ${message.role}`);
  }
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
}

/** Applies the bulk update that the conversation announces to tickets. */
async function applyBump(world, project) {
  const numbers = BUMPED.map((id) => Number(id.split("-")[1]));
  const { data, error } = await world.admin
    .from("issues")
    .select("id, number, priority")
    .eq("project_id", project.id)
    .in("number", numbers);
  if (error) throw new Error(`captures: lecture des tickets à repriorer — ${error.message}`);

  const stale = (data || []).filter((i) => i.priority !== "medium");
  if (stale.length === 0) {
    console.log("  → priorités déjà alignées sur ce que dit la conversation");
    return;
  }
  const plan = createPlan(world);
  for (const issue of stale) {
    plan.update("issues", { id: issue.id }, { priority: "medium" }, `${project.key}-${issue.number}`);
  }
  console.log(plan.describe());
  await plan.apply({ confirmed: true });
}

async function main() {
  const window = currentCycleWindow();

  if (DRY_RUN) {
    console.log("Ce que ce script créerait (rien n'est écrit) :\n");
    console.log(`  • Créer 1 conversation Numo « ${TITLE} » sur le projet Aurora, pour Camille`);
    console.log("  • Créer 6 messages :");
    for (const m of buildMessages("—", window)) {
      const tools = (m.tool_calls || []).map((t) => t.function.name).join(", ");
      const label = m.role === "tool" ? `résultat de ${m.tool_name}` : m.content?.slice(0, 70);
      console.log(`      - [${m.role}] ${label}${tools ? ` · appelle ${tools}` : ""}`);
    }
    console.log(`  • Passer ${BUMPED.join(" et ")} en priorité « medium » — ce que la conversation annonce`);
    return;
  }

  const world = await openDemoWorld();
  const people = resolvePeople(world);
  const project = requireProject(world, "AUR");

  const { data: existing, error } = await world.admin
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", people.camille)
    .eq("project_id", project.id)
    .eq("title", TITLE);
  if (error) throw new Error(`captures: lecture des conversations — ${error.message}`);

  // The result announced by the thread, actually applied to tickets. Do
  // BEFORE the idempotence test so that a conversation already there does not leave
  // misaligned priorities.
  await applyBump(world, project);

  if ((existing || []).length > 0) {
    console.log(`  → conversation « ${TITLE} » déjà là, contenu laissé tel quel`);
    // The sequence, for its part, catches up: it is this which gives the displayed duration.
    await alignTimeline(world, existing[0], window);
    return;
  }

  // Two obligatory steps: the messages are anchored in the conversation, and
  // a parent is only recognized from the demo world once applied.
  const conversationPlan = createPlan(world);
  conversationPlan.insert(
    "conversations",
    [{
      project_id: project.id,
      user_id: people.camille,
      title: TITLE,
      status: "idle",
      created_at: spreadInWindow(window, 0.98, 14),
      updated_at: spreadInWindow(window, 1, 14),
    }],
    "conversation",
  );
  console.log(conversationPlan.describe());
  const inserted = await conversationPlan.apply({ confirmed: true });
  const conversation = inserted.conversations[0];

  const messagePlan = createPlan(world);
  messagePlan.insert("assistant_messages", buildMessages(conversation.id, window), "message");
  console.log(messagePlan.describe());
  await messagePlan.apply({ confirmed: true });
  console.log("  → conversation Numo créée avec 6 messages");
}

await main();
