import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { importIssuesIntoProject } from "@/lib/server/import-issues";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import type { ImportedIssue } from "@/lib/import/types";
import type { RepoProviderId } from "@/lib/repo-providers";
import { listRepoOpenIssues } from "./github-app";
import { getGitlabAccessToken, listGitlabOpenIssues } from "./gitlab-app";
import {
  REMOTE_LANDING_STATUS,
  statusForRemoteAction,
  type RemoteIssue,
} from "./issue-sync-core";

/**
 * Cœur de la synchronisation unidirectionnelle dépôt lié → minddy (MIN-97).
 * Appelé par les deux récepteurs webhook (issue ouverte / fermée / rouverte) et
 * par le backfill lancé à l'activation du toggle.
 *
 * Sens unique STRICT : rien ici n'écrit chez le provider. Créer un ticket dans
 * minddy ne crée pas d'issue GitHub/GitLab, et fermer un ticket ne ferme pas
 * l'issue distante.
 *
 * Le dédoublonnage n'est pas fait en TS mais par l'index UNIQUE partiel
 * `idx_issues_remote_identity` : une redélivrance de webhook produit une
 * violation 23505 que `createIssueForProject` renvoie en 409 — avalée ici.
 *
 * Acteur des écritures : `project_git_links.created_by`, le owner qui a lié le
 * dépôt (updateIssueFields exige un membre du projet). Les événements sont
 * estampillés `forge_sync` pour que la timeline crédite GitHub/GitLab et non
 * cette personne — même compromis que l'agent de code.
 */

/** Plafond dur du backfill : au-delà, on n'importe pas l'historique d'un dépôt. */
export const REMOTE_BACKFILL_MAX = 500;

/** Une liaison dont la synchro d'issues est active. */
export interface IssueSyncTarget {
  linkId: string;
  projectId: string;
  provider: RepoProviderId;
  connectionId: string;
  installationId: number | null;
  externalRepoId: string;
  repoFullName: string | null;
  /** Le owner qui a lié le dépôt — acteur technique des écritures. */
  createdBy: string | null;
}

const TARGET_COLUMNS =
  "id, project_id, provider, connection_id, installation_id, external_repo_id, repo_full_name, created_by";

type TargetRow = {
  id: string;
  project_id: string;
  provider: string;
  connection_id: string;
  installation_id: number | null;
  external_repo_id: string;
  repo_full_name: string | null;
  created_by: string | null;
};

const toTarget = (row: TargetRow): IssueSyncTarget => ({
  linkId: row.id,
  projectId: row.project_id,
  provider: row.provider as RepoProviderId,
  connectionId: row.connection_id,
  installationId: row.installation_id,
  externalRepoId: row.external_repo_id,
  repoFullName: row.repo_full_name,
  createdBy: row.created_by,
});

/**
 * Les liaisons ACTIVES d'un dépôt. Plusieurs projets peuvent lier le même dépôt
 * (via des connexions différentes) : le fan-out doit tous les servir, comme
 * `syncPrState` le fait pour les PR.
 */
