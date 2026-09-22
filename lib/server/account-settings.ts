import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { locales, type Locale } from "@/i18n/config";
import {
  resolveNumoDefaultStatus,
  isNumoDefaultStatus,
} from "@/lib/numo-default-status";
import {
  PROMPT_COPY_AUTO_START_META_KEY,
  resolvePromptCopyAutoStart,
} from "@/lib/prompt-copy-auto-start";
import {
  SMART_FILL_CREATED_META_KEY,
  SMART_FILL_META_KEY,
  SMART_FILL_TRIAGE_META_KEY,
  resolveSmartFill,
  resolveSmartFillScope,
} from "@/lib/smart-fill";
import {
  AUTO_ASSIGN_ON_START_META_KEY,
  resolveAutoAssignOnStart,
} from "@/lib/auto-assign-on-start";
import {
  CYCLES_ENABLED_META_KEY,
  CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
  CYCLE_DURATION_WEEKS_META_KEY,
  CYCLE_INTENSITY_META_KEY,
  CYCLE_START_DOW_META_KEY,
  CYCLE_UPCOMING_COUNT_META_KEY,
  isCycleIntensity,
  resolveCyclePrefs,
  type CyclePrefs,
} from "@/lib/cycle-prefs";
import {
  AUTOMATION_PRESET_META_KEY,
  isAutomationPresetId,
  resolveAutomationPreset,
  resolveAutomationEfforts,
  resolveAutomationStartDelayMinutes,
  ALL_EFFORTS,
  MAX_AUTOMATION_START_DELAY_MIN,
  type AutomationPresetId,
} from "@/lib/automations";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META_KEYS,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { isReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  ACCOUNT_THEME_META_KEY,
  isAccountTheme,
  resolveAccountTheme,
  type AccountTheme,
} from "@/lib/account-theme";
import { emailLocalPart } from "@/lib/display-name";
import {
  DEFAULT_AGENT_BRANCH_PREFIX,
  normalizeAgentBranchPrefix,
} from "@/lib/server/agent/branch-name";
import {
  SEND_MODE_META_KEY,
  isSendMode,
  resolveSendMode,
  type SendMode,
} from "@/lib/keyboard/send-shortcut";
import { type IssueEffort } from "@/lib/issue-constants";
import {
  AUTOMATION_START_DELAY_META_KEY,
  AUTOMATION_EFFORTS_META_KEY,
} from "@/lib/automations";
import { ANALYTICS_CONSENT_META_KEY, resolveAnalyticsConsent } from "@/lib/cookie-consent";
import {
  isSandboxRegion,
  isSandboxSize,
  resolveSandboxPreferences,
  type SandboxRegion,
  type SandboxSize,
} from "@/lib/agent-sandbox-config";

/**
 * The requesting user's own account settings, mirroring Account → Profile /
 * Preferences. Everything editable lives in the Supabase Auth account's
 * `user_metadata`, so these cores read/write it through the service admin API.
 * They act ONLY on the given userId — never another user's account.
 *
 * `email` is read-only (surfaced for context). `display_name` is written to both
 * `display_name` and `full_name` (the profile UI keeps them in sync).
 */

export interface AccountSettings {
  display_name: string;
  email: string | null;
  locale: Locale;
  /** Appearance saved on the account (follows the user across devices).
   * `null` = never set: devices keep their own default. */
  theme: AccountTheme | null;
  numo_default_status: ReturnType<typeof resolveNumoDefaultStatus>;
  auto_assign_created: boolean;
  auto_assign_on_start: boolean;
  prompt_copy_auto_start: boolean;
  /** Keyboard gesture that sends a composer (mod-enter | enter). */
  send_shortcut: SendMode;
  smart_fill: boolean;
  smart_fill_created: boolean;
  smart_fill_triage: boolean;
  /** Cycles (MIN-32) — Account → Cycles, one key per knob in user_metadata. */
  cycles: CyclePrefs;
  /** Automation preset (MIN-147): Numo loop applied to ALL
  * projects owned by this account. `null` = none. */
  automation_preset: AutomationPresetId | null;
  /** Minutes the automation waits after its trigger before starting the agent. */
  automation_start_delay_minutes: number;
  /** Which ticket sizes the automation loop may run on. */
  automation_efforts: Record<IssueEffort, boolean>;
  /** Product-analytics consent. `null` = never answered. */
  analytics_consent: "accepted" | "declined" | null;
  /** Inbox (MIN-82) — one toggle per trigger family. */
  notifications: NotificationPrefs;
  /** Code Agent Preferences (MIN-46 / MIN-122). The only account setting block
 * which does NOT live in `user_metadata` but in `user_agent_preferences` —
 * hence its separate reading. */
  agent: AgentPrefs;
}

