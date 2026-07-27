import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isRepoProviderId } from "@/lib/repo-providers";
import type { BranchCleanupTarget } from "@/lib/types";

/**
 * GET /api/me/branch-cleanup-targets — les projets où le ménage des branches
 * d'agent (MIN-102) a un sens, tous projets confondus. La command palette s'en
 * sert pour offrir l'action de n'importe où, pas seulement depuis le projet.
 *
 * Un projet est retenu s'il remplit les trois conditions du bouton des
 * paramètres : j'en suis le OWNER, un dépôt y est lié, et au moins un run
 * d'agent y a poussé une branche. Cette dernière condition se lit en base
 * (`agent_runs.branch_name`) : savoir s'il reste vraiment des branches à
 * supprimer demanderait d'interroger la forge pour chaque projet — bien trop
 * cher pour peupler une liste. Le dialogue, lui, le dit exactement.
 *
 * Tout passe par le client de l'appelant : RLS (`can_access_project`) borne
 * déjà la lecture à mes projets, et le filtre owner se fait sur `owner_id`.
 */

/** Route de peuplement de liste : jamais mise en cache par la plateforme. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const [projectsRes, linksRes] = await Promise.all([
    auth.supabase.from("projects").select("id, owner_id").is("deleted_at", null),
    auth.supabase
      .from("project_git_links")
      .select("project_id, provider, repo_full_name"),
  ]);

  const firstError = projectsRes.error || linksRes.error;
  if (firstError) {
    console.error("[api/me/branch-cleanup-targets] load failed:", firstError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const ownedIds = new Set(
    ((projectsRes.data ?? []) as { id: string; owner_id: string }[])
      .filter((p) => p.owner_id === auth.user.id)
      .map((p) => p.id),
  );

  const candidates = (
    (linksRes.data ?? []) as {
      project_id: string;
      provider: string;
      repo_full_name: string | null;
    }[]
  ).filter((l) => ownedIds.has(l.project_id) && isRepoProviderId(l.provider));

  // Une existence par projet candidat, en parallèle : `limit(1)` ne ramène qu'un
  // id là où un `select` global ramènerait un uuid par run. Les candidats se
  // comptent sur les doigts d'une main — un projet lié dont je suis owner.
  const withBranches = await Promise.all(
    candidates.map(async (link) => {
      const { data } = await auth.supabase
        .from("agent_runs")
        .select("id")
        .eq("project_id", link.project_id)
        .not("branch_name", "is", null)
        .limit(1);
      return (data ?? []).length > 0 ? link : null;
    }),
  );

  const targets: BranchCleanupTarget[] = withBranches
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => ({
      project_id: l.project_id,
      provider: l.provider as BranchCleanupTarget["provider"],
      repo_full_name: l.repo_full_name,
    }));

  return NextResponse.json({ targets });
}
