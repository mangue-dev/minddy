"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { ChevronDown, ClipboardCopy, Code2, ListChecks, Pencil } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { NumoIcon } from "@/components/numo-icon";
import { TaskRow } from "@/components/plan-task-row";
import {
  parsePlan,
  setTaskState,
  type PlanTask,
  type PlanTaskState,
} from "@/lib/plan";
import { trackEvent } from "@/lib/analytics";

/**
 * The issue's implementation plan (Plan tab of the side panel): rendered
 * markdown with interactive task rows by default, raw-markdown editing behind
 * an explicit Save/Cancel (a blur-commit would fire spurious task events on a
 * half-edited plan). The markdown is the single source of truth — every task
 * interaction rewrites one line and commits the full document (lib/plan.ts).
 *
 * Plan vide : trois façons de le remplir — laisser un agent Numo le cadrer,
 * copier le prompt pour un agent externe (MCP), ou l'écrire à la main. Les deux
 * premières sont optionnelles : le panneau ne les passe que quand elles ont un
 * sens (agents autorisés + dépôt lié pour Numo).
 *
 * Plan rempli : le plan est écrit, la suite est de l'IMPLÉMENTER — c'est le
 * bouton principal, en tête de l'onglet. En dessous, les deux façons de le
 * reprendre d'abord : le faire vérifier point par point par Numo, ou copier un
 * prompt pour un agent externe (au choix : implémenter, ou vérifier le plan).
 */
export function IssuePlan({
  plan,
  onCommit,
  onWriteWithAgent,
  onCopyPrompt,
  onImplementWithAgent,
  onCopyImplementPrompt,
}: {
  plan: string | null;
  onCommit: (plan: string | null) => void;
  /** Ouvre le composer d'agent avec un prompt « écris / vérifie le plan ». */
  onWriteWithAgent?: () => void;
  /** Copie le prompt « écris / vérifie le plan » pour un agent externe. */
  onCopyPrompt?: () => void;
  /** Ouvre le composer d'agent avec le prompt « implémente le ticket ». */
  onImplementWithAgent?: () => void;
  /** Copie le prompt « implémente le ticket » pour un agent externe. */
  onCopyImplementPrompt?: () => void;
}) {
  const t = useTranslations("Plan");
  const tIssue = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const { segments, progress } = useMemo(() => parsePlan(plan), [plan]);
  const percent =
    progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  // Un plan avec des tâches se VÉRIFIE ; du markdown sans tâche (de la prose
  // seule) reste à écrire — même définition que `hasPlanTasks`, pour que les
  // libellés collent aux prompts que les callbacks déclenchent.
  const reviewing = progress.total > 0;

  const startEditing = () => {
    setDraft(plan ?? "");
    setEditing(true);
  };
  const saveDraft = () => {
    const next = draft.trim() ? draft : null;
    if (next !== (plan ?? null)) onCommit(next);
    setEditing(false);
  };

  const commitTaskState = (task: PlanTask, state: PlanTaskState) => {
    if (!plan || task.state === state) return;
    trackEvent("plan_task_toggled", { to_state: state });
    onCommit(setTaskState(plan, task.line, state));
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              saveDraft();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          placeholder={t("editorPlaceholder")}
          autoFocus
          spellCheck={false}
          className="min-h-[45vh] w-full resize-y rounded-lg border border-border bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {tCommon("cancel")}
          </Button>
          <Button size="sm" onClick={saveDraft}>
            {tCommon("save")}
          </Button>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-medium">{t("emptyTitle")}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t("emptyHint")}</p>
        {/* Les deux façons de faire écrire le plan, puis — en retrait — celle
            qui consiste à l'écrire soi-même. */}
        {(onWriteWithAgent || onCopyPrompt) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onWriteWithAgent && (
              <Button size="sm" onClick={onWriteWithAgent}>
                <NumoIcon animated={false} className="size-4" />
                {t("writeWithNumo")}
              </Button>
            )}
            {onCopyPrompt && (
              // Le libellé ne dit pas QUEL prompt : l'infobulle le dit.
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onCopyPrompt}>
                    <ClipboardCopy className="size-4" />
                    {t("copyPlanPrompt")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-center">
                  {t("copyPlanPromptHint")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        <Button
          variant={onWriteWithAgent || onCopyPrompt ? "ghost" : "outline"}
          size="sm"
          onClick={startEditing}
        >
          {t("addPlan")}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {progress.total > 0 && (
          <>
            <span className="text-xs text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
            <Progress value={percent} className="w-24" />
          </>
        )}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editAriaLabel")}
          className="rounded-full text-muted-foreground hover:text-foreground"
          onClick={startEditing}
        >
          <Pencil />
        </Button>
      </div>

      {/* Ce qu'on fait d'un plan écrit. L'implémenter est l'action attendue —
          seul bouton plein ; en dessous, les deux façons de le reprendre avant.
          Numo n'apparaît que là où il peut travailler (le panneau ne passe ses
          deux callbacks que dans ce cas) ; les prompts copiables, eux, servent
          les agents externes et restent toujours là. */}
      {(onImplementWithAgent ||
        onWriteWithAgent ||
        onCopyPrompt ||
        onCopyImplementPrompt) && (
        <div className="mb-4 flex flex-col gap-2">
          {onImplementWithAgent && (
            <Button className="w-full" onClick={onImplementWithAgent}>
              <NumoIcon animated={false} className="size-4" />
              {t("implementWithNumo")}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {onWriteWithAgent && (
              <Button
                variant="outline"
                // `grow basis-*` plutôt que `flex-1` : les boutons partagent la
                // ligne quand elle est assez large, sans jamais rogner leur
                // libellé (le composant est `shrink-0`) — sinon ils passent à la
                // ligne, chacun sur toute la largeur.
                className="grow basis-40"
                onClick={onWriteWithAgent}
              >
                <NumoIcon animated={false} className="size-4" />
                {t(reviewing ? "reviewWithNumo" : "writeWithNumo")}
              </Button>
            )}
            {(onCopyPrompt || onCopyImplementPrompt) && (
              // Le libellé ne dit pas QUEL prompt : le menu le demande — les
              // deux mêmes façons de travailler le ticket que le menu « ⋯ ».
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="grow basis-32">
                    <ClipboardCopy className="size-4" />
                    {t("copyPlanPrompt")}
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {onCopyImplementPrompt && (
                    <DropdownMenuItem onSelect={onCopyImplementPrompt}>
                      <Code2 className="size-4" />
                      {tIssue("actionImplement")}
                    </DropdownMenuItem>
                  )}
                  {onCopyPrompt && (
                    <DropdownMenuItem onSelect={onCopyPrompt}>
                      <ListChecks className="size-4" />
                      {tIssue(reviewing ? "actionReviewPlan" : "actionWritePlan")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {segments.map((segment, i) =>
          segment.kind === "prose" ? (
            <Markdown key={i}>{segment.markdown}</Markdown>
          ) : (
            <div key={i} className="my-1 flex flex-col">
              {segment.tasks.map((task) => (
                <TaskRow
                  key={`${task.line}-${task.text}`}
                  task={task}
                  onSetState={(state) => commitTaskState(task, state)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
