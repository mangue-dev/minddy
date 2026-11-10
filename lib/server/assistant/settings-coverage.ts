/**
 * Which Numo tool changes each setting of the app (MIN-955).
 *
 * Every setting a person can change in Account settings or in a project's
 * settings is listed here, with either the tool field Numo uses to change it
 * or the reason it stays a human gesture. `settings-coverage.test.ts` scans
 * the settings screens and the update cores: a new preference key, settings
 * tab or project field that is missing from this file fails the suite, and so
 * does an entry whose tool cannot actually change it.
 *
 * When the test fails on a new setting, give Numo a way to change it (a field
 * of `update_account_settings`, `update_project` or another tool) and list it
 * here. Mark it human-only only when the gesture must stay the person's own:
 * credentials and identities, account deletion, connecting a forge, device
 * settings, or state that is not a setting.
 */

/** A setting Numo changes through `update_account_settings`. */
export interface NumoAccountSetting {
  /** Where `get_account_settings` returns it ("cycles.enabled"). */
  read: string;
  /** A valid, non-default value the round trip writes and reads back. */
  sample: unknown;
  /** What the read returns for `sample` when it differs from it. */
  readBack?: unknown;
}

/** A key Numo deliberately does not change, with the reason. */
export interface HumanOnly {
  humanOnly: string;
}

export type AccountKeyCoverage = NumoAccountSetting | HumanOnly;

/**
 * Every `user_metadata` key of the account, keyed by the metadata key, which
 * is also the input field of `update_account_settings`.
 */
export const ACCOUNT_METADATA_COVERAGE: Readonly<Record<string, AccountKeyCoverage>> = {
  // Profile
  display_name: { read: "display_name", sample: "Camille R." },
  full_name: { humanOnly: "Mirror of display_name, written with it." },
  // Preferences → Appearance, keyboard, calendar
  locale: { read: "locale", sample: "fr" },
  theme: { read: "theme", sample: "dark" },
  theme_light: { read: "theme_light", sample: "ink-light" },
  theme_dark: { read: "theme_dark", sample: "ink-dark" },
  theme_transparency: { read: "theme_transparency", sample: false },
  send_shortcut: { read: "send_shortcut", sample: "enter" },
  week_start: { read: "week_start", sample: "saturday" },
  // Preferences → Coding agent (MIN-951)
  prompt_send_to_agent: { read: "prompt_send_to_agent", sample: true },
  prompt_send_agent: { read: "prompt_send_agent", sample: "codex" },
  // Preferences → Voice dictation (MIN-773)
  dictation_cleanup: { read: "dictation_cleanup", sample: false },
  dictation_vocabulary: {
    read: "dictation_vocabulary",
    sample: [{ term: "minddy" }, { term: "Numo", heardAs: "new mo" }],
  },
  // Numo
  numo_memory: { read: "numo_memory", sample: false },
  numo_background: { read: "numo_background", sample: false },
  numo_default_status: { read: "numo_default_status", sample: "todo" },
  // Issues
  auto_assign_created: { read: "auto_assign_created", sample: true },
  auto_assign_on_start: { read: "auto_assign_on_start", sample: false },
  prompt_copy_auto_start: { read: "prompt_copy_auto_start", sample: false },
  // Smart Fill
  smart_fill: { read: "smart_fill", sample: false },
  smart_fill_created: { read: "smart_fill_created", sample: false },
  smart_fill_triage: { read: "smart_fill_triage", sample: false },
  smart_fill_reevaluate: { read: "smart_fill_reevaluate", sample: false },
  smart_fill_title: { read: "smart_fill_title", sample: false },
  smart_fill_relations: { read: "smart_fill_relations", sample: false },
  smart_fill_objectives: { read: "smart_fill_objectives", sample: false },
  smart_fill_objective_name: { read: "smart_fill_objective_name", sample: false },
  issue_indexing: { read: "issue_indexing", sample: false },
  // Cycles
  cycles_enabled: { read: "cycles.enabled", sample: true },
  cycle_duration_weeks: { read: "cycles.durationWeeks", sample: 2 },
  cycle_start_dow: { read: "cycles.startDow", sample: 3 },
  cycle_intensity: { read: "cycles.intensity", sample: "heavy" },
  cycle_upcoming_count: { read: "cycles.upcomingCount", sample: 4 },
  cycle_auto_capture_started: { read: "cycles.autoCaptureStarted", sample: false },
  cycle_auto_capture_completed: { read: "cycles.autoCaptureCompleted", sample: false },
  // Inbox
  notif_assigned: { read: "notifications.assigned", sample: false },
  notif_mention: { read: "notifications.mention", sample: false },
  notif_comment: { read: "notifications.comment", sample: false },
  notif_agent: { read: "notifications.agent", sample: false },
  notif_routine: { read: "notifications.routine", sample: false },
  notif_pull_request: { read: "notifications.pullRequest", sample: false },
  notif_feedback: { read: "notifications.feedback", sample: false },
  notif_page: { read: "notifications.page", sample: false },
  notif_numo: { read: "notifications.numo", sample: false },
  // Data
  analytics_consent: { read: "analytics_consent", sample: "declined" },
  // Interface state, not settings
  onboarding_steps: { humanOnly: "Onboarding checklist progress, recorded by the checklist itself." },
  onboarding_dismissed: { humanOnly: "Onboarding checklist state, not a setting." },
  onboarding_version: { humanOnly: "Onboarding checklist state, not a setting." },
  onboarding_started: { humanOnly: "Onboarding checklist state, not a setting." },
  desktop_prompt_dismissed: { humanOnly: "Whether the desktop app banner was dismissed: interface state." },
  pwa_prompt_dismissed: { humanOnly: "Whether the install hint was dismissed: interface state." },
  tab_orders: { humanOnly: "Order of the view tabs, set by dragging them: interface state." },
};

