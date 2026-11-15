"use client";

import { useState } from "react";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { useIssuesQuery } from "@/lib/use-issues-query";

/**
 * An issue of any project in the side panel, above the current page and
 * without navigating to its board: the app-wide panel (Inbox, palette,
 * mentions) and the Pull Requests page (MIN-66). Hosts mount it with
 * `key={projectId}:{issueId}`, so it starts over on another issue.
 */
export function GlobalIssuePanel({
  projectId,
  issueId,
  open = true,
  onClose,
}: {
  projectId: string;
  issueId: string;
  /** False while the host keeps the panel mounted for its exit animation. */
  open?: boolean;
  onClose: () => void;
}) {
  const { issues } = useIssuesQuery(projectId);
  // The issue shown: a relation or the parent link opens another one here.
  const [openId, setOpenId] = useState(issueId);
  const issue = issues.find((candidate) => candidate.id === openId) ?? null;

  return (
    <IssueSidePanel
      issue={issue}
      open={open && !!issue}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenIssue={setOpenId}
    />
  );
}
