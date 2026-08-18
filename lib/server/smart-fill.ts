import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import { hasUsageBudget } from "@/lib/server/usage";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  isEffort,
  isPriority,
  type IssueEffortValue,
  type IssuePriorityValue,
} from "@/lib/issue-validation";

/**
 * SMART-FILL (MIN-260) — WHAT THE TICKET IS, deduced from what we have just written.
 *
 * The form asks for seven properties on each ticket. Four are read in the
 * title and description — priority, effort, categories, objective —
 * and putting them back by hand each time is the gesture that this pass eliminates.
 * The other three are not there: the status, the assigned and the deadline say a
 * intention, not content, and Smart-fill never touches it.
 *
 * **It turns BEFORE the insert**, in the POST of creation
 * ([create-issue.ts](create-issue.ts)) — not in `after()` like the AI ​​half of
 * Smart Assign. This is what keeps the promise “the ticket does not appear in the
 * board only once filled”: the line is born complete, so there is no line to
 * hide, neither “being filled” column, nor filter to place on the
 * readings and on the live feed, nor a sweep for the lines that remained invisible. Nothing
 * all of this is not blocking the screen however: the dialog is already not waiting
 * the POST (see `createIssue` in lib/use-issues-query.ts), it closes and places a
 * toast.
 *
 * **It never raises or fails a creation.** No key, no
 * budget, silent model, JSON crooked: the patch is empty and the ticket is born
 * as it was written. A ticket without priority is a ticket; a creation that
 * fails because a help failed, no.
 *
 * **Who pays: the one who activated the scale**, therefore the author of the ticket - and not the
 * project owner as Smart Assign. It's not an inconsistency, it's the same
 * rule applied to two different settings: Smart Assign is a DU setting
 * PROJECT, which the owner activates for everyone; Smart-fill is a preference
 * IN ACCOUNT, let each arm for himself and cut by ticket. The payer follows the
 * person who decides.
 */

/** The patch that Smart-fill knows how to install — the four fields that can be deduced, and
 * never one more. An absent field = the model was unable to say anything about it. */
export interface SmartFillPatch {
  priority?: IssuePriorityValue;
  effort?: IssueEffortValue | null;
  category_ids?: string[];
  objective_id?: string | null;
}

/** What the model has the right to name: the real categories and the real
 * project objectives. Nothing is created — associate or leave blank. */
export interface SmartFillContext {
  categories: { id: string; name: string }[];
  objectives: { id: string; name: string; status: string }[];
}

/** Title/description truncated before prompt: a ticket pasted from a document
 * whole must not cause the cost of storage to drift. */
const MAX_TITLE_CHARS = 500;
const MAX_DESCRIPTION_CHARS = 4000;
/** Beyond that, the list no longer guides the model, it drowns it out — and a project to
 * three hundred goals is not an OBVIOUS goal anyway. */
const MAX_CONTEXT_ITEMS = 60;
/** More categories than that on a ticket means a ticket that is no longer stored. */
const MAX_CATEGORIES_PER_ISSUE = 3;

/**
 * THE SENTINEL OF “NOTHING” — `"none"`, not `null`.
 *
 * Two reasons, and the second is the real one. First a union type
 * (`["string", "null"]`) is not accepted everywhere in strict function calls,
 * and a refused schema is NOT seen: the call returns `null`, the patch is empty,
 * and the tickets simply stop being filled without anything saying so.
 * Then a small model responds much better to a value it can choose
 * in a list than an absence that it must produce.
 */
const NONE = "none";

/**
 * The patch, filtered against REAL project ids and field enums.
 *
 * Pure, and that's where everything that can go wrong lives: a model that invents a
 * objective id despite the enum, which renders `"critical"` instead of `"urgent"`, which
 * places the ticket in eight categories, or which answers `"none"` where the diagram
 * don't offer it. Nothing he renders is written without being acknowledged here.
 */
