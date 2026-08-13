"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { isPrWorthShowing, type IssuePr } from "@/lib/agent-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * L'état de l'agent de code sur l'en-tête du panneau d'issue, en un chip — le
 * pendant panneau des indicateurs de la carte (MIN-46 / MIN-68). Il ne montre que
 * ce qui appelle une action :
 *   • l'agent TRAVAILLE → visage Numo animé, clic = ouvrir la conversation ;
 *   • sinon, une PR vivante (ouverte, brouillon) ou livrée (fusionnée) → clic = la review.
 * Rien à dire (aucune run, PR fermée) → rien affiché. Tout le reste — lancer,
 * nouvelle session, ouvrir — vit dans le menu « ⋯ » à droite de l'en-tête.
 */
export function IssueAgentChip({
  working,
  pr,
  onOpenConversation,
  onOpenPr,
}: {
  /** Une run de l'issue est queued/running. */
  working: boolean;
  /** La PR du ticket, tous états confondus — le chip écarte lui-même `closed`. */
  pr: IssuePr | null;
  onOpenConversation: () => void;
  onOpenPr: () => void;
}) {
  const t = useTranslations("Agent");

  // Au travail : l'agent EST l'information. La PR, s'il y en a une, reste
  // atteignable par le menu « ⋯ ».
  if (working) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenConversation}
            aria-label={t("working")}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:bg-primary/10"
          >
            <NumoIcon state="thinking" className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("working")}</TooltipContent>
      </Tooltip>
    );
  }

  // Une PR REFUSÉE n'appelle plus rien : le chip se tait. Le menu « ⋯ », lui, y
  // mène quand même — c'est ce qui s'est passé sur ce ticket.
  if (!isPrWorthShowing(pr)) return null;
  const merged = pr?.state === "merged";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenPr}
          aria-label={t("viewPullRequest")}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none transition-colors",
            merged
              ? "text-violet-600 hover:bg-violet-500/10 focus-visible:bg-violet-500/10 dark:text-violet-400"
              : "text-emerald-600 hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 dark:text-emerald-500"
          )}
        >
          <GitPullRequest className="size-3.5 shrink-0" />
          <span className="truncate">{merged ? t("prMerged") : t("prBadge")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPullRequest")}</TooltipContent>
    </Tooltip>
  );
}
