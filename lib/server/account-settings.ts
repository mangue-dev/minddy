import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NUMO_MEMORY_META_KEY, resolveNumoMemoryEnabled } from "@/lib/numo-memory";
import { NUMO_BACKGROUND_META_KEY, resolveNumoBackgroundEnabled } from "@/lib/numo-background";
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
  SMART_FILL_RELATIONS_META_KEY,
  SMART_FILL_REEVALUATE_META_KEY,
  SMART_FILL_TITLE_META_KEY,
  SMART_FILL_OBJECTIVES_META_KEY,
  SMART_FILL_OBJECTIVE_NAME_META_KEY,
  ISSUE_INDEXING_META_KEY,
  resolveIssueIndexing,
  resolveSmartFillObjectiveName,
  resolveSmartFillObjectives,
  resolveSmartFill,
  resolveSmartFillReevaluation,
  resolveSmartFillRelations,
  resolveSmartFillScope,
  resolveSmartFillTitle,
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
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META_KEYS,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import {
  ACCOUNT_THEME_META_KEY,
  isAccountTheme,
  resolveAccountTheme,
  type AccountTheme,
} from "@/lib/account-theme";
import {
  DARK_THEME_PRESETS,
  isThemePresetFor,
  LIGHT_THEME_PRESETS,
  resolveThemeAppearance,
  THEME_PRESET_META_KEYS,
  THEME_TRANSPARENCY_META_KEY,
  type DarkThemePreset,
  type LightThemePreset,
  type ThemeMode,
} from "@/lib/theme-presets";
import { emailLocalPart } from "@/lib/display-name";
import {
  SEND_MODE_META_KEY,
  isSendMode,
  resolveSendMode,
  type SendMode,
} from "@/lib/keyboard/send-shortcut";
import { ANALYTICS_CONSENT_META_KEY, resolveAnalyticsConsent } from "@/lib/cookie-consent";
import { DICTATION_CLEANUP_META_KEY, resolveDictationCleanup } from "@/lib/dictation-context";
import {
  DICTATION_VOCABULARY_META_KEY,
  MAX_VOCABULARY_ENTRIES,
  resolveDictationVocabulary,
  sanitizeVocabulary,
  type VocabularyEntry,
} from "@/lib/dictation-vocabulary";
import {
  AGENT_TARGET_IDS,
  PROMPT_SEND_AGENT_META_KEY,
  PROMPT_SEND_META_KEY,
  resolvePromptSend,
  resolvePromptSendAgent,
  type AgentTarget,
} from "@/lib/prompt-delivery";
import {
  HiddenProjectsError,
  listHiddenProjectIds,
  setProjectHidden,
} from "@/lib/server/hidden-projects";
import {
  WEEK_START_META_KEY,
  WEEK_START_OPTIONS,
  isWeekStartPreference,
  resolveWeekStartPreference,
  type WeekStartPreference,
} from "@/lib/week-start";

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
  /** Palette used in light mode (MIN-696); the Minddy one when never set. */
  theme_light: LightThemePreset;
  /** Palette used in dark mode, chosen independently of the light one. */
  theme_dark: DarkThemePreset;
  /** Translucent, blurred popovers and menus. */
  theme_transparency: boolean;
  numo_default_status: ReturnType<typeof resolveNumoDefaultStatus>;
  /** Numo's memory (MIN-915): Numo reads and keeps memories about the user. */
  numo_memory: boolean;
  /** Background Numo (MIN-929): Numo acts on workspace events while the user is away. Needs the memory. */
  numo_background: boolean;
  auto_assign_created: boolean;
  auto_assign_on_start: boolean;
  prompt_copy_auto_start: boolean;
  /** Keyboard gesture that sends a composer (mod-enter | enter). */
  send_shortcut: SendMode;
  /** Voice dictation cleanup pass (MIN-773); off = raw transcription. */
  dictation_cleanup: boolean;
  /** Dictation vocabulary (MIN-773): spellings and replacements. */
  dictation_vocabulary: VocabularyEntry[];
  /** Coding agent (MIN-951): prompts open in the agent's app instead of being copied. */
  prompt_send_to_agent: boolean;
  /** The app prompts open in; null = the first connected one. */
  prompt_send_agent: AgentTarget | null;
  /** First day of the week (MIN-881); `auto` follows the interface language. */
  week_start: WeekStartPreference;
  smart_fill: boolean;
  smart_fill_created: boolean;
  smart_fill_triage: boolean;
  /** Smart Fill re-evaluation (MIN-750): read an issue again after its text changes. */
  smart_fill_reevaluate: boolean;
  /** Smart Fill title (MIN-798): write an empty title from the description. */
  smart_fill_title: boolean;
  /** Smart Fill relations (MIN-717): link related issues and dependencies after save. */
  smart_fill_relations: boolean;
  /** Smart Fill for objectives (MIN-919): color and target date of new objectives. */
  smart_fill_objectives: boolean;
  /** Smart Fill writes the name of an objective created without one (MIN-919). */
  smart_fill_objective_name: boolean;
  /** Issue indexing (MIN-717): embedding vectors of the account's issues, independent of Smart Fill. */
  issue_indexing: boolean;
  /** Cycles (MIN-32) — Account → Cycles, one key per knob in user_metadata. */
  cycles: CyclePrefs;
  /** Product-analytics consent. `null` = never answered. */
  analytics_consent: "accepted" | "declined" | null;
  /** Inbox (MIN-82) — one toggle per trigger family. */
  notifications: NotificationPrefs;
  /**
   * Projects the user hid from their sidebar and lists (MIN-692). Only read
   * when the caller passes the request's RLS client; otherwise absent.
   */
  hidden_project_ids?: string[];
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

