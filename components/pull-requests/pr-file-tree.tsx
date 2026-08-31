"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PullRequestFile } from "@/lib/agent-api";
import { buildFileTree, type FileTreeNode } from "@/lib/pr-file-tree";
import { DiffCounters, FileStatusIcon } from "@/components/pull-requests/pr-file-marks";

/**
 * "What does this PR touch, and take me to this file" (MIN-182) —
 * the tree of changed files, in a panel that opens from the diff bar counter
 *
 *
 * **A panel, not a column.** Measured: on a 1512 px laptop, once
 * the main bar and the list of PRs deduced, the diff has ~890 px. A
 * GitHub-style side column (240–280 px) would take almost a third — and
 * for nothing, because a tree cannot be reduced: the information IS the path, and
 * `pr-di…` no longer distinguishes `pr-diff.tsx` from `pr-detail.tsx`. Placed ABOVE the
 * diff, the panel can be 380 px and show the paths in full, for the time
 * you choose.
 *
 * **A `Popover`, and not another modal panel.** Two of the three surfaces which
 * render `PrDiff` already live in a `SidePanel` (the diff of a commit and that
 * of an agent run): nesting a second modal would make two overlays, two focus
 * traps and two Escapes that argue. A single gesture everywhere, therefore,
 * and no mobile bifurcation to write or check.
 */

/**
 * The indentation rails: one vertical line per level above the line.
 *
 * These are the ones that say “who is in what”. A simple removal lets the eye
 * measure distances; the line, LINKS — we go back from the file to its
 * folder following a line, without counting the pixels. On a diff of seventeen
 * files it is the difference between a list and a tree.
 *
 * Each rail is 16 px and places its line 7 px from its edge: the line falls
 * therefore right at the CENTER of the chevron of the level above, and the column is continue
 * from one line to the next. `self-stretch` makes it run the full height of the
 * line, including when a long path crosses two lines.
 */
function Rails({ depth }: { depth: number }) {
  return Array.from({ length: depth }, (_, i) => (
    <span
      key={i}
      aria-hidden
      className="ml-[7px] w-[9px] shrink-0 self-stretch border-l border-border"
    />
  ));
}

/**
 * Turns off the punctuation of a label — the `/` of a folded folder, the arrow
 * of a rename. It's the NAME that we're looking for, not what articulates it:
 * in `components/pull-requests`, two full ink separators would make three
 * words of equal strength.
 */
function Segmented({ label }: { label: string }) {
  return label.split(/( → |\/)/).map((part, i) =>
    part === "/" || part === " → " ? (
      <span key={i} className="text-muted-foreground/70">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * The skeleton common to both lines. Without `gap`: the rails touch to
 * form a column, and the gaps are placed one by one after them.
 */
const ROW_CLASS =
  "flex w-full items-start rounded-md py-1 pr-2 pl-1.5 text-left transition-colors hover:bg-muted";

function TreeRows({
  nodes,
  depth,
  closed,
  onToggleDir,
  onSelect,
}: {
  nodes: FileTreeNode[];
  depth: number;
  /** Files CLOSED: everything is open at the start, we only note the difference. */
  closed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const open = !closed.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDir(node.path)}
                aria-expanded={open}
                className={ROW_CLASS}
              >
                <Rails depth={depth} />
                {open ? (
                  <ChevronDown className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                )}
                {/* The folder in half bold, the file in normal: it is the
 structure which bears, and the file name which we then read.
 `break-words` and not `truncate` — a truncated path no longer designates
 anything, two lines are better than a prefix. */}
                <span className="ml-1.5 min-w-0 flex-1 font-mono text-xs font-medium break-words">
                  <Segmented label={node.label} />
                </span>
                <DiffCounters
                  additions={node.additions}
                  deletions={node.deletions}
                  className="ml-2 pt-px"
                />
              </button>
              {open ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  closed={closed}
                  onToggleDir={onToggleDir}
                  onSelect={onSelect}
                />
              ) : null}
            </li>
          );
        }

        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              // The ENTIRE path, including renaming: the line says the name, this
              // hover says where it comes from.
              title={
                node.file.previous_filename
                  ? `${node.file.previous_filename} → ${node.path}`
                  : node.path
              }
              className={ROW_CLASS}
            >
              <Rails depth={depth} />
              <FileStatusIcon status={node.status} className="mt-px" />
              <span className="ml-1.5 min-w-0 flex-1 font-mono text-xs break-words">
                <Segmented label={node.label} />
              </span>
              <DiffCounters
                additions={node.additions}
                deletions={node.deletions}
                className="ml-2 pt-px"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PrFileTreeButton({
  files,
  totalAdditions,
  totalDeletions,
  onSelect,
}: {
  files: PullRequestFile[];
  totalAdditions: number;
  totalDeletions: number;
  /** Takes to the file: the parent unfolds the card, then scrolls through it. */
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());

  /**
 * Numo's panel had already learned this: in a modal panel,
 * react-remove-scroll blocks the wheel on anything set to `<body>`.
 * Two of our three surfaces ARE IN an overlay — otherwise, the tree of a PR of
 * forty files would not scroll. We therefore carry it in the surrounding
 * panel when there is one, and `<body>` otherwise.
 */
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useCallback((node: HTMLButtonElement | null) => {
    setContainer(
      node
        ? (node.closest(
            '[data-slot="side-panel-content"],[data-slot="sheet-content"]',
          ) as HTMLElement | null)
        : null,
    );
  }, []);

  const tree = useMemo(() => buildFileTree(files), [files]);

  const toggleDir = useCallback((path: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /**
 * A jump has just taken place — so the focus is ALREADY set, on the header of the
 * targeted file. Radix returns focus to the trigger when closing, and the
 * browser brings back scrolling with: the jump would be undone before our eyes.
 * The flag is only valid for this case; on Esc or a click next to it, the
 * normal restitution remains the correct one.
 */
  const jumped = useRef(false);

  const select = useCallback(
    (path: string) => {
      jumped.current = true;
      // Closed BEFORE the jump: the panel covers the diff, and we want to see it happen
      // the file, not find it behind a panel that remains open.
      setOpen(false);
      onSelect(path);
    },
    [onSelect],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          title={t("fileTreeHint")}
          className="group -mx-1.5 flex min-w-0 items-center rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <span className="truncate">{t("fileCount", { count: files.length })}</span>
          <span className="ml-2 shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
            +{totalAdditions}
          </span>
          <span className="ml-1 shrink-0 tabular-nums text-red-600 dark:text-red-400">
            −{totalDeletions}
          </span>
          <ChevronDown className="ml-1 size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        container={container}
        onCloseAutoFocus={(event) => {
          if (!jumped.current) return;
          jumped.current = false;
          event.preventDefault();
        }}
        // 384 px wide, and the width of the screen minus its margins below
        // — the entire paths rather than a column which would truncate them.
        className="w-[min(24rem,calc(100vw_-_2rem))] gap-0 p-0"
      >
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">
          {t("fileTreeTitle")}
        </p>
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-1.5">
          <TreeRows
            nodes={tree}
            depth={0}
            closed={closed}
            onToggleDir={toggleDir}
            onSelect={select}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
