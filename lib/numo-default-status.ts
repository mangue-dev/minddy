import type { IssueStatusValue } from "@/lib/issue-validation";

// Where Numo-created issues land, chosen in Account → Preferences and stored in
// the account's Supabase auth `user_metadata.numo_default_status` (same
// mechanism as `auto_assign_created`). Server-safe: imports only the enum type,
// no React/lucide — route handlers and the assistant loop can use it too.

/** The statuses a Numo-created issue may default to. Restricted to the pre-work
 *  "landing" statuses (arrival → ready) — closing/duplicate/in-review statuses
 *  make no sense for a freshly created issue. Order = picker order. */
export const NUMO_DEFAULT_STATUS_OPTIONS = [
  "triage",
  "backlog",
  "todo",
] as const satisfies readonly IssueStatusValue[];

export type NumoDefaultStatus = (typeof NUMO_DEFAULT_STATUS_OPTIONS)[number];

/** Historical default: where assistant-created issues land when the user hasn't
 *  chosen otherwise. Triage remains the validation gate. */
export const DEFAULT_NUMO_STATUS: NumoDefaultStatus = "triage";

export const isNumoDefaultStatus = (v: unknown): v is NumoDefaultStatus =>
  typeof v === "string" &&
  (NUMO_DEFAULT_STATUS_OPTIONS as readonly string[]).includes(v);

/** Read the user's chosen Numo landing status from their auth user_metadata,
 *  falling back to 'triage' when unset or invalid. */
export function resolveNumoDefaultStatus(
  meta: Record<string, unknown> | null | undefined
): NumoDefaultStatus {
  return isNumoDefaultStatus(meta?.numo_default_status)
    ? meta.numo_default_status
    : DEFAULT_NUMO_STATUS;
}
