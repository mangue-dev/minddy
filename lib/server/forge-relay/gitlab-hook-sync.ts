import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isForgeRelayClientConfigured, relayRequest } from "./client";

/**
 * Instance-side sharing of GitLab per-repo hook secrets
 * (docs/managed-forge-relay-plan.md, "GitLab flows").
 *
 * Secret generation/rotation stays in the core (MIN-333); only the SHARING
 * moves over the wire: in relay mode the hook points at Cloud, so Cloud needs
 * the per-repo secret to verify incoming deliveries and re-sign the fan-out.
 * Pushed at hook-registration time and on every rotation (the rotation path
 * goes through `ensureGitlabIssuesHook`, which calls this after each write).
 *
 * Best-effort: a failed push leaves Cloud without the current secret, so its
 * relay receiver refuses deliveries for that repo (fail-closed) until the
 * next registration or rotation re-shares it.
 */
export async function pushGitlabHookSecret(
  externalProjectId: string,
  secret: string,
): Promise<void> {
  if (!isForgeRelayClientConfigured()) return;
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("project_git_links")
      .select("repo_full_name")
      .eq("provider", "gitlab")
      .eq("external_repo_id", externalProjectId)
      .limit(1)
      .maybeSingle();
    const row = data as { repo_full_name: string | null } | null;
    if (!row?.repo_full_name) return;
    const response = await relayRequest("/api/relay/gitlab/hook-secret", {
      repo: row.repo_full_name,
      secret,
    });
    if (!response.ok) {
      console.error("[forge-relay] hook-secret push refused:", response.error);
    }
  } catch (err) {
    console.error("[forge-relay] hook-secret push failed:", (err as Error).message);
  }
}
