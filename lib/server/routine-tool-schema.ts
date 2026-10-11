import "server-only";

import { z } from "zod";
import type { RoutineCondition } from "@/lib/routine-triggers";

import { ROUTINE_FREQUENCIES } from "@/lib/routine-schedule";

/**
 * The SCHEMA for the `create_routine` tool, written once (MIN-185).
 *
 * Three surfaces use it — Numo chat, the Numo agent in its sandbox, and MCP
 * (which re-describes it in Zod because its SDK requires that, but with the same
 * wording). The description cannot differ across all three: it defines what a
 * routine IS, and a model that reads three definitions of the same thing invents
 * a fourth.
 *
 * The description must include the following, because the model sees it nowhere else:
 * - **this is NOT a recurring ticket** (`recurrence` on a ticket) and
 * combines schedules and product events. The definitions must remain consistent;
 * a client that confuses them creates the wrong thing;
 * - **each occurrence is a Numo conversation** that can use Minddy tools and
 *   pause visibly for owner input;
 * - **repository work is optional** and delegated only when needed;
 * - **only the project owner can create one**;
 * - **the time zone cannot be guessed**.
 */

const FREQUENCY_VALUES = [...ROUTINE_FREQUENCIES];

export const CREATE_ROUTINE_DESCRIPTION =
  "Create a ROUTINE: an instruction that starts a private Numo conversation on a " +
  "schedule or a product event — triage, status change, assignment, comment, feedback, or database entry. It is NOT a recurring ticket (that is an issue with a `recurrence`) " +
  ". Choose one trigger: schedule, event, or a new page database entry. Every occurrence " +
  "has its own Numo conversation and history. There " +
  "is NO name to pass: minddy writes the routine's title from its " +
  "instruction, and rewrites it whenever the instruction changes. `prompt` IS the " +
  "instruction Numo receives, so WRITE it from the user's request rather than " +
  "copying their sentence. Numo uses Minddy tools directly for product work and " +
  "delegates to a code worker only when repository access is actually needed. A " +
  "project therefore does not need a linked repository to create or run a routine. " +
  "If a real decision is missing, the occurrence can pause for owner input in its " +
  "conversation. OWNER ONLY: only the project's " +
  "owner can create a routine, because it is their usage budget that leaves every " +
  "occurrence — a member gets a refusal, and there is no way around it. Delegated " +
  "workers always use the owner's current account code model and reasoning. The " +
  "complete occurrence, including Numo and delegated workers, stops at 15% of the " +
  "owner's monthly usage budget by default — it cannot silently take the whole " +
  "month (`max_spend_percent`).";

export const UPDATE_ROUTINE_DESCRIPTION =
  "Change an existing routine: turn it on or off (`enabled`), move its cadence, " +
  "replace its trigger or nested AND/OR conditions, or rewrite its instruction (its title follows). OWNER ONLY. " +
  "Configuration changes invalidate pending armings; re-enabling listens to future events without replaying the past. " +
  "Touching the cadence or re-enabling it recomputes the next run — so 'move it to 7am' takes effect at the " +
  "NEXT occurrence, not at the one already scheduled. Get the id from list_routines.";

export const LIST_ROUTINES_DESCRIPTION =
  "List the routines of a project without loading every instruction: id, title " +
  "(written by minddy from the instruction), trigger and conditions, cadence for schedules, " +
  "the spending cap of one occurrence, whether it is enabled, when it last ran " +
  "and when it runs next, and the " +
  "code of the last missed occurrence. " +
  "The compact list deliberately omits instructions so a project with many long " +
  "routines still fits in one tool result. Pass `routine_id` after finding the " +
  "routine to read that routine again with its full instruction. " +
  "Call it before creating one, to reuse or adjust what is already scheduled instead " +
  "of stacking a second routine that does the same job.";

/**
 * The spending ceiling for one occurrence, including Numo and delegated work.
 * Without the sentence about the default, a client
 * resets it to 100 “to avoid getting in the way” and reopens exactly the hole the
 * ceiling is meant to close.
 */
const MAX_SPEND_PERCENT_PROPERTY = {
  type: "number",
  description:
    "Cap on what ONE occurrence, including Numo and delegated code work, may spend, as a percentage (1–100) of " +
    "the owner's monthly usage budget. OMIT IT unless the user asks for a cap: " +
    "the default (15) leaves room for a routine to run all month without eating " +
    "the budget, and passing 100 removes the cap entirely. Raise it for a " +
    "routine that runs rarely and must finish its job (a monthly security review " +
    "at 50); lower it for one that runs every day (an inventory at 5). It is a " +
    "share of the PLAN's budget, so it follows an upgrade on its own — and it " +
    "does not apply to owners running on their own API key.",
};

