"use client";

import "react-diff-view/style/index.css";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, SegmentedControl } from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parseDiff, Diff, Hunk, type DiffType } from "react-diff-view";
import type { PullRequestFile } from "@/lib/agent-api";

/**
 * Vue diff moderne d'une PR (MIN-66) : liste de fichiers repliables avec compteurs
 * +/−, bascule unifié ↔ côte-à-côte (`viewType` de react-diff-view). Réutilisée
 * par la page Pull Requests et le panneau de review d'une issue.
 *
 * GitHub renvoie un `patch` par fichier (fragment de hunks) : on reconstruit un
 * diff unifié complet autour, puis `parseDiff`. Les fichiers binaires/trop gros
 * arrivent sans `patch` → repli « voir sur GitHub ».
 */

/** Reconstruit un diff unifié complet à partir du patch par-fichier de GitHub. */
export function toUnifiedDiff(f: PullRequestFile): string {
  if (!f.patch) return "";
  const oldPath = f.status === "added" ? "/dev/null" : `a/${f.filename}`;
  const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
  return `diff --git a/${f.filename} b/${f.filename}\n--- ${oldPath}\n+++ ${newPath}\n${f.patch}\n`;
}

type ViewType = "unified" | "split";

export function PrDiff({
  files,
  prUrl,
  className,
}: {
  files: PullRequestFile[];
  prUrl?: string | null;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const [viewType, setViewType] = useState<ViewType>("unified");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Parse une fois puis indexe par chemin (nouveau chemin, ou ancien pour une suppression).
  const parsedByPath = useMemo(() => {
    const diffText = files.map(toUnifiedDiff).filter(Boolean).join("\n");
    const parsed = diffText ? parseDiff(diffText) : [];
    const map = new Map<string, (typeof parsed)[number]>();
    for (const p of parsed) {
      const key = p.newPath && p.newPath !== "/dev/null" ? p.newPath : p.oldPath;
      map.set(key, p);
    }
    return map;
  }, [files]);

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noDiff")}</p>;
  }

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("fileCount", { count: files.length })}
          <span className="ml-2 tabular-nums text-emerald-600 dark:text-emerald-400">
            +{totalAdd}
          </span>
          <span className="ml-1 tabular-nums text-red-600 dark:text-red-400">−{totalDel}</span>
        </p>
        <SegmentedControl
          className="w-40 shrink-0"
          value={viewType}
          onChange={setViewType}
          options={[
            { value: "unified", label: t("unified") },
            { value: "split", label: t("split") },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3">
        {files.map((f) => {
          const parsed = f.patch ? parsedByPath.get(f.filename) : undefined;
          const isCollapsed = collapsed.has(f.filename);
          return (
            <div
              key={f.filename}
              className="overflow-hidden rounded-md border border-border"
            >
              <button
                type="button"
                onClick={() => toggle(f.filename)}
                className="flex w-full items-center gap-2 bg-muted px-2 py-1.5 text-left outline-none hover:bg-muted/80"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {f.filename}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{f.additions}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
                  −{f.deletions}
                </span>
              </button>
              {isCollapsed ? null : parsed ? (
                <div className="overflow-x-auto text-xs">
                  <Diff
                    viewType={viewType}
                    diffType={parsed.type as DiffType}
                    hunks={parsed.hunks}
                  >
                    {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
                  </Diff>
                </div>
              ) : (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">
                  {t("binaryOrLarge")}{" "}
                  {prUrl ? (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      {t("viewOnGithub")}
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
