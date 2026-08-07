// Normalisation PURE des événements d'issue GitHub/GitLab (sans DB, sans import
// server-only) : testable en node/vitest, comme plan-sync-core.ts. La partie qui
// écrit en base vit dans issue-sync.ts, celle qui écrit chez la forge dans
// issue-push.ts.
//
// Les deux forges parlent des vocabulaires différents (`closed`/`close`,
// `number`/`iid`, `{name}`/`{title}`) — tout est ramené ici à une forme neutre
// `RemoteIssue` que le reste du code consomme sans savoir d'où l'événement vient.
//
// Le sens de la synchro a CHANGÉ depuis MIN-97, qui était strictement
// descendant (« le dépôt pousse ses issues dans minddy, jamais l'inverse ») :
//  • descendant, le ticket est le REFLET de l'issue — titre, corps, labels,
//    assigné et état la suivent (`statusForRemoteReconcile`) ;
//  • montant, un seul champ remonte, l'état ouvert/fermé
//    (`remoteStateForStatus`), parce que celui qui termine le travail peut
//    très bien le dire depuis minddy.
// Ce sont les deux seules fonctions de statut, et elles se lisent ensemble :
// l'une est la réciproque de l'autre, c'est ce qui ferme la boucle d'écho.

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

/**
 * Le statut que doit prendre un ticket DÉJÀ importé, ou `null` s'il ne bouge
 * pas. C'est la fonction qu'appelle la réconciliation, et elle raisonne sur
 * l'ÉTAT porté par le payload plutôt que sur l'action — un `edited`, un
 * `labeled` ou un `assigned` ne dit rien d'une transition, mais transporte
 * quand même `state`, ce qui rattrape au passage une fermeture dont le webhook
 * s'est perdu.
 *
 * **Elle compare des états, pas des statuts**, et c'est tout l'intérêt : minddy
 * a huit statuts, la forge en a deux. Trois des huit valent « fermé ». Traduire
 * `closed` en `done` sans regarder où en est le ticket ferait basculer vers
 * « terminé » un ticket délibérément mis en « annulé » — à chaque édition de
 * l'issue distante, et sans que personne ne comprenne pourquoi. Tant que les
 * deux côtés s'accordent sur ouvert/fermé, on ne touche à rien.
 */
export function statusForRemoteReconcile(
  remote: RemoteIssue,
  current: IssueStatusValue,
): IssueStatusValue | null {
  // Pas d'état dans la charge : on retombe sur la transition, quand il y en a
  // une. Elle est soumise à la même règle d'accord (une fermeture qui trouve un
  // ticket déjà clos ne le requalifie pas).
  const remoteOpen =
    remote.state != null
      ? remote.state === "open"
      : statusForRemoteAction(remote.action) === "backlog"
        ? true
        : statusForRemoteAction(remote.action) === "done"
          ? false
          : null;
  if (remoteOpen === null) return null;
  if (remoteStateForStatus(current).open === remoteOpen) return null;
  // Rouvert → `backlog`, jamais `triage` : le ticket a déjà été vu. Une issue
  // ouverte qu'on n'a jamais importée passe, elle, par REMOTE_LANDING_STATUS.
  return remoteOpen ? "backlog" : "done";
}

/** L'état d'une issue distante, vu depuis minddy — la moitié montante de la
 *  synchro (`issue-push.ts`). */
export interface RemoteState {
  open: boolean;
  /** Fermée « sans suite » plutôt que « faite ». GitHub l'affiche
   *  différemment (`state_reason`) ; GitLab n'a pas la nuance. */
  notPlanned: boolean;
}

/**
 * Statut minddy → état de l'issue distante. Table TOTALE : chacun des huit
 * statuts dit quelque chose, et l'exhaustivité est vérifiée à la compilation —
 * un neuvième statut ne pourra pas se glisser ici en valant `undefined`, donc
 * en rouvrant silencieusement des issues.
 *
 * Les trois statuts clos de minddy ferment, mais pas de la même façon :
 * `done` est un travail fait, `canceled` et `duplicate` un travail qui n'aura
 * pas lieu — ce que GitHub sait dire, et affiche autrement.
 */
