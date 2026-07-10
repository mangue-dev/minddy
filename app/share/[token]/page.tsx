import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublicBoard, type PublicCard } from "@/components/public-board";
import { PublicPageShell } from "@/components/public-page-shell";
import { getRequestDomainTarget } from "@/lib/server/custom-domains";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import type { ChipRelation } from "@/components/relation-chips";
import { AppQueryProvider } from "@/lib/query-provider";
import { displayName } from "@/lib/display-name";
import { resolveRelations } from "@/lib/relation-constants";
import { filterIssues, viewConfigOf } from "@/lib/view-filter";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  SHARE_UNLOCK_COOKIE,
  getPublicShareByToken,
  unlockCookieValue,
  type PublicShareContext,
} from "@/lib/server/view-shares";
import { getServiceClient } from "@/lib/supabase-service";
import type {
  Category,
  Issue,
  IssueRelation,
  Member,
  Objective,
} from "@/lib/types";
import { PasswordForm } from "./password-form";

/**
 * Public read-only view of a shared kanban (MIN-26). Anonymous — the token IS
 * the authorization (plus the unlock cookie for password shares); every read
 * goes through the service client, and the view's filters run server-side so
 * hidden issues never reach the visitor.
 */

// Reads cookies and live share state on every request.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

// Deduped between generateMetadata and the page render.
const getShareContext = cache(getPublicShareByToken);

/** A password share reveals NOTHING (not even the view name) until unlocked. */
async function isUnlocked(ctx: PublicShareContext): Promise<boolean> {
  if (ctx.share.level === "public") return true;
  if (!ctx.share.password_hash) return false;
  const cookie = (await cookies()).get(SHARE_UNLOCK_COOKIE)?.value;
  return cookie === unlockCookieValue(ctx.share.token, ctx.share.password_hash);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const ctx = await getShareContext(token);
  // Omit (don't set undefined — that drops the tag) the title while locked so
  // the tab falls back to the root default and reveals nothing.
  const unlocked = ctx ? await isUnlocked(ctx) : false;
  return {
    ...(ctx && unlocked ? { title: ctx.view.name } : {}),
    robots: { index: false, follow: false },
  };
}

/** Everything the read-only board needs, filtered to what the view shows and
    sanitized for anonymous visitors (no emails — Member.email stays null and
    full_name is pre-resolved through displayName). */
async function loadBoardProps(ctx: PublicShareContext): Promise<{
  cards: PublicCard[];
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
}> {
  const { view, project } = ctx;
  const service = getServiceClient();

  const [issuesRes, relationsRes, categoriesRes, objectivesRes, membersRes] =
    await Promise.all([
      service
        .from("issues")
        .select(ISSUE_SELECT)
        .eq("project_id", project.id)
        .order("position", { ascending: true })
        .order("number", { ascending: true }),
      service
        .from("issue_relations")
        .select("id, source_id, target_id, type")
        .eq("project_id", project.id),
      service.from("categories").select("*").eq("project_id", project.id),
      service.from("objectives").select("*").eq("project_id", project.id),
      service.from("project_members").select("user_id").eq("project_id", project.id),
    ]);

  const allIssues = (issuesRes.data ?? []).map(mapIssueRow) as unknown as Issue[];
  const relations = (relationsRes.data ?? []) as IssueRelation[];

  // An "@me" filter shares the SHARER's roadmap: it resolves against the view
  // owner's id (shared team views fall back to whoever created the share),
  // exactly like on their own board.
  const config = viewConfigOf(view);
  const issues = filterIssues(allIssues, config, {
    myUserId: view.user_id ?? ctx.share.created_by,
  });

  // Parent identifiers and relation chips resolve against ALL issues (a filter
  // may hide the other end), mirroring KanbanBoard — resolved here so the full
  // issue list never reaches the client.
  const allIssueMap = new Map(allIssues.map((i) => [i.id, i]));
  const statusById = new Map(allIssues.map((i) => [i.id, i.status]));
  const cards: PublicCard[] = issues.map((issue) => {
    const parent = issue.parent_id ? allIssueMap.get(issue.parent_id) : undefined;
    const chips = resolveRelations(issue.id, relations, statusById)
      .map((r) => {
        const other = allIssueMap.get(r.otherId);
        return other ? { ...r, otherNumber: other.number } : null;
      })
      .filter((r): r is ChipRelation => r !== null);
    return {
      issue,
      parentNumber: parent?.number,
      relations: chips.length > 0 ? chips : undefined,
    };
  });

  const memberIds = [
    ...new Set([
      project.owner_id,
      ...(membersRes.data ?? []).map((m) => m.user_id as string),
    ]),
  ];
  const usersById = await fetchAuthUsersById(service, memberIds);
  const members: Member[] = memberIds.map((id) => {
    const named = toNamed(usersById.get(id));
    return {
      user_id: id,
      email: null,
      full_name: displayName(named),
      avatar_url: named.avatar_url,
      role: id === project.owner_id ? "owner" : "member",
      is_owner: id === project.owner_id,
    };
  });

  return {
    cards,
    projectKey: project.key,
    members,
    categories: (categoriesRes.data ?? []) as Category[],
    objectives: (objectivesRes.data ?? []) as Objective[],
  };
}

export default async function SharedViewPage({ params }: PageProps) {
  const { token } = await params;
  const ctx = await getShareContext(token);
  if (!ctx) notFound();
  const { view } = ctx;
  const unlocked = await isUnlocked(ctx);
  // Le site public du projet : onglets Feedback + vues partagées. Une vue
  // verrouillée ne révèle rien d'elle-même, mais la navigation du site reste.
  const tFeedback = await getTranslations("PublicFeedback");
  const tabs = await getPublicSiteTabs({
    projectId: ctx.project.id,
    feedbackLabel: tFeedback("title"),
    current: { kind: "view", shareToken: token },
    domainTarget: await getRequestDomainTarget(),
  });

  return (
    <PublicPageShell
      fullHeight
      tabs={tabs}
      // The password gate shows nothing about the view, not even its name.
      heading={
        unlocked ? (
          <h1 className="min-w-0 truncate text-sm font-semibold">{view.name}</h1>
        ) : undefined
      }
    >
      {unlocked ? (
        <main className="min-h-0 flex-1 px-4 pb-4 desktop:px-6">
          {/* IssueCardBody's integration indicator uses React Query — the
              anonymous fetch 401s harmlessly, but the provider must exist. */}
          <AppQueryProvider>
            <PublicBoard {...await loadBoardProps(ctx)} config={viewConfigOf(view)} />
          </AppQueryProvider>
        </main>
      ) : (
        <main className="flex flex-1 items-center justify-center p-6">
          <PasswordForm token={token} />
        </main>
      )}
    </PublicPageShell>
  );
}
