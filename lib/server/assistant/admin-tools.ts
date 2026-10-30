import "server-only";

import type { User } from "@supabase/supabase-js";

import { hasAdminRole, isAdminEmail, isAdminUser } from "@/lib/server/admin";
import {
  checkAiConfigValue,
  importAiConfigFile,
  readAiConfigValues,
  writeAiConfigValue,
} from "@/lib/server/admin-model-config";
import {
  fetchAdminAccount,
  fetchAdminUserDetails,
  setAdminPlanOverride,
} from "@/lib/server/admin-users";
import {
  AI_MODEL_CONFIG_FIELDS,
  isSuffixableField,
  modelSuffixKey,
} from "@/lib/ai-model-config";
import { buildModelConfigFile } from "@/lib/ai-model-config-file";
import { getFinanceSummary } from "@/lib/server/finance";
import {
  ADMIN_COST_GROUPS,
  costGroupOf,
  costTotals,
  dailyValues,
  filterCostRows,
  rankBy,
  relativeChange,
  splitPeriods,
  windowDays,
  type AdminCostGroupId,
  type CostFilters,
} from "@/lib/admin-costs";
import { BILLING_PLANS, coerceBillingPlanId } from "@/lib/billing-plans";
import { coerceGiftDuration, GIFT_DURATIONS } from "@/lib/billing-gift";
import type { AssistantToolDef } from "./tools";
import type { ToolContext } from "./execute-tool";
import { readConversationAttachmentText } from "./conversation-attachments";

/** Generous for a configuration file; anything larger is not one. */
const MAX_CONFIG_FILE_CHARACTERS = 200_000;

/**
 * Numo's instance administration (MIN-829): the model configuration and
 * account support of `/admin`, as tools.
 *
 * WHO gets them: only a chat turn admitted from a session that passes
 * `isAdminUser` (admin role or allowlisted address, verified MFA, `aal2`).
 * The turn records that session (`AdminSessionGrant`) and the gate runs again
 * — live session, role and MFA — when the turn executes and before EVERY
 * admin call: a revoked session or a removed role loses the tools mid-turn.
 * Mentions, routines and the public documentation help never carry a grant.
 *
 * The cost tool reads the same ledger aggregates as the Costs tab, through
 * the same arithmetic (`lib/admin-costs.ts`), so Numo and the screen agree.
 *
 * WHAT they read about another account mirrors the Accounts tab and the data
 * minimisation of `20270109200030_admin_data_minimisation.sql`: an account is
 * reached by its exact address or id only, and nothing returns its activity,
 * profile or project content.
 */

export interface AdminSessionGrant {
  sessionId: string;
  aal: "aal2";
  amr: unknown[];
}

const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The grant a chat request earns, or `null`. The cheap claim checks come
 * first, so an ordinary member's message never pays the live admin lookup.
 */
export async function adminGrantForRequest(
  user: Pick<User, "id" | "email" | "app_metadata">,
  claims: Record<string, unknown> | null | undefined,
): Promise<AdminSessionGrant | null> {
  if (claims?.aal !== "aal2" || typeof claims.session_id !== "string") return null;
  if (!hasAdminRole(user) && !isAdminEmail(user.email)) return null;
  if (!(await isAdminUser(user, claims))) return null;
  return {
    sessionId: claims.session_id,
    aal: "aal2",
    amr: Array.isArray(claims.amr) ? claims.amr : [],
  };
}

/** Re-runs the admin gate against the session the grant was earned in. */
export function adminGrantIsLive(userId: string, grant: AdminSessionGrant | null | undefined): Promise<boolean> {
  if (!grant) return Promise.resolve(false);
  return isAdminUser({ id: userId }, {
    sub: userId,
    aal: grant.aal,
    session_id: grant.sessionId,
    amr: grant.amr,
  });
}

/** Read tools (safe to replay) and write tools, which the prompt makes Numo confirm. */
export const ADMIN_READ_TOOLS = new Set([
  "admin_get_instance_models",
  "admin_get_costs",
  "admin_find_account",
  "admin_get_account",
]);

const MODEL_KEYS_HINT =
  "Keys come from admin_get_instance_models: a category default (category_<id>_model), a task key, " +
  "a routing shortcut (<key>_suffix: nitro, floor or exacto), assistant_reasoning_level, " +
  "recommended_models (a JSON array string) or a provider default for personal keys (byok_default_*).";

