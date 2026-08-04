"use client";

import { useSyncExternalStore } from "react";

/**
 * Brouillon « optimiste » de lancement d'agent, posé par un bouton « Lancer un
 * agent » (panneau d'issue, carte — ou le CARNET, MIN-84, ou le bouton
 * « Nouveau » de la page Agents) puis lu par la page Agents. Il porte juste de
 * quoi dessiner une ENTRÉE synthétique dans la liste et amorcer la conversation
 * en compose. Purement UI : si l'utilisateur n'envoie jamais le 1er message,
 * l'entrée est effacée sans qu'aucune run n'ait existé.
 *
 * Deux formes : `issue` (ancré à un ticket, `?compose=<issueId>`) et `free`
 * (conversation SANS ticket — le projet se choisit dans le composer ou arrive
 * pré-choisi, `?compose=new`).
 *
 * Store module-level (pas de contexte) : il n'a qu'un producteur à la fois et
 * un seul consommateur (la page), et doit survivre à la navigation `router.push`
 * entre les deux — ce qu'un état React local ne ferait pas.
 */
/**
 * Ce qu'on demande à l'agent, du point de vue du TICKET — pas du prompt, que
 * l'utilisateur peut réécrire. Seul `implement` fait DÉMARRER le ticket ; les
 * deux autres le laissent exactement où il est :
 *  • `plan`   — cadrer (écrire ou vérifier le plan) : planifier n'est pas
 *    commencer le travail (même règle que le prompt copié, qui n'auto-démarre
 *    que sur la branche « implémenter ») ;
 *  • `verify` — relire une implémentation déjà faite : le ticket est au-delà du
 *    travail, pas avant. Le repasser « en cours » ferait REGRESSER un ticket en
 *    revue — or on ne fait que le contrôler.
 *  • `custom` — consigne écrite par l'utilisateur : on ne sait pas ce qu'elle
 *    demande (explorer, corriger un détail, relire), donc on ne présume pas que
 *    le travail commence et on laisse le ticket exactement où il est.
 */
export type AgentComposeIntent = "implement" | "plan" | "verify" | "custom";

export interface AgentIssueComposeDraft {
  kind: "issue";
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
  /** Défaut : `implement` (le lancement fait démarrer le ticket). */
  intent?: AgentComposeIntent;
}

export interface AgentFreeComposeDraft {
  kind: "free";
  /**
   * Texte PRÉ-ÉCRIT du composer, éditable avant envoi : une note du carnet
   * (MIN-84), un prompt d'intégration — ou la chaîne VIDE quand la conversation
   * part de zéro (bouton « Nouveau » de la page Agents), où c'est l'utilisateur
   * qui dit sur quoi lancer l'agent.
   */
  prompt: string;
  /**
   * Projet PRÉ-CHOISI dans le composer, quand le producteur du brouillon sait
   * déjà quel dépôt est visé — le prompt d'intégration feedback part des
   * réglages d'UN projet. Absent (carnet, bouton « Nouveau ») : le composer
   * laisse choisir. Reste librement modifiable : c'est un pré-remplissage, pas
   * un verrou.
   */
  projectId?: string;
}

export type AgentComposeDraft = AgentIssueComposeDraft | AgentFreeComposeDraft;

/** Valeur du paramètre `?compose=` qui désigne un brouillon SANS ticket. */
export const FREE_COMPOSE_PARAM = "new";

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
