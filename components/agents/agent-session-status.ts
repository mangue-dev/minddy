import type { MessageKey } from "@/lib/i18n-keys";
import type { AgentRunStatus } from "@/lib/agent-api";

/**
 * L'état d'une session d'agent, en UN mot — celui qu'affiche le tooltip de la
 * liste (page Agents). Il ne dit pas « terminé » : il reflète la GÉNÉRATION en
 * cours, puis l'ÉTAT DE LA PULL REQUEST. Priorité :
 *   1. génération en cours → « En cours » ;
 *   2. PR fusionnée → « PR fusionnée » ;
 *   3. PR ouverte (ou brouillon, ou état inconnu) → « PR disponible » ;
 *   4. PR fermée → « PR fermée » ;
 *   5. sinon (pas de PR) → échec / annulation / au repos.
 *
 * C'était un BADGE coloré posé sur chaque ligne de la liste. La ligne ne porte
 * plus que son titre : l'état s'y réduit au point de couleur (non lu / réponse
 * attendue) et au spinner, et le mot exact attend le survol.
 */
export function agentSessionStatusKey({
  status,
  working,
  prNumber,
  prState,
}: {
  status: AgentRunStatus;
  working?: boolean;
  prNumber?: number | null;
  prState?: "draft" | "open" | "merged" | "closed" | null;
}): MessageKey<"Agents"> {
  const isWorking = working ?? (status === "queued" || status === "running");
  if (isWorking) return "statusWorking";
  if (prState === "merged") return "prMergedShort";
  if (prNumber != null && prState !== "closed") return "prAvailable";
  if (prState === "closed") return "prClosed";
  if (status === "failed") return "statusFailed";
  if (status === "canceled") return "statusCanceled";
  return "statusWaiting";
}