export function sanitizeSmartFill(
  raw: Record<string, unknown> | null,
  ctx: SmartFillContext,
): SmartFillPatch {
  if (!raw) return {};
  const patch: SmartFillPatch = {};

  // `none` is a valid priority, but it is the DEFAULT of the form: the
  // asking learns nothing and would pass off "the model did not know" for "the
  // model judged that it was without priority.
  if (isPriority(raw.priority) && raw.priority !== "none") patch.priority = raw.priority;

  // The effort is void on the ticket side, and “nothing valuable” is a REAL
  // response (a one-line ticket, a question): it arrives in `"none"` —
  // the sentinel of the schema — and translates to `null`. The literal `null` is
  // also accepted: this is what a model renders spontaneously despite the diagram.
  if (raw.effort === NONE || raw.effort === null) patch.effort = null;
  else if (isEffort(raw.effort)) patch.effort = raw.effort;

  if (Array.isArray(raw.category_ids)) {
    const known = new Set(ctx.categories.map((c) => c.id));
    const ids = [
      ...new Set(
        raw.category_ids.filter((id): id is string => typeof id === "string" && known.has(id)),
      ),
    ];
    if (ids.length > 0) patch.category_ids = ids.slice(0, MAX_CATEGORIES_PER_ISSUE);
  }

  // An objective cannot be GUESSED: without clear correspondence, the field remains
  // empty. The prompt says it, and this guard holds it — a ticket tucked under the
  // bad objective costs more to undo than a ticket with no objective.
  // `"none"` has nothing to fix: the field is simply not set, and
  // no lens can carry this id (these are UUIDs).
  if (typeof raw.objective_id === "string" && ctx.objectives.some((o) => o.id === raw.objective_id))
    patch.objective_id = raw.objective_id;

  return patch;
}

/** The system prompt. Explicitly separates what is valued (priority, effort) from
 * what is RECOGNIZED (categories, objective): the first two have always
 * an answer, the other two only have one if there is something. */
export function buildSmartFillPrompt(projectName: string, ctx: SmartFillContext): string {
  const categoryLines =
    ctx.categories
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((c) => `- "${c.name}" (id: ${c.id})`)
      .join("\n") || "None — leave category_ids empty.";
  const objectiveLines =
    ctx.objectives
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((o) => `- "${o.name}" (id: ${o.id}) [${o.status}]`)
      .join("\n") || "None — objective_id must be \"none\".";

  return `You are Smart-fill, minddy's issue triager for the project "${projectName}".
Someone just wrote a new issue. Read its title and description and call fill_issue once with its properties.

Rules:
- You MUST call fill_issue. Never refuse, never reply in plain text. Answer EVERY argument.
- priority: how urgent the work reads. Default to "medium" when the text gives no signal; keep "urgent" for outages, data loss and blockers.
- effort: t-shirt size of the work described, from the writer's point of view. "xs" is a one-line change, "xl" a multi-week project. Answer "none" only when the text describes nothing estimable (a question, a note).
- category_ids: pick ONLY from the list below, at most ${MAX_CATEGORIES_PER_ISSUE}, and only those the issue clearly belongs to. Empty is a fine answer. Never invent an id, never propose a new category.
- objective_id: pick an EXISTING objective from the list below only if the issue plainly belongs to it. Otherwise answer "none". Never invent one. A wrong objective is worse than none.
- Judge the issue on what it says, not on what it might become.

## Categories of this project
${categoryLines}

## Objectives of this project
${objectiveLines}`;
}


/**
 * The tool schema, built WITH the context: the possible ids are
 * `enum`, as the member list is for Smart Assign. The model cannot
 * donc pas inventer un id — il peut encore en choisir un mauvais, ce que
 * `sanitizeSmartFill` ne rattrapera pas, mais il ne peut plus en fabriquer.
 *
 * ALL fields are `required`. An argument presented as optional is not
 * just not answered by a small model, and Smart-fill turns by
 * construction on a fast model: “no response” must be a VALUE.
 */
