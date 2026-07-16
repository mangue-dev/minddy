"use client";

import { useSyncExternalStore } from "react";

/**
 * Brouillon « optimiste » de lancement d'agent, posé par le bouton « Lancer un
 * agent » du panneau d'issue puis lu par la page Agents. Il porte juste de quoi
 * dessiner une ENTRÉE synthétique dans la liste (identifiant + titre de l'issue) et
 * amorcer la conversation en compose. Purement UI : si l'utilisateur n'envoie jamais
 * le 1er message, l'entrée est effacée sans qu'aucune run n'ait existé.
 *
 * Store module-level (pas de contexte) : il n'a qu'un seul producteur (le bouton) et
 * un seul consommateur (la page), et doit survivre à la navigation `router.push`
 * entre les deux — ce qu'un état React local ne ferait pas.
 */
export interface AgentComposeDraft {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  projectId: string;
  projectKey: string;
  /**
   * Prompt pré-écrit qui amorce le composer (demande d'implémentation adaptée à
   * l'effort / au plan de l'issue, DÉJÀ localisé — voir `agentLaunchPromptVariant`).
   * Éditable avant envoi ; vidé s'il n'est jamais envoyé, comme le reste du brouillon.
   */
  prompt: string;
}

let current: AgentComposeDraft | null = null;
const listeners = new Set<() => void>();

/** Pose (ou efface avec `null`) le brouillon et notifie la page Agents. */
export function setAgentComposeDraft(draft: AgentComposeDraft | null): void {
  current = draft;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AgentComposeDraft | null {
  return current;
}

/** Brouillon courant, réactif. `null` côté serveur (jamais de brouillon au SSR). */
export function useAgentComposeDraft(): AgentComposeDraft | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
