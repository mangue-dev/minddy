"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { ChevronLeft, GitPullRequest, NotebookPen } from "lucide-react";
import { AgentConversation } from "@/components/agent/agent-conversation";
import { issueIdentifier } from "@/lib/issue-constants";
import type { AgentRunSummary, AgentSessionListItem } from "@/lib/agent-api";

/**
 * Panneau de détail d'une session d'agent (page Agents) : un en-tête épuré (retour
 * mobile · titre cliquable · bouton « Ouvrir la pull request ») au-dessus de la MÊME
 * conversation que la modal (`AgentConversation`, inline ici). Cliquer le titre ouvre
 * la sidebar du ticket EN INLINE sur la page (pas de navigation vers le Kanban).
 * Cliquer un ticket ouvre sa session la plus ACTIVE (résolution par défaut de la
 * conversation), et donne accès à ses runs précédentes (MIN-68).
 *
 * Session CARNET (MIN-84, `issue` null) : le run EST la session — l'en-tête montre
 * l'excerpt de la note (non cliquable), la conversation s'ancre sur `noteRunId`.
 */
export function AgentSessionDetail({
  item,
  onBack,
  onOpenIssue,
  compose = false,
  composeInitialText,
  onLaunched,
  showUnread = false,
}: {
  item: AgentSessionListItem;
  onBack: () => void;
  /** Ouvre l'issue liée dans le panneau latéral, par-dessus la page (pas de navigation). */
  onOpenIssue: (issueId: string, projectId: string) => void;
  /**
   * Ouvre la conversation en phase COMPOSE (brouillon de lancement) : composer
   * pré-écrit + picker de modèle, sans rouvrir la dernière run. `item` est alors une
   * entrée synthétique (aucune run réelle) — voir la page Agents.
   */
  compose?: boolean;
  /** Prompt pré-écrit amorçant le composer en compose (relayé à la conversation). */
  composeInitialText?: string;
  /** Relayé à la conversation : une run neuve vient d'être lancée depuis le compose. */
  onLaunched?: (run: AgentRunSummary) => void;
  /** Affiche les bulles bleues « terminé, non lu » sur le sélecteur de runs (page Agents). */
  showUnread?: boolean;
}) {
  const t = useTranslations("Agents");
  const router = useRouter();

  // Garde-fou : sans projet joint (RLS aberrante), rien à afficher. Une session
  // sans ISSUE est légitime : c'est une session carnet.
  if (!item.project) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
      </div>
    );
  }

  const issue = item.issue;
  const project = item.project;

  const backButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("backToList")}
      className="md:hidden"
      onClick={onBack}
    >
      <ChevronLeft />
    </Button>
  );

  const prActions =
    // En compose : pas de bouton PR (aucune run lancée ; la PR héritée n'existe
    // qu'une fois le 1er message envoyé). Sinon, s'adapte à l'état de la PR :
    // rien (pas de PR), bouton (disponible), ou lien texte vert (fusionnée).
    compose || item.pr_number == null ? undefined : item.pr_state === "merged" ? (
      <button
        type="button"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
        className="text-sm font-medium text-emerald-600 outline-none hover:underline dark:text-emerald-500"
      >
        {t("prMerged")}
      </button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
      >
        <GitPullRequest className="size-3.5" />
        {t("openPullRequest")}
      </Button>
    );

  // ── Session CARNET : conversation d'UN run, en-tête = excerpt de la note ────
  if (!issue) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AgentConversation
          key={item.runId}
          noteRunId={item.runId}
          active
          showUnread={false}
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {backButton}
              <NotebookPen className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {item.prompt || t("noteSessionTitle")}
              </span>
            </div>
          }
          headerActions={prActions}
        />
      </div>
    );
  }

  const identifier = issueIdentifier(project.key, issue.number);

  const headerTitle = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {backButton}
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
        // Cliquer un ticket ouvre sa session la plus ACTIVE — la run au travail,
        // sinon la dernière run non `failed` : c'est la résolution PAR DÉFAUT de la
        // conversation (`initialRunId=null`). On ne force PLUS le représentant
        // `item.runId` (la dernière run CRÉÉE) : quand celle-ci a échoué à l'amorçage,
        // c'est un tronçon mort (ni fil ni composer) et l'ouvrir de force masquait la
        // vraie session vivante du ticket. Une session terminée (non `failed`) rouvre
        // quand même — la résolution la retient. En COMPOSE (brouillon de lancement),
        // `initialCompose` force le composer vierge quoi qu'il arrive.
        initialRunId={null}
        initialCompose={compose}
        initialComposeText={compose ? composeInitialText : undefined}
        onLaunched={onLaunched}
        showUnread={showUnread}
        active
        headerTitle={headerTitle}
        headerActions={prActions}
      />
    </div>
  );
}
