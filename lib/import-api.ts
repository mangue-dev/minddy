"use client";

import type { CsvDigest } from "@/lib/import/digest";
import type { ImportMapping, ImportSource, ImportWarning } from "@/lib/import/types";
import { trackEvent } from "./analytics";

export interface ImportCommitResponse {
  source: ImportSource;
  created: number;
  categories_created: number;
  sub_issues_linked: number;
  /** Tickets rendus à un membre du projet. */
  assigned: number;
  warnings: ImportWarning[];
}

/**
 * Demande au modèle une correspondance de colonnes pour le fichier en cours de
 * dépôt. N'envoie que le RÉSUMÉ du fichier, jamais le fichier.
 *
 * Ne lève jamais : la passe est un bonus. Une panne, un budget épuisé, un
 * drapeau coupé — l'aperçu garde le plan déduit des en-têtes, l'utilisateur
 * garde son tableau de correspondance.
 */
export async function fetchImportMappingApi(
  projectId: string,
  digest: CsvDigest
): Promise<ImportMapping | null> {
  try {
    const response = await fetch(`/api/projects/${projectId}/import/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { mapping?: ImportMapping | null };
    return data.mapping ?? null;
  } catch {
    return null;
  }
}

/** POST the raw CSV text plus the mapping the user validated — the server
 *  re-parses the file and replays the same mapper the preview used. */
export async function importIssuesApi(
  projectId: string,
  csv: string,
  mapping: ImportMapping
): Promise<ImportCommitResponse> {
  trackEvent("import_started", { source: "csv" });
  const response = await fetch(`/api/projects/${projectId}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv, mapping }),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  const result = data as ImportCommitResponse;
  trackEvent("import_completed", {
    source: result.source,
    issue_count: result.created,
    categories_created: result.categories_created,
    sub_issues_linked: result.sub_issues_linked,
    warning_count: result.warnings.length,
  });
  return result;
}