function fillParameters(ctx: SmartFillContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
      effort: {
        type: "string",
        enum: [...ISSUE_EFFORTS, NONE],
        description: `T-shirt size, or "${NONE}" when nothing is estimable.`,
      },
      category_ids: {
        type: "array",
        items: { type: "string", enum: ctx.categories.map((c) => c.id) },
        description: `Ids of the matching categories. Empty array when none match.`,
      },
      objective_id: {
        type: "string",
        enum: [...ctx.objectives.map((o) => o.id), NONE],
        description: `Id of the objective this issue belongs to, or "${NONE}".`,
      },
    },
    required: ["priority", "effort", "category_ids", "objective_id"],
  };
}

/**
 * The categories and objectives of the project. Customer SERVICE: this pass runs
 * in the creation POST, where the caller's session exists — but it serves
 * also creations without humans in front (MCP, integrations), and read by a
 * single path prevents one day one of the two paths from rendering an empty list without
 * let no one see it.
 */
async function gatherContext(projectId: string): Promise<SmartFillContext> {
  const service = getServiceClient();
  const [{ data: categories }, { data: objectives }] = await Promise.all([
    service.from("categories").select("id, name").eq("project_id", projectId),
    service
      .from("objectives")
      .select("id, name, status")
      .eq("project_id", projectId)
      // A completed or abandoned objective does not accommodate a ticket that arises:
      // proposing it to the model is inviting him to reopen closed work.
      .in("status", ["planned", "in_progress"]),
  ]);
  return {
    categories: (categories ?? []) as SmartFillContext["categories"],
    objectives: (objectives ?? []) as SmartFillContext["objectives"],
  };
}

/**
 * The entry point. Makes the patch to merge into the row before the insert, or
 * an EMPTY patch — never an exception, never a failed creation.
 */
export async function runSmartFill({
  projectId,
  projectName,
  actorId,
  title,
  description,
}: {
  projectId: string;
  projectName: string;
  /** Who creates, therefore who pays. Without it (integration, webhook), we do not complete
   * not: an expense that cannot be attributed to anyone is not incurred. */
  actorId: string | null;
  title: string;
  description: string | null;
}): Promise<SmartFillPatch> {
  if (!actorId || !title.trim()) return {};
  try {
    const config = await getAppConfigValues([
      "smart_fill_enabled",
      ...modelConfigKeys("smart_fill_model"),
    ]);
    const enabled = (config["smart_fill_enabled"] ?? aiModelFallback("smart_fill_enabled")) !== "false";
    if (!enabled) return {};
    // The budget of THE ONE WHO ARMED the scale, as for dictation. Dry, we
    // does not fill out — and the ticket is still born.
    if (!(await hasUsageBudget(actorId, "automations"))) return {};

    const { model } = resolveFromValues("smart_fill_model", config);
    const ctx = await gatherContext(projectId);

    const raw = await forcedToolCall(
      model,
      buildSmartFillPrompt(projectName, ctx),
      `## Issue\nTitle: ${title.slice(0, MAX_TITLE_CHARS)}\nDescription: ${
        description?.trim() ? description.slice(0, MAX_DESCRIPTION_CHARS) : "(none)"
      }`,
      "fill_issue",
      fillParameters(ctx),
      {
        xTitle: "minddy Smart-fill",
        logPrefix: "smart-fill",
        modelKey: "smart_fill_model",
        maxTokens: 256,
        // Someone is waiting in front of their screen: beyond that, the ticket must be born
        // without its filling rather than making you wait a minute.
        timeoutMs: 20_000,
        record: { feature: "smart_fill", billTo: { userId: actorId }, projectId },
      },
    );
    return sanitizeSmartFill(raw, ctx);
  } catch (err) {
    console.error("[smart-fill] fill failed:", (err as Error).message);
    return {};
  }
}
