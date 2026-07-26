/**
 * 006 — une conversation avec Numo.
 *
 * Pour quelle capture : `numoPanel` — « une instruction de l'utilisateur, la
 * réponse de Numo, et deux ou trois appels d'outils dépliés (recherche de
 * tickets, mise à jour groupée) ».
 *
 * Le badge « Ticket en contexte » de l'en-tête n'est PAS une donnée : il est
 * rendu à partir de la page ouverte au moment de la capture
 * (`components/assistant/page-context-badge.tsx`). Il suffit d'ouvrir le
 * panneau depuis un ticket pour qu'il apparaisse.
 *
 * Forme des lignes, imposée par le schéma (20260707160000_assistant) :
 *   - `tool_calls` = [{ id, type: 'function', function: { name, arguments } }],
 *     `arguments` étant du JSON SÉRIALISÉ, pas un objet ;
 *   - une ligne `role: 'tool'` par appel, portant `tool_call_id` et `tool_name`.
 *
 * Idempotent : la conversation est reconnue à son titre.
 *
 *   node captures/world/seed/006-numo.mjs --dry-run
 *   node captures/world/seed/006-numo.mjs
 */
import { openDemoWorld, createPlan } from "../../lib/guards.mjs";
import { resolvePeople, requireProject } from "./_people.mjs";
import { currentCycleWindow, spreadInWindow } from "./_cycle-window.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const TITLE = "Sweep the unassigned backlog";

/** Les appels d'outils, avec le nom réel des outils de Numo (lib/server/assistant/tools.ts). */
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
 * Ce que la conversation raconte est aussi ce que la base contient : le script
 * applique la même modification aux tickets. Un fil qui annonce un changement
 * que le board dément se remarque tout de suite sur une capture.
 */
const BUMPED = ["AUR-11", "AUR-7"];
const UPDATE_RESULT = { updated: BUMPED.length, identifiers: BUMPED };

/**
 * Le déroulé, en SECONDES depuis le premier message.
 *
 * L'app affiche la durée d'un tour de travail (« A travaillé pendant … »,
 * `Agent.workedForMinutes`) en soustrayant le premier horodatage du dernier.
 * Le fil tenait sur douze minutes rondes, ce qui est invraisemblable pour deux
 * recherches et une mise à jour groupée — et le « et 0 seconde » d'une durée
 * pile sonnait faux. Une minute trois, avec des intervalles inégaux : le temps
 * de lire un résultat n'est pas celui d'écrire une phrase.
 */
const TIMELINE = [0, 4, 9, 31, 38, 63];

/** Les six horodatages du fil, dans l'ordre. Partagés par la création et le
    réalignement, pour qu'il n'existe qu'une seule définition du déroulé. */
function timelineFor(window) {
  const base = Date.parse(spreadInWindow(window, 1, 14));
  return TIMELINE.map((seconds) => new Date(base + seconds * 1000).toISOString());
}

/**
 * Le fil, dans l'ordre. Il est daté dans la quinzaine courante — la
 * conversation doit être récente pour que l'horodatage affiché ait l'air vivant.
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
 * Redate les messages d'une conversation déjà en base sur le déroulé courant.
 *
 * Le script est idempotent par le TITRE : une conversation déjà là est laissée
 * telle quelle, et changer `TIMELINE` ne suffirait donc pas à corriger ce qui
 * est photographié. Même logique qu'`applyBump` : on réaligne l'existant au
 * lieu de tout détruire pour tout recréer.
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

  // `conversations.updated_at` n'est PAS à nous : le trigger
  // `conversations_set_updated_at` (migration 20260707160000_assistant) le
  // repose à `now()` à chaque UPDATE. Le viser ne changerait rien et laisserait
  // le script réclamer la même modification à chaque exécution. Il ne se voit
  // pas sur la capture — la liste range la conversation sous « Aujourd'hui »,
  // ce que `now()` donne de toute façon.
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

/** Applique aux tickets la mise à jour groupée que la conversation annonce. */
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

  // Le résultat annoncé par le fil, réellement appliqué aux tickets. Fait
  // AVANT le test d'idempotence pour qu'une conversation déjà là ne laisse pas
  // les priorités désalignées.
  await applyBump(world, project);

  if ((existing || []).length > 0) {
    console.log(`  → conversation « ${TITLE} » déjà là, contenu laissé tel quel`);
    // Le déroulé, lui, se rattrape : c'est lui qui donne la durée affichée.
    await alignTimeline(world, existing[0], window);
    return;
  }

  // Deux temps obligatoires : les messages s'ancrent sur la conversation, et
  // un parent n'est reconnu du monde de démo qu'une fois appliqué.
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
