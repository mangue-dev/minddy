// Normalisation PURE des événements d'issue GitHub/GitLab (sans DB, sans import
// server-only) : testable en node/vitest, comme plan-sync-core.ts. La partie qui
// écrit en base vit dans issue-sync.ts.
//
// Synchronisation UNIDIRECTIONNELLE (MIN-97) : le dépôt lié pousse ses issues
// dans minddy, jamais l'inverse. Les deux forges parlent des vocabulaires
// différents (`closed`/`close`, `number`/`iid`) — tout est ramené ici à une
// forme neutre `RemoteIssue` que le reste du code consomme sans savoir d'où
// l'événement vient.

import type { IssueStatusValue } from "@/lib/issue-validation";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Statut d'arrivée d'une issue importée. `triage` et pas `backlog` : c'est le
 * sas que minddy réserve déjà à tout ce qui vient de l'extérieur (API Feedback),
 * la page /triage existe pour ça, et ça évite de déclencher Smart Assign — donc
 * de la dépense IA — sur chaque issue du dépôt.
 */
export const REMOTE_LANDING_STATUS: IssueStatusValue = "triage";

/** Action distante normalisée → statut minddy (null = rien à changer). */
export function statusForRemoteAction(action: string): IssueStatusValue | null {
  switch (action) {
    // GitHub `closed` / GitLab `close`.
    case "closed":
    case "close":
      return "done";
    // Réouverture → `backlog`, jamais `triage` : le ticket a déjà été vu.
    case "reopened":
    case "reopen":
      return "backlog";
    default:
      return null;
  }
}

/** Forme neutre d'un événement d'issue distante, quel que soit le provider. */
export interface RemoteIssue {
  provider: RepoProviderId;
  /** "owner/repo" (GitHub) ou "group/sub/project" (GitLab) — clé du fan-out. */
  repoFullName: string;
  /** Id numérique du dépôt, tel que stocké en `external_repo_id`. */
  repoId: string;
  /** `number` GitHub / `iid` GitLab — le numéro visible dans l'URL. */
  number: number;
  title: string;
  body: string | null;
  url: string | null;
  /** Action brute du provider (`opened`, `close`…), lue par statusForRemoteAction. */
  action: string;
  actorLogin: string | null;
}

interface GithubIssuesEvent {
  action?: string;
  issue?: {
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string | null;
    /** Présent = c'est une pull request déguisée en issue → à ignorer. */
    pull_request?: unknown;
  };
  repository?: { id?: number; full_name?: string };
  sender?: { login?: string };
}

/**
 * Payload `issues` de la GitHub App → forme neutre, ou null si inexploitable.
 * L'API issues de GitHub compte les pull requests parmi les issues : une entrée
 * portant `pull_request` est écartée (elle est déjà traitée par le handler PR).
 */
export function normalizeGithubIssueEvent(payload: unknown): RemoteIssue | null {
  const event = (payload ?? {}) as GithubIssuesEvent;
  const issue = event.issue;
  if (!issue || issue.pull_request) return null;
  const number = issue.number;
  const repoFullName = event.repository?.full_name;
  const repoId = event.repository?.id;
  if (typeof number !== "number" || !repoFullName || repoId == null) return null;
  return {
    provider: "github",
    repoFullName,
    repoId: String(repoId),
    number,
    title: issue.title ?? "",
    body: issue.body ?? null,
    url: issue.html_url ?? null,
    action: event.action ?? "",
    actorLogin: event.sender?.login ?? null,
  };
}

interface GitlabIssueEvent {
  object_kind?: string;
  user?: { username?: string };
  project?: { id?: number; path_with_namespace?: string };
  object_attributes?: {
    iid?: number;
    title?: string;
    description?: string | null;
    url?: string | null;
    action?: string;
  };
}

/**
 * Payload `Issue Hook` de GitLab → forme neutre, ou null si inexploitable.
 * Les issues CONFIDENTIELLES arrivent avec `object_kind: "confidential_issue"`
 * — on ne les importe pas : leur contenu est restreint côté GitLab, le recopier
 * dans un projet minddy le rendrait visible à toute l'équipe.
 */
export function normalizeGitlabIssueEvent(payload: unknown): RemoteIssue | null {
  const event = (payload ?? {}) as GitlabIssueEvent;
  if (event.object_kind !== "issue") return null;
  const attrs = event.object_attributes;
  const iid = attrs?.iid;
  const repoFullName = event.project?.path_with_namespace;
  const repoId = event.project?.id;
  if (typeof iid !== "number" || !repoFullName || repoId == null) return null;
  return {
    provider: "gitlab",
    repoFullName,
    repoId: String(repoId),
    number: iid,
    title: attrs?.title ?? "",
    body: attrs?.description ?? null,
    url: attrs?.url ?? null,
    action: attrs?.action ?? "",
    actorLogin: event.user?.username ?? null,
  };
}
