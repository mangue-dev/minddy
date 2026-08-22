import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import type { DomainTarget } from "@/lib/custom-domain-lookup";
import type { PublicSiteTab } from "@/lib/feedback/types";

/**
 * Navigation of the public site of a project (MIN-37): the feedback board, the
 * shared views and the published pages form a single “site” with tabs —
 * “Feedback” (the board), then one tab per shared view, named after the view,
 * then one per published page, named after the page. Used by /f/[token],
 * /share/[token] AND /p/[token] to make navigation symmetrical.
 */

export async function getPublicSiteTabs(params: {
  projectId: string;
  /** Label of the board tab (i18n on the calling side). */
  feedbackLabel: string;
  /** Fallback label for a published page without a title (i18n too). */
  untitledLabel: string;
  /** Current page: the board token, that of a shared view or of a published page. */
  current:
    | { kind: "feedback" }
    | { kind: "view"; shareToken: string }
    | { kind: "page"; shareToken: string };
  /** Target mapped to the current host (MIN-36): its tab points to "/",
 the others keep their path token (served in pass-through). */
  domainTarget?: DomainTarget | null;
}): Promise<PublicSiteTab[]> {
  const service = getServiceClient();

  const board = await getBoardForProject(params.projectId);
  // Opt-in coupling (feedback settings) for each family: without it, each
  // public surface remains isolated — no tabs on the board, no links from
  // views or pages.
  if (!board?.enabled || (!board.show_views && !board.show_pages)) return [];

  // `level = public` only (MIN-342): a password-protected view says nothing
  // about itself on its own page — not even its name — and announcing it here,
  // token included, would void that discretion. It remains reachable through
  // its link, which is the only path to it. Same discretion for a protected
  // PAGE: the tab would give both name and URL away.
  const [sharesRes, pageSharesRes] = await Promise.all([
    service
      .from("view_shares")
      .select("token, views!inner (id, name, project_id)")
      .eq("views.project_id", params.projectId)
      .eq("level", "public")
      .order("created_at", { ascending: true }),
    service
      .from("view_shares")
      .select("token, pages!inner (id, title, project_id)")
      .eq("pages.project_id", params.projectId)
      .is("pages.deleted_at", null)
      .eq("level", "public")
      .order("created_at", { ascending: true }),
  ]);

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
    // Each family is armed by its own switch, then each view is opt-in:
    // only those checked in the settings come out.
    if (!board.show_views || !view || !visible.has(view.id)) continue;
    const shareToken = row.token as string;
    const mapped = target?.kind === "share" && target.token === shareToken;
    tabs.push({
      label: view.name,
      href: mapped ? "/" : `/share/${shareToken}`,
      active: params.current.kind === "view" && params.current.shareToken === shareToken,
    });
  }
  const visiblePages = new Set(board.visible_page_ids);
  for (const row of pageSharesRes.data ?? []) {
    const page = row.pages as unknown as {
      id: string;
      title: string;
    } | null;
    // Same double gate as the views: the switch, then the opt-in per page.
    if (!board.show_pages || !page || !visiblePages.has(page.id)) continue;
    tabs.push({
      label: page.title || params.untitledLabel,
      // Published pages do not ride custom domains (MIN-36 covers the board
      // and shared views only), so no mapping branch here.
      href: `/p/${row.token as string}`,
      active:
        params.current.kind === "page" &&
        params.current.shareToken === row.token,
    });
  }

  // Single tab = no navigation to show.
  return tabs.length > 1 ? tabs : [];
}
