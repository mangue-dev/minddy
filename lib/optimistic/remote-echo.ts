"use client";

// Adoption des lignes écrites AILLEURS.
//
// Le pont temps réel (lib/realtime-provider.tsx) recevait déjà chaque écriture
// de tous mes projets — mais il n'en faisait qu'une INVALIDATION. Le ticket que
// Numo vient de créer n'apparaissait donc pas à l'arrivée de la diffusion : il
// apparaissait au retour du refetch qu'elle déclenche, et pour `/all` ce refetch
// est `GET /api/me/board`, une route agrégée à plusieurs secondes (tous les
// tickets de tous mes projets, les membres résolus par l'API admin, la
// réconciliation des cycles). D'où le « ça met quelques secondes à apparaître »
// — et le doute : est-ce que ça a marché ?
//
// Or la diffusion PORTE la ligne. Mesuré en prod le 2026-08-05, sonde en clé
// service : les 30 colonnes de `issues`, valeurs identiques au caractère près à
// ce que rend PostgREST, reçues 231 ms après le début de l'INSERT — soit en même
// temps que la réponse HTTP de l'écriture elle-même. Il n'y a donc rien à
// attendre du serveur pour l'AFFICHER. Ce module la traduit en écriture de
// cache, exactement comme le retour d'un PATCH local (`mergeServerIssue`) : la
// ligne est là à la milliseconde, et l'invalidation qui suit ne sert plus qu'à
// réconcilier ce qu'elle ne dit pas (les catégories liées, le nombre de pièces
// jointes, les vues dérivées calculées en SQL).
//
// Ce qui NE doit pas passer par ici : l'écho de notre PROPRE écriture. Le
// trigger diffuse au commit, typiquement avant que la réponse HTTP ne revienne
// (mesuré : 4 ms avant) — réécrire la ligne d'alors par-dessus une seconde
// édition déjà partie rouvrirait la course fermée par MIN-156. L'appelant écarte
// ce cas (`issueWrites` / `objectiveWrites`.wasJustWritten).

import type { QueryClient } from "@tanstack/react-query";
import {
  findCachedIssue,
  findCachedObjective,
  insertIssueEverywhere,
  insertObjectiveEverywhere,
  issueWrites,
  objectiveWrites,
  patchIssueEverywhere,
  patchObjectiveEverywhere,
  removeIssueEverywhere,
  removeObjectiveEverywhere,
} from "./issue-writes";
import {
  removeSearchIndexIssue,
  removeSearchIndexObjective,
  upsertSearchIndexIssue,
  upsertSearchIndexObjective,
} from "../use-search-index";
import type { PendingEntry, PendingWrites } from "./pending-writes";
import type {
  Issue,
  Objective,
  SearchIndexIssue,
  SearchIndexObjective,
} from "../types";

