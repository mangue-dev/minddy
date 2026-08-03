// La proposition d'amorce d'un projet (MIN-172), telle qu'elle voyage : le
// serveur la fabrique (`lib/server/brief-to-issues.ts`), le navigateur
// l'affiche et la retouche (`components/project-seed/`), le serveur la relit
// et la valide avant d'écrire (`lib/server/seed-issues.ts`).
//
// Isomorphe comme `lib/import/types.ts`, et pour la même raison : c'est le
// SEUL contrat entre les trois, et ce qui part au commit est ce que l'aperçu a
// montré. Les clés (`O1`, `T4`) sont synthétiques et n'ont de sens qu'à
// l'intérieur d'un lot — elles servent à relier un ticket à son objectif et à
// son parent sans qu'aucun identifiant réel n'ait à traverser le modèle.

import type { IssueEffortValue, IssuePriorityValue } from "@/lib/issue-validation";

/** Un chantier du brief : ce qui deviendra un objectif du projet. */
export interface SeedObjective {
  /** Clé synthétique du lot ("O1"). */
  key: string;
  name: string;
  /** Une ou deux phrases — la description de l'objectif créé. */
  summary: string;
}

/** Un ticket proposé. Tous les champs sont présents, quitte à être vides : ce
 *  qui manque à l'écran ne se répare pas, il se décoche. */
export interface SeedIssue {
  /** Clé synthétique du lot ("T7"). */
  key: string;
  title: string;
  /** Markdown. */
  description: string;
  /** Clé d'un `SeedObjective` du même lot, ou "" — les tickets sans chantier
   *  existent (une fondation, une tâche isolée) et se rangent ensemble. */
  objectiveKey: string;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Clé d'un autre `SeedIssue` du même lot, ou "" — un seul niveau. */
  parentKey: string;
  /** Étiquettes → catégories du projet (créées au besoin par l'import). */
  labels: string[];
}

export interface SeedProposal {
  objectives: SeedObjective[];
  issues: SeedIssue[];
}

/**
 * Plafonds — des garde-fous contre une sortie de modèle partie en vrille, pas
 * des limites de produit. Un brief raisonnable rend trois à six chantiers et
 * dix à quarante tickets (MIN-170) ; au-delà, ce n'est plus une amorce relue à
 * l'écran, c'est un import.
 */
export const MAX_SEED_OBJECTIVES = 10;
export const MAX_SEED_ISSUES = 60;
/** Étiquettes par ticket — au-delà, la catégorisation ne veut plus rien dire. */
export const MAX_SEED_LABELS = 4;
/**
 * Étiquettes DISTINCTES sur tout le lot — les plus portées gagnent
 * (`keepTopLabels`, `lib/server/seed-issues.ts`). Mesuré sur un vrai brief :
 * le modèle en rend une par sujet qu'il croise, soit treize catégories pour
 * vingt-deux tickets, dont neuf portées une seule fois. Un projet qui vient de
 * naître ne doit pas ouvrir son picker sur treize entrées.
 */
export const MAX_SEED_DISTINCT_LABELS = 6;

/**
 * Longueur du texte collé. Un brief est le RÉSUMÉ d'une réflexion menée
 * ailleurs, pas la conversation entière : quelques milliers de mots suffisent,
 * et c'est aussi ce qui garde l'appel à un prix d'amorce.
 *
 * Le plafond tient SOUS celui d'un message de chat (12 000 caractères,
 * `sanitizeAssistantMessageContent`), phrase d'encadrement comprise : depuis
 * MIN-173 le brief collé dans le wizard voyage comme premier message d'une
 * conversation avec Numo. Au-dessus, il serait tronqué en silence à l'entrée de
 * l'API — et c'est la fin du brief, celle qui dit le hors-périmètre, qui
 * disparaîtrait.
 */
export const MAX_BRIEF_CHARS = 10_000;
/** En dessous, il n'y a rien à découper — le bouton reste éteint. */
export const MIN_BRIEF_CHARS = 40;

export const EMPTY_SEED_PROPOSAL: SeedProposal = { objectives: [], issues: [] };
