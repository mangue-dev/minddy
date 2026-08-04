"use client";

import { EXPORT_ISSUES_PATH } from "@/lib/export/issues-csv";
import type { IssueStatus } from "@/lib/issue-constants";
import { trackEvent } from "./analytics";

export interface ExportIssuesResult {
  fileName: string;
  count: number;
  /** Le plafond de la route a coupé : le dialogue le dit plutôt que de laisser
   *  croire à un export complet. */
  truncated: boolean;
}

/**
 * Télécharge l'export CSV de mes tickets.
 *
 * Le fichier passe par `fetch` plutôt que par une simple navigation vers la
 * route : une erreur serveur reste alors une erreur (un toast), là où un lien
 * de téléchargement aurait affiché le JSON d'erreur dans l'onglet. C'est le
 * même chemin que l'export de compte (`account-data-section.tsx`).
 *
 * `projectId` à `null` = tous mes projets. `statuses` vide = tous les statuts.
 */
export async function exportIssuesApi(
  projectId: string | null,
  statuses: IssueStatus[]
): Promise<ExportIssuesResult> {
  const params = new URLSearchParams();
  if (projectId) params.set("project", projectId);
  if (statuses.length > 0) params.set("statuses", statuses.join(","));

  const response = await fetch(`${EXPORT_ISSUES_PATH}?${params}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Request failed");
  }

  const fileName =
    fileNameFromDisposition(response.headers.get("Content-Disposition")) ??
    "minddy-issues.csv";
  const count = Number(response.headers.get("X-Minddy-Issue-Count") ?? "0");
  const truncated = response.headers.get("X-Minddy-Truncated") === "true";

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  trackEvent("issues_exported", {
    scope: projectId ? "project" : "all",
    status_count: statuses.length,
    issue_count: count,
    truncated,
  });

  return { fileName, count, truncated };
}

/** `attachment; filename="minddy-issues-min-2026-08-04.csv"` → le nom. */
function fileNameFromDisposition(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? null;
}
