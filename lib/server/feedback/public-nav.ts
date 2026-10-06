import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getPublicBoardForProject } from "@/lib/server/feedback/boards";
import { decodeView } from "@/lib/server/view-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeShareToken } from "@/lib/server/encryption/share-token-content";
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
}): Promise<PublicSiteTab[]> {
  const service = getServiceClient();

  const board = await getPublicBoardForProject(params.projectId);
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
      .select("id, token, views!inner (*)")
      .eq("views.project_id", params.projectId)
      .eq("level", "public")
      .order("created_at", { ascending: true }),
    service
      .from("view_shares")
      .select("id, token, pages!inner (id, title, project_id, encrypted_content, encryption_version)")
      .eq("pages.project_id", params.projectId)
      .is("pages.deleted_at", null)
      .eq("level", "public")
      .order("created_at", { ascending: true }),
  ]);

  const tabs: PublicSiteTab[] = [];
  if (board.enabled) {
    tabs.push({
      label: params.feedbackLabel,
      href: `/f/${board.token}`,
      active: params.current.kind === "feedback",
    });
  }
  const visible = new Set(board.visible_view_ids);
  for (const row of sharesRes.data ?? []) {
    const stored = row.views as unknown as Record<string, unknown> | null;
    // Each family is armed by its own switch, then each view is opt-in:
    // only those checked in the settings come out.
    if (!board.show_views || !stored || !visible.has(stored.id as string)) continue;
    const view = await decodeView(stored);
    const shareToken = await decodeShareToken(row.id as string,
      row.token as string);
    tabs.push({
      label: view.name as string,
      href: `/share/${shareToken}`,
      active: params.current.kind === "view" && params.current.shareToken === shareToken,
    });
  }
  const visiblePages = new Set(board.visible_page_ids);
  for (const row of pageSharesRes.data ?? []) {
    const storedPage = row.pages as unknown as {
      id: string;
      title: string;
      project_id: string;
      encrypted_content?: string | null;
      encryption_version?: number;
    } | null;
    // Same double gate as the views: the switch, then the opt-in per page.
    if (!board.show_pages || !storedPage || !visiblePages.has(storedPage.id)) continue;
    const page = await decodePageProjection(storedPage);
    const pageToken = await decodeShareToken(row.id as string,
      row.token as string);
    tabs.push({
      label: page.title || params.untitledLabel,
      href: `/p/${pageToken}`,
      active:
        params.current.kind === "page" &&
        params.current.shareToken === pageToken,
    });
  }

  // Single tab = no navigation to show.
  return tabs.length > 1 ? tabs : [];
}
