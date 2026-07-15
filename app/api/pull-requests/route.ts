import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Liste GLOBALE des pull requests ouvertes par l'agent Numo, tous projets
 * accessibles confondus (MIN-66 — page Pull Requests). RLS agent_runs =
 * can_access_project → le cookie client suffit, aucun filtre projet manuel.
 *
 * Une PR = PLUSIEURS runs : le webhook (`syncPrState`) tamponne tous les runs
 * partageant un `pr_number`, et chaque « demande de changements » relance un run
 * sur la même branche → même `pr_number`. On DÉDOUBLONNE donc par
 * (repo_link_id, pr_number) en gardant le run le plus ancien comme canonique
 * (son id pilote le détail : diff, commentaires, merge/close/relance).
 */

export const runtime = "nodejs";

// « Numo retravaille » = l'agent TRAVAILLE (queued/running). Un run au REPOS n'est
// PAS en train de retravailler la PR — sinon la PR resterait « en cours » pour
// toujours et les actions merge/reject seraient bloquées indéfiniment.
const WORKING_STATUSES = ["queued", "running"];
// Un run OCCUPE l'issue (MIN-68) : il travaille, ou il est suspendu en attente de
// l'utilisateur. Tant qu'il y en a un, aucune nouvelle run ne peut être lancée —
// « demander des changements » est donc indisponible (le serveur renvoie 409).
// Distinct de WORKING_STATUSES : merger/refuser une PR reste possible dans ce cas.
const ACTIVE_STATUSES = ["queued", "running", "needs_input"];

interface RunRow {
  id: string;
  repo_link_id: string | null;
  status: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string } | null;
}

export interface PullRequestListItem {
  runId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: RunRow["pr_state"];
  model: string | null;
  created_at: string;
  updated_at: string;
  issue: RunRow["issue"];
  project: RunRow["project"];
  /** Un run qui TRAVAILLE (queued/running) sur cette PR = « Numo retravaille ». */
  activeRunId: string | null;
  /** Un run ACTIF occupe l'issue → pas de nouvelle demande de changements (MIN-68). */
  busyRunId: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_runs")
    .select(
      "id, repo_link_id, status, pr_number, pr_url, pr_state, model, created_at, updated_at, issue:issues(id, number, title), project:projects(id, key, name)",
    )
    .not("pr_number", "is", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as RunRow[];
  // Dédoublonnage par (repo_link_id, pr_number). Les lignes arrivent triées par
  // created_at asc → la première vue est le run canonique (le plus ancien). On
  // garde ensuite l'état PR le plus frais (webhook / merge tamponnent updated_at).
  const byPr = new Map<string, PullRequestListItem>();
  for (const r of rows) {
    if (r.pr_number == null) continue;
    const key = `${r.repo_link_id ?? ""}:${r.pr_number}`;
    const isWorking = WORKING_STATUSES.includes(r.status);
    const isActive = ACTIVE_STATUSES.includes(r.status);
    const existing = byPr.get(key);
    if (!existing) {
      byPr.set(key, {
        runId: r.id,
        pr_number: r.pr_number,
        pr_url: r.pr_url,
        pr_state: r.pr_state,
        model: r.model,
        created_at: r.created_at,
        updated_at: r.updated_at,
        issue: r.issue,
        project: r.project,
        activeRunId: isWorking ? r.id : null,
        busyRunId: isActive ? r.id : null,
      });
      continue;
    }
    if (r.updated_at > existing.updated_at) {
      existing.pr_state = r.pr_state;
      existing.pr_url = r.pr_url ?? existing.pr_url;
      existing.updated_at = r.updated_at;
    }
    if (isWorking && !existing.activeRunId) existing.activeRunId = r.id;
    if (isActive && !existing.busyRunId) existing.busyRunId = r.id;
  }

  const pullRequests = [...byPr.values()].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  );
  return NextResponse.json({ pullRequests });
}
