import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import type { DomainTarget } from "@/lib/custom-domain-lookup";
import type { PublicSiteTab } from "@/lib/feedback/types";

/**
 * Navigation du site public d'un projet (MIN-37) : le board de feedback et les
 * vues partagées forment un seul « site » avec des onglets — « Feedback »
 * (le board) puis un onglet par vue partagée, nommé d'après la vue. Utilisé
 * par /f/[token] ET /share/[token] pour que la navigation soit symétrique.
 */

export async function getPublicSiteTabs(params: {
  projectId: string;
  /** Libellé de l'onglet board (i18n côté appelant). */
  feedbackLabel: string;
  /** Page courante : le token du board ou celui d'une vue partagée. */
  current: { kind: "feedback" } | { kind: "view"; shareToken: string };
  /** Cible mappée sur le host courant (MIN-36) : son onglet pointe sur "/",
      les autres gardent leur path token (servis en pass-through). */
  domainTarget?: DomainTarget | null;
}): Promise<PublicSiteTab[]> {
  const service = getServiceClient();

  const board = await getBoardForProject(params.projectId);
  // Couplage opt-in (settings du feedback) : sans lui, chaque page publique
  // reste isolée — pas d'onglets sur le board, pas de lien depuis les vues.
  if (!board?.enabled || !board.show_views) return [];

  const sharesRes = await service
    .from("view_shares")
    .select("token, views!inner (id, name, project_id)")
    .eq("views.project_id", params.projectId)
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
    // Chaque vue est opt-in : seules celles cochées dans les settings sortent.
    if (!view || !visible.has(view.id)) continue;
    const shareToken = row.token as string;
    const mapped = target?.kind === "share" && target.token === shareToken;
    tabs.push({
      label: view.name,
      href: mapped ? "/" : `/share/${shareToken}`,
      active: params.current.kind === "view" && params.current.shareToken === shareToken,
    });
  }

  // Un seul onglet = pas de navigation à montrer.
  return tabs.length > 1 ? tabs : [];
}