/** A settings tab and the tools that change what it shows. */
export interface TabCoverage {
  /** Numo tools that change this tab's settings. */
  tools: readonly string[];
  /** What on the tab stays a human gesture, and why. */
  humanOnly?: string;
}

/** Account settings tabs (`components/settings/account-settings-page.tsx`). */
export const ACCOUNT_TAB_COVERAGE: Readonly<Record<string, TabCoverage>> = {
  profile: {
    tools: ["update_account_settings"],
    humanOnly: "The avatar is an upload or a new random picture chosen by the person.",
  },
  security: {
    tools: [],
    humanOnly: "Email, password, two-factor authentication and sessions are credentials.",
  },
  preferences: {
    tools: ["update_account_settings"],
    humanOnly: "The desktop app's window material, server and updates are device settings.",
  },
  "hidden-projects": { tools: ["update_account_settings"] },
  issues: { tools: ["update_account_settings"] },
  "smart-fill": { tools: ["update_account_settings"] },
  cycles: { tools: ["update_account_settings"] },
  inbox: {
    tools: ["update_account_settings"],
    humanOnly: "Push notifications are granted per device by its browser.",
  },
  numo: { tools: ["update_account_settings", "remember", "forget", "create_watch", "update_watch", "cancel_watch"] },
  ai: {
    tools: [],
    humanOnly: "Provider keys are credentials, and each usage's provider and model are tied to those keys and to billing.",
  },
  mcp: {
    tools: ["configure_mcp_connection"],
    humanOnly: "Authorizing or revoking the apps and assistants connected to minddy is an access decision.",
  },
  git: {
    tools: [],
    humanOnly: "Connecting a forge account or an identity acts on the person's behalf elsewhere.",
  },
  data: {
    tools: ["update_account_settings"],
    humanOnly: "Exporting and deleting the account are the person's own gestures.",
  },
};

/** Project settings tabs (`components/settings/project-settings-page.tsx`). */
export const PROJECT_TAB_COVERAGE: Readonly<Record<string, TabCoverage>> = {
  general: {
    tools: ["update_project", "update_account_settings"],
    humanOnly: "The icon is an upload; leaving the project and moving it to the trash stay the person's own.",
  },
  categories: {
    tools: ["create_category", "update_category", "reorder_categories"],
    humanOnly: "Deleting a category removes it from every issue.",
  },
  members: {
    tools: ["invite_member", "update_member_role", "remove_member", "cancel_invitation"],
    humanOnly: "Transferring ownership hands the project to someone else.",
  },
  recurrences: { tools: ["update_issues"] },
  "smart-assign": { tools: ["update_project"] },
  feedback: { tools: ["update_project", "configure_feedback_board"] },
  git: {
    tools: [],
    humanOnly: "Linking repositories goes through the forge's own authorization.",
  },
  import: {
    tools: [],
    humanOnly: "An import reads a file or another tracker's account the person provides.",
  },
  integrations: {
    tools: ["create_integration", "update_integration_webhook", "update_integration_objective", "revoke_integration"],
    humanOnly: "Choosing where a webhook delivers stays the owner's (see webhookHumanOnly).",
  },
};

/**
 * Fields `updateProjectSettings` accepts, and the `update_project` field that
 * changes each one (the same name), or why Numo leaves it.
 */
export const PROJECT_FIELD_COVERAGE: Readonly<Record<string, "update_project" | HumanOnly>> = {
  name: "update_project",
  key: "update_project",
  color: "update_project",
  smart_assign_enabled: "update_project",
  smart_assign_rules: "update_project",
  smart_triage_mode: "update_project",
  feedback_review_enabled: "update_project",
  feedback_review_skip_over_budget: "update_project",
  feedback_translate_enabled: "update_project",
  feedback_team_language: "update_project",
  feedback_no_translate_languages: "update_project",
  automations: { humanOnly: "Retired: project automations became routines, and the core refuses it." },
  automations_enabled: { humanOnly: "Retired: project automations became routines, and the core refuses it." },
};

export function isHumanOnly(value: unknown): value is HumanOnly {
  return typeof value === "object" && value !== null && "humanOnly" in value;
}
