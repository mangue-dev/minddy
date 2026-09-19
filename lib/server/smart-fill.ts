import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { hasUsageBudget } from "@/lib/server/usage";
import { runDecision } from "@/lib/server/decisions/runner";
import { buildSmartFillSpec } from "@/lib/server/decisions/prepare";
import type { DecisionAnswers } from "@/lib/server/decisions/types";
import { resolveSmartFill, resolveSmartFillScope, type SmartFillScope } from "@/lib/smart-fill";
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
 * **One pass, two engines (MIN-563).** The judgment runs through the decision
 * layer ([decisions/runner.ts](decisions/runner.ts)): Jev answers on the
 * structured state first, and the LLM pass below (`buildSmartFillPrompt`,
 * `fillParameters`) is replayed verbatim as the fallback. `sanitizeSmartFill`
 * stays the single door every answer walks through, whichever engine said it.
 *
 * **Who pays: the account tied to the creation.** `resolveSmartFillPayer`
 * resolves that account from the direct actor, Numo user, MCP key creator,
 * integration creator, or project owner for owner-managed triage. Smart Fill
 * then checks that account's preferences and automation budget.
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

export interface SmartFillPayerInput {
  projectId: string;
  actorId: string | null;
  integrationId?: string | null;
  mcpKeyId?: string | null;
  status: unknown;
  explicit?: unknown;
  /** Feedback promotion belongs to the owner's triage flow even when a member
   * performs the promotion and the resulting issue lands outside triage. */
  ownerBilledTriage?: boolean;
  /** Forge imports and recurrence copies are not new user-linked creations. */
  excluded?: boolean;
}

/**
 * Resolves who owns and pays for an automatic Smart Fill pass.
 *
 * Provenance is authoritative: integration and MCP rows identify their creator,
 * Numo/direct web creations use the acting user, and unattributed triage belongs
 * to the project owner. An explicit per-ticket opt-in can re-enable a disabled
 * automatic scope, but it never overrides the account-wide master switch.
 */
export async function resolveSmartFillPayer(
  input: SmartFillPayerInput,
): Promise<{ userId: string; scope: SmartFillScope } | null> {
  try {
    return await resolveSmartFillPayerUnsafe(input);
  } catch (err) {
    console.error("[smart-fill] payer resolution failed:", (err as Error).message);
    return null;
  }
}

