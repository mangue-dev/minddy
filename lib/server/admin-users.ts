import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import {
  ONBOARDING_STARTED_META_KEY,
  resolveOnboardingState,
} from "@/lib/onboarding";

/**
 * Shared reading of accounts for the admin console (MIN-90).
 *
 * `/api/admin/users` (the paginated list) and `/api/admin/overview` (the onboarding funnel
 * and plan distribution) need the same lines: one
 * per `auth.users` account, with its counters. So they both pass
 * this way — the RPC returns the raw ingredients, and onboarding resolves
 * with the SAME `resolveOnboardingState` as home, never reimplemented.
 */

/** A raw line of `get_admin_users_overview`. */
export interface AdminUserRpcRow {
  user_id: string;
  email: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  /** Internal account (team, demo, bot): visible here, never in the stats. */
  is_internal: boolean;
  projects_owned: number;
  projects_member: number;
  issues_accessible: number;
  issues_created: number;
  last_activity_at: string | null;
  spent_month: number | string;
  ai_calls: number;
  reset_at: string | null;
  total_count: number;
}

export interface AdminUsersPage {
  rows: AdminUserRpcRow[];
  total: number;
}

/** An accounts page, most recent registration first. */
export async function fetchAdminUsers(params: {
  search?: string | null;
  limit: number;
  offset: number;
}): Promise<AdminUsersPage> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("get_admin_users_overview", {
    p_search: params.search?.trim() || null,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AdminUserRpcRow[];
  // `total_count` is carried by each line (window function); without line, the
  // search does not match anyone.
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) || 0 : 0 };
}

/**
 * Accounts that have set a BYOK key. The "key" stage of onboarding is
 * checkmark above (MIN-149): without this set, the admin funnel would count
 * blocked on this stage of the accounts which have passed it.
 *
 * Read in full rather than filtered on the page: `user_ai_keys` carries only one
 * line per BYOK account — a tiny subset of accounts — and a single
 * read serves both admin routes regardless of their pagination.
 */
export async function fetchByokUserIds(): Promise<Set<string>> {
  const { data, error } = await getServiceClient().from("user_ai_keys").select("user_id");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => (row as { user_id: string }).user_id));
}

/** The onboarding state of an account, resolved as the home resolves it. */
export function onboardingOf(row: AdminUserRpcRow, byokUserIds: ReadonlySet<string>) {
  const meta = row.meta ?? {};
  const state = resolveOnboardingState({
    meta,
    projectCount: Number(row.projects_owned) + Number(row.projects_member),
    issueCount: Number(row.issues_accessible),
    hasAiKey: byokUserIds.has(row.user_id),
    cyclesEnabled: resolveCyclePrefs(meta).enabled,
  });
  return {
    // `eligible` mixes “onboarding has started” and “the account is empty”;
    // for the admin only the first half is a fact, hence the direct reading
    // of the watermark placed on the first display.
    started: meta[ONBOARDING_STARTED_META_KEY] === true,
    completed: state.completedCount,
    total: state.totalCount,
    allComplete: state.allComplete,
    dismissed: state.dismissed,
    currentStep: state.currentStepId,
  };
}

/** Nom d'affichage du compte (display_name → full_name → name → handle). */
export function nameOf(row: AdminUserRpcRow): string {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const pick = (key: string) => {
    const value = meta[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const full = pick("display_name") ?? pick("full_name") ?? pick("name");
  return displayName({ full_name: full, email: row.email }, "—");
}

/**
 * Marks (or unmarks) an account as INTERNAL — team, demo, bot.
 *
 * The flag lives in `app_metadata`, like the admin role: the user cannot assign it to himself.
 *
 * The writing is intentionally defensive on TWO points. We first reread the
 * count and return the complete object: if GoTrue were to REPLACE
 * `app_metadata` instead of merging it, sending the flag alone would erase
 * `role: "admin"`. And we remove the flag with `null`, not by omitting the key:
 * the current semantics are a merge, where an absent key does not delete anything.
 * Both behaviors give the correct result.
 */
export async function setUserInternal(
  userId: string,
  internal: boolean,
): Promise<void> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error(error?.message ?? "User not found");

  const current = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    app_metadata: { ...current, internal: internal ? true : null },
  });
  if (updateError) throw new Error(updateError.message);
}

