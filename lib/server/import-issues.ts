import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { insertEvents, type EventRow } from "@/lib/server/issue-events";
import { normalizeToken } from "@/lib/import/normalize";
import type { ImportedIssue, ImportSource } from "@/lib/import/types";

/**
 * Bulk-insert core of the CSV importers (MIN-45). Deliberately NOT a loop over
 * createIssueForProject: an import must not fire per-issue side effects (stats
 * ledger, Smart Assign, webhooks, sub_issue_added events) nor pay N sequential
 * round-trips. Issues get one `imported` timeline event instead of `created` —
 * a type the webhook dispatcher doesn't map, so nothing is delivered outside.
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
}

export type ImportCommitResult =
  | { ok: true; result: ImportOutcome }
  | { ok: false; status: number; errorKey: "databaseError" };

const dbError = (step: string, message: string): ImportCommitResult => {
  console.error(`[import-issues] ${step} failed:`, message);
  return { ok: false, status: 500, errorKey: "databaseError" };
};

/** Issues per INSERT statement. */
const INSERT_CHUNK = 200;
/** Concurrent single-row RPC calls while reserving numbers. */
const RPC_CHUNK = 25;

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

  // ── Categories: match existing labels case-insensitively, create the rest ──
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

  // ── Numbers: the counter RPC is atomic per call, so parallel chunks are
  // safe; sorting the batch keeps CLÉ-numbers aligned with CSV row order. ──
  const numbers: number[] = [];
  for (let i = 0; i < issues.length; i += RPC_CHUNK) {
    const results = await Promise.all(
      issues
        .slice(i, i + RPC_CHUNK)
        .map(() => service.rpc("next_issue_number", { p_project_id: projectId }))
    );
    for (const r of results) {
      if (r.error || typeof r.data !== "number") {
        return dbError("number reservation", r.error?.message ?? "no number");
      }
      numbers.push(r.data);
    }
  }
  numbers.sort((a, b) => a - b);

  // ── Issue rows, in CSV order ──
  const positionBase = Date.now();
  const rows = issues.map((issue, i) => {
    const row: Record<string, unknown> = {
      project_id: projectId,
      number: numbers[i],
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      due_date: issue.dueDate,
      created_by: actorId,
      position: positionBase + i,
    };
    if (issue.createdAt) row.created_at = issue.createdAt;
    if (issue.status === "done") {
      row.completed_at =
        issue.completedAt ?? issue.createdAt ?? new Date().toISOString();
    }
    return row;
  });

  const idByNumber = new Map<number, string>();
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { data, error } = await service
      .from("issues")
      .insert(rows.slice(i, i + INSERT_CHUNK))
      .select("id, number");
    if (error) return dbError("issues insert", error.message);
    for (const inserted of data ?? []) {
      idByNumber.set(inserted.number as number, inserted.id as string);
    }
  }

  // ── Parent pass: links were validated against the batch at parse time
  // (existing + one level only), so this just resolves keys to fresh ids. ──
  const idByExternalKey = new Map<string, string>();
  issues.forEach((issue, i) => {
    const id = idByNumber.get(numbers[i]);
    if (!id) return;
    for (const key of issue.externalKeys) idByExternalKey.set(normalizeToken(key), id);
  });

  const links: { childId: string; parentId: string }[] = [];
  issues.forEach((issue, i) => {
    if (!issue.parentExternalKey) return;
    const childId = idByNumber.get(numbers[i]);
    const parentId = idByExternalKey.get(normalizeToken(issue.parentExternalKey));
    if (childId && parentId && parentId !== childId) links.push({ childId, parentId });
  });

  let subIssuesLinked = 0;
  for (let i = 0; i < links.length; i += RPC_CHUNK) {
    const chunk = links.slice(i, i + RPC_CHUNK);
    const results = await Promise.all(
      chunk.map((link) =>
        service.from("issues").update({ parent_id: link.parentId }).eq("id", link.childId)
      )
    );
    for (const r of results) {
      if (r.error) {
        console.error("[import-issues] parent link failed:", r.error.message);
      } else {
        subIssuesLinked += 1;
      }
    }
  }

  // ── Categories on issues (best-effort: the issues exist from here on) ──
  const categoryRows: { issue_id: string; category_id: string }[] = [];
  issues.forEach((issue, i) => {
    const issueId = idByNumber.get(numbers[i]);
    if (!issueId) return;
    const seen = new Set<string>();
    for (const label of issue.labels) {
      const categoryId = categoryIdByKey.get(label.toLowerCase());
      if (categoryId && !seen.has(categoryId)) {
        seen.add(categoryId);
        categoryRows.push({ issue_id: issueId, category_id: categoryId });
      }
    }
  });
  for (let i = 0; i < categoryRows.length; i += 500) {
    const { error } = await service
      .from("issue_categories")
      .insert(categoryRows.slice(i, i + 500));
    if (error) console.error("[import-issues] categories attach failed:", error.message);
  }

  // ── Timeline: one `imported` event per issue (to_value = source) ──
  const events: EventRow[] = [];
  for (const id of idByNumber.values()) {
    events.push({ issue_id: id, actor_id: actorId, type: "imported", to_value: source });
  }
  for (let i = 0; i < events.length; i += 500) {
    await insertEvents(service, events.slice(i, i + 500));
  }

  return {
    ok: true,
    result: { created: idByNumber.size, categoriesCreated, subIssuesLinked },
  };
}
