import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { importIssuesIntoProject } from "@/lib/server/import-issues";
import { ensureIssueLimit } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { categoryKey, resolveCategoryIdsByName } from "@/lib/server/categories";
import { readForgeLabels } from "@/lib/import/forge-labels";
import type { ImportedIssue } from "@/lib/import/types";
import type { IssueStatusValue } from "@/lib/issue-validation";
import type { RepoProviderId } from "@/lib/repo-providers";
import { listRepoOpenIssues } from "./github-app";
import { getGitlabAccessToken, listGitlabOpenIssues } from "./gitlab-app";
import {
  buildForgeAssigneeIndex,
  matchForgeAssignee,
  type ForgeAssigneeIndex,
} from "./forge-members";
import { forgeIssueResource } from "./forge-resource";
import {
  REMOTE_LANDING_STATUS,
  statusForRemoteReconcile,
  type RemoteIssue,
} from "./issue-sync-core";

/**
 * Cœur du sens DESCENDANT de la synchro d'issues (dépôt lié → minddy, MIN-97).
 * Appelé par les deux récepteurs webhook et par le backfill lancé à l'activation
 * du toggle.
 *
 * Rien ICI n'écrit chez le provider : le seul retour qui existe est celui de
 * l'état ouvert/fermé, et il vit à part, dans `issue-push.ts`, appelé depuis
 * `updateIssueFields`. Créer un ticket dans minddy ne crée toujours aucune issue
 * GitHub/GitLab.
 *
 * Le dédoublonnage n'est pas fait en TS mais par l'index UNIQUE partiel
 * `idx_issues_remote_identity` : une redélivrance de webhook produit une
 * violation 23505 que `createIssueForProject` renvoie en 409 — avalée ici.
 *
 * Acteur des écritures : `project_git_links.created_by`, le owner qui a lié le
 * dépôt (updateIssueFields exige un membre du projet). Les événements sont
 * estampillés `forge_sync` — ce qui crédite GitHub/GitLab dans la timeline
 * plutôt que cette personne (même compromis que l'agent de code) ET, depuis le
 * retour de statut, empêche la boucle : une écriture estampillée forge ne
 * repart pas vers la forge.
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
 * n'existe pas encore, sinon RÉCONCILIE le ticket existant avec l'issue
 * distante. Best-effort — une cible qui échoue ne doit pas empêcher les autres
 * d'être servies.
 *
 * La réconciliation est un renversement assumé par rapport à MIN-97, qui
 * n'alignait que le statut « pour ne pas écraser le travail fait dans minddy ».
 * L'usage a tranché autrement : quand une équipe ouvre encore des issues sur le
 * dépôt alors que le projet minddy existe, c'est que le dépôt reste l'endroit où
 * cette issue-là vit. Le ticket en est le REFLET, et un reflet qui diverge de ce
 * qu'il reflète ne sert plus à rien. Ce qui n'a pas d'équivalent distant — le
 * plan, les commentaires minddy, l'objectif, le cycle — n'est jamais touché.
 */