const REMOTE_STATE_BY_STATUS: Record<IssueStatusValue, RemoteState> = {
  triage: { open: true, notPlanned: false },
  backlog: { open: true, notPlanned: false },
  todo: { open: true, notPlanned: false },
  in_progress: { open: true, notPlanned: false },
  in_review: { open: true, notPlanned: false },
  done: { open: false, notPlanned: false },
  canceled: { open: false, notPlanned: true },
  duplicate: { open: false, notPlanned: true },
};

export const remoteStateForStatus = (status: IssueStatusValue): RemoteState =>
  REMOTE_STATE_BY_STATUS[status];

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
  /** État courant porté par le payload, indépendant de l'action. `null` quand
   *  le provider ne l'a pas donné — on ne l'invente pas. */
  state: "open" | "closed" | null;
  /** Noms des labels de l'issue, tels que la forge les écrit. */
  labels: string[];
  /** Logins des assignés, dans l'ordre de la forge (les deux en acceptent
   *  plusieurs, minddy un seul — cf. `matchForgeAssignee`). */
  assigneeLogins: string[];
}

/**
 * Un label de forge est un objet — mais les deux ne le nomment pas pareil :
 * GitHub écrit `{name}`, GitLab `{title}`. Une charge peut aussi le donner en
 * chaîne nue (l'API REST de GitLab le fait sur certains endpoints).
 */
function readLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry.trim()) names.push(entry.trim());
      continue;
    }
    const row = entry as Record<string, unknown> | null;
    const name = typeof row?.name === "string" ? row.name : row?.title;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return names;
}

/** Les logins d'une liste d'assignés (`{login}` GitHub, `{username}` GitLab). */
function readLogins(raw: unknown, key: "login" | "username"): string[] {
  if (!Array.isArray(raw)) return [];
  const logins: string[] = [];
  for (const entry of raw) {
    const login = (entry as Record<string, unknown> | null)?.[key];
    if (typeof login === "string" && login.trim()) logins.push(login.trim());
  }
  return logins;
}

interface GithubIssuesEvent {
  action?: string;
  issue?: {
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string | null;
    state?: string;
    labels?: unknown;
    assignees?: unknown;
    assignee?: unknown;
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
  // `assignees` est la liste moderne, `assignee` le champ historique que GitHub
  // continue de servir : le second n'est que le premier de la première, alors on
  // ne s'en sert qu'à défaut, sans jamais compter deux fois la même personne.
  const assignees = readLogins(issue.assignees, "login");
  const legacy = readLogins([issue.assignee], "login");
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
    state: issue.state === "open" || issue.state === "closed" ? issue.state : null,
    labels: readLabels(issue.labels),
    assigneeLogins: assignees.length > 0 ? assignees : legacy,
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
    state?: string;
    labels?: unknown;
  };
  /** GitLab porte labels et assignés à la RACINE du hook, pas dans
   *  `object_attributes` (qui ne recopie les labels que sur certaines versions). */
  labels?: unknown;
  assignees?: unknown;
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
  // GitLab dit « opened », GitHub « open » : la forme neutre tranche pour la
  // seconde, sinon `statusForRemoteReconcile` aurait deux vocabulaires à connaître.
  const rawState = attrs?.state;
  const state =
    rawState === "closed" ? "closed" : rawState === "opened" ? "open" : null;
  // Les labels de la racine font foi : `object_attributes.labels` n'est pas
  // servi par toutes les versions, et quand il l'est, il dit la même chose.
  const labels = readLabels(event.labels);
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
    state,
    labels: labels.length > 0 ? labels : readLabels(attrs?.labels),
    assigneeLogins: readLogins(event.assignees, "username"),
  };
}
