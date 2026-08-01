"use client";

import "@git-diff-view/react/styles/diff-view.css";

import { useTheme } from "mangue-ui";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";

import type { PullRequestFile } from "@/lib/agent-api";
import { diffLanguage } from "@/lib/diff-highlight";
import { toUnifiedDiff } from "@/components/pull-requests/pr-diff";

/**
 * BANC D'ESSAI — @git-diff-view/react, la lib candidate face à react-diff-view
 * (voir `app/(app)/lab/diff/page.tsx`). Rien de tout ceci n'est branché sur les
 * pull requests réelles.
 *
 * Volontairement NU : ni commentaires de review, ni dépliage de contexte, ni
 * fichiers repliables. Ce qui se compare ici est le rendu du diff lui-même —
 * couleurs, coloration, densité, alignement — puisque c'est là-dessus que la
 * question se pose. Le reste (ancrage des fils, `expandFromRawCode`, widgets)
 * n'existe pas dans cette lib sous la même forme : c'est justement le coût de la
 * bascule, pas quelque chose qu'un prototype peut trancher.
 */
export function DiffViewAlt({ files }: { files: PullRequestFile[] }) {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex flex-col gap-3">
      {files.map((f) => (
        <div key={f.filename} className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center gap-2 bg-card px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.filename}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
              +{f.additions}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
              −{f.deletions}
            </span>
          </div>
          {f.patch ? (
            <DiffView
              data={{
                // Son parseur attend un diff unifié BIEN FORMÉ, en-tête compris
                // (`diff --git`, `---`, `+++`) : nourri du seul patch de GitHub,
                // il ne trouve aucun hunk et rend une carte vide. Même besoin
                // que react-diff-view, donc même reconstruction.
                hunks: [toUnifiedDiff(f)],
                oldFile: { fileName: f.previous_filename ?? f.filename, fileLang: diffLanguage(f.filename) },
                newFile: { fileName: f.filename, fileLang: diffLanguage(f.filename) },
              }}
              diffViewMode={DiffModeEnum.Unified}
              diffViewHighlight
              diffViewWrap={false}
              diffViewFontSize={13}
              diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
            />
          ) : (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Pas de patch — la lib n&apos;a rien à rendre non plus.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