async function resolveSmartFillPayerUnsafe(
  input: SmartFillPayerInput,
): Promise<{ userId: string; scope: SmartFillScope } | null> {
  if (input.explicit === false || input.excluded) return null;

  const service = getServiceClient();
  const scope: SmartFillScope =
    input.ownerBilledTriage || input.status === "triage" ? "triage" : "created";
  let userId: string | null = null;

  if (input.ownerBilledTriage) {
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", input.projectId)
      .maybeSingle();
    userId = (data?.owner_id as string | null | undefined) ?? null;
  } else if (input.integrationId) {
    const { data } = await service
      .from("integrations")
      .select("created_by")
      .eq("id", input.integrationId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    userId = (data?.created_by as string | null | undefined) ?? null;
  } else if (input.mcpKeyId) {
    const { data } = await service
      .from("api_keys")
      .select("user_id")
      .eq("id", input.mcpKeyId)
      .maybeSingle();
    userId = (data?.user_id as string | null | undefined) ?? null;
  } else if (input.actorId) {
    userId = input.actorId;
  } else if (scope === "triage") {
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", input.projectId)
      .maybeSingle();
    userId = (data?.owner_id as string | null | undefined) ?? null;
  }

  if (!userId) return null;
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  if (!resolveSmartFill(meta)) return null;
  if (input.explicit !== true && !resolveSmartFillScope(meta, scope)) return null;
  return { userId, scope };
}

/** Title/description truncated before prompt: a ticket pasted from a document
 * whole must not cause the cost of storage to drift. Exported for the
 * decision layer, whose builders truncate the structured state the same way. */
export const MAX_TITLE_CHARS = 500;
export const MAX_DESCRIPTION_CHARS = 4000;
/** Beyond that, the list no longer guides the model, it drowns it out — and a project to
 * three hundred goals is not an OBVIOUS goal anyway. */
export const MAX_CONTEXT_ITEMS = 60;
/** More categories than that on a ticket means a ticket that is no longer stored. */
export const MAX_CATEGORIES_PER_ISSUE = 3;

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
export const SMART_FILL_NONE = "none";

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
  if (raw.effort === SMART_FILL_NONE || raw.effort === null) patch.effort = null;
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
 * The user message of the pass: the issue itself, truncated to the same
 * ceilings as the prompt lists. Exported for the decision layer, which
 * replays the pass verbatim as its LLM fallback (MIN-562).
 */
export function buildSmartFillUserMessage(title: string, description: string | null): string {
  return `## Issue\nTitle: ${title.slice(0, MAX_TITLE_CHARS)}\nDescription: ${
    description?.trim() ? description.slice(0, MAX_DESCRIPTION_CHARS) : "(none)"
  }`;
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
 *
 * Exported for the decision layer (MIN-562): its LLM fallback replays this
 * exact schema so the pass behaves identically on both engines.
 */
export function fillParameters(ctx: SmartFillContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      priority: { type: "string", enum: [...ISSUE_PRIORITIES] },
      effort: {
        type: "string",
        enum: [...ISSUE_EFFORTS, SMART_FILL_NONE],
        description: `T-shirt size, or "${SMART_FILL_NONE}" when nothing is estimable.`,
      },
      category_ids: {
        type: "array",
        items: { type: "string", enum: ctx.categories.map((c) => c.id) },
        description: `Ids of the matching categories. Empty array when none match.`,
      },
      objective_id: {
        type: "string",
        enum: [...ctx.objectives.map((o) => o.id), SMART_FILL_NONE],
        description: `Id of the objective this issue belongs to, or "${SMART_FILL_NONE}".`,
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
 * The runner's typed answers, replayed as the tool-arguments shape
 * `sanitizeSmartFill` was built on. Pure, and deliberately boring: it copies
 * the values of the answers that exist, and the sanitizer does ALL the
 * judging — an invented id, a `none` priority, a fifth category — whichever
 * engine produced them. A missing answer simply leaves its key out, which is
 * how "the engine said nothing about it" reaches the patch as an absent field.
 */
export function smartFillAnswersToRaw(answers: DecisionAnswers): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const priority = answers.priority?.value;
  if (typeof priority === "string") raw.priority = priority;
  const effort = answers.effort?.value;
  if (typeof effort === "string") raw.effort = effort;
  const objectiveId = answers.objective_id?.value;
  if (typeof objectiveId === "string") raw.objective_id = objectiveId;
  const categoryIds = answers.category_ids?.value;
  if (Array.isArray(categoryIds)) raw.category_ids = categoryIds.filter((id) => typeof id === "string");
  return raw;
}

/**
 * The entry point. Makes the patch to merge into the row before the insert, or
 * an EMPTY patch — never an exception, never a failed creation.
 *
 * Since MIN-563 the pass runs through the decision layer
 * ([runner.ts](decisions/runner.ts)): Jev first (one fast call on the same
 * structured state), the existing LLM pass as fallback — unchanged, replayed
 * verbatim by the spec's recipe — and the empty patch when BOTH engines fail,
 * the same degradation as before. The gates stay here: the flag, the budget
 * of the actor (the one who armed the pass pays for whichever engine
 * answers), and the context gathering.
 */
export async function runSmartFill({
  projectId,
  projectName,
  billToUserId,
  title,
  description,
}: {
  projectId: string;
  projectName: string;
  /** Account resolved from creation provenance and charged for this pass. */
  billToUserId: string | null;
  title: string;
  description: string | null;
}): Promise<SmartFillPatch> {
  if (!billToUserId || !title.trim()) return {};
  try {
    const config = await getAppConfigValues(["smart_fill_enabled"]);
    const enabled = (config["smart_fill_enabled"] ?? aiModelFallback("smart_fill_enabled")) !== "false";
    if (!enabled) return {};
    // The budget of THE ONE WHO ARMED the scale, as for dictation. Dry, we
    // does not fill out — and the ticket is still born.
    if (!(await hasUsageBudget(billToUserId, "automations"))) return {};

    const ctx = await gatherContext(projectId);
    const spec = buildSmartFillSpec({ projectName, title, description, ctx });
    const outcome = await runDecision(spec, { billTo: { userId: billToUserId }, projectId });
    // `null` (both engines down) and an outcome without answers land on the
    // same empty patch: the ticket is born as it was written.
    return sanitizeSmartFill(outcome ? smartFillAnswersToRaw(outcome.answers) : null, ctx);
  } catch (err) {
    console.error("[smart-fill] fill failed:", (err as Error).message);
    return {};
  }
}
