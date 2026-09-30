import "server-only";
import { locales } from "@/i18n/config";
import { isAutomationPresetId, MAX_AUTOMATION_START_DELAY_MIN } from "@/lib/automations";
import { NUMO_DEFAULT_STATUS_OPTIONS } from "@/lib/numo-default-status";

const BOOLEAN_KEYS = [
  "auto_assign_created", "auto_assign_on_start", "prompt_copy_auto_start", "smart_fill",
  "cycles_enabled", "cycle_auto_capture_started", "cycle_auto_capture_completed",
  "notif_assigned", "notif_mention", "notif_comment", "notif_agent", "notif_routine",
  "notif_pull_request", "notif_feedback", "notif_page", "onboarding_started",
  "onboarding_dismissed", "desktop_prompt_dismissed", "smart_fill_created", "smart_fill_triage",
] as const;
const ENUMS: Record<string, readonly string[]> = {
  theme: ["light", "dark", "system"], locale: locales,
  analytics_consent: ["accepted", "declined"], cycle_intensity: ["light", "medium", "heavy"],
  send_shortcut: ["enter", "mod-enter"], numo_default_status: NUMO_DEFAULT_STATUS_OPTIONS,
};
const NUMBERS: Record<string, readonly [number, number]> = {
  cycle_duration_weeks: [1, 2], cycle_start_dow: [1, 7], cycle_upcoming_count: [1, 4],
  automation_start_delay_min: [0, MAX_AUTOMATION_START_DELAY_MIN],
};

/** Auth contains public identity and bounded product preferences, never arbitrary imported content. */
export function selectImportedAccountMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of BOOLEAN_KEYS) if (typeof source[key] === "boolean") result[key] = source[key];
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (typeof source[key] === "string" && allowed.includes(source[key])) result[key] = source[key];
  }
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    const number = source[key];
    if (typeof number === "number" && Number.isInteger(number) && number >= min && number <= max) result[key] = number;
  }
  for (const key of ["display_name", "full_name", "name"]) {
    if (typeof source[key] === "string" && source[key].trim() && source[key].length <= 200) result[key] = source[key];
  }
  if (isAutomationPresetId(source.automation_preset)) result.automation_preset = source.automation_preset;
  if (Array.isArray(source.onboarding_steps)) {
    const allowed = ["project", "tickets", "mcp", "key", "cycles", "issue", "import"];
    result.onboarding_steps = [...new Set(source.onboarding_steps.filter((step) => allowed.includes(step)))];
  }
  const efforts = source.automation_efforts;
  if (efforts && typeof efforts === "object" && !Array.isArray(efforts)) {
    result.automation_efforts = Object.fromEntries(["xs", "s", "m", "l", "xl"]
      .filter((key) => typeof (efforts as Record<string, unknown>)[key] === "boolean")
      .map((key) => [key, (efforts as Record<string, unknown>)[key]]));
  }
  return result;
}
