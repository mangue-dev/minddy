import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { insertEvents, stampForgeSync, type EventRow } from "@/lib/server/issue-events";
import { normalizeToken } from "@/lib/import/normalize";
import type { ImportedIssue, ImportSource } from "@/lib/import/types";

/**
 * Bulk-insert core of the CSV importers (MIN-45). Deliberately NOT a loop over
 * createIssueForProject: an import must not fire per-issue side effects (stats
 * ledger, Smart Assign, webhooks, sub_issue_added events) nor pay N sequential
 * round-trips. Issues get one `imported` timeline event instead of `created` —
 * a type the webhook dispatcher doesn't map, so nothing is delivered outside.
 *
 * TENIR À 1 000 TICKETS ET AU-DELÀ tient à deux choix, et il faut les garder :
 *
 *  1. Les identifiants sont tirés ICI (`randomUUID`), pas rendus par la base.
 *     Du coup un ticket connaît l'id de son parent AVANT d'être inséré : plus
 *     de seconde passe de liens (c'était un UPDATE par sous-ticket), plus de
 *     table numéro → id à reconstruire. Les catégories et les événements se
 *     construisent dans la même foulée.
 *  2. Les numéros sont réservés en UN appel (`next_issue_numbers`), pas un par
 *     ticket. C'était le poste dominant : 1 000 tickets = 1 000 RPC.
 *
 * Un import de 1 000 tickets tient désormais en une douzaine d'allers-retours,
 * tous par lots, au lieu d'un bon millier.
 *
 * Callers MUST have verified the actor's access beforehand (writes bypass RLS).
 *
 * Not transactional: a failure mid-way leaves the already-inserted chunks in
 * place (visible, deletable) and unused reserved numbers become plain gaps in
 * the CLÉ numbering — both harmless, so no compensation logic.
 */

export interface ImportOutcome {
  created: number;
  categoriesCreated: number;
  subIssuesLinked: number;
  /** Tickets rendus à un membre du projet — ce que le rapprochement a sauvé. */
  assigned: number;
}

export type ImportCommitResult =
  | { ok: true; result: ImportOutcome }
  | { ok: false; status: number; errorKey: "databaseError" };

const dbError = (step: string, message: string): ImportCommitResult => {
  console.error(`[import-issues] ${step} failed:`, message);
  return { ok: false, status: 500, errorKey: "databaseError" };
};

/** Lignes par INSERT. Au-delà, la requête devient lourde à sérialiser sans
 *  gagner de temps réseau. */
const INSERT_CHUNK = 200;
/** Lignes par INSERT pour les tables de jointure, plus étroites. */
const LINK_CHUNK = 1000;