export async function applyRemoteIssue(
  target: IssueSyncTarget,
  remote: RemoteIssue,
  /** Index login → membre, construit une fois par LOT quand il y en a un
   *  (backfill). Absent = construit ici, pour un événement isolé. */
  assignees?: ForgeAssigneeIndex,
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
    .select("id, status, title, description, assignee_id, priority, effort")
    .is("deleted_at", null)
    .eq("project_id", target.projectId)
    .eq("remote_provider", remote.provider)
    .eq("remote_repo_id", remote.repoId)
    .eq("remote_number", remote.number)
    .maybeSingle();
  if (error) {
    console.error("[issue-sync] lookup failed:", error.message);
    return;
  }

  const { priority, effort, labels } = readForgeLabels(remote.labels);
  // L'index coûte deux requêtes : on ne le construit que si l'issue nomme
  // effectivement quelqu'un. La plupart des webhooks (`labeled`, `edited`) ne
  // parlent pas d'assignation, et beaucoup de dépôts n'assignent jamais rien.
  const index =
    remote.assigneeLogins.length === 0
      ? null
      : (assignees ??
        (await buildForgeAssigneeIndex({
          projectId: target.projectId,
          provider: target.provider,
        })));
  const assigneeId = index ? matchForgeAssignee(remote.assigneeLogins, index) : null;

  if (!existing) {
    // Jamais importée : elle entre TOUJOURS par le triage, quel que soit l'état
    // distant. Une fermeture peut tomber ici (issue au-delà du plafond de
    // backfill) — la créer directement en `done` la ferait entrer dans le projet
    // sans que personne ne l'ait jamais vue.
    const resource = forgeIssueResource({
      provider: remote.provider,
      repoFullName: remote.repoFullName,
      number: remote.number,
      url: remote.url,
    });
    const result = await createIssueForProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      input: {
        title: remote.title || `#${remote.number}`,
        description: remote.body ?? undefined,
        status: REMOTE_LANDING_STATUS,
        priority,
        effort,
        assignee_id: assigneeId,
        resources: resource ? [resource] : undefined,
      },
      remote: {
        provider: remote.provider,
        repoId: remote.repoId,
        number: remote.number,
        url: remote.url,
      },
    });
    if (!result.ok) {
      // 409 = redélivrance du webhook, le chemin normal : silence.
      if (result.errorKey !== "remoteIssueAlreadyImported") {
        console.error(
          `[issue-sync] create failed for ${remote.repoFullName}#${remote.number}:`,
          result.errorKey ?? result.rawMessage,
        );
      }
      return;
    }
    await applyRemoteLabels(target, result.issue.id as string, labels);
    return;
  }

  // ── Déjà importée : on réaligne ce que la forge porte, et rien d'autre ──
  //
  // UNE règle gouverne tout ce bloc : **la forge n'écrase un champ que si elle
  // a quelque chose à en dire.** Elle a toujours un titre, un corps et un état,
  // donc ces trois-là suivent sans condition. Elle n'a pas forcément de
  // priorité, de taille, d'assigné ni de labels — et prendre son silence pour
  // une valeur serait ravageur : sur un dépôt qui n'assigne jamais ses issues,
  // le moindre webhook `labeled` désassignerait le ticket que quelqu'un venait
  // de prendre dans minddy, sans que rien ne l'ait demandé.
  const issueId = existing.id as string;
  const patch: Record<string, unknown> = {};

  const title = remote.title || `#${remote.number}`;
  if (title !== existing.title) patch.title = title;
  const body = remote.body ?? null;
  if (body !== (existing.description ?? null)) patch.description = body;
  // L'assigné suit quand la forge NOMME quelqu'un qu'on reconnaît. Un assigné
  // qu'on ne reconnaît pas (compte non connecté) ne vide pas la case non plus :
  // on ne sait pas qui c'est, on ne sait donc rien de plus qu'avant.
  if (assigneeId && assigneeId !== (existing.assignee_id ?? null)) {
    patch.assignee_id = assigneeId;
  }
  if (priority !== "none" && priority !== existing.priority) patch.priority = priority;
  if (effort && effort !== existing.effort) patch.effort = effort;

  // Le statut suit l'ÉTAT distant, comparé à l'état que le statut courant
  // représente — pas au statut lui-même : `canceled` et `done` sont tous deux
  // « fermé », et une issue fermée qui reste fermée ne doit rien requalifier.
  const mappedStatus = statusForRemoteReconcile(
    remote,
    existing.status as IssueStatusValue,
  );
  if (mappedStatus) patch.status = mappedStatus;

  if (Object.keys(patch).length > 0) {
    const updated = await updateIssueFields({
      issueId,
      actorId: target.createdBy,
      input: patch,
      // C'est ce drapeau qui empêche la BOUCLE : `updateIssueFields` ne
      // repousse pas vers la forge un statut qui en vient (cf. issue-push.ts).
      forgeSync: remote.provider,
    });
    if (!updated.ok) {
      console.error(
        `[issue-sync] update failed for ${remote.repoFullName}#${remote.number}:`,
        updated.errorKey ?? updated.rawMessage,
      );
    }
  }

  await applyRemoteLabels(target, issueId, labels);
}

/**
 * Les labels de l'issue distante, posés en catégories du projet — remplacement
 * complet quand elle en porte : un label retiré chez elle retire la catégorie
 * ici, c'est le sens du reflet.
 *
 * Une issue SANS aucun label ne touche à rien, par la même règle que le bloc
 * ci-dessus : un dépôt qui n'étiquette pas ses issues ne doit pas balayer, à
 * chaque webhook, les catégories rangées à la main dans minddy. Retirer le
 * DERNIER label chez la forge ne vide donc pas les catégories ici — le prix,
 * assumé, de ne pas confondre « rien à dire » et « rien ».
 *
 * Best-effort et à part de `updateIssueFields` : les catégories vivent dans une
 * table de jointure, avec leur propre chemin d'écriture (`setIssueCategories`)
 * et leurs propres événements de timeline.
 */
