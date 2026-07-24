"use client";

import type { ImportSource, ImportWarning } from "@/lib/import/types";
import { trackEvent } from "./analytics";

export interface ImportCommitResponse {
  source: ImportSource;
  created: number;
  categories_created: number;
  sub_issues_linked: number;
  warnings: ImportWarning[];
}

/** POST the raw CSV text — the server re-parses it with the same mapper the
 *  preview used client-side. */
export async function importIssuesApi(
  projectId: string,
  csv: string
): Promise<ImportCommitResponse> {
  trackEvent("import_started", { source: "csv" });
  const response = await fetch(`/api/projects/${projectId}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv }),
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
