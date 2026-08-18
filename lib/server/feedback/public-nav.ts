import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import type { DomainTarget } from "@/lib/custom-domain-lookup";
import type { PublicSiteTab } from "@/lib/feedback/types";

/**
 * Navigation of the public site of a project (MIN-37): the feedback board and the
 * shared views form a single “site” with tabs — “Feedback”
 * (the board) then one tab per shared view, named after the view. Used
 * by /f/[token] AND /share/[token] to make navigation symmetrical.
 */

export async function getPublicSiteTabs(params: {
  projectId: string;
  /** Label of the board tab (i18n on the calling side). */
  feedbackLabel: string;
  /** Current page: the board token or that of a shared view. */
  current: { kind: "feedback" } | { kind: "view"; shareToken: string };
  /** Target mapped to the current host (MIN-36): its tab points to "/",
 the others keep their path token (served in pass-through). */
  domainTarget?: DomainTarget | null;
}): Promise<PublicSiteTab[]> {
  const service = getServiceClient();

  const board = await getBoardForProject(params.projectId);
  // Couplage opt-in (settings du feedback) : sans lui, chaque page publique
  // remains isolated — no tabs on the board, no links from views.
  if (!board?.enabled || !board.show_views) return [];

  // `level = public` only (MIN-342): a password-protected view cannot
  // says nothing about herself on her own page — not even her name — and announce it
  // here, with its token, would make this discretion irrelevant. She remains
  // reachable through his link, which is the only path known to him.
  const sharesRes = await service
    .from("view_shares")
    .select("token, views!inner (id, name, project_id)")
    .eq("views.project_id", params.projectId)
    .eq("level", "public")
    .order("created_at", { ascending: true });

  const target = params.domainTarget ?? null;
  const tabs: PublicSiteTab[] = [];
  if (board.enabled) {
    const mapped = target?.kind === "feedback" && target.token === board.token;
    tabs.push({
      label: params.feedbackLabel,
      href: mapped ? "/" : `/f/${board.token}`,
      active: params.current.kind === "feedback",
    });
  }
  const visible = new Set(board.visible_view_ids);
  for (const row of sharesRes.data ?? []) {
    const view = row.views as unknown as { id: string; name: string } | null;
    // Each view is opt-in: only those checked in the settings come out.
    if (!view || !visible.has(view.id)) continue;
    const shareToken = row.token as string;
    const mapped = target?.kind === "share" && target.token === shareToken;
    tabs.push({
      label: view.name,
      href: mapped ? "/" : `/share/${shareToken}`,
      active: params.current.kind === "view" && params.current.shareToken === shareToken,
    });
  }

  // Single tab = no navigation to show.
  return tabs.length > 1 ? tabs : [];
}
