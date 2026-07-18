"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { useAgentRunEventsQuery } from "@/lib/use-agent-runs";
import { cumulativeBranchFiles, liveTurnFiles } from "@/lib/agent-changed-files";
import { ChangedFilesBlock } from "./changed-files-block";

/**
 * Barre « fichiers changés » posée AU-DESSUS du composer (MIN-46, note « diff par
 * tour »). Deux états, jamais simultanés :
 *  • l'agent TRAVAILLE → bloc LIVE du tour en cours (reconstruit des tool-calls,
 *    approximatif), épinglé et repliable — on voit défiler ce qui est touché ;
 *  • au REPOS avec du travail poussé et pas encore de PR → bloc CUMULÉ de la branche
 *    + bouton « créer une pull request » (déclenche l'agent, qui ouvre la PR).
 * Sinon : rien (le composer occupe seul le bas). Le bloc SETTLED de fin de tour, lui,
 * vit dans le fil sous la réponse (agent-event-feed) — ici c'est le pendant vivant.
 *
 * Lit les mêmes events que le fil (clé de query partagée → pas de requête en double).
 */
export function AgentChangesBar({
  runId,
  working,
  canCreatePr,
  requestingPr,
  onCreatePr,
}: {
  runId: string;
  /** L'agent produit-il un tour en ce moment ? (pilote live vs repos.) */
  working: boolean;
  /** Session reprennable et sans PR : le bouton « créer la PR » a du sens. */
  canCreatePr: boolean;
  /** Demande de PR déjà envoyée (désactive le bouton le temps que l'agent reparte). */
  requestingPr: boolean;
  onCreatePr: () => void;
}) {
  const t = useTranslations("Agent");
  const { events } = useAgentRunEventsQuery(runId, working);

  const liveFiles = useMemo(() => (working ? liveTurnFiles(events) : []), [events, working]);
  const branch = useMemo(
    () => (!working && canCreatePr ? cumulativeBranchFiles(events) : { files: [], truncated: false }),
    [events, working, canCreatePr],
  );

  if (working) {
    if (liveFiles.length === 0) return null;
    return (
      <div className="px-3 pb-2">
        <ChangedFilesBlock
          files={liveFiles}
          label={t("filesChangedTurn", { count: liveFiles.length })}
          live
          defaultOpen
        />
      </div>
    );
  }

  if (!canCreatePr || branch.files.length === 0) return null;
  return (
    <div className="px-3 pb-2">
      <ChangedFilesBlock
        files={branch.files}
        truncated={branch.truncated}
        label={t("filesChanged", { count: branch.files.length })}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={requestingPr}
            onClick={onCreatePr}
          >
            <GitPullRequest className="size-3.5" />
            {t("createPullRequest")}
          </Button>
        }
      />
    </div>
  );
}