export const ADMIN_ASSISTANT_TOOLS: AssistantToolDef[] = [
  {
    type: "function",
    function: {
      name: "admin_get_instance_models",
      description:
        "INSTANCE ADMIN. Read the AI model configuration of this instance: every setting with its stored value (null = default) and its built-in default, plus the same configuration as the exportable file (format minddy.instance-models). Categories (assistant, automations, embeddings, feedback) hold one default model; a task follows its category until its own key is set, which overrides it. A task left unset with an unset category runs on its built-in default. Read-only.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_update_instance_models",
      description:
        `INSTANCE ADMIN. Change AI model settings for the WHOLE instance: every member's Numo, automations, voice and feedback. ${MODEL_KEYS_HINT} An empty value returns a setting to its default (for a task: back to following its category). Each value is checked like the admin screen does (a decision model is test-called, an embedding field only takes embedding models); one refusal changes nothing. Always confirm the exact changes with ask_user first.`,
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "object",
              properties: {
                key: { type: "string", description: "Setting key." },
                value: { type: "string", description: "New value; empty string for the default." },
              },
              required: ["key", "value"],
            },
          },
        },
        required: ["changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_import_instance_models",
      description:
        "INSTANCE ADMIN. Import a model configuration file, exactly like the Import button of the admin Models tab. Pass the file the user attached to the conversation with attachment_id (from list_conversation_attachments), or a configuration JSON with file (for example one the user pasted, or admin_get_instance_models' `file`). The import REPLACES the configuration: what the file leaves out returns to its default. Call it with apply false first, show the user the listed changes, confirm with ask_user, then call again with apply true. A file from a newer minddy release is refused.",
      parameters: {
        type: "object",
        properties: {
          attachment_id: { type: "string", description: "An attached .json file, from list_conversation_attachments." },
          file: { type: "object", description: "The configuration file, as JSON, when it was not attached." },
          apply: { type: "boolean", description: "false = preview only; true = write the changes." },
        },
        required: ["apply"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_get_costs",
      description:
        `INSTANCE ADMIN. Read what the AI providers cost this instance, the same figures as the admin Costs tab: totals in USD (spend, requests, tokens, cost per million tokens, cache hit rate) with their change against the previous period of the same length, the most expensive features and models, spend per feature family, and the spend per day. Optional filters narrow everything like the tab's menus: a feature family (${ADMIN_COST_GROUPS.join(", ")}) or a model id. Calls made with members' personal keys are never recorded, so they are not part of these figures. Aggregates only: no account, project or prompt. Read-only.`,
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", minimum: 1, maximum: 365, description: "Period length in days, ending today (default 30)." },
          family: { type: "string", enum: ADMIN_COST_GROUPS, description: "Only this feature family." },
          model: { type: "string", description: "Only this model id (as returned in top_models)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_find_account",
      description:
        "INSTANCE ADMIN. Find ONE account by its exact email address, for a support or billing task the user asked for. Returns its id, display name, email and whether the email is confirmed — nothing else. There is no partial search and no listing.",
      parameters: {
        type: "object",
        properties: { email: { type: "string", description: "The complete email address." } },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_get_account",
      description:
        "INSTANCE ADMIN. Read the effective plan (and where it comes from: gifted by an admin, Stripe, or the default plan), any gift in progress, and the AI usage budget of ONE account found with admin_find_account. No activity, projects or content are returned.",
      parameters: {
        type: "object",
        properties: { user_id: { type: "string", description: "Account id from admin_find_account." } },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_set_account_plan",
      description:
        `INSTANCE ADMIN. Gift a plan to an account, or take a gift back (plan_id null). A gift overrides the account's Stripe subscription without touching it and ends on its own. Plans: ${BILLING_PLANS.map((plan) => plan.id).join(", ")}. Durations: ${GIFT_DURATIONS.join(", ")}; omit the duration to keep the current end date. Always confirm the account, plan and duration with ask_user first.`,
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Account id from admin_find_account." },
          plan_id: { type: ["string", "null"], description: "Plan to gift, or null to restore the real plan." },
          duration: { type: ["string", "null"], description: "Gift duration, or null to keep the current end date." },
          note: { type: ["string", "null"], description: "Why, for the next admin (500 characters)." },
        },
        required: ["user_id", "plan_id"],
      },
    },
  },
];

export const ADMIN_TOOL_NAMES = new Set(ADMIN_ASSISTANT_TOOLS.map((tool) => tool.function.name));

/** Appended to the system prompt of a turn that carries the admin tools. */
export const ADMIN_PROMPT_BLOCK = `
## Instance administration
- The user is an administrator of this minddy instance. The admin_* tools act on the WHOLE instance (every member's AI models, the instance's AI costs) or on another person's account. Use them only when the user asks for instance administration.
- For questions about AI spending (how much, which feature or model costs most, a trend, the share of personal keys), read admin_get_costs and quote its figures in dollars; never estimate costs yourself.
- Before any admin_* write (admin_update_instance_models, admin_import_instance_models with apply true, admin_set_account_plan), state exactly what will change and confirm with ask_user. Never chain a write the user did not confirm.
- Account support is for support or billing tasks only: look an account up by its exact email, never guess addresses, and do not repeat another person's details beyond what the task needs.`;

type AdminToolResult = { result: unknown; success: boolean };

function adminError(message: string): AdminToolResult {
  return { result: { error: message }, success: false };
}

async function readModels(): Promise<AdminToolResult> {
  const values = await readAiConfigValues();
  const settings = AI_MODEL_CONFIG_FIELDS.flatMap((field) => {
    const row = {
      key: field.key,
      kind: field.kind,
      ...(field.category ? { category: field.category } : {}),
      ...(field.categoryDefault ? { category_default_of: field.categoryDefault } : {}),
      ...(field.catalogCapability ? { capability: field.catalogCapability } : {}),
      value: values[field.key] ?? null,
      default: field.fallback || null,
    };
    if (!isSuffixableField(field)) return [row];
    const suffixKey = modelSuffixKey(field.key);
    return [row, { key: suffixKey, kind: "suffix", value: values[suffixKey] ?? null, default: null }];
  });
  return { result: { settings, file: buildModelConfigFile(values) }, success: true };
}

const round = (value: number | null, digits = 4) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

async function readCosts(args: Record<string, unknown>): Promise<AdminToolResult> {
  const days = typeof args.days === "number" && Number.isInteger(args.days)
    ? Math.min(365, Math.max(1, args.days))
    : 30;
  const family = typeof args.family === "string" && (ADMIN_COST_GROUPS as string[]).includes(args.family)
    ? (args.family as AdminCostGroupId)
    : "all";
  const filters: CostFilters = {
    group: family,
    model: typeof args.model === "string" && args.model.trim() ? args.model.trim() : "all",
  };
  const summary = await getFinanceSummary({ days });
  const { current, previous } = splitPeriods(filterCostRows(summary.breakdown, filters), summary.windowStartDay);
  const totals = costTotals(current);
  const before = costTotals(previous);
  const totalsOut = (value: typeof totals) => ({
    spend_usd: round(value.costUsd),
    requests: value.calls,
    tokens: value.tokens,
    cost_per_million_tokens_usd: round(value.costPerMillion),
    cache_hit_rate: round(value.cacheHitRate, 3),
  });
  const change = (now: number | null, then: number | null) =>
    previous.length > 0 ? round(relativeChange(now, then), 3) : null;
  const share = (cost: number) => (totals.costUsd > 0 ? round(cost / totals.costUsd, 3) : 0);
  const dayList = windowDays(summary.windowStartDay, summary.windowDays);
  const perDay = dailyValues(current, dayList, (row) => row.costUsd);
  return {
    result: {
      period: { days: summary.windowDays, from: summary.windowStartDay, to: dayList[dayList.length - 1] },
      filters: { family, model: filters.model },
      currency: "USD",
      totals: totalsOut(totals),
      previous_period: previous.length > 0 ? totalsOut(before) : null,
      change_vs_previous: {
        spend: change(totals.costUsd, before.costUsd),
        requests: change(totals.calls, before.calls),
        tokens: change(totals.tokens, before.tokens),
        cost_per_million_tokens: change(totals.costPerMillion, before.costPerMillion),
      },
      top_features: rankBy(current, (row) => row.feature).slice(0, 10).map((entry) => ({
        feature: entry.key,
        family: costGroupOf(entry.key),
        spend_usd: round(entry.costUsd),
        share: share(entry.costUsd),
        requests: entry.calls,
      })),
      top_models: rankBy(current, (row) => row.model).slice(0, 10).map((entry) => ({
        model: entry.key || null,
        spend_usd: round(entry.costUsd),
        share: share(entry.costUsd),
        requests: entry.calls,
        tokens: entry.tokens,
      })),
      by_family: rankBy(current, (row) => costGroupOf(row.feature)).map((entry) => ({
        family: entry.key,
        spend_usd: round(entry.costUsd),
        share: share(entry.costUsd),
      })),
      // Days without a call are zeros; a long period stays short enough to read.
      spend_per_day_usd: dayList.map((day, index) => ({ day, spend: round(perDay[index]) })),
    },
    success: true,
  };
}

async function updateModels(args: Record<string, unknown>): Promise<AdminToolResult> {
  const raw = Array.isArray(args.changes) ? args.changes : null;
  if (!raw || raw.length === 0 || raw.length > 40) return adminError("Pass 1 to 40 changes.");
  const changes: Array<{ key: string; value: string }> = [];
  for (const change of raw) {
    const key = typeof change?.key === "string" ? change.key : "";
    const value = typeof change?.value === "string" ? change.value : null;
    if (value === null) return adminError(`Change for "${key}" needs a string value.`);
    changes.push({ key, value });
  }
  // Every value is checked before the first write: one refusal changes nothing.
  for (const change of changes) {
    const check = await checkAiConfigValue(change.key, change.value);
    if (!check.ok) return adminError(`${change.key}: ${check.error}`);
  }
  const applied: Array<{ key: string; value: string | null }> = [];
  const released: string[] = [];
  for (const change of changes) {
    const write = await writeAiConfigValue(change.key, change.value);
    if (!write.ok) return adminError(`${change.key}: ${write.error}`);
    applied.push({ key: write.key, value: write.value || null });
    released.push(...write.released);
  }
  return {
    result: {
      applied,
      ...(released.length > 0 ? { now_following_their_category: released } : {}),
    },
    success: true,
  };
}

async function importModels(args: Record<string, unknown>, ctx: AdminToolContext): Promise<AdminToolResult> {
  let file: unknown = args.file;
  if (typeof args.attachment_id === "string" && args.attachment_id) {
    if (!ctx.supabase || !ctx.service) return adminError("Attachments can only be read in a conversation.");
    try {
      file = (await readConversationAttachmentText(ctx as ToolContext, args.attachment_id, MAX_CONFIG_FILE_CHARACTERS)).text;
    } catch (error) {
      return adminError((error as Error).message);
    }
  }
  if (file === undefined) return adminError("Pass the attached file's attachment_id, or the configuration as file.");
  const outcome = await importAiConfigFile(file, args.apply === true);
  if (!outcome.ok) {
    return adminError(
      outcome.error === "newer_version"
        ? "This file comes from a newer minddy release; update the instance first."
        : `The file was refused (${outcome.error}${outcome.key ? `, ${outcome.key}` : ""}${outcome.detail ? `: ${outcome.detail}` : ""}).`,
    );
  }
  return {
    result: {
      applied: outcome.applied,
      changes: outcome.changes,
      ignored: outcome.ignored,
      upgraded_from_older_file: outcome.upgraded,
    },
    success: true,
  };
}

async function findAccount(args: Record<string, unknown>): Promise<AdminToolResult> {
  const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  if (email.length > 254 || !ADMIN_EMAIL_PATTERN.test(email)) {
    return adminError("Pass a complete email address; partial searches are not possible.");
  }
  const account = await fetchAdminAccount({ email });
  return { result: { account }, success: true };
}

async function getAccount(args: Record<string, unknown>): Promise<AdminToolResult> {
  const userId = typeof args.user_id === "string" ? args.user_id : "";
  if (!UUID_RE.test(userId)) return adminError("Pass the account id from admin_find_account.");
  const account = await fetchAdminUserDetails(userId);
  return account ? { result: { account }, success: true } : adminError("Account not found.");
}

async function setAccountPlan(args: Record<string, unknown>): Promise<AdminToolResult> {
  const userId = typeof args.user_id === "string" ? args.user_id : "";
  if (!UUID_RE.test(userId)) return adminError("Pass the account id from admin_find_account.");
  const planId = args.plan_id == null ? null : coerceBillingPlanId(args.plan_id);
  if (args.plan_id != null && !planId) return adminError(`Unknown plan "${String(args.plan_id)}".`);
  const duration = args.duration == null ? null : coerceGiftDuration(args.duration);
  if (args.duration != null && !duration) return adminError(`Unknown duration "${String(args.duration)}".`);
  if (!(await fetchAdminAccount({ userId }))) return adminError("Account not found.");
  const state = await setAdminPlanOverride({
    userId,
    planId,
    duration,
    note: typeof args.note === "string" ? args.note : null,
  });
  return { result: { plan: state }, success: true };
}

/**
 * Runs one admin tool. The caller has already checked that the name is an
 * admin tool; the grant is re-verified here, on every call.
 */
type AdminToolContext = Pick<ToolContext, "userId" | "adminGrant"> & Partial<ToolContext>;

export async function executeAdminTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AdminToolContext,
): Promise<AdminToolResult> {
  if (!(await adminGrantIsLive(ctx.userId, ctx.adminGrant))) {
    return adminError("Instance administration needs an administrator session with two-factor authentication.");
  }
  switch (toolName) {
    case "admin_get_instance_models":
      return readModels();
    case "admin_update_instance_models":
      return updateModels(args);
    case "admin_import_instance_models":
      return importModels(args, ctx);
    case "admin_get_costs":
      return readCosts(args);
    case "admin_find_account":
      return findAccount(args);
    case "admin_get_account":
      return getAccount(args);
    case "admin_set_account_plan":
      return setAccountPlan(args);
    default:
      return adminError(`Unknown admin tool ${toolName}.`);
  }
}
