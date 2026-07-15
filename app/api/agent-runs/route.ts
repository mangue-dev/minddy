import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Liste GLOBALE des sessions de l'agent de code (Numo), tous projets accessibles
 * confondus — alimente la page Agents. RLS `agent_runs` = can_access_project → le
 * cookie client suffit, aucun filtre projet manuel.
 *
 * Une SESSION est persistante et scoppée à une ISSUE (un run reprennable par issue,
 * MIN-46). On DÉDOUBLONNE donc par `issue_id` : le représentant est le run que la
 * conversation reprendrait — le plus récent NON `failed` (cohérent avec la
 * résolution `runs.find(isAgentRunResumable)` de la conversation) ; à défaut (issue
 * n'ayant que des runs `failed`) le run le plus récent. `working` signale qu'un run
 * de l'issue TRAVAILLE (queued/running) — pilote le spinner de la liste.
 */

export const runtime = "nodejs";

const WORKING_STATUSES = ["queued", "running"];

type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "needs_input";

interface RunRow {
  id: string;
  issue_id: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: "button" | "chat" | "mention";
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string } | null;
}

export interface AgentSessionListItem {
  /** Run représentant de la session (pilote le détail / la conversation). */
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: RunRow["triggered_by"];
  pr_number: number | null;
  pr_url: string | null;
  pr_state: RunRow["pr_state"];
  created_at: string;
  updated_at: string;
  issue: RunRow["issue"];
  project: RunRow["project"];
  /** Un run de l'issue TRAVAILLE (queued/running) → « Numo travaille ». */
  working: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_runs")
    .select(
      "id, issue_id, status, model, triggered_by, pr_number, pr_url, pr_state, created_at, updated_at, issue:issues(id, number, title), project:projects(id, key, name)",
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as RunRow[];
  // Les lignes arrivent triées par created_at DESC. Pour chaque issue on garde le
  // 1er run non `failed` rencontré (= le plus récent reprennable) comme
  // représentant ; à défaut le 1er run vu (le plus récent). `working` = un run
  // quelconque de l'issue travaille.
  const byIssue = new Map<string, AgentSessionListItem>();
  for (const r of rows) {
    const existing = byIssue.get(r.issue_id);
    const isWorking = WORKING_STATUSES.includes(r.status);
    if (!existing) {
      byIssue.set(r.issue_id, {
        runId: r.id,
        status: r.status,
        model: r.model,
        triggered_by: r.triggered_by,
        pr_number: r.pr_number,
        pr_url: r.pr_url,
        pr_state: r.pr_state,
        created_at: r.created_at,
        updated_at: r.updated_at,
        issue: r.issue,
        project: r.project,
        working: isWorking,
      });
      continue;
    }
    // Un run plus ancien peut toujours porter l'info « travaille » de l'issue.
    if (isWorking) existing.working = true;
    // Promotion du représentant : si l'actuel est `failed` mais qu'on croise un run
    // reprennable (plus ancien mais non `failed`), il devient le représentant.
    if (existing.status === "failed" && r.status !== "failed") {
      existing.runId = r.id;
      existing.status = r.status;
      existing.model = r.model;
      existing.triggered_by = r.triggered_by;
      existing.pr_number = r.pr_number;
      existing.pr_url = r.pr_url;
      existing.pr_state = r.pr_state;
      // La session « existe » depuis son 1er run ; on garde la date d'activité la
      // plus fraîche pour le tri (created_at du représentant peut être plus ancien).
      existing.created_at = r.created_at;
    }
  }

  // Ordre STABLE par date de création (la plus récente en haut) : contrairement à
  // updated_at (bougé par les synchros PR / webhooks), created_at ne change pas →
  // la liste ne se réordonne pas toute seule.
  const sessions = [...byIssue.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
  return NextResponse.json({ sessions });
}
