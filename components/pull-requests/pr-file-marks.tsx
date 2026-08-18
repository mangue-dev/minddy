"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { FileMinus, FilePen, FilePlus, FileSymlink } from "lucide-react";
import { FILE_STATUS_LABELS, type FileStatus } from "@/lib/pr-file-tree";

/**
 * The four marks of a file in a diff: what happened to it, its
 * path, what it weighs, and the proportion. Extracted from `pr-diff` and
 * `pr-file-tree` because a third surface requested them — the
 * “changed files” block of an agent trick, which until then wrote them in its
 * own vocabulary (a phrase in flat text, “modified app/…”) and ne
 * looked like nothing else.
 *
 * A list of affected files reads the same everywhere in minddy: the icon says
 * the nature of the change, mono says the path (folder off, name forward),
 * the counters say the volume. Components, not class copies —
 * the color of the “added” green is only decided here.
 */

const STATUS_ICONS = {
  added: FilePlus,
  removed: FileMinus,
  renamed: FileSymlink,
  modified: FilePen,
} as const satisfies Record<FileStatus, unknown>;

/** Same colors as the file card badge, in line rather than solid. */
const STATUS_COLORS: Record<FileStatus, string> = {
  added: "text-green-600 dark:text-green-400",
  removed: "text-destructive",
  renamed: "text-violet-600 dark:text-violet-400",
  modified: "text-blue-600 dark:text-blue-400",
};

/**
 * What happened to the file, said in icon and color. The word remains
 * accessible (tooltip + screen reader): the color alone means nothing to those who
 * does not see it, and two file icons look similar from a distance.
 */
export function FileStatusIcon({
  status,
  className,
}: {
  status: FileStatus;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const Icon = STATUS_ICONS[status];
  const label = t(FILE_STATUS_LABELS[status]);
  return (
    <span className={cn("shrink-0", STATUS_COLORS[status], className)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The full path, folder turned off and file name forward: in a list
 * of paths that share their first six segments, this is the last one that we
 * look for. A rename is said in prefix, the same gray as the folder.
 */
export function FilePathLabel({
  path,
  previousPath,
  className,
}: {
  path: string;
  /** BEFORE path, for renaming only. */
  previousPath?: string | null;
  className?: string;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  return (
    <span
      className={cn("min-w-0 flex-1 truncate font-mono text-xs", className)}
      title={previousPath ? `${previousPath} → ${path}` : path}
    >
      {previousPath ? <span className="text-muted-foreground">{previousPath} → </span> : null}
      <span className="text-muted-foreground">{dir}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}

/**
 * The volume, in lines. `tabular-nums` so that the columns of a list
 * line up, and the number does not dance when a live makes it change.
 */
export function DiffCounters({
  additions,
  deletions,
  hideEmpty = false,
  className,
}: {
  additions: number;
  deletions: number;
  /**
 * Keep a counter to zero. For the LIVE view of an agent tour, where git has not counted anything yet: “+0 −0” on each line would read as a measurement,
 * whereas it is an absence of measurement.
 */
  hideEmpty?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-[11px] tabular-nums", className)}>
      {hideEmpty && additions === 0 ? null : (
        <span
          className="text-emerald-600 dark:text-emerald-400"
          title={t("linesAdded", { count: additions })}
        >
          +{additions}
        </span>
      )}
      {hideEmpty && deletions === 0 ? null : (
        <span
          className="text-red-600 dark:text-red-400"
          title={t("linesRemoved", { count: deletions })}
        >
          −{deletions}
        </span>
      )}
    </span>
  );
}

/**
 * GitHub's five-block square: the proportion of additions and removals, read
 * at a glance. The numerical counters tell the volume, this bar says the
 * NATURE of the change — a rewritten file and an expanded file don't look like
 *, even +40/−40.
 */
export function DiffStatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  // A non-zero side is always worth at least one block, and never all five when
  // the other exists: on +2/−300, rounding would otherwise erase the addition, and a
  // purely added file would no longer be distinguishable from a retouched file.
  const green =
    total === 0
      ? 0
      : deletions === 0
        ? 5
        : additions === 0
          ? 0
          : Math.min(4, Math.max(1, Math.round((additions / total) * 5)));
  const red = total === 0 ? 0 : 5 - green;

  return (
    <span className="flex shrink-0 gap-px" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-[1px]",
            i < green
              ? "bg-emerald-500 dark:bg-emerald-400"
              : i < green + red
                ? "bg-red-500 dark:bg-red-400"
                : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
