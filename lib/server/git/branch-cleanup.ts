import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { issueIdentifier } from "@/lib/issue-constants";
import type { RepoProviderId } from "@/lib/repo-providers";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor } from "@/lib/server/agent/forge";
import { selectStaleBranches, type StaleBranch } from "./branch-cleanup-core";

/**
 * Ménage des branches d'agent (MIN-102) : lister les branches poussées par les
 * runs du projet dont la PR/MR est fermée, puis les supprimer chez la forge.
 *
 * Le client n'est JAMAIS cru : `deleteStaleBranches` recalcule l'aperçu et
 * n'accepte que son intersection. Envoyer `main` dans le POST ne supprime donc
 * rien, même avec les droits owner — la liste servie est la seule autorité.
 *
 * Client service : on lit `agent_runs` de tous les runs du projet (y compris
 * ceux d'autres membres) et on mint un token de forge ; le contrôle d'accès est
 * fait par la route appelante (owner du projet uniquement).
 */

/** Le ticket derrière une branche d'agent (null pour un run carnet, MIN-84). */
export interface BranchIssueRef {
  issueId: string;
  identifier: string;
  title: string;
}

/** Une branche de l'aperçu : la sélection pure + le ticket qui l'a produite. */
export interface StaleBranchInfo extends StaleBranch {
  issue: BranchIssueRef | null;
}

export interface StaleBranchesPreview {
  provider: RepoProviderId;
  repoFullName: string;
  branches: StaleBranchInfo[];
  /** La liste des PR a été tronquée : l'aperçu n'est pas exhaustif. */
  truncated: boolean;
}

/** Résultat de la suppression d'UNE branche — rendu tel quel dans l'UI. */
export interface BranchDeletionResult {
  branch: string;
  ok: boolean;
  /** La référence n'existait déjà plus : succès, pas panne. */
  alreadyGone?: boolean;
  error?: string;
}

interface RunRow {
  branch_name: string | null;
  issue_id: string | null;
  issues: { id: string; number: number; title: string } | null;
}

/**
 * Branches enregistrées par les runs d'agent du projet → le ticket qui les a
 * produites (null pour un run carnet, qui n'a pas d'issue). C'est la liste des
 * branches que minddy s'autorise à toucher : tout ce qui n'y est pas appartient
 * à quelqu'un d'autre.
 */
export async function listAgentBranchesForProject(
  projectId: string,
): Promise<Map<string, BranchIssueRef | null>> {
  const supabase = getServiceClient();

  const [{ data: project }, { data: runs }] = await Promise.all([
    supabase.from("projects").select("key").eq("id", projectId).maybeSingle(),
    supabase
      .from("agent_runs")
      .select("branch_name, issue_id, issues(id, number, title)")
      .eq("project_id", projectId)
      .not("branch_name", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const projectKey = (project as { key?: string } | null)?.key ?? "";
  const map = new Map<string, BranchIssueRef | null>();
  for (const row of (runs ?? []) as unknown as RunRow[]) {
    const branch = row.branch_name;
    if (!branch || map.has(branch)) continue;
    const issue = row.issues;
    map.set(
      branch,
      issue
        ? {
            issueId: issue.id,
            identifier: issueIdentifier(projectKey, issue.number),
            title: issue.title,
          }
        : null,
    );
  }
  return map;
}

type CloneTarget = NonNullable<Awaited<ReturnType<typeof resolveRepoCloneTarget>>>;

/** L'aperçu à partir d'une cible DÉJÀ résolue — la suppression réutilise la
    sienne plutôt que de minter un second token pour le même ménage. */
async function previewFor(
  projectId: string,
  target: CloneTarget,
): Promise<StaleBranchesPreview> {
  const [known, { pulls, truncated }] = await Promise.all([
    listAgentBranchesForProject(projectId),
    forgeFor(target.provider).listPullRequests({
      token: target.token,
      repoFullName: target.repoFullName,
    }),
  ]);

  const branches = selectStaleBranches({
    pulls,
    knownBranches: new Set(known.keys()),
    defaultBranch: target.defaultBranch,
  }).map((b) => ({ ...b, issue: known.get(b.branch) ?? null }));

  return {
    provider: target.provider,
    repoFullName: target.repoFullName,
    branches,
    truncated,
  };
}

/**
 * Aperçu des branches nettoyables du projet, ou null s'il n'a aucun dépôt lié.
 * Lève les erreurs de la forge (la route les traduit en 502).
 */
export async function previewStaleBranches(
  projectId: string,
): Promise<StaleBranchesPreview | null> {
  const target = await resolveRepoCloneTarget(projectId);
  if (!target) return null;
  return previewFor(projectId, target);
}

/**
 * Supprime les branches demandées, une par une et EN SÉQUENCE (l'API de la forge
 * n'aime pas les rafales, et un échec ne doit pas emporter les suivantes).
 *
 * Recalcule l'aperçu et n'accepte que son intersection : une branche absente de
 * la liste servie ressort en échec explicite plutôt que d'être supprimée sur
 * parole. Renvoie null si le projet n'a pas (ou plus) de dépôt lié.
 */
export async function deleteStaleBranches(
  projectId: string,
  branches: string[],
): Promise<BranchDeletionResult[] | null> {
  const target = await resolveRepoCloneTarget(projectId);
  if (!target) return null;

  const preview = await previewFor(projectId, target);
  const forge = forgeFor(target.provider);
  const allowed = new Set(preview.branches.map((b) => b.branch));

  const results: BranchDeletionResult[] = [];
  for (const branch of branches) {
    if (!allowed.has(branch)) {
      results.push({ branch, ok: false, error: "Branch is not eligible for cleanup" });
      continue;
    }
    try {
      const outcome = await forge.deleteBranch({
        token: target.token,
        repoFullName: target.repoFullName,
        branch,
      });
      results.push({
        branch,
        ok: true,
        ...(outcome === "already-gone" ? { alreadyGone: true } : {}),
      });
    } catch (err) {
      results.push({ branch, ok: false, error: (err as Error).message });
    }
  }
  return results;
}
