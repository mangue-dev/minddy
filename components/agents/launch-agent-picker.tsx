"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { Plus } from "lucide-react";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { StatusIndicator } from "@/components/issue-indicators";
import { useProjects } from "@/lib/projects-context";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { setAgentComposeDraft } from "@/lib/agent-compose-draft";
import { agentLaunchPromptVariant } from "@/lib/agent-launch-prompt";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import type { AgentSessionListItem } from "@/lib/agent-api";
import type { GlobalBoardResponse, Issue } from "@/lib/types";

/**
 * Bouton « New » de la page Agents : choisir un ticket (recherche cross-projet) et
 * lancer un agent dessus. Trois cas, alignés sur l'issue-card :
 *   • un agent TRAVAILLE déjà sur le ticket → on ouvre sa conversation vivante (un
 *     seul run à la fois : un compose échouerait) ;
 *   • une session existe (au repos) → NOUVELLE session, composer VIERGE ;
 *   • aucune session → lancement à froid, composer amorcé du contexte du ticket.
 *
 * Le board agrégé (toutes les issues accessibles) n'est chargé qu'à l'OUVERTURE du
 * picker — cache partagé avec le board « Tous les tickets », pas de fetch au simple
 * affichage de /agents.
 *
 * Deux tailles pour un seul bouton. Dans la ligne de titre de la colonne, il est
 * réduit à son icône : la place y sert au champ de filtre, et le libellé revient
 * en tooltip (celui de `SearchMenu`, pas un `title` HTML — l'app n'a qu'une façon
 * de dire ce que fait un bouton). Dans la scène vide, où il est le seul geste
 * offert, il garde son libellé et son cadre.
 */
export function LaunchAgentPicker({
  sessions,
  iconOnly,
}: {
  sessions: AgentSessionListItem[];
  iconOnly?: boolean;
}) {
  const t = useTranslations("Agents");
  const tAgent = useTranslations("Agent");
  const router = useRouter();
  const { projects } = useProjects();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    enabled: open,
    staleTime: 30_000,
  });

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const issues = (data?.issues ?? []) as GlobalBoardResponse["issues"];
  const issueById = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues],
  );

  const options = useMemo<PickerOption[]>(() => {
    // Ouvertes d'abord (les closes restent choisissables — une session « terminée »
    // peut vouloir une nouvelle session), sinon ordre du board.
    return [...issues]
      .sort((a, b) => (isClosedStatus(a.status) ? 1 : 0) - (isClosedStatus(b.status) ? 1 : 0))
      .map((i) => {
        const project = projectById.get(i.project_id);
        const identifier = issueIdentifier(project?.key ?? "", i.number);
        return {
          value: i.id,
          label: `${identifier}  ${i.title}`,
          keywords: [identifier, i.title, project?.name ?? ""],
          icon: <StatusIndicator status={i.status} className="size-4" />,
        };
      });
  }, [issues, projectById]);

  const launch = (issueId: string | null) => {
    if (!issueId) return;
    const issue = issueById.get(issueId) as Issue | undefined;
    if (!issue) return;
    const session = sessions.find((s) => s.issue?.id === issueId) ?? null;
    // Un agent travaille déjà → on ouvre sa conversation (un compose échouerait, un
    // seul run actif par ticket) plutôt que de tenter un nouveau lancement.
    if (session?.working) {
      router.push(`/agents?issue=${issueId}`);
      return;
    }
    const project = projectById.get(issue.project_id);
    const projectKey = project?.key ?? "";
    const identifier = issueIdentifier(projectKey, issue.number);
    // Session existante (au repos) → nouvelle session, input VIERGE ; sinon prompt
    // d'amorçage (contexte du ticket adapté à son plan / effort).
    const prompt = session
      ? ""
      : `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`;
    setAgentComposeDraft({
      kind: "issue",
      issueId,
      issueNumber: issue.number,
      issueTitle: issue.title,
      projectId: issue.project_id,
      projectKey,
      prompt,
    });
    router.push(`/agents?compose=${issueId}`);
  };

  return (
    <SearchSelect
      value={null}
      onChange={launch}
      options={options}
      open={open}
      onOpenChange={setOpen}
      align="end"
      searchPlaceholder={t("newSearchPlaceholder")}
      emptyText={isLoading ? t("newLoading") : t("newEmpty")}
      tooltip={iconOnly ? t("newButton") : undefined}
      trigger={
        iconOnly ? (
          /* `-mr-2` compense le padding du bouton : l'icône s'aligne alors sur le
             bord droit des lignes de la liste, pas 8 px en-deçà. */
          <Button
            size="icon-sm"
            variant="ghost"
            className="-mr-2 text-muted-foreground hover:text-foreground"
            aria-label={t("newButton")}
          >
            <Plus className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="size-4" />
            {t("newButton")}
          </Button>
        )
      }
    />
  );
}