function toSettings(
  meta: Record<string, unknown>,
  email: string | null,
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
    ...(() => {
      const appearance = resolveThemeAppearance(meta);
      return {
        theme_light: appearance.light,
        theme_dark: appearance.dark,
        theme_transparency: appearance.transparency,
      };
    })(),
    numo_default_status: resolveNumoDefaultStatus(meta),
    numo_memory: resolveNumoMemoryEnabled(meta),
    numo_background: resolveNumoBackgroundEnabled(meta),
    auto_assign_created: meta.auto_assign_created === true,
    auto_assign_on_start: resolveAutoAssignOnStart(meta),
    prompt_copy_auto_start: resolvePromptCopyAutoStart(meta),
    send_shortcut: resolveSendMode(meta),
    dictation_cleanup: resolveDictationCleanup(meta),
    dictation_vocabulary: resolveDictationVocabulary(meta),
    prompt_send_to_agent: resolvePromptSend(meta),
    prompt_send_agent: resolvePromptSendAgent(meta),
    week_start: resolveWeekStartPreference(meta),
    smart_fill: resolveSmartFill(meta),
    smart_fill_created: resolveSmartFillScope(meta, "created"),
    smart_fill_triage: resolveSmartFillScope(meta, "triage"),
    smart_fill_reevaluate: resolveSmartFillReevaluation(meta),
    smart_fill_title: resolveSmartFillTitle(meta),
    smart_fill_relations: resolveSmartFillRelations(meta),
    smart_fill_objectives: resolveSmartFillObjectives(meta),
    smart_fill_objective_name: resolveSmartFillObjectiveName(meta),
    issue_indexing: resolveIssueIndexing(meta),
    cycles: resolveCyclePrefs(meta),
    analytics_consent: resolveAnalyticsConsent(meta),
    notifications: resolveNotificationPrefs(meta),
  };
}

/**
 * `supabase` is the request's RLS client. With it, the read also lists the
 * hidden projects and the update can hide or show projects; without it (a
 * caller that only has the service client), those stay out of reach.
 */
export async function getAccountSettings({
  userId,
  supabase,
}: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Account not found." };
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const settings = toSettings(meta, data.user.email ?? null);
  if (supabase) {
    try {
      settings.hidden_project_ids = await listHiddenProjectIds(supabase, userId);
    } catch (e) {
      if (!(e instanceof HiddenProjectsError)) throw e;
      return { ok: false, error: "Could not read the hidden projects." };
    }
  }
  return { ok: true, settings };
}

const HIDE_PROJECTS_INPUT = "hide_project_ids";
const SHOW_PROJECTS_INPUT = "show_project_ids";
const MAX_PROJECT_IDS = 50;

/** A list of project ids from the tool input, or an error message. */
function projectIdList(input: Record<string, unknown>, key: string): string[] | string {
  if (!(key in input)) return [];
  const value = input[key];
  if (
    !Array.isArray(value) ||
    value.length > MAX_PROJECT_IDS ||
    !value.every((id) => typeof id === "string" && id.trim() !== "")
  ) {
    return `${key} must be a list of at most ${MAX_PROJECT_IDS} project ids.`;
  }
  return [...new Set(value.map((id: string) => id.trim()))];
}