export interface AgentPrefs {
  default_model: string | null;
  default_reasoning_level: ReasoningLevel | null;
  branch_prefix: string;
  /** Where the server sandbox spins up (eu | us) and how big it is
      (standard | performance) — the same `user_agent_preferences` row. */
  sandbox_region: SandboxRegion;
  sandbox_size: SandboxSize;
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The agent preferences of the account, read in `user_agent_preferences`.
 *
 * NO LINE AND READ FAILURE ARE NOT THE SAME THING. An account that
 * has never touched these settings has no line — this is the common case, and
 * it is worth "no preference". A basic error goes back: making it
 * like "no preference" would make Numo say "you don't have a model by
 * default" to someone who does, and making a valid but false state is
 * worse than failing.
 */
async function readAgentPrefs(
  userId: string
): Promise<{ ok: true; prefs: AgentPrefs } | { ok: false; error: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("user_agent_preferences")
    .select(
      "default_model, default_reasoning_level, branch_prefix, sandbox_region, sandbox_size"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[account-settings] agent prefs read failed:", error.message);
    return { ok: false, error: error.message };
  }
  const sandbox = resolveSandboxPreferences(data);
  return {
    ok: true,
    prefs: {
      default_model: (data as { default_model?: string | null } | null)?.default_model ?? null,
      default_reasoning_level: isReasoningLevel(
        (data as { default_reasoning_level?: string | null } | null)?.default_reasoning_level
      )
        ? ((data as { default_reasoning_level: string }).default_reasoning_level as ReasoningLevel)
        : null,
      branch_prefix:
        normalizeAgentBranchPrefix(
          (data as { branch_prefix?: string | null } | null)?.branch_prefix
        ) ?? DEFAULT_AGENT_BRANCH_PREFIX,
      sandbox_region: sandbox.sandbox_region,
      sandbox_size: sandbox.sandbox_size,
    },
  };
}

function toSettings(
  meta: Record<string, unknown>,
  email: string | null,
  agent: AgentPrefs
): AccountSettings {
  const rawLocale = meta.locale;
  const locale: Locale = locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : "en";
  return {
    display_name:
      metaString(meta, "display_name") ||
      metaString(meta, "full_name") ||
      metaString(meta, "name") ||
      emailLocalPart(email) ||
      "",
    email,
    locale,
    theme: resolveAccountTheme(meta),
    numo_default_status: resolveNumoDefaultStatus(meta),
    auto_assign_created: meta.auto_assign_created === true,
    auto_assign_on_start: resolveAutoAssignOnStart(meta),
    prompt_copy_auto_start: resolvePromptCopyAutoStart(meta),
    send_shortcut: resolveSendMode(meta),
    smart_fill: resolveSmartFill(meta),
    smart_fill_created: resolveSmartFillScope(meta, "created"),
    smart_fill_triage: resolveSmartFillScope(meta, "triage"),
    cycles: resolveCyclePrefs(meta),
    automation_preset: resolveAutomationPreset(meta),
    automation_start_delay_minutes: resolveAutomationStartDelayMinutes(meta),
    automation_efforts: resolveAutomationEfforts(meta),
    analytics_consent: resolveAnalyticsConsent(meta),
    notifications: resolveNotificationPrefs(meta),
    agent,
  };
}

export async function getAccountSettings({
  userId,
}: {
  userId: string;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const [{ data, error }, agent] = await Promise.all([
    service.auth.admin.getUserById(userId),
    readAgentPrefs(userId),
  ]);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Account not found." };
  }
  if (!agent.ok) return { ok: false, error: agent.error };
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    settings: toSettings(meta, data.user.email ?? null, agent.prefs),
  };
}

