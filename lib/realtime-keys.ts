import type { QueryKey } from "@tanstack/react-query";

import { GLOBAL_BOARD_KEY, issueWrites, objectiveWrites } from "./optimistic/issue-writes";

/**
 * CE QU'UN ÉVÉNEMENT DIFFUSÉ RAFRAÎCHIT — la table d'aiguillage du pont temps
 * réel (lib/realtime-provider.tsx).
 *
 * Séparée du provider, et pure, pour la même raison que lib/realtime-topics.ts
 * et lib/realtime-catch-up.ts : vitest tourne en node nu — pas de React, pas de
 * `next/navigation` — et c'est ICI que se joue la seule chose qu'un type-check
 * ne peut pas voir. Une table qui diffuse sans avoir de `case` ne lève rien, ne
 * journalise rien : elle rend simplement l'écran muet devant les écritures des
 * autres clients, et personne ne s'en aperçoit avant d'ouvrir deux fenêtres
 * côte à côte. C'est exactement ce qui est arrivé à `pages` (MIN-346) — la
 * table est née avec MIN-266, ses quatre satellites ont câblé leur diffusion
 * (activité, rétroliens, commentaires), et la table elle-même est restée sans.
 *
 * D'où le test qui accompagne ce module : il énumère les tables diffusées par
 * les triggers de `supabase/migrations` et exige qu'aucune n'arrive ici sans
 * réponse.
 */