export async function updateAccountSettings({
  userId,
  input,
  supabase,
}: {
  userId: string;
  input: Record<string, unknown>;
  supabase?: SupabaseClient;
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
  if (["automation_preset", "automation_start_delay_minutes", "automation_start_delay_min", "automation_efforts"].some(key => key in input)) {
    return { ok: false, error: "Project automations were replaced by routines. Configure a routine instead." };
  }
  const next: Record<string, unknown> = { ...meta };

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
  for (const mode of ["light", "dark"] as const satisfies readonly ThemeMode[]) {
    const key = THEME_PRESET_META_KEYS[mode];
    if (!(key in input)) continue;
    // `null` resets THIS mode to the Minddy palette; the other mode and the
    // light/dark/system selector stay as they are.
    if (input[key] === null) {
      delete next[key];
    } else if (!isThemePresetFor(mode, input[key])) {
      const allowed = mode === "light" ? LIGHT_THEME_PRESETS : DARK_THEME_PRESETS;
      return { ok: false, error: `${key} must be one of: ${allowed.join(", ")}.` };
    } else {
      next[key] = input[key];
    }
  }
  if (THEME_TRANSPARENCY_META_KEY in input) {
    const value = input[THEME_TRANSPARENCY_META_KEY];
    if (value === null) {
      delete next[THEME_TRANSPARENCY_META_KEY];
    } else if (typeof value !== "boolean") {
      return { ok: false, error: `${THEME_TRANSPARENCY_META_KEY} must be a boolean.` };
    } else {
      next[THEME_TRANSPARENCY_META_KEY] = value;
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
  if (WEEK_START_META_KEY in input) {
    if (!isWeekStartPreference(input[WEEK_START_META_KEY])) {
      return {
        ok: false,
        error: `${WEEK_START_META_KEY} must be one of: ${WEEK_START_OPTIONS.join(", ")}.`,
      };
    }
    next[WEEK_START_META_KEY] = input[WEEK_START_META_KEY];
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
  if (NUMO_MEMORY_META_KEY in input) {
    if (typeof input[NUMO_MEMORY_META_KEY] !== "boolean") {
      return { ok: false, error: "numo_memory must be a boolean." };
    }
    next[NUMO_MEMORY_META_KEY] = input[NUMO_MEMORY_META_KEY];
  }
  if (NUMO_BACKGROUND_META_KEY in input) {
    if (typeof input[NUMO_BACKGROUND_META_KEY] !== "boolean") {
      return { ok: false, error: "numo_background must be a boolean." };
    }
    // Background Numo reads its standing instructions and authorizations
    // from the memory: it cannot be turned on while the memory is off.
    if (input[NUMO_BACKGROUND_META_KEY] && !resolveNumoMemoryEnabled(next)) {
      return { ok: false, error: "numo_background needs numo_memory: turn Numo's memory on first." };
    }
    next[NUMO_BACKGROUND_META_KEY] = input[NUMO_BACKGROUND_META_KEY];
  }
  if ("prompt_copy_auto_start" in input) {
    if (typeof input.prompt_copy_auto_start !== "boolean") {
      return { ok: false, error: "prompt_copy_auto_start must be a boolean." };
    }
    next[PROMPT_COPY_AUTO_START_META_KEY] = input.prompt_copy_auto_start;
  }
  if (PROMPT_SEND_AGENT_META_KEY in input) {
    const agent = input[PROMPT_SEND_AGENT_META_KEY];
    // `null` clears the choice: prompts open in the first connected app.
    if (agent === null) {
      delete next[PROMPT_SEND_AGENT_META_KEY];
    } else if (!AGENT_TARGET_IDS.includes(agent as AgentTarget)) {
      return {
        ok: false,
        error: `${PROMPT_SEND_AGENT_META_KEY} must be one of: ${AGENT_TARGET_IDS.join(", ")}, or null.`,
      };
    } else {
      next[PROMPT_SEND_AGENT_META_KEY] = agent;
    }
  }
  if (DICTATION_VOCABULARY_META_KEY in input) {
    const raw = input[DICTATION_VOCABULARY_META_KEY];
    if (!Array.isArray(raw) || raw.length > MAX_VOCABULARY_ENTRIES) {
      return {
        ok: false,
        error: `${DICTATION_VOCABULARY_META_KEY} must be a list of at most ${MAX_VOCABULARY_ENTRIES} entries.`,
      };
    }
    // The same normalization as the settings screen: unusable entries drop,
    // duplicates merge. An empty list clears the vocabulary.
    next[DICTATION_VOCABULARY_META_KEY] = sanitizeVocabulary(raw);
  }
  const hide = projectIdList(input, HIDE_PROJECTS_INPUT);
  if (typeof hide === "string") return { ok: false, error: hide };
  const show = projectIdList(input, SHOW_PROJECTS_INPUT);
  if (typeof show === "string") return { ok: false, error: show };
  if (hide.some((id) => show.includes(id))) {
    return { ok: false, error: "A project cannot be both hidden and shown in one call." };
  }
  if ((hide.length > 0 || show.length > 0) && !supabase) {
    return { ok: false, error: "Hidden projects cannot be changed from here." };
  }
  if (SMART_FILL_META_KEY in input) {
    if (typeof input[SMART_FILL_META_KEY] !== "boolean") {
      return { ok: false, error: "smart_fill must be a boolean." };
    }
    next[SMART_FILL_META_KEY] = input[SMART_FILL_META_KEY];
  }
  for (const key of [
    DICTATION_CLEANUP_META_KEY,
    PROMPT_SEND_META_KEY,
    SMART_FILL_OBJECTIVES_META_KEY,
    SMART_FILL_OBJECTIVE_NAME_META_KEY,
    SMART_FILL_CREATED_META_KEY,
    SMART_FILL_TRIAGE_META_KEY,
    SMART_FILL_REEVALUATE_META_KEY,
    SMART_FILL_TITLE_META_KEY,
    SMART_FILL_RELATIONS_META_KEY,
    ISSUE_INDEXING_META_KEY,
  ]) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
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

  // Nothing recognised to change.
  const CHANGEABLE = [
    "display_name",
    "locale",
    "theme",
    THEME_PRESET_META_KEYS.light,
    THEME_PRESET_META_KEYS.dark,
    THEME_TRANSPARENCY_META_KEY,
    "numo_default_status",
    NUMO_MEMORY_META_KEY,
    NUMO_BACKGROUND_META_KEY,
    "send_shortcut",
    WEEK_START_META_KEY,
    "auto_assign_created",
    "auto_assign_on_start",
    "prompt_copy_auto_start",
    SMART_FILL_META_KEY,
    SMART_FILL_CREATED_META_KEY,
    SMART_FILL_TRIAGE_META_KEY,
    SMART_FILL_REEVALUATE_META_KEY,
    SMART_FILL_TITLE_META_KEY,
    SMART_FILL_RELATIONS_META_KEY,
    ISSUE_INDEXING_META_KEY,
    SMART_FILL_OBJECTIVES_META_KEY,
    SMART_FILL_OBJECTIVE_NAME_META_KEY,
    DICTATION_CLEANUP_META_KEY,
    DICTATION_VOCABULARY_META_KEY,
    PROMPT_SEND_META_KEY,
    PROMPT_SEND_AGENT_META_KEY,
    // Without it, a call carrying ONLY the preset came out here as “nothing to
    // change” — even though the block that wrote it had just placed it.
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
  if (!metaChanged && hide.length === 0 && show.length === 0) {
    return { ok: false, error: "No account settings to update." };
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

  // Hidden projects (MIN-692) live in their own table, written through the
  // request's RLS client: hiding needs read access to the project.
  if (supabase) {
    try {
      const missing: string[] = [];
      for (const projectId of hide) {
        if ((await setProjectHidden(supabase, userId, projectId, true)) === "not_found") {
          missing.push(projectId);
        }
      }
      for (const projectId of show) await setProjectHidden(supabase, userId, projectId, false);
      if (missing.length > 0) {
        return { ok: false, error: `Project not found: ${missing.join(", ")}.` };
      }
    } catch (e) {
      if (!(e instanceof HiddenProjectsError)) throw e;
      return { ok: false, error: "Could not change the hidden projects." };
    }
  }

  // ONLY one path to construct the rendered state, regardless of what moved —
  // and it propagates a read failure instead of inventing values.
  return getAccountSettings({ userId, supabase });
}
