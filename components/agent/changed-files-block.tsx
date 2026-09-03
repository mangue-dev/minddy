"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Diff } from "lucide-react";
import { Button, cn } from "mangue-ui";
import type { AgentFileChange } from "@/lib/agent-api";
import { changeTotals } from "@/lib/agent-changed-files";
import { DiffCounters, FilePathLabel } from "@/components/pull-requests/pr-file-marks";

const INITIAL_VISIBLE_FILES = 5;

type ChangeKind = "created" | "deleted" | "edited";

const SUMMARY_KEYS = {
  created: "filesCreated",
  deleted: "filesDeleted",
  edited: "filesEdited",
} as const;

const SINGLE_FILE_KEYS = {
  created: "fileCreated",
  deleted: "fileDeleted",
  edited: "fileEdited",
} as const;

function changeKind(files: AgentFileChange[]): ChangeKind {
  if (files.every((file) => file.status === "added")) return "created";
  if (files.every((file) => file.status === "deleted")) return "deleted";
  return "edited";
}

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function FileRow({
  file,
  onOpenFile,
}: {
  file: AgentFileChange;
  onOpenFile?: (path: string) => void;
}) {
  const content = (
    <>
      <FilePathLabel
        path={file.path}
        previousPath={file.previousPath}
        className="text-sm"
      />
      <DiffCounters
        additions={file.additions}
        deletions={file.deletions}
        hideEmpty
        className="text-sm"
      />
    </>
  );

  if (onOpenFile) {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(file.path)}
        className="flex w-full items-center gap-2 bg-background px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
      >
        {content}
      </button>
    );
  }

  return <div className="flex w-full items-center gap-2 bg-background px-3 py-2.5">{content}</div>;
}

/**
 * Final map of files changed under the response of a round.
 *
 * The summary remains visible with a short list: five files initially, then
 * all remaining files when expanded. The full diff remains accessible via Review;
 * clicking a line directly opens the corresponding file in that same
 * sidebar.
 */
export function ChangedFilesBlock({
  files,
  truncated = false,
  onOpenFile,
  onReview,
  className,
}: {
  files: AgentFileChange[];
  truncated?: boolean;
  onOpenFile?: (path: string) => void;
  onReview?: () => void;
  className?: string;
}) {
  const t = useTranslations("Agent");
  const [isExpanded, setIsExpanded] = useState(false);

  if (files.length === 0) return null;

  const kind = changeKind(files);
  const { additions, deletions } = changeTotals(files);
  const summary =
    files.length === 1
      ? t(SINGLE_FILE_KEYS[kind], { file: fileName(files[0].path) })
      : t(SUMMARY_KEYS[kind], { count: files.length });
  const visibleFiles =
    files.length === 1
      ? []
      : isExpanded
        ? files
        : files.slice(0, INITIAL_VISIBLE_FILES);
  const hasMore = files.length > INITIAL_VISIBLE_FILES;
  const hasContentBelowHeader = visibleFiles.length > 0 || hasMore || truncated;

  const reviewAction = onReview ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onReview}
      className="h-7 px-2 text-sm"
    >
      {t("reviewChangesShort")}
    </Button>
  ) : null;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-2.5",
          hasContentBelowHeader && "border-b border-border",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/50">
            <Diff className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{summary}</p>
            <DiffCounters additions={additions} deletions={deletions} className="mt-0.5 text-sm" />
          </div>
        </div>
        {reviewAction ? <div className="shrink-0">{reviewAction}</div> : null}
      </div>

      {visibleFiles.length > 0 ? (
        <div>
          {visibleFiles.map((file) => (
            <FileRow key={`${file.status}:${file.path}`} file={file} onOpenFile={onOpenFile} />
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
          className="flex w-full items-center justify-between border-t border-border px-3 py-2.5 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        >
          <span>
            {t(isExpanded ? "filesHide" : "filesShowMore", {
              count: files.length - INITIAL_VISIBLE_FILES,
            })}
          </span>
          {isExpanded ? <ChevronUp className="size-4 shrink-0" aria-hidden /> : <ChevronDown className="size-4 shrink-0" aria-hidden />}
        </button>
      ) : null}

      {truncated ? (
        <p className="border-t border-border px-3 py-1.5 text-sm text-muted-foreground">
          {t("filesListTruncated")}
        </p>
      ) : null}

    </div>
  );
}
