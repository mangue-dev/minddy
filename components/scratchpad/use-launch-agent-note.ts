"use client";

import { useRouter } from "next/navigation";
import { useScratchpad } from "@/lib/scratchpad-context";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";

/**
 * « Lancer un agent » depuis le carnet (MIN-84) — le geste commun aux trois
 * portées (une tâche, une section, tout le carnet) : ferme le carnet (son
 * démontage flushe l'autosave, cf. scratchpad-editor.tsx), pose un brouillon
 * SANS ticket amorcé de la note (le prompt, librement éditable avant envoi) et
 * navigue vers le composer de la page Agents, où se choisissent projet, modèle
 * et branche.
 */
export function useLaunchAgentNote(): (note: string) => void {
  const router = useRouter();
  const { close: closeScratchpad } = useScratchpad();

  return (note: string) => {
    const text = note.trim();
    if (!text) return;
    closeScratchpad();
    setAgentComposeDraft({ kind: "free", prompt: text });
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };
}