export async function importIssuesIntoProject({
  projectId,
  actorId,
  issues,
  source,
}: {
  projectId: string;
  actorId: string;
  issues: ImportedIssue[];
  source: ImportSource;
}): Promise<ImportCommitResult> {
  const service = getServiceClient();
  if (issues.length === 0) {
    return {
      ok: true,
      result: { created: 0, categoriesCreated: 0, subIssuesLinked: 0, assigned: 0 },
    };
  }

  // ── Categories: match existing labels case-insensitively, create the rest ──
  // Le rapprochement fin (« Bugs » → la catégorie « Bug » du projet) a déjà eu
  // lieu au mapping : ce qui arrive ici est le nom VOULU. Il ne reste que
  // l'égalité, et la création de ce qui manque.
  const labelByKey = new Map<string, string>(); // lower name → first casing seen
  for (const issue of issues) {
    for (const label of issue.labels) {
      const key = label.toLowerCase();
      if (!labelByKey.has(key)) labelByKey.set(key, label);
    }
  }

  const categoryIdByKey = new Map<string, string>();
  let categoriesCreated = 0;
  if (labelByKey.size > 0) {
    const { data: existing, error } = await service
      .from("categories")
      .select("id, name")
      .eq("project_id", projectId);
    if (error) return dbError("categories fetch", error.message);
    for (const cat of existing ?? []) {
      categoryIdByKey.set((cat.name as string).toLowerCase(), cat.id as string);
    }

    const missing = [...labelByKey].filter(([key]) => !categoryIdByKey.has(key));
    if (missing.length > 0) {
      // Continue the palette round-robin where the project's list left off.
      const offset = (existing ?? []).length;
      const { data: created, error: createError } = await service
        .from("categories")
        .insert(
          missing.map(([, name], i) => ({
            project_id: projectId,
            name,
            color: CATEGORY_COLORS[(offset + i) % CATEGORY_COLORS.length],
          }))
        )
        .select("id, name");
      if (createError) return dbError("categories create", createError.message);
      for (const cat of created ?? []) {
        categoryIdByKey.set((cat.name as string).toLowerCase(), cat.id as string);
      }
      categoriesCreated = created?.length ?? 0;
    }
  }

  // ── Numbers: one RPC reserves the whole range, atomically. ──
  const { data: firstNumber, error: numberError } = await service.rpc(
    "next_issue_numbers",
    { p_project_id: projectId, p_count: issues.length }
  );
  if (numberError || typeof firstNumber !== "number") {
    return dbError("number reservation", numberError?.message ?? "no number");
  }

  // ── Identity first: ids are ours, so every link is known before insert. ──
  const ids = issues.map(() => randomUUID());
  const idByExternalKey = new Map<string, string>();
  issues.forEach((issue, i) => {
    for (const key of issue.externalKeys) idByExternalKey.set(normalizeToken(key), ids[i]);
  });

  const positionBase = Date.now();
  let subIssuesLinked = 0;
  let assigned = 0;

  const rows = issues.map((issue, i) => {
    // Les liens ont été validés contre le lot au parsing (parent présent, un
    // seul niveau) : il ne reste qu'à résoudre la clé en identifiant.
    const parentId = issue.parentExternalKey
      ? (idByExternalKey.get(normalizeToken(issue.parentExternalKey)) ?? null)
      : null;
    if (parentId && parentId !== ids[i]) subIssuesLinked += 1;
    if (issue.assigneeId) assigned += 1;

    const row: Record<string, unknown> = {
      id: ids[i],
      project_id: projectId,
      number: firstNumber + i,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      // L'appelant a vérifié que l'assigné est un membre du projet
      // (`sanitizeMapping`) : la colonne porte une FK vers auth.users.
      assignee_id: issue.assigneeId,
      due_date: issue.dueDate,
      // L'objectif est un id réel, créé et validé par l'appelant (amorce par
      // brief, MIN-172) : rien à résoudre ici.
      objective_id: issue.objectiveId ?? null,
      parent_id: parentId && parentId !== ids[i] ? parentId : null,
      created_by: actorId,
      position: positionBase + i,
    };
    if (issue.createdAt) row.created_at = issue.createdAt;
    // Backfill d'un dépôt lié (MIN-97) : l'identité distante voyage avec la
    // ligne, l'index UNIQUE partiel garantit qu'on ne l'importe qu'une fois.
    if (issue.remote) {
      row.remote_provider = issue.remote.provider;
      row.remote_repo_id = issue.remote.repoId;
      row.remote_number = issue.remote.number;
      row.remote_url = issue.remote.url;
    }
    if (issue.status === "done") {
      row.completed_at =
        issue.completedAt ?? issue.createdAt ?? new Date().toISOString();
    }
    return row;
  });

  // Les parents d'abord : un enfant inséré avant son parent violerait la FK
  // `parent_id`, et l'ordre du fichier ne garantit rien.
  const order = rows
    .map((_, i) => i)
    .sort((a, b) => Number(rows[a].parent_id != null) - Number(rows[b].parent_id != null));
  const ordered = order.map((i) => rows[i]);

  for (let i = 0; i < ordered.length; i += INSERT_CHUNK) {
    const { error } = await service.from("issues").insert(ordered.slice(i, i + INSERT_CHUNK));
    if (error) return dbError("issues insert", error.message);
  }

  // ── Categories on issues (best-effort: the issues exist from here on) ──
  const categoryRows: { issue_id: string; category_id: string }[] = [];
  issues.forEach((issue, i) => {
    const seen = new Set<string>();
    for (const label of issue.labels) {
      const categoryId = categoryIdByKey.get(label.toLowerCase());
      if (categoryId && !seen.has(categoryId)) {
        seen.add(categoryId);
        categoryRows.push({ issue_id: ids[i], category_id: categoryId });
      }
    }
  });
  for (let i = 0; i < categoryRows.length; i += LINK_CHUNK) {
    const { error } = await service
      .from("issue_categories")
      .insert(categoryRows.slice(i, i + LINK_CHUNK));
    if (error) console.error("[import-issues] categories attach failed:", error.message);
  }

  // ── Timeline: one `imported` event per issue (to_value = source) ──
  // Backfill d'un dépôt lié (MIN-97) : l'événement est estampillé forge pour que
  // la timeline crédite GitHub/GitLab, pas le owner qui a activé la synchro.
  const forge = source === "github" || source === "gitlab" ? source : null;
  const events: EventRow[] = ids.map((id) => ({
    issue_id: id,
    actor_id: actorId,
    type: "imported",
    to_value: source,
  }));
  for (let i = 0; i < events.length; i += LINK_CHUNK) {
    await insertEvents(service, stampForgeSync(events.slice(i, i + LINK_CHUNK), forge));
  }

  return {
    ok: true,
    result: { created: ids.length, categoriesCreated, subIssuesLinked, assigned },
  };
}