export async function listIssueSyncTargets(params: {
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<IssueSyncTarget[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_git_links")
    .select(TARGET_COLUMNS)
    .eq("provider", params.provider)
    .eq("repo_full_name", params.repoFullName)
    .eq("issue_sync_enabled", true);
  if (error) {
    console.error("[issue-sync] targets lookup failed:", error.message);
    return [];
  }
  return ((data ?? []) as TargetRow[]).map(toTarget);
}

/** La liaison d'un projet, qu'elle soit active ou non (backfill, activation). */
export async function getIssueSyncLink(
  projectId: string,
): Promise<IssueSyncTarget | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select(TARGET_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? toTarget(data as TargetRow) : null;
}

/** Écrit le toggle de la liaison (et l'id du hook GitLab provisionné). */
export async function setIssueSyncEnabled(params: {
  linkId: string;
  enabled: boolean;
  hookId?: string | null;
}): Promise<void> {
  const service = getServiceClient();
  const patch: Record<string, unknown> = {
    issue_sync_enabled: params.enabled,
    issue_sync_enabled_at: params.enabled ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (params.hookId !== undefined) patch.issue_sync_hook_id = params.hookId;
  const { error } = await service
    .from("project_git_links")
    .update(patch)
    .eq("id", params.linkId);
  if (error) throw new Error(error.message);
}

/**
 * Applique un événement d'issue distante à UNE liaison : crée le ticket s'il
 * n'existe pas encore, sinon aligne son statut sur l'état distant. Best-effort —
 * une cible qui échoue ne doit pas empêcher les autres d'être servies.
 */
export async function applyRemoteIssue(
  target: IssueSyncTarget,
  remote: RemoteIssue,
): Promise<void> {
  if (!target.createdBy) {
    console.warn(
      `[issue-sync] link ${target.linkId} has no created_by — skipped`,
    );
    return;
  }
  const service = getServiceClient();
  const { data: existing, error } = await service
    .from("issues")
    .select("id, status")
    .eq("project_id", target.projectId)
    .eq("remote_provider", remote.provider)
    .eq("remote_repo_id", remote.repoId)
    .eq("remote_number", remote.number)
    .maybeSingle();
  if (error) {
    console.error("[issue-sync] lookup failed:", error.message);
    return;
  }

  const mappedStatus = statusForRemoteAction(remote.action);

  if (!existing) {
    // Jamais importée : elle entre TOUJOURS par le triage, quelle que soit
    // l'action distante. Une fermeture peut tomber ici (issue au-delà du
    // plafond de backfill) — la créer directement en `done` la ferait entrer
    // dans le projet sans que personne ne l'ait jamais vue. Le mapping
    // fermé → done / rouvert → backlog ne vaut que pour un ticket DÉJÀ importé.
    const result = await createIssueForProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      input: {
        title: remote.title || `#${remote.number}`,
        description: remote.body ?? undefined,
        status: REMOTE_LANDING_STATUS,
      },
      remote: {
        provider: remote.provider,
        repoId: remote.repoId,
        number: remote.number,
        url: remote.url,
      },
    });
    if (!result.ok && result.errorKey !== "remoteIssueAlreadyImported") {
      // 409 = redélivrance du webhook, le chemin normal : silence.
      console.error(
        `[issue-sync] create failed for ${remote.repoFullName}#${remote.number}:`,
        result.errorKey ?? result.rawMessage,
      );
    }
    return;
  }

  // Déjà importée : seul le statut suit l'état distant. Ni le titre ni le corps
  // ne sont réécrits — ça écraserait le travail fait dans minddy.
  if (!mappedStatus || mappedStatus === existing.status) return;
  const updated = await updateIssueFields({
    issueId: existing.id as string,
    actorId: target.createdBy,
    input: { status: mappedStatus },
    forgeSync: remote.provider,
  });
  if (!updated.ok) {
    console.error(
      `[issue-sync] status update failed for ${remote.repoFullName}#${remote.number}:`,
      updated.errorKey ?? updated.rawMessage,
    );
  }
}

/** Fan-out complet d'un événement : toutes les liaisons actives du dépôt. */
export async function syncRemoteIssueEvent(remote: RemoteIssue): Promise<void> {
  const targets = await listIssueSyncTargets({
    provider: remote.provider,
    repoFullName: remote.repoFullName,
  });
  for (const target of targets) {
    try {
      await applyRemoteIssue(target, remote);
    } catch (err) {
      console.error(
        `[issue-sync] target ${target.linkId} failed:`,
        (err as Error).message,
      );
    }
  }
}

// --- Backfill à l'activation ------------------------------------------------

/** Les numéros distants déjà présents dans le projet, pour ce dépôt. */
async function loadImportedNumbers(
  target: IssueSyncTarget,
): Promise<Set<number>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("issues")
    .select("remote_number")
    .eq("project_id", target.projectId)
    .eq("remote_provider", target.provider)
    .eq("remote_repo_id", target.externalRepoId);
  if (error) {
    console.error("[issue-sync] backfill lookup failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((r) => r.remote_number as number | null)
      .filter((n): n is number => typeof n === "number"),
  );
}

/** Une issue distante, ramenée à la forme attendue par l'import en masse. */
function toImportedIssue(
  target: IssueSyncTarget,
  issue: { number: number; title: string; body: string | null; url: string | null },
): ImportedIssue {
  return {
    title: issue.title || `#${issue.number}`,
    description: issue.body,
    status: REMOTE_LANDING_STATUS,
    priority: "none",
    effort: null,
    labels: [],
    dueDate: null,
    createdAt: null,
    completedAt: null,
    externalKeys: [],
    parentExternalKey: null,
    remote: {
      provider: target.provider,
      repoId: target.externalRepoId,
      number: issue.number,
      url: issue.url,
    },
  };
}

/**
 * Importe les issues OUVERTES du dépôt lié à l'activation du toggle. Les issues
 * déjà fermées côté provider ne sont PAS rapatriées : la synchro sert à suivre
 * le travail en cours, pas à recopier un historique.
 *
 * Renvoie le nombre de tickets créés (0 si tout était déjà là). Best-effort :
 * le toggle est déjà écrit quand cette fonction tourne (dans `after()`), un
 * échec ici ne le remet pas à false — les événements suivants passeront.
 */
export async function backfillRemoteIssues(
  target: IssueSyncTarget,
): Promise<number> {
  if (!target.createdBy) return 0;

  // Une seule vérification de quota pour tout le lot : la limite est un
  // garde-fou d'offre, pas un compteur exact (l'import CSV fait pareil).
  try {
    await ensureIssueLimit(target.projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      console.warn(
        `[issue-sync] backfill skipped for project ${target.projectId}: issue limit reached`,
      );
      return 0;
    }
    throw err;
  }

  let remoteIssues: Array<{
    number: number;
    title: string;
    body: string | null;
    url: string | null;
  }>;
  if (target.provider === "github") {
    if (target.installationId == null || !target.repoFullName) return 0;
    const issues = await listRepoOpenIssues(
      target.installationId,
      target.repoFullName,
      REMOTE_BACKFILL_MAX,
    );
    remoteIssues = issues.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
      url: i.htmlUrl,
    }));
  } else {
    const token = await getGitlabAccessToken(target.connectionId);
    const issues = await listGitlabOpenIssues(
      token,
      target.externalRepoId,
      REMOTE_BACKFILL_MAX,
    );
    remoteIssues = issues.map((i) => ({
      number: i.iid,
      title: i.title,
      body: i.description,
      url: i.webUrl,
    }));
  }

  const alreadyImported = await loadImportedNumbers(target);
  const fresh = remoteIssues.filter((i) => !alreadyImported.has(i.number));

  let created = 0;
  if (fresh.length > 0) {
    const result = await importIssuesIntoProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      issues: fresh.map((i) => toImportedIssue(target, i)),
      source: target.provider,
    });
    if (!result.ok) {
      console.error("[issue-sync] backfill import failed:", result.errorKey);
      return 0;
    }
    created = result.result.created;
  }

  const service = getServiceClient();
  await service
    .from("project_git_links")
    .update({ issue_sync_backfilled_at: new Date().toISOString() })
    .eq("id", target.linkId);

  return created;
}
