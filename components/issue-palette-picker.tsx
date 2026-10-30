"use client";

import { useMemo, useRef } from "react";
import { PickerLoading, issuePickerRow, type PickerIssue } from "@/components/palette-picker-rows";
import { usePalettePicker, type PalettePickerRequest } from "@/lib/palette-picker";
import { orderIssuesForSearch } from "@/lib/issue-search-order";

/**
 * One issue of a project, picked in the ⌘K palette (MIN-844): marking a
 * triage issue as a duplicate, linking a feedback post to an existing issue.
 * The palette lists the eligible issues only, work under way first, and also
 * finds them by meaning. Mounted while the choice is open; the palette closing
 * (a row, Escape, a click outside) calls `onClose`.
 */
export function IssuePalettePicker({
  scope,
  projectId,
  projectKey,
  issues,
  loading = false,
  placeholder,
  category,
  emptyLabel,
  loadingLabel,
  onPick,
  onClose,
}: {
  /** Identifies the picker step, e.g. `triage-duplicate:{issueId}`. */
  scope: string;
  projectId: string;
  projectKey: string;
  /** The eligible issues, in any order. */
  issues: readonly PickerIssue[];
  loading?: boolean;
  placeholder: string;
  /** The group header above the rows. */
  category: string;
  emptyLabel: string;
  loadingLabel: string;
  onPick: (issueId: string) => void;
  onClose: () => void;
}): null {
  const handlers = useRef({ onPick, onClose });
  handlers.current = { onPick, onClose };
  const request = useMemo<PalettePickerRequest>(() => {
    const ordered = orderIssuesForSearch(issues, (issue) => issue.status);
    return {
      key: scope,
      placeholder,
      categories: [{ id: "picked-issues", label: category }],
      items: ordered.map((issue) =>
        issuePickerRow(issue, projectKey, "picked-issues", () => handlers.current.onPick(issue.id))),
      semanticProjectId: projectId,
      status: loading
        ? <PickerLoading label={loadingLabel} />
        : ordered.length === 0 ? emptyLabel : undefined,
      onClose: () => handlers.current.onClose(),
    };
  }, [scope, issues, projectKey, projectId, placeholder, category, loading, emptyLabel, loadingLabel]);
  usePalettePicker(request);
  return null;
}
