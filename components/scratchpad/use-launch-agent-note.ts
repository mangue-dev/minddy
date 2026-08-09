"use client";

import { useRouter } from "next/navigation";
import { useScratchpad } from "@/lib/scratchpad-context";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";

/**
 * « Lancer un agent » depuis le carnet (MIN-84) — le geste commun aux trois
 * portées (une tâche, une section, tout le carnet) : ferme le carnet (son
 * démontage flushe l'autosave, cf. scratchpad-editor.tsx), pose un brouillon
 * SANS ticket amorcé de la note (le prompt, librement éditable avant envoi) et
 * navigue vers le composer de la page Agents, où se choisissent projet, modèle
 * et branche.
 *
 * Le brouillon porte le prompt COMPLET, celui de « copier le prompt » : cadrage
 * « ce sont des notes personnelles, pas une spec », sémantique des cases, et la
 * section nommée en clair. La note brute laissait lire « - [~] relancer le
 * cron » dans un composer qu'on est censé relire et corriger avant d'envoyer —
 * or ce n'était pas ce que l'agent allait recevoir : le serveur emballait dans
 * son dos. Ce qu'on voit est maintenant ce qui part (le serveur laisse passer
 * un prompt déjà emballé, cf. `isScratchpadPrompt`), et reste éditable.
 *
 * SANS le bloc MCP, comme le run carnet côté serveur : les tools natifs de numo
 * (read_scratchpad / update_scratchpad_task) le remplacent.
 */
export function useLaunchAgentNote(): (
  note: string,
  opts?: { section?: boolean }
) => void {
  const router = useRouter();
  const { close: closeScratchpad } = useScratchpad();

  return (note: string, opts?: { section?: boolean }) => {
    const text = note.trim();
    if (!text) return;
    closeScratchpad();
    setAgentComposeDraft({
      kind: "free",
      prompt: buildScratchpadPrompt(text, {
        section: opts?.section,
        mcp: false,
      }),
    });
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };
}
