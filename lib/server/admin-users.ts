import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { resolveCyclePrefs } from "@/lib/cycle-prefs";
import { ONBOARDING_STARTED_META_KEY, resolveOnboardingState } from "@/lib/onboarding";
import type { AdminAccountSummary } from "@/lib/types";

/** Only the signals needed by the shared onboarding resolver, never a profile. */
export interface AdminOnboardingRow {
  user_id: string;
  is_internal: boolean;
  meta: Record<string, unknown> | null;
  has_project: boolean;
  has_issue: boolean;
}

const SCAN_PAGE_SIZE = 500;

/** Reads minimal signals in stable, bounded pages for exact overview aggregates. */
export async function fetchAdminOnboardingSignals(): Promise<AdminOnboardingRow[]> {
  const service = getServiceClient();
  const rows: AdminOnboardingRow[] = [];
  for (let offset = 0; ; offset += SCAN_PAGE_SIZE) {
    const { data, error } = await service.rpc("get_admin_onboarding_signals", {
      p_limit: SCAN_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    const page = (data ?? []) as AdminOnboardingRow[];
    rows.push(...page);
    if (page.length < SCAN_PAGE_SIZE) return rows;
  }
}

export function onboardingOf(row: AdminOnboardingRow) {
  const meta = row.meta ?? {};
  const state = resolveOnboardingState({
    meta,
    projectCount: row.has_project ? 1 : 0,
    issueCount: row.has_issue ? 1 : 0,
    cyclesEnabled: resolveCyclePrefs(meta).enabled,
  });
  return {
    started: meta[ONBOARDING_STARTED_META_KEY] === true,
    allComplete: state.allComplete,
    dismissed: state.dismissed,
  };
}

/** Exact lookup for support; an empty or partial search cannot enumerate accounts. */
export async function fetchAdminAccount(params: {
  email?: string;
  userId?: string;
}): Promise<AdminAccountSummary | null> {
  const { data, error } = await getServiceClient().rpc("get_admin_account", {
    p_email: params.email ?? null,
    p_user_id: params.userId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0] as {
    user_id: string;
    email: string | null;
    name: string | null;
    is_internal: boolean;
    email_confirmed: boolean;
  } | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    name: displayName({ full_name: row.name, email: row.email }, "—"),
    email: row.email,
    internal: row.is_internal,
    emailConfirmed: row.email_confirmed,
  };
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
