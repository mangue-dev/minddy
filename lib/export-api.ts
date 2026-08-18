"use client";

import { EXPORT_ISSUES_PATH } from "@/lib/export/issues-csv";
import type { IssueStatus } from "@/lib/issue-constants";
import { trackEvent } from "./analytics";

export interface ExportIssuesResult {
  fileName: string;
  count: number;
  /** The road cap has cut: the dialogue says this rather than letting
 * believe in a full export. */
  truncated: boolean;
}

/**
 * Downloads the CSV export of my tickets.
 *
 * The file goes through `fetch` rather than a simple navigation to the
 * route: a server error then remains an error (a toast), where a download link
 * would have displayed the JSON error in the tab. This is the
 * same path as the account export (`account-data-section.tsx`).
 *
 * `projectId` to `null` = all my projects. `statuses` empty = all statuses.
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

/** `attachment; filename="minddy-issues-min-2026-08-04.csv"` → the name. */
function fileNameFromDisposition(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? null;
}