/** Charge utile de `realtime.broadcast_changes()`, telle que le pont la reçoit. */
export interface RemoteChange {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

/** L'entité qu'un écho touche : les deux que l'app recopie dans ses caches. */
type Entity = "issue" | "objective";

/** Ce qu'un écho demande aux caches. */
export type RemoteEcho =
  /** La ligne diffusée, à compléter (si on l'a) ou à ajouter (sinon). */
  | { entity: Entity; kind: "upsert"; id: string; row: Record<string, unknown> }
  /** Corbeillée (soft delete = UPDATE `deleted_at`) ou purgée : la ligne s'en va. */
  | { entity: Entity; kind: "remove"; id: string }
  /** Un lien de catégorie posé ou retiré sur un ticket. */
  | { entity: "issue"; kind: "category"; id: string; categoryId: string; linked: boolean }
  | null;

function stringField(row: Record<string, unknown> | null, field: string): string | null {
  const value = row?.[field];
  return typeof value === "string" && value ? value : null;
}

/**
 * Une ligne diffusée pour une table à corbeille : ce qu'elle demande aux caches.
 *
 * Une suppression y est un UPDATE qui pose `deleted_at` (MIN-133) ; la purge
 * définitive, elle, est un vrai DELETE. Les deux font disparaître la ligne — la
 * RLS l'a déjà fait disparaître des lectures.
 */
function trashAwareEcho(entity: Entity, change: RemoteChange): RemoteEcho {
  const row = change.record ?? change.old_record;
  const id = stringField(row, "id");
  if (!id) return null;
  if (change.operation === "DELETE" || stringField(change.record, "deleted_at")) {
    return { entity, kind: "remove", id };
  }
  return change.record ? { entity, kind: "upsert", id, row: change.record } : null;
}

/**
 * Ce que cet écho veut dire pour les caches, ou `null` s'il ne les concerne pas.
 * Fonction PURE — c'est elle que verrouille le test.
 */
export function remoteEchoOf(change: RemoteChange): RemoteEcho {
  if (change.table === "issues") return trashAwareEcho("issue", change);
  if (change.table === "objectives") return trashAwareEcho("objective", change);
  if (change.table === "issue_categories") {
    const row = change.record ?? change.old_record;
    const id = stringField(row, "issue_id");
    const categoryId = stringField(row, "category_id");
    if (!id || !categoryId) return null;
    return {
      entity: "issue",
      kind: "category",
      id,
      categoryId,
      linked: change.operation !== "DELETE",
    };
  }
  return null;
}

/**
 * Inscrit l'écriture au registre des écritures en attente, DÉJÀ confirmée.
 *
 * Sans ça, une réponse de `/api/me/board` partie avant la diffusion et arrivée
 * après elle réécrirait le cache sans le ticket — il apparaîtrait puis
 * disparaîtrait pour quelques secondes de plus. Le contrat du registre est
 * temporel : l'entrée s'applique aux réponses parties avant cet instant, puis se
 * purge d'elle-même (30 s).
 *
 * `settle` SANS ligne serveur, volontairement : l'empreinte qu'il mémoriserait
 * sinon ferait passer une diffusion suivante pour l'écho d'une écriture à nous,
 * et lui ferait sauter l'invalidation qui réconcilie ce que la ligne ne dit pas.
 */
function remember<T extends { id: string }>(
  registry: PendingWrites<T>,
  entry: PendingEntry<T>
): void {
  registry.settle(registry.begin(entry));
}

/**
 * La ligne d'index de la palette, champ par champ.
 *
 * PAS un `...row` : l'index porte jusqu'à 4 000 lignes, il est tenu hors du
 * disque pour cette raison (lib/query-provider.tsx), et une ligne de ticket
 * complète y traînerait sa description et son plan (jusqu'à 64 Ko). La route
 * n'en sélectionne que ces colonnes — on n'en met pas d'autres.
 */
function indexIssueOf(row: Record<string, unknown>): SearchIndexIssue {
  const full = row as unknown as SearchIndexIssue;
  return {
    id: full.id,
    project_id: full.project_id,
    number: full.number,
    title: full.title,
    status: full.status,
    priority: full.priority,
    effort: full.effort,
    assignee_id: full.assignee_id,
    objective_id: full.objective_id,
    updated_at: full.updated_at,
  };
}

function indexObjectiveOf(row: Record<string, unknown>): SearchIndexObjective {
  const full = row as unknown as SearchIndexObjective;
  return {
    id: full.id,
    project_id: full.project_id,
    name: full.name,
    status: full.status,
    color: full.color,
  };
}

/** Un objectif écrit ailleurs, dans ses trois caches. */
function adoptObjective(
  queryClient: QueryClient,
  projectId: string,
  echo: Extract<RemoteEcho, { kind: "upsert" | "remove" }>
): void {
  if (echo.kind === "remove") {
    removeObjectiveEverywhere(queryClient, projectId, echo.id);
    removeSearchIndexObjective(queryClient, echo.id);
    remember(objectiveWrites, { kind: "remove", id: echo.id });
    return;
  }
  upsertSearchIndexObjective(queryClient, indexObjectiveOf(echo.row));
  const objective = echo.row as unknown as Objective;
  if (findCachedObjective(queryClient, projectId, echo.id)) {
    patchObjectiveEverywhere(queryClient, projectId, echo.id, objective);
    remember(objectiveWrites, { kind: "patch", id: echo.id, patch: objective });
    return;
  }
  insertObjectiveEverywhere(queryClient, projectId, objective);
  remember(objectiveWrites, { kind: "insert", row: objective });
}

/**
 * Écrit dans les caches la ligne qu'un autre client (Numo, le MCP, un
 * coéquipier) vient d'écrire en base, sans attendre le moindre aller-retour.
 *
 * `projectId` vient du TOPIC, pas de la ligne : c'est le même projet, et les
 * lignes de liaison (`issue_categories`) ne le portent pas.
 */
export function adoptRemoteRow(
  queryClient: QueryClient,
  projectId: string,
  echo: RemoteEcho
): void {
  if (!echo) return;
  if (echo.entity === "objective") {
    adoptObjective(queryClient, projectId, echo);
    return;
  }

  switch (echo.kind) {
    case "remove": {
      removeIssueEverywhere(queryClient, projectId, echo.id);
      removeSearchIndexIssue(queryClient, echo.id);
      remember(issueWrites, { kind: "remove", id: echo.id });
      return;
    }
    case "upsert": {
      const cached = findCachedIssue(queryClient, projectId, echo.id);
      // L'index de la palette, dans les deux cas : `patchIssueEverywhere` ne sait
      // que patcher une ligne DÉJÀ indexée, et un ticket qui vient de naître n'y
      // est par définition pas.
      upsertSearchIndexIssue(queryClient, indexIssueOf(echo.row));
      if (cached) {
        // La ligne diffusée ne porte PAS `category_ids` (ni `attachment_count`) :
        // ce sont des agrégats que la route calcule. Ne pas les citer dans le
        // patch, c'est justement les préserver.
        const patch = echo.row as Partial<Issue>;
        patchIssueEverywhere(queryClient, projectId, echo.id, patch);
        remember(issueWrites, { kind: "patch", id: echo.id, patch });
        return;
      }
      // Première fois qu'on voit ce ticket : ses liens de catégorie arriveront
      // par leurs propres diffusions, et le refetch les portera de toute façon.
      const issue = { category_ids: [], ...echo.row } as unknown as Issue;
      insertIssueEverywhere(queryClient, projectId, issue);
      remember(issueWrites, { kind: "insert", row: issue });
      return;
    }
    case "category": {
      const cached = findCachedIssue(queryClient, projectId, echo.id);
      if (!cached) return; // rien à patcher : la ligne du ticket suit ou suivra
      const current = cached.category_ids ?? [];
      const next = echo.linked
        ? current.includes(echo.categoryId)
          ? current
          : [...current, echo.categoryId]
        : current.filter((id) => id !== echo.categoryId);
      if (next === current) return;
      const patch = { category_ids: next };
      patchIssueEverywhere(queryClient, projectId, echo.id, patch);
      remember(issueWrites, { kind: "patch", id: echo.id, patch });
    }
  }
}
