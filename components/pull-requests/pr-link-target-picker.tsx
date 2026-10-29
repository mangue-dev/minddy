"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { PickerLoading, pullRequestPickerRow } from "@/components/palette-picker-rows";
import { usePalettePicker, type PalettePickerRequest } from "@/lib/palette-picker";
import type { PullRequestListItem } from "@/lib/agent-api";
import { useAllPullRequestsQuery } from "@/lib/use-agent-runs";

/**
 * Open pull requests an issue of `projectId` can be linked to. The server only
 * accepts a PR whose repository the issue's project links, which is what the
 * list's `project` names.
 */
export function linkablePullRequests(
  pullRequests: readonly PullRequestListItem[],
  projectId: string | null,
): PullRequestListItem[] {
  return pullRequests.filter((pr) =>
    (pr.pr_state === "open" || pr.pr_state === "draft") &&
    (projectId === null || pr.project?.id === projectId));
}

/** The open pull requests list, read only while a picker is mounted. */
export function useLinkablePullRequests(projectId: string | null) {
  const { pullRequests, loading } = useAllPullRequestsQuery("open");
  return { pullRequests: linkablePullRequests(pullRequests, projectId), loading };
}

/**
 * Reports whether `projectId` has a pull request an issue can join; null while
 * the list loads. Mounted only while a menu is open, so the cards of a board do
 * not each subscribe to the pull request list.
 */
export function LinkablePullRequestsProbe({
  projectId,
  onChange,
}: {
  projectId: string;
  onChange: (hasLinkable: boolean | null) => void;
}) {
  const { pullRequests, loading } = useLinkablePullRequests(projectId);
  const hasLinkable = loading ? null : pullRequests.length > 0;
  useEffect(() => {
    onChange(hasLinkable);
  }, [hasLinkable, onChange]);
  return null;
}

/**
 * The ⌘K palette on the pull requests an issue can join (MIN-844). Mounted
 * only while it is open, so the list is only read then.
 */
export function PullRequestPalettePicker({
  projectId,
  subject,
  onClose,
  onSelect,
}: {
  projectId: string;
  /** What is being linked, named in the placeholder (an identifier, or a count). */
  subject: string;
  onClose: () => void;
  onSelect: (pr: PullRequestListItem) => void;
}): null {
  const t = useTranslations("PullRequests");
  const { pullRequests, loading } = useLinkablePullRequests(projectId);
  const handlers = useRef({ onClose, onSelect });
  handlers.current = { onClose, onSelect };
  const request = useMemo<PalettePickerRequest>(() => ({
    key: `link-pull-request:${projectId}`,
    placeholder: t("linkToPullRequestPlaceholder", { subject }),
    categories: [{ id: "pull-requests", label: t("linkToPullRequest") }],
    items: pullRequests.map((pr) =>
      pullRequestPickerRow(pr, "pull-requests", () => handlers.current.onSelect(pr))),
    status: loading ? <PickerLoading label={t("linkToPullRequestLoading")} /> : undefined,
    onClose: () => handlers.current.onClose(),
  }), [projectId, subject, pullRequests, loading, t]);
  usePalettePicker(request);
  return null;
}