/** Payload emitted by realtime.broadcast_changes(). */
export interface BroadcastChange {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

export type RefetchMode = "active" | "none";

/** A cache to invalidate, and whether a mounted observer should refetch it. */
export interface Invalidation {
  key: QueryKey;
  refetch: RefetchMode;
}

// Caches that aggregate several projects. A project event has to reach them too
// or /home, /all, /statistics and the palette stay stale (MIN-89). Kept as
// literals like every other key in this file; the owning modules are named.
// (GLOBAL_BOARD_KEY vient de lib/optimistic/issue-writes.ts — c'est le module
// qui sait aussi si l'événement est l'écho de notre propre écriture.)
const HOME_SUMMARY_KEY: QueryKey = ["me", "summary"]; // lib/use-home-summary-query.ts
const SEARCH_INDEX_KEY: QueryKey = ["me", "search-index"]; // lib/use-search-index.ts
// Smart Assign mal réglé : la sidebar en porte la marque sur toutes les pages.
const SMART_ASSIGN_WARNINGS_KEY: QueryKey = ["me", "smart-assign-warnings"]; // lib/use-smart-assign-warnings-query.ts
// Ce qui attend d'être trié par projet : le chiffre des lignes de projet de la
// sidebar, lu lui aussi sur toutes les pages. lib/use-triage-counts-query.ts.
const TRIAGE_COUNTS_KEY: QueryKey = ["me", "triage-counts"];
const STATS_KEY: QueryKey = ["stats"]; // lib/use-stats-query.ts — ["stats", tz]
// Listes GLOBALES de l'agent de code : la barre latérale les lit sur toutes les
// pages, un run de n'importe quel projet les bouge. lib/use-agent-runs.ts.
const ALL_AGENT_SESSIONS_KEY: QueryKey = ["agent-sessions", "all"];
const ALL_PULL_REQUESTS_KEY: QueryKey = ["pull-requests", "all"];

/**
 * Vues DÉRIVÉES d'un ticket : leur appartenance aux listes est calculée en SQL,
 * donc rien ne les patche localement — elles doivent être rafraîchies même sur
 * l'écho de notre propre écriture (MIN-156). Le palier de la palette est marqué
 * périmé mais PAS rafraîchi : c'est un instantané de 4 000 lignes chargé une
 * fois par onglet, qui se revalide déjà à l'ouverture quand il est périmé
 * (lib/use-search-index.ts). Les autres ne repartent au serveur que si elles
 * sont montées — `invalidateQueries` laisse périmées les requêtes sans
 * observateur, sans requête.
 */
const ISSUE_DERIVED_KEYS: Invalidation[] = [
  { key: HOME_SUMMARY_KEY, refetch: "active" },
  { key: STATS_KEY, refetch: "active" },
  { key: TRIAGE_COUNTS_KEY, refetch: "active" },
  { key: SEARCH_INDEX_KEY, refetch: "none" },
];

/** Tout ce qu'un changement de ticket bouge, board agrégé compris. */
const ISSUE_AGGREGATE_KEYS: Invalidation[] = [
  { key: GLOBAL_BOARD_KEY, refetch: "active" },
  ...ISSUE_DERIVED_KEYS,
];

const active = (key: QueryKey): Invalidation => ({ key, refetch: "active" });

function issueIdOf(change: BroadcastChange): string | null {
  const issueId = (change.record ?? change.old_record)?.issue_id;
  return typeof issueId === "string" ? issueId : null;
}

/** La ROUTINE d'un run diffusé (MIN-185), quand il en porte une. */
function routineIdOf(change: BroadcastChange): string | null {
  const routineId = (change.record ?? change.old_record)?.routine_id;
  return typeof routineId === "string" ? routineId : null;
}

function objectiveIdOf(change: BroadcastChange): string | null {
  const objectiveId = (change.record ?? change.old_record)?.objective_id;
  return typeof objectiveId === "string" ? objectiveId : null;
}

function feedbackPostIdOf(change: BroadcastChange): string | null {
  const postId = (change.record ?? change.old_record)?.feedback_post_id;
  return typeof postId === "string" ? postId : null;
}

/** La PAGE d'une ligne d'activité (MIN-278) — le quatrième parent d'un event. */
function pageIdOf(change: BroadcastChange): string | null {
  const pageId = (change.record ?? change.old_record)?.page_id;
  return typeof pageId === "string" ? pageId : null;
}

/**
 * Runs de l'agent de code : le spinner « Numo travaille » de la barre latérale,
 * la liste de la page Agents et le compteur de PR. Ces caches ne POLLENT que si
 * une session travaille DÉJÀ — sans cet événement, un run lancé hors du composer
 * (assistant Numo, @numo, autre onglet) n'apparaissait qu'au rechargement.
 *
 * DEUX TOPICS depuis MIN-332, et c'est la visibilité du run qui tranche : une
 * conversation PERSONNELLE arrive sur `user:{id}` (son créateur, seul abonné),
 * un run du PROJET — routine, automatisation, relecture de PR — sur
 * `project:{id}`. Les caches à rafraîchir, eux, sont les mêmes des deux côtés :
 * d'où cette fonction, appelée par les deux aiguilleurs.
 *
 * Le trigger ne diffuse que les transitions visibles, et ne pousse plus que
 * l'id, le ticket, la routine et le statut (voir la migration).
 */
function keysForAgentRun(change: BroadcastChange): Invalidation[] {
  const issueId = issueIdOf(change);
  const routineId = routineIdOf(change);
  // Un passage de ROUTINE (MIN-185) n'est pas une conversation : il sort de la
  // liste des sessions (`.is("routine_id", null)` côté route), donc l'invalider
  // ne rafraîchirait rien — c'est la liste des EXÉCUTIONS de sa routine qui doit
  // bouger, et la liste des routines elle-même (son `last_run_at` et son alerte
  // viennent de changer).
  if (routineId) {
    return [active(["routines", routineId, "runs"]), active(["routines"])];
  }
  return [
    active(ALL_AGENT_SESSIONS_KEY),
    active(ALL_PULL_REQUESTS_KEY),
    ...(issueId ? [active(["agent-runs", "issue", issueId])] : []),
  ];
}

export function keysForUserEvent(change: BroadcastChange): Invalidation[] {
  switch (change.table) {
    case "notifications":
      return [active(["notifications"])];
    // Mes conversations avec Numo (MIN-332) : elles n'existent plus que pour moi,
    // donc leur écho passe par MON topic et non par celui du projet.
    case "agent_runs":
      return keysForAgentRun(change);
    // Ces deux tables sont exactement ce dont dépend l'avertissement Smart
    // Assign (réglage du projet, liste des membres) : la marque de la sidebar
    // et la bannière de l'accueil s'effacent donc dès que les règles sont
    // enregistrées, sans attendre une navigation.
    // Un projet qui part à la corbeille (ou qui en revient) change aussi le
    // PÉRIMÈTRE des chiffres de la sidebar : sans ça, la ligne disparaissait de
    // la liste — ["projects"] se rafraîchit — mais sa part du badge « Accueil »
    // restait, faute d'avoir redemandé la table.
    case "projects":
      return [
        active(["projects"]),
        active(SMART_ASSIGN_WARNINGS_KEY),
        active(TRIAGE_COUNTS_KEY),
      ];
    // Mon adhésion à moi a changé (rejoint / retiré) : ce n'est pas seulement
    // une ligne de plus ou de moins dans la barre latérale, c'est le PÉRIMÈTRE
    // de tous mes agrégats — le board cross-projet, le tableau de bord et
    // l'index de la palette portent encore les tickets d'un projet auquel je
    // n'ai plus accès (ou pas encore les siens).
    case "project_members":
      return [
        active(["projects"]),
        active(SMART_ASSIGN_WARNINGS_KEY),
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        active(TRIAGE_COUNTS_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "project_invitations":
      return [active(["my-invitations"]), active(["projects"])];
    case "views": // global (project-less) views broadcast on the user topic
      return [active(["views", "global"])];
    case "cycles": // my cycle timeline moved (fill, capture, rollover — MIN-32)
      return [
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        active(["me", "cycle"]),
      ];
    case "user_scratchpad": // agent (MCP) or another tab edited my notes
      return [active(["me", "scratchpad"])];
    case "ai_usage": // une action IA vient d'être comptée → jauge du header (MIN-72)
      return [active(["billing", "usage"])];
    case "billing_accounts": // sync Stripe / override admin → plan effectif
      return [active(["billing", "status"]), active(["billing", "usage"])];
    default:
      return [];
  }
}

/**
 * Cet écho est-il celui d'une écriture qu'on vient de faire (MIN-156) ?
 *
 * Il décide de DEUX choses, qui vont ensemble : ne pas rafraîchir des caches qui
 * portent déjà la ligne serveur, et ne pas y réécrire la ligne diffusée
 * par-dessus une édition suivante déjà partie (adoptRemoteRow). Les événements
 * des autres clients — Numo, le MCP, un coéquipier — ne matchent aucune écriture
 * locale et passent donc par les deux chemins.
 */
export function isOwnEcho(change: BroadcastChange): boolean {
  const id = (change.record ?? change.old_record)?.id;
  switch (change.table) {
    case "issues":
      return issueWrites.wasJustWritten(id, change.record);
    // La ligne du TICKET : c'est `issue_id` sur la table de liaison.
    case "issue_categories":
      return issueWrites.wasJustWritten(issueIdOf(change), change.record);
    case "objectives":
      return objectiveWrites.wasJustWritten(id, change.record);
    default:
      return false;
  }
}

export function keysForProjectEvent(
  change: BroadcastChange,
  projectId: string
): Invalidation[] {
  switch (change.table) {
    // Issue-shaped changes also move every cross-project aggregate: the
    // dashboard counters, the /all board, the statistics page and the palette
    // index all derive from issues (MIN-89). Plan progress on the cards and in
    // the side panel rides the same ["issues", projectId] cache.
    case "issues":
    case "issue_categories": // issues are cached hydrated with category_ids
      // L'écho de NOTRE propre écriture (MIN-156) : les deux caches de tickets
      // portent déjà la ligne serveur, fusionnée au retour du PATCH. Les
      // rafraîchir ne pourrait rien apprendre — mais ouvrirait la fenêtre de
      // course qu'on vient de fermer. Les événements des autres clients (Numo,
      // MCP, coéquipiers) ne matchent aucune écriture locale et passent donc
      // inchangés, comme les vues dérivées qu'on ne patche pas.
      return isOwnEcho(change)
        ? ISSUE_DERIVED_KEYS
        : [active(["issues", projectId]), ...ISSUE_AGGREGATE_KEYS];
    case "issue_relations":
      return [active(["issue-relations", projectId]), active(GLOBAL_BOARD_KEY)];
    // Un objectif est recopié dans DEUX caches : celui de son projet et la
    // tranche `objectives` du board cross-projet (puces des cartes, facette
    // « Objectif », sélecteur du panneau d'un ticket). L'écho de notre propre
    // écriture n'a rien à leur apprendre — les deux portent déjà la ligne
    // serveur (MIN-156) ; celui d'un autre client (coéquipier, Numo, MCP), ou
    // d'une création / suppression, doit atteindre les deux, sans quoi `/all`
    // gardait un objectif renommé sous son ancien nom.
    case "objectives":
      return isOwnEcho(change)
        ? [{ key: SEARCH_INDEX_KEY, refetch: "none" }]
        : [
            active(["objectives", projectId]),
            active(GLOBAL_BOARD_KEY),
            { key: SEARCH_INDEX_KEY, refetch: "none" },
          ];
    // Les PAGES du projet — le wiki (MIN-266), muet jusqu'à MIN-346.
    //
    // Le cache est UNIQUE et il est PLAT : `["pages", projectId]` porte toutes
    // les pages vivantes du projet, sans leur corps (lib/use-pages-query.ts).
    // C'est lui que lisent l'arbre de la barre secondaire, le fil d'Ariane, le
    // bloc sous-page et la palette — donc une seule invalidation les remet tous
    // d'aplomb, création, renommage, déplacement, épinglage et corbeille
    // compris.
    //
    // Pas d'écriture directe de la ligne diffusée (`adoptRemoteRow`) comme pour
    // un ticket : la liste est un ARBRE trié par `position` au sein d'une
    // fratrie, et y insérer une ligne à la main referait ici le travail que
    // `buildPageTree` fait déjà — pour gagner le temps d'un GET sur une seule
    // requête indexée, sans corps. Le rapport n'est pas le même que pour
    // `/api/me/board`, qui est ce qui justifiait l'adoption côté tickets.
    //
    // Le trigger ne diffuse QUE les colonnes visibles (voir la migration) : une
    // frappe dans le document ne passe pas par ici, elle ne bougerait rien dans
    // cette liste qui n'a pas les corps.
    case "pages":
      return [
        active(["pages", projectId]),
        // Le titre d'une page est dans l'index de la palette
        // (app/api/me/search-index/route.ts) : périmé, pas rechargé — c'est un
        // instantané qui se revalide de lui-même à l'ouverture.
        { key: SEARCH_INDEX_KEY, refetch: "none" },
        // Mise à la corbeille et restauration passent par un `deleted_at` sur
        // cette même table : /trash doit bouger chez qui la regarde
        // (lib/use-trash-query.ts). « active » ne coûte une requête que si la
        // corbeille est ouverte à cet instant.
        active(["me", "trash"]),
      ];
    case "categories": // renames/deletes also affect chips on cached issues
      return [
        active(["categories", projectId]),
        active(["issues", projectId]),
        // Une catégorie est recopiée dans le board cross-projet, comme un
        // objectif : sans ça, celle qu'un coéquipier (ou Numo, ou l'ajout
        // rapide d'un autre onglet) vient de créer n'existait pas sur `/all`.
        active(GLOBAL_BOARD_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "views":
      return [active(["views", projectId])];
    // Une adhésion qui change ne bouge pas que l'onglet Membres : la liste des
    // membres est RECOPIÉE dans deux caches agrégés — la carte `members` du
    // board cross-projet (filtre et sélecteur d'assigné, panneau d'un ticket,
    // personnes mentionnables de Numo — lib/use-numo-mentionables.ts) et l'index
    // de la palette. Sans les invalider ici, quelqu'un qui vient d'être retiré
    // restait proposé partout ailleurs jusqu'au prochain montage périmé, cinq
    // minutes plus tard — et un rechargement n'y changeait rien, le cache étant
    // réhydraté depuis le disque (lib/query-provider.tsx).
    case "project_members":
      return [
        active(["members", projectId]),
        active(GLOBAL_BOARD_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
        // L'équipe change de taille → l'avertissement Smart Assign aussi.
        active(SMART_ASSIGN_WARNINGS_KEY),
      ];
    // Une invitation en attente n'est encore membre de rien : seule la vue
    // Membres, qui liste les deux, la montre.
    case "project_invitations":
      return [active(["members", projectId])];
    // Feedback (MIN-89): the team board, the open-feedback badge in the sidebar
    // and the home section all move when a post is created, voted or triaged.
    // The dashboard summary is in that list since MIN-104 — the home "to triage"
    // section reads its undecided posts from ["me","summary"], which until then
    // only moved on issue and cycle events.
    case "feedback_posts":
    case "feedback_votes":
    case "feedback_post_categories":
      return [
        active(["feedback", projectId]),
        active(["feedback-detail", projectId]),
        active(["feedback-count", projectId]),
        active(HOME_SUMMARY_KEY),
        // Le chiffre des lignes de projet de la sidebar compte les retours
        // ouverts avec les tickets en triage : un retour publié, promu ou
        // fusionné le bouge, exactement comme le badge de l'onglet Feedback.
        active(TRIAGE_COUNTS_KEY),
      ];
    case "comments": {
      // A comment hangs off an issue OR an objective OR a feedback post — route
      // to the right cache. Feedback comment keys carry the project id.
      const issueId = issueIdOf(change);
      if (issueId) return [active(["comments", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-comments", objectiveId])];
      const postId = feedbackPostIdOf(change);
      return postId ? [active(["feedback-comments", projectId, postId])] : [];
    }
    case "attachments": {
      // The table keeps its name; the NOTION is a resource (MIN-184). Those on
      // comments ride the comments cache; entity-level ones have their own query.
      //
      // Une ressource de genre `page` (MIN-275) est en plus l'une des deux
      // moitiés d'un rétrolien : l'attacher ou la retirer change le « Cité par »
      // de la page visée, chez qui la lit en ce moment (MIN-279). Elle S'AJOUTE
      // aux branches ci-dessous et n'en est pas une : une ressource pend
      // toujours à un ticket, à un objectif ou à un retour
      // (`attachments_parent_ck`), donc une branche placée après elles ne serait
      // jamais atteinte.
      const backlinks = pageIdOf(change);
      const cited: Invalidation[] = backlinks
        ? [active(["page-backlinks", backlinks])]
        : [];
      const issueId = issueIdOf(change);
      if (issueId) {
        return [
          active(["comments", issueId]),
          active(["issue-resources", issueId]),
          ...cited,
        ];
      }
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) {
        return [
          active(["objective-comments", objectiveId]),
          active(["objective-resources", objectiveId]),
          ...cited,
        ];
      }
      const postId = feedbackPostIdOf(change);
      if (postId) {
        return [active(["feedback-comments", projectId, postId]), ...cited];
      }
      return cited;
    }
    // Le fil d'une PAGE (MIN-282). La table porte son `page_id` en clair, donc
    // rien à aller chercher : le commentaire d'un coéquipier apparaît sous le
    // document sans rechargement, et le liseré de son bloc avec lui.
    case "page_comments": {
      const pageId = pageIdOf(change);
      return pageId ? [active(["page-comments", pageId])] : [];
    }
    // L'autre moitié du rétrolien : la table DÉRIVÉE des mentions (MIN-279).
    // Elle est réécrite après la réponse, donc l'écho arrive un instant après
    // l'écriture du ticket qui cite — c'est exactement ce que le pont sert à
    // rattraper, et c'est ce qui fait apparaître la ligne sans rechargement.
    case "page_links": {
      const record = change.record ?? change.old_record;
      const pageId = typeof record?.page_id === "string" ? record.page_id : null;
      return pageId ? [active(["page-backlinks", pageId])] : [];
    }
    // Runs de l'agent de code — ceux du PROJET (routine, automatisation,
    // relecture de PR). Les conversations personnelles arrivent, elles, sur le
    // topic utilisateur : même traitement, autre porte (MIN-332).
    case "agent_runs":
      return keysForAgentRun(change);
    // Chaînes d'automatisation (MIN-147). C'est la seule surface du produit où
    // la péremption est CERTAINE : une chaîne avance toute seule pendant
    // plusieurs minutes, sans que personne ne touche à rien — sans cet
    // événement, sa barre d'état est fausse dès la seconde qui suit son
    // ouverture. Le trigger ne diffuse que les transitions visibles (statut,
    // étape, dépense, motif d'arrêt — voir la migration).
    case "agent_chains": {
      const issueId = issueIdOf(change);
      return issueId
        ? [active(["agent-chain", "issue", issueId]), active(["agent-runs", "issue", issueId])]
        : [];
    }
    // Pull requests (MIN-161). Le trigger ne diffuse que les colonnes VISIBLES
    // (état, titre, url, tête, ticket, fusion — voir la migration) : un balayage
    // qui retamponne `synced_at` sur tout un dépôt reste muet.
    //
    // Trois caches, et ce ne sont pas les mêmes lecteurs : la LISTE (page Pull
    // Requests, compteur de la barre latérale), l'EN-TÊTE d'un panneau dont la
    // PR n'est pas celle que ce lecteur regarde — le topic `pull-request:{id}`
    // ne l'atteint pas, il n'y est pas abonné —, et le panneau du TICKET, qui
    // lit sa PR et son état dans `["agent-runs","issue",id]`
    // (`useIssueAgentRunsQuery`).
    case "pull_requests": {
      const record = change.record ?? change.old_record;
      const prId = typeof record?.id === "string" ? record.id : null;
      const issueId = issueIdOf(change);
      return [
        active(ALL_PULL_REQUESTS_KEY),
        ...(prId ? [active(["pull-request", prId])] : []),
        ...(issueId ? [active(["agent-runs", "issue", issueId])] : []),
      ];
    }
    case "issue_events": {
      const issueId = issueIdOf(change);
      if (issueId) return [active(["events", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-events", objectiveId])];
      const postId = feedbackPostIdOf(change);
      if (postId) return [active(["feedback-events", projectId, postId])];
      // L'activité d'une PAGE (MIN-278) : le panneau ouvert chez un coéquipier
      // doit voir arriver « X a modifié la page » sans qu'il le referme.
      const pageId = pageIdOf(change);
      return pageId ? [active(["page-events", pageId])] : [];
    }
    default:
      return [];
  }
}

// Everything a scope can feed, for the catch-up refetch after a dropped
// connection (events missed while offline). Prefix keys: ["comments"] matches
// every ["comments", issueId] query.
export const USER_SCOPE_KEYS: QueryKey[] = [
  ["notifications"],
  ["projects"],
  ["my-invitations"],
  ["views", "global"],
  ["me", "board"],
  ["me", "cycle"],
  ["me", "scratchpad"],
  ["me", "triage-counts"],
  ["billing"],
  // Mes conversations avec Numo (MIN-332) : leur écho ne passe plus par le topic
  // du projet, donc leur rattrapage après coupure ne peut plus passer par le
  // sien non plus. En préfixe, comme côté projet — `["agent-runs"]` couvre
  // `["agent-runs","issue",id]`.
  ["agent-runs"],
  ALL_AGENT_SESSIONS_KEY,
  ALL_PULL_REQUESTS_KEY,
];

export const projectScopeKeys = (projectId: string): QueryKey[] => [
  ["issues", projectId],
  ["issue-relations", projectId],
  ["objectives", projectId],
  ["categories", projectId],
  ["views", projectId],
  ["members", projectId],
  ["comments"],
  ["events"],
  ["issue-resources"],
  ["objective-comments"],
  ["objective-events"],
  ["objective-resources"],
  ["feedback", projectId],
  ["feedback-detail", projectId],
  ["feedback-count", projectId],
  ["feedback-comments", projectId],
  ["feedback-events", projectId],
  ["agent-runs"],
  // La chaîne d'automatisation d'un ticket (MIN-147) : en préfixe, comme les
  // runs — un onglet qui a dormi pendant qu'une chaîne se déroulait doit
  // retrouver son étape réelle, pas celle d'avant la coupure.
  ["agent-chain"],
  // Le panneau d'une PR, ses quatre surfaces (MIN-161). En préfixe, et les
  // quatre : les messages du topic `pull-request:{id}` sont ÉPHÉMÈRES — un
  // onglet dormant ne les rejoue pas, il ne les a simplement pas eus. C'est donc
  // ce rattrapage-ci qui remet le fil, les commits et les remarques à jour au
  // retour au premier plan, et rien d'autre. Seules les requêtes MONTÉES
  // repartent au serveur (cf. `catchUp`), soit un panneau au plus.
  ["pull-request"],
  ["pr-comments"],
  ["pr-commits"],
  ["pr-review-comments"],
  // L'ARBRE des pages (MIN-266). Il est persisté sur le disque
  // (lib/query-provider.tsx) et son `staleTime` est de cinq minutes : une
  // fenêtre restée ouverte sur l'onglet Pages pendant une coupure ne redemande
  // RIEN d'elle-même. C'est ce rattrapage qui remet l'arbre en phase.
  ["pages", projectId],
  // L'activité d'une page (MIN-278), en préfixe comme les événements de ticket :
  // un panneau resté ouvert pendant une coupure doit rattraper les gestes qu'il
  // n'a pas vus passer.
  ["page-events"],
  // Les rétroliens d'une page (MIN-279), en préfixe pour la même raison : ils
  // naissent d'écritures faites AILLEURS, donc d'événements qu'un onglet
  // endormi n'a pas reçus.
  ["page-backlinks"],
  // Le fil d'une page (MIN-282), en préfixe comme les commentaires de ticket :
  // une page laissée ouverte pendant une coupure doit retrouver les objections
  // écrites entre-temps, pas celles d'avant.
  ["page-comments"],
  // The aggregates this project feeds — missed events while offline would
  // otherwise leave the dashboard and /all stale until their staleTime.
  GLOBAL_BOARD_KEY,
  HOME_SUMMARY_KEY,
  STATS_KEY,
  TRIAGE_COUNTS_KEY,
  ALL_AGENT_SESSIONS_KEY,
  ALL_PULL_REQUESTS_KEY,
];
