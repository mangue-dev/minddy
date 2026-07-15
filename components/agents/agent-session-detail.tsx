"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { ChevronLeft, GitPullRequest } from "lucide-react";
import { AgentConversation } from "@/components/agent/agent-conversation";
import { issueIdentifier } from "@/lib/issue-constants";
import type { AgentSessionListItem } from "@/lib/agent-api";

/**
 * Panneau de détail d'une session d'agent (page Agents) : un en-tête épuré (retour
 * mobile · titre cliquable · bouton « Ouvrir la pull request ») au-dessus de la MÊME
 * conversation que la modal (`AgentConversation`, inline ici). Cliquer le titre ouvre
 * la sidebar du ticket EN INLINE sur la page (pas de navigation vers le Kanban). La
 * conversation est scoppée à l'issue → elle reprend la session persistante de l'issue.
 */
export function AgentSessionDetail({
  item,
  onBack,
  onOpenIssue,
}: {
  item: AgentSessionListItem;
  onBack: () => void;
  /** Ouvre l'issue liée dans le panneau latéral, par-dessus la page (pas de navigation). */
  onOpenIssue: (issueId: string, projectId: string) => void;
}) {
  const t = useTranslations("Agents");
  const router = useRouter();

  // Garde-fou : sans issue/projet joint (RLS aberrante), on ne peut pas router la
  // conversation vers une issue — on montre l'invite de sélection.
  if (!item.issue || !item.project) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
      </div>
    );
  }

  const issue = item.issue;
  const project = item.project;
  const identifier = issueIdentifier(project.key, issue.number);

  const headerTitle = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("backToList")}
        className="md:hidden"
        onClick={onBack}
      >
        <ChevronLeft />
      </Button>
      {/* Titre cliquable → ouvre la sidebar du ticket en inline sur la page. */}
      <button
        type="button"
        onClick={() => onOpenIssue(issue.id, project.id)}
        className="truncate text-left text-sm font-medium outline-none hover:underline focus-visible:underline"
      >
        {issue.title}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentConversation
        key={issue.id}
        issueId={issue.id}
        issueIdentifier={identifier}
        active
        headerTitle={headerTitle}
        headerClassName="border-b border-border"
        headerActions={
          item.pr_number != null ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
            >
              <GitPullRequest className="size-3.5" />
              {t("openPullRequest")}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