export async function updateAccountSettings({
  userId,
  input,
}: {
  userId: string;
  input: Record<string, unknown>;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const { data: current, error: readErr } =
    await service.auth.admin.getUserById(userId);
  if (readErr || !current.user) {
    return { ok: false, error: readErr?.message ?? "Account not found." };
  }
  const meta = (current.user.user_metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...meta };

  // Numo may read and explain code-worker settings, but only the authenticated
  // Account settings route may change them. Keep this check here as a
  // server-side boundary even when a caller forges fields absent from the tool
  // schema.
  if ("default_model" in input || "default_reasoning_level" in input) {
    return {
      ok: false,
      error:
        "Code-worker model and reasoning can only be changed in Account settings.",
    };
  }

  if ("display_name" in input) {
    const name = typeof input.display_name === "string" ? input.display_name.trim() : "";
    if (!name) return { ok: false, error: "display_name cannot be empty." };
    next.display_name = name;
    next.full_name = name;
  }
  if ("locale" in input) {
    if (!locales.includes(input.locale as Locale)) {
      return { ok: false, error: `locale must be one of: ${locales.join(", ")}.` };
    }
    next.locale = input.locale;
  }
  if ("theme" in input) {
    // `null` clears the account theme: devices fall back to their own default.
    if (input.theme === null) {
      delete next[ACCOUNT_THEME_META_KEY];
    } else if (!isAccountTheme(input.theme)) {
      return { ok: false, error: "theme must be one of: light, dark, system." };
    } else {
      next[ACCOUNT_THEME_META_KEY] = input.theme;
    }
  }
  if ("numo_default_status" in input) {
    if (!isNumoDefaultStatus(input.numo_default_status)) {
      return {
        ok: false,
        error: "numo_default_status must be one of: triage, backlog, todo.",
      };
    }
    next.numo_default_status = input.numo_default_status;
  }
  if ("send_shortcut" in input) {
    if (!isSendMode(input.send_shortcut)) {
      return {
        ok: false,
        error: "send_shortcut must be one of: mod-enter, enter.",
      };
    }
    next[SEND_MODE_META_KEY] = input.send_shortcut;
  }
  if ("auto_assign_created" in input) {
    if (typeof input.auto_assign_created !== "boolean") {
      return { ok: false, error: "auto_assign_created must be a boolean." };
    }
    next.auto_assign_created = input.auto_assign_created;
  }
  if ("auto_assign_on_start" in input) {
    if (typeof input.auto_assign_on_start !== "boolean") {
      return { ok: false, error: "auto_assign_on_start must be a boolean." };
    }
    next[AUTO_ASSIGN_ON_START_META_KEY] = input.auto_assign_on_start;
  }
  if ("prompt_copy_auto_start" in input) {
    if (typeof input.prompt_copy_auto_start !== "boolean") {
      return { ok: false, error: "prompt_copy_auto_start must be a boolean." };
    }
    next[PROMPT_COPY_AUTO_START_META_KEY] = input.prompt_copy_auto_start;
  }
  if (SMART_FILL_META_KEY in input) {
    if (typeof input[SMART_FILL_META_KEY] !== "boolean") {
      return { ok: false, error: "smart_fill must be a boolean." };
    }
    next[SMART_FILL_META_KEY] = input[SMART_FILL_META_KEY];
  }
  for (const key of [SMART_FILL_CREATED_META_KEY, SMART_FILL_TRIAGE_META_KEY]) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
  }

  // Automation preset (MIN-147). `null` erases it — that's the way to
  // say “no more loops”, without having to turn off each project.
  if ("automation_preset" in input) {
    if (input.automation_preset === null) {
      delete next[AUTOMATION_PRESET_META_KEY];
    } else if (isAutomationPresetId(input.automation_preset)) {
      next[AUTOMATION_PRESET_META_KEY] = input.automation_preset;
    } else {
      return { ok: false, error: "automation_preset is not a known preset." };
    }
  }

  // Start delay of the automation loop: the reprieve between the trigger and
  // the agent run. Same bounds as `resolveAutomationStartDelayMinutes`.
  if ("automation_start_delay_minutes" in input) {
    const n = input.automation_start_delay_minutes;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > MAX_AUTOMATION_START_DELAY_MIN
    ) {
      return {
        ok: false,
        error: `automation_start_delay_minutes must be an integer between 0 and ${MAX_AUTOMATION_START_DELAY_MIN}.`,
      };
    }
    next[AUTOMATION_START_DELAY_META_KEY] = n;
  }

  // Per-effort switches of the automation loop. Partial on purpose: only the
  // keys sent change, the others keep their value (they default to enabled).
  if ("automation_efforts" in input) {
    const raw = input.automation_efforts;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: "automation_efforts must be an object of effort → boolean." };
    }
    const patch: Record<string, boolean> = {};
    for (const [effort, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!ALL_EFFORTS.includes(effort as IssueEffort)) {
        return { ok: false, error: `automation_efforts carries an unknown effort: ${effort}.` };
      }
      if (typeof value !== "boolean") {
        return { ok: false, error: `automation_efforts.${effort} must be a boolean.` };
      }
      patch[effort] = value;
    }
    // Merge over the CURRENT value, not over the default: a second partial
    // write must not re-enable a size the user disabled earlier.
    const current = resolveAutomationEfforts(meta);
    next[AUTOMATION_EFFORTS_META_KEY] = { ...current, ...patch };
  }

  // Analytics consent (GDPR). `null` clears the stored answer, so the user
  // is asked again; the banner itself stays a client concern.
  if ("analytics_consent" in input) {
    if (input.analytics_consent === null) {
      delete next[ANALYTICS_CONSENT_META_KEY];
    } else if (
      input.analytics_consent === "accepted" ||
      input.analytics_consent === "declined"
    ) {
      next[ANALYTICS_CONSENT_META_KEY] = input.analytics_consent;
    } else {
      return {
        ok: false,
        error: "analytics_consent must be 'accepted', 'declined' or null.",
      };
    }
  }

  // Inbox (MIN-82) — one toggle per family, input keys = meta keys.
  for (const category of NOTIFICATION_CATEGORIES) {
    const key = NOTIFICATION_CATEGORY_META_KEYS[category];
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
  }

  // Cycles (MIN-32) — same flat input keys as the meta keys.
  for (const key of [
    CYCLES_ENABLED_META_KEY,
    CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
    CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  ]) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
  }
  if (CYCLE_DURATION_WEEKS_META_KEY in input) {
    if (input[CYCLE_DURATION_WEEKS_META_KEY] !== 1 && input[CYCLE_DURATION_WEEKS_META_KEY] !== 2) {
      return { ok: false, error: `${CYCLE_DURATION_WEEKS_META_KEY} must be 1 or 2.` };
    }
    next[CYCLE_DURATION_WEEKS_META_KEY] = input[CYCLE_DURATION_WEEKS_META_KEY];
  }
  if (CYCLE_START_DOW_META_KEY in input) {
    const dow = input[CYCLE_START_DOW_META_KEY];
    if (typeof dow !== "number" || !Number.isInteger(dow) || dow < 1 || dow > 7) {
      return { ok: false, error: `${CYCLE_START_DOW_META_KEY} must be 1 (Monday) to 7 (Sunday).` };
    }
    next[CYCLE_START_DOW_META_KEY] = dow;
  }
  if (CYCLE_INTENSITY_META_KEY in input) {
    if (!isCycleIntensity(input[CYCLE_INTENSITY_META_KEY])) {
      return { ok: false, error: `${CYCLE_INTENSITY_META_KEY} must be light, medium or heavy.` };
    }
    next[CYCLE_INTENSITY_META_KEY] = input[CYCLE_INTENSITY_META_KEY];
  }
  if (CYCLE_UPCOMING_COUNT_META_KEY in input) {
    const n = input[CYCLE_UPCOMING_COUNT_META_KEY];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 4) {
      return { ok: false, error: `${CYCLE_UPCOMING_COUNT_META_KEY} must be an integer between 1 and 4.` };
    }
    next[CYCLE_UPCOMING_COUNT_META_KEY] = n;
  }

  // Agent preferences outside user_metadata. Numo may still change the branch
  // prefix, which is unrelated to the worker's model configuration.
  const agentPatch: Record<string, unknown> = {};
  if ("branch_prefix" in input) {
    const prefix =
      input.branch_prefix === null
        ? DEFAULT_AGENT_BRANCH_PREFIX
        : normalizeAgentBranchPrefix(input.branch_prefix);
    if (!prefix) {
      return { ok: false, error: "branch_prefix is not a valid Git branch prefix." };
    }
    agentPatch.branch_prefix = prefix;
  }

  // Sandbox preferences (MIN-46 family): same `user_agent_preferences` row as
  // the branch prefix, same writer contract. Each field is validated alone so
  // a two-field patch that carries one bad value changes nothing at all.
  if ("sandbox_region" in input) {
    if (!isSandboxRegion(input.sandbox_region)) {
      return { ok: false, error: "sandbox_region must be one of: eu, us." };
    }
    agentPatch.sandbox_region = input.sandbox_region;
  }
  if ("sandbox_size" in input) {
    if (!isSandboxSize(input.sandbox_size)) {
      return { ok: false, error: "sandbox_size must be one of: standard, performance." };
    }
    agentPatch.sandbox_size = input.sandbox_size;
  }

  // Nothing recognised to change.
  const CHANGEABLE = [
    "display_name",
    "locale",
    "theme",
    "numo_default_status",
    "send_shortcut",
    "auto_assign_created",
    "auto_assign_on_start",
    "prompt_copy_auto_start",
    SMART_FILL_META_KEY,
    SMART_FILL_CREATED_META_KEY,
    SMART_FILL_TRIAGE_META_KEY,
    // Without it, a call carrying ONLY the preset came out here as “nothing to
    // change” — even though the block that wrote it had just placed it.
    AUTOMATION_PRESET_META_KEY,
    AUTOMATION_START_DELAY_META_KEY,
    AUTOMATION_EFFORTS_META_KEY,
    ANALYTICS_CONSENT_META_KEY,
    ...NOTIFICATION_CATEGORIES.map((c) => NOTIFICATION_CATEGORY_META_KEYS[c]),
    CYCLES_ENABLED_META_KEY,
    CYCLE_DURATION_WEEKS_META_KEY,
    CYCLE_START_DOW_META_KEY,
    CYCLE_INTENSITY_META_KEY,
    CYCLE_UPCOMING_COUNT_META_KEY,
    CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
    CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  ];
  const metaChanged = CHANGEABLE.some((k) => k in input);
  if (!metaChanged && Object.keys(agentPatch).length === 0) {
    return { ok: false, error: "No account settings to update." };
  }

  if (Object.keys(agentPatch).length > 0) {
    const { error: agentErr } = await service
      .from("user_agent_preferences")
      .upsert(
        { user_id: userId, updated_at: new Date().toISOString(), ...agentPatch },
        { onConflict: "user_id" }
      );
    if (agentErr) {
      console.error("[account-settings] agent prefs update failed:", agentErr.message);
      return { ok: false, error: agentErr.message };
    }
  }

  if (metaChanged) {
    const { error: writeErr } = await service.auth.admin.updateUserById(userId, {
      user_metadata: next,
    });
    if (writeErr) {
      console.error("[account-settings] update failed:", writeErr.message);
      return { ok: false, error: writeErr.message };
    }
  }

  // ONLY one path to construct the rendered state, regardless of what moved —
  // and it propagates a read failure instead of inventing values.
  return getAccountSettings({ userId });
}
