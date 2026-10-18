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
  SMART_FILL_RELATIONS_META_KEY,
  ISSUE_INDEXING_META_KEY,
  resolveIssueIndexing,
  resolveSmartFill,
  resolveSmartFillRelations,
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
  auto_assign_created: boolean;
  auto_assign_on_start: boolean;
  prompt_copy_auto_start: boolean;
  /** Keyboard gesture that sends a composer (mod-enter | enter). */
  send_shortcut: SendMode;
  smart_fill: boolean;
  smart_fill_created: boolean;
  smart_fill_triage: boolean;
  /** Smart Fill relations (MIN-717): link related issues and dependencies after save. */
  smart_fill_relations: boolean;
  /** Issue indexing (MIN-717): embedding vectors of the account's issues, independent of Smart Fill. */
  issue_indexing: boolean;
  /** Cycles (MIN-32) — Account → Cycles, one key per knob in user_metadata. */
  cycles: CyclePrefs;
  /** Product-analytics consent. `null` = never answered. */
  analytics_consent: "accepted" | "declined" | null;
  /** Inbox (MIN-82) — one toggle per trigger family. */
  notifications: NotificationPrefs;
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
    auto_assign_created: meta.auto_assign_created === true,
    auto_assign_on_start: resolveAutoAssignOnStart(meta),
    prompt_copy_auto_start: resolvePromptCopyAutoStart(meta),
    send_shortcut: resolveSendMode(meta),
    smart_fill: resolveSmartFill(meta),
    smart_fill_created: resolveSmartFillScope(meta, "created"),
    smart_fill_triage: resolveSmartFillScope(meta, "triage"),
    smart_fill_relations: resolveSmartFillRelations(meta),
    issue_indexing: resolveIssueIndexing(meta),
    cycles: resolveCyclePrefs(meta),
    analytics_consent: resolveAnalyticsConsent(meta),
    notifications: resolveNotificationPrefs(meta),
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
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Account not found." };
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    settings: toSettings(meta, data.user.email ?? null),
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
  for (const key of [
    SMART_FILL_CREATED_META_KEY,
    SMART_FILL_TRIAGE_META_KEY,
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
    "send_shortcut",
    "auto_assign_created",
    "auto_assign_on_start",
    "prompt_copy_auto_start",
    SMART_FILL_META_KEY,
    SMART_FILL_CREATED_META_KEY,
    SMART_FILL_TRIAGE_META_KEY,
    SMART_FILL_RELATIONS_META_KEY,
    ISSUE_INDEXING_META_KEY,
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
  if (!metaChanged) {
    return { ok: false, error: "No account settings to update." };
  }

  const { error: writeErr } = await service.auth.admin.updateUserById(userId, {
    user_metadata: next,
  });
  if (writeErr) {
    console.error("[account-settings] update failed:", writeErr.message);
    return { ok: false, error: writeErr.message };
  }

  // ONLY one path to construct the rendered state, regardless of what moved —
  // and it propagates a read failure instead of inventing values.
  return getAccountSettings({ userId });
}