async function applyRemoteLabels(
  target: IssueSyncTarget,
  issueId: string,
  labels: string[],
): Promise<void> {
  if (!target.createdBy || labels.length === 0) return;
  const resolved = await resolveCategoryIdsByName(target.projectId, labels);
  if (!resolved) return;
  // DÉDOUBLONNÉ : `readForgeLabels` sépare deux labels que `categoryKey` peut
  // ramener à la même catégorie (il rogne les accents, la clé non ; il garde
  // entiers deux noms que la borne des 200 caractères confond). Un id répété
  // ferait rater la comparaison ci-dessous, et le DELETE/INSERT repartirait à
  // chaque webhook — précisément ce qu'elle est là pour éviter.
  const ids = [
    ...new Set(
      labels
        .map((label) => resolved.idByKey.get(categoryKey(label)))
        .filter((id): id is string => !!id),
    ),
  ];

  const service = getServiceClient();
  const { data: current } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);
  const before = new Set((current ?? []).map((r) => r.category_id as string));
  // Rien n'a bougé : ne pas réécrire. `setIssueCategories` fait un DELETE puis
  // un INSERT, et le rejouer à chaque webhook ferait clignoter les catégories
  // sur tous les tableaux ouverts, par le temps réel, sans qu'il se passe rien.
  if (before.size === ids.length && ids.every((id) => before.has(id))) return;

  const result = await setIssueCategories({
    issueId,
    actorId: target.createdBy,
    categoryIds: ids,
    // La timeline crédite la forge, pas le owner qui a activé la synchro : ce
    // n'est pas lui qui a posé ce label.
    forgeSync: target.provider,
  });
  if (!result.ok) {
    console.error(
      `[issue-sync] categories failed for issue ${issueId}:`,
      result.errorKey ?? result.rawMessage,
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
    .is("deleted_at", null)
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

/** Une issue distante du backfill, telle que les deux forges la rendent. */
interface BackfilledIssue {
  number: number;
  title: string;
  body: string | null;
  url: string | null;
  labels: string[];
  assigneeLogins: string[];
}

/** Une issue distante, ramenée à la forme attendue par l'import en masse. */
function toImportedIssue(
  target: IssueSyncTarget,
  issue: BackfilledIssue,
  assignees: ForgeAssigneeIndex,
): ImportedIssue {
  // Les labels portent trois choses à la fois : la priorité, la taille, et le
  // reste — qui devient des catégories du projet.
  const { priority, effort, labels } = readForgeLabels(issue.labels);
  const resource = forgeIssueResource({
    provider: target.provider,
    repoFullName: target.repoFullName,
    number: issue.number,
    url: issue.url,
  });
  return {
    title: issue.title || `#${issue.number}`,
    description: issue.body,
    status: REMOTE_LANDING_STATUS,
    priority,
    effort,
    labels,
    // Le compte de forge redevient un membre du projet quand cette personne a
    // connecté le sien (MIN-144) — sinon `null`, et rien n'est deviné.
    assigneeId: matchForgeAssignee(issue.assigneeLogins, assignees),
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
    resources: resource ? [resource] : undefined,
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

  let remoteIssues: BackfilledIssue[];
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
      labels: i.labels,
      assigneeLogins: i.assigneeLogins,
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
      labels: i.labels,
      assigneeLogins: i.assigneeLogins,
    }));
  }

  const alreadyImported = await loadImportedNumbers(target);
  const fresh = remoteIssues.filter((i) => !alreadyImported.has(i.number));

  let created = 0;
  if (fresh.length > 0) {
    // Une seule construction d'index pour tout le lot : c'est deux requêtes,
    // là où le faire par ticket en ferait deux par ticket.
    const assignees = await buildForgeAssigneeIndex({
      projectId: target.projectId,
      provider: target.provider,
    });
    const result = await importIssuesIntoProject({
      projectId: target.projectId,
      actorId: target.createdBy,
      issues: fresh.map((i) => toImportedIssue(target, i, assignees)),
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