/** Schedule fields — shared by `create_routine` and `update_routine`. */
export const ROUTINE_SCHEDULE_PROPERTIES: Record<string, unknown> = {
  frequency: {
    type: "string",
    enum: FREQUENCY_VALUES,
    description:
      "How often it runs: 'daily', 'weekly' (then pass weekdays) or 'monthly' " +
      "(then pass days_of_month).",
  },
  hour: {
    type: "number",
    description: "Hour of the run, 0–23, IN `timezone`. Ask or default to 9 (morning).",
  },
  minute: {
    type: "number",
    description: "Minute of the run, 0–59. Defaults to 0.",
  },
  weekdays: {
    type: "array",
    items: { type: "number" },
    description:
      "Days of the week a 'weekly' routine runs on: 0 = Sunday, 1 = Monday … " +
      "6 = Saturday. SEVERAL are allowed — [1, 4] is 'every Monday and Thursday', " +
      "and it runs on each of them. At least one is required for 'weekly', and the " +
      "field is REFUSED on the other cadences.",
  },
  days_of_month: {
    type: "array",
    items: { type: "number" },
    description:
      "Days of the month a 'monthly' routine runs on, 1–31. SEVERAL are allowed — " +
      "[1, 15] is 'the 1st and the 15th'. On a shorter month a day falls back to " +
      "that month's last day (31 in February means the 28th) and never skips the " +
      "month. At least one is required for 'monthly', and the field is REFUSED on " +
      "the other cadences.",
  },
  timezone: {
    type: "string",
    description:
      "IANA timezone the hour is expressed in ('Europe/Paris', 'America/New_York'). " +
      "Pass the USER'S timezone — it is in your context; never guess one and never " +
      "default to UTC, or the routine runs hours off every single time. An unknown " +
      "name is refused.",
  },
};

/** Recursive, typed conditions shared with the MCP registration. */
export const ROUTINE_CONDITION_SCHEMA: z.ZodType<RoutineCondition> = z.lazy(() => z.union([
  z.object({ operator: z.enum(["and", "or"]), children: z.array(ROUTINE_CONDITION_SCHEMA).min(1).max(16) }).strict(),
  z.object({ field: z.enum(["status", "assignee", "category", "priority", "effort", "property"]), propertyId: z.string().uuid().optional(), operator: z.enum(["eq", "neq", "in", "contains", "present", "absent", "gt", "gte", "lt", "lte"]), value: z.union([z.string().max(2000), z.array(z.string()).max(100), z.number(), z.boolean(), z.null()]).optional() }).strict(),
]));
export const ROUTINE_TRIGGER_SCHEMA = z.union([
  z.object({ type: z.literal("schedule") }).strict(),
  z.object({ type: z.literal("event"), event: z.enum(["issue.created", "issue.status_changed", "issue.assigned", "issue.comment_added", "feedback.received"]), status: z.string().optional(), assigneeId: z.string().uuid().optional(), issueId: z.string().uuid().optional(), delayMinutes: z.number().int().min(0).max(120).optional(), conditions: ROUTINE_CONDITION_SCHEMA.optional() }).strict(),
  z.object({ type: z.literal("database"), databaseId: z.string().uuid(), delayMinutes: z.number().int().min(0).max(120).optional(), conditions: ROUTINE_CONDITION_SCHEMA.optional() }).strict(),
]).describe("One trigger. Omit for a schedule; cadence fields are schedule-only. A status event requires its target status; a comment requires a followed issueId; a database requires databaseId. Conditions are nested and/or groups with children or typed leaves (field, operator, optional value/propertyId). An unmatched item stays armed until an edit satisfies the conditions; status exit cancels it. Resolve all IDs in this project. Max depth 6, 64 nodes, 16 KiB. No code or arbitrary expressions.");
const { $defs: TRIGGER_DEFINITIONS, $schema: _draft, ...TRIGGER_PROPERTY } = z.toJSONSchema(ROUTINE_TRIGGER_SCHEMA, { target: "draft-2020-12" });

/** Complete `create_routine` parameters. */
export const CREATE_ROUTINE_PARAMETERS = {
  type: "object" as const,
  $defs: TRIGGER_DEFINITIONS,
  properties: {
    prompt: {
      type: "string",
      description:
        "The instruction Numo receives at every occurrence, in the user's language. It " +
        "must stand on its own: say what to look at, what counts as a finding, and " +
        "what to do with one. Numo may use Minddy tools, delegate repository work, " +
        "or pause the conversation when owner input is genuinely required.",
    },
    trigger: TRIGGER_PROPERTY,
    ...ROUTINE_SCHEDULE_PROPERTIES,
    max_spend_percent: MAX_SPEND_PERCENT_PROPERTY,
  } as Record<string, unknown>,
  // `minute`, `weekdays`, and `days_of_month` remain outside `required`: the latter
  // two depend on the schedule, and a field that is required but forbidden for some
  // frequencies is a trap. Everything else IS required — a small model will not fill
  // an optional field, and omitting `timezone` starts the routine three hours away
  // without anyone noticing. No `title`: minddy writes it from the instruction.
  required: ["prompt", "timezone"],
};

/** `update_routine` parameters — everything is optional except the target. */
export const UPDATE_ROUTINE_PARAMETERS = {
  type: "object" as const,
  $defs: TRIGGER_DEFINITIONS,
  properties: {
    routine_id: { type: "string", description: "Routine id, from list_routines." },
    prompt: {
      type: "string",
      description:
        "New instruction (REPLACES the current one). The routine's title is rewritten " +
        "from it automatically — there is no name to pass.",
    },
    enabled: {
      type: "boolean",
      description:
        "false pauses the routine without deleting it (its past runs stay readable); " +
        "true re-arms it on its next occurrence.",
    },
    trigger: TRIGGER_PROPERTY,
    ...ROUTINE_SCHEDULE_PROPERTIES,
    max_spend_percent: MAX_SPEND_PERCENT_PROPERTY,
  } as Record<string, unknown>,
  required: ["routine_id"],
};
