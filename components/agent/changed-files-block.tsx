"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FilePen } from "lucide-react";
import { Button, cn } from "mangue-ui";
import type { AgentFileChange } from "@/lib/agent-api";
import { changeTotals } from "@/lib/agent-changed-files";
import { DiffCounters, FilePathLabel } from "@/components/pull-requests/pr-file-marks";

const INITIAL_VISIBLE_FILES = 5;
const MORE_FILES = 10;

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
      <FilePathLabel path={file.path} previousPath={file.previousPath} />
      <DiffCounters
        additions={file.additions}
        deletions={file.deletions}
        hideEmpty
      />
    </>
  );

  if (onOpenFile) {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(file.path)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
      >
        {content}
      </button>
    );
  }

  return <div className="flex w-full items-center gap-2 px-3 py-2">{content}</div>;
}

/**
 * Final map of files changed under the response of a round.
 *
 * The summary remains visible with a short list: five files initially, then
 * ten more with each request. The full diff remains accessible via Review;
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
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_FILES);

  if (files.length === 0) return null;

  const kind = changeKind(files);
  const { additions, deletions } = changeTotals(files);
  const summary =
    files.length === 1
      ? t(SINGLE_FILE_KEYS[kind], { file: fileName(files[0].path) })
      : t(SUMMARY_KEYS[kind], { count: files.length });
  const visibleFiles = files.length === 1 ? [] : files.slice(0, visibleCount);
  const hasMore = visibleCount < files.length;

  const reviewAction = onReview ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onReview}
      className="h-7 px-2 text-xs"
    >
      {t("reviewChangesShort")}
    </Button>
  ) : null;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/50">
            <FilePen className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{summary}</p>
            <DiffCounters additions={additions} deletions={deletions} className="mt-0.5 text-xs" />
          </div>
        </div>
        {reviewAction ? <div className="shrink-0">{reviewAction}</div> : null}
      </div>

      {visibleFiles.length > 0 ? (
        <div className="divide-y divide-border">
          {visibleFiles.map((file) => (
            <FileRow key={`${file.status}:${file.path}`} file={file} onOpenFile={onOpenFile} />
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + MORE_FILES)}
          className="w-full border-t border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
        >
          {t("filesShowMore")}
        </button>
      ) : null}

      {truncated ? (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {t("filesListTruncated")}
        </p>
      ) : null}

    </div>
  );
}
