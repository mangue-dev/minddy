"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { ChevronLeft, GitPullRequest } from "lucide-react";
import { AgentConversation } from "@/components/agent/agent-conversation";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PR_STATE_STYLES, PrStateBadge } from "@/components/pull-requests/pr-state-badge";
import { issueIdentifier } from "@/lib/issue-constants";
import { agentSessionTitle } from "@/lib/agent-session-title";
import { ChainStatusBar } from "@/components/automations/chain-status-bar";
import type { AgentRunSummary, AgentSessionListItem } from "@/lib/agent-api";
import type { AgentComposeIntent } from "@/lib/agent-compose-draft";

/**
 * Panneau de détail d'une conversation d'agent (page Agents) : un en-tête épuré
 * (retour mobile · titre cliquable · bouton « Ouvrir la pull request ») au-dessus
 * de la MÊME conversation que la modal (`AgentConversation`, inline ici).
 *
 * Le volet ouvre LE run de la ligne choisie, et lui seul — un run est une
 * conversation. L'en-tête porte son titre, précédé de l'identifiant du ticket
 * quand il y en a un (`agentSessionTitle`, le même nom que dans la colonne) ;
 * cliquer dessus ouvre la sidebar du ticket EN INLINE sur la page (pas de
 * navigation vers le Kanban).
 *
 * Conversation SANS TICKET (MIN-84, `issue` null) : même volet, titre non
 * cliquable (résumé de son premier message), ancrée sur `noteRunId`.
 */
export function AgentSessionDetail({
  item,
  onBack,
  onOpenIssue,
  compose = false,
  composeInitialText,
  composeIntent,
  onLaunched,
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
  /**
   * Ce que demandait le point d'entrée : `plan` (cadrage) ne fait pas démarrer le
   * ticket au lancement, `implement` si. Relayé tel quel à la conversation.
   */
  composeIntent?: AgentComposeIntent;
  /** Relayé à la conversation : une run neuve vient d'être lancée depuis le compose. */
  onLaunched?: (run: AgentRunSummary) => void;
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

  /**
   * L'orbe du projet ouvre l'en-tête des TROIS formes de session (ticket, sujet
   * libre, relecture de PR). C'est la question qu'on se pose en arrivant sur une
   * conversation — de quel dépôt parle-t-on ? —, et elle vaut pour les trois. Ce
   * qu'elle remplace (l'icône du TYPE de session) se lit déjà dans la colonne, au
   * survol de la ligne.
   */
  const projectOrb = (
    <ProjectOrb
      seed={projectOrbSeed(project)}
      iconUrl={project.icon_url}
      className="size-4 shrink-0"
    />
  );

  const closedState =
    item.pr_state === "merged" || item.pr_state === "closed" ? item.pr_state : null;

  const prActions =
    // En compose : pas de bouton PR (aucune run lancée ; la PR héritée n'existe
    // qu'une fois le 1er message envoyé). Sinon, deux cas selon ce que la PR
    // attend encore :
    //  • VIVANTE (ouverte, brouillon) → l'action, « voir la pull request » ;
    //  • FINIE (fusionnée, fermée) → son ÉTAT, dans le badge de la page Pull
    //    requests. Il n'y a plus rien à y faire, et un bouton d'action mentirait
    //    sur ce qui reste possible. Le badge reste cliquable — la PR se consulte.
    //
    // C'est le MÊME badge qu'ailleurs (`PrStateBadge`), aux couleurs de GitHub :
    // violet fusionnée, rouge fermée. Cet en-tête peignait sa propre version.
    compose || item.pr_number == null ? undefined : closedState ? (
      <button
        type="button"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PrStateBadge state={closedState} icon />
      </button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => router.push(`/pull-requests?run=${item.runId}`)}
        className={cn(item.pr_state === "open" && PR_STATE_STYLES.open)}
      >
        <GitPullRequest className="size-3.5" />
        {t("openPullRequest")}
      </Button>
    );

  // ── Session de RELECTURE (MIN-168) : conversation d'UN run, en-tête = la PR ──
  // Même volet qu'une session carnet — le run EST la session, il n'y a pas de
  // lignée à parcourir —, avec le badge et le lien de la pull request relue. La
  // reprise conversationnelle passe donc par le même chemin (`noteRunId` +
  // /steer) : répondre ici fait poster un nouveau commentaire sur la PR.
  const reviewed = item.pullRequest;
  if (!issue && reviewed) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AgentConversation
          key={item.runId}
          noteRunId={item.runId}
          projectId={project.id}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {backButton}
              {projectOrb}
              <span className="truncate text-sm font-medium">
                {reviewed.title?.trim() || `#${reviewed.number}`}
              </span>
            </div>
          }
          headerActions={
            // Vers la PR DANS minddy (`?pr=`), comme partout ailleurs — la carte,
            // le panneau du ticket, l'en-tête d'une session de code. Ce bouton
            // partait sur la forge : le seul de l'app à sortir de minddy pour
            // montrer une pull request qu'on sait afficher.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/pull-requests?pr=${reviewed.id}`)}
            >
              <GitPullRequest className="size-3.5" />
              {t("openPullRequest")}
            </Button>
          }
        />
      </div>
    );
  }

  // ── Session SANS TICKET : conversation d'UN run, en-tête = son sujet ───────
  if (!issue) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AgentConversation
          key={item.runId}
          noteRunId={item.runId}
          projectId={project.id}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {backButton}
              {projectOrb}
              <span className="truncate text-sm font-medium">
                {agentSessionTitle(item, t("freeSessionTitle"))}
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
      {projectOrb}
      {/* Le MÊME nom que dans la colonne — « MIN-42: Corriger la redirection ».
          Cliquable → ouvre la sidebar du ticket en inline sur la page. */}
      <button
        type="button"
        onClick={() => onOpenIssue(issue.id, project.id)}
        className="truncate text-left text-sm font-medium outline-none hover:underline focus-visible:underline"
      >
        {agentSessionTitle(item, t("freeSessionTitle"))}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* La chaîne d'automatisation du ticket (MIN-147) : c'est ELLE qui a lancé
          la session qu'on regarde, et c'est d'ici qu'on la continue ou l'arrête —
          sans avoir à repasser par le panneau du ticket. */}
      <div className="shrink-0 px-4 pt-3 empty:hidden">
        <ChainStatusBar issueId={issue.id} />
      </div>
      <AgentConversation
        key={item.runId}
        issueId={issue.id}
        issueIdentifier={identifier}
        projectId={project.id}
        // LE run de la ligne, et rien d'autre : c'est lui la conversation qu'on a
        // choisie. Auparavant on laissait la conversation résoudre elle-même « la
        // plus active du ticket » (`initialRunId=null`), parce que la ligne
        // désignait un TICKET et non un échange ; ouvrir aujourd'hui autre chose
        // que la ligne cliquée serait un mensonge. L'ancrage `issueId` reste, lui :
        // c'est de lui que viennent la lignée (une run passée n'est pas
        // reprennable), les branches et le lancement d'une run neuve.
        // En COMPOSE (brouillon de lancement), `initialCompose` force le composer
        // vierge quoi qu'il arrive — le run n'existe pas encore.
        initialRunId={compose ? null : item.runId}
        initialCompose={compose}
        initialComposeText={compose ? composeInitialText : undefined}
        composeIntent={compose ? composeIntent : undefined}
        onLaunched={onLaunched}
        active
        headerTitle={headerTitle}
        headerActions={prActions}
      />
    </div>
  );
}
