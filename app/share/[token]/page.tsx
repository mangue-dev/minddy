import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicBoard, type PublicCard } from "@/components/public-board";
import { PublicPageShell } from "@/components/public-page-shell";
import type { Locale } from "@/i18n/config";
import { appPageMetadata } from "@/lib/app-metadata";
import { publicTokenMetadata } from "@/lib/seo";
import { getRequestDomainTarget } from "@/lib/server/custom-domains";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import type { ChipRelation } from "@/components/relation-chips";
import { AppQueryProvider } from "@/lib/query-provider";
import { displayName } from "@/lib/display-name";
import { resolveRelations } from "@/lib/relation-constants";
import {
  publicCategoriesFor,
  publicObjectivesFor,
  toPublicIssue,
} from "@/lib/public-board-projection";
import { filterIssues, issueComparator, viewConfigOf } from "@/lib/view-filter";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  getPublicShareByToken,
  type PublicShareContext,
} from "@/lib/server/view-shares";
import { isShareUnlocked } from "@/lib/server/share-unlock";
import { getServiceClient } from "@/lib/supabase-service";
import type {
  Category,
  Issue,
  IssueCardCategory,
  IssueCardObjective,
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

/** A password share reveals NOTHING (not even the view name) until unlocked.
    The rule is written once for both public surfaces
    (lib/server/share-unlock.ts). */
async function isUnlocked(ctx: PublicShareContext): Promise<boolean> {
  return isShareUnlocked(ctx.share);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [ctx, t, locale] = await Promise.all([
    getShareContext(token),
    getTranslations("PublicShare"),
    getLocale(),
  ]);
  // Unknown token → the page goes to 404: it bears the title, whatever
  // either that of the two paths (metadata of the road or the border
  // not-found) que Next retient.
  if (!ctx) {
    return { ...(await appPageMetadata("notFound")), robots: { index: false, follow: false } };
  }
  // Locked, the page says neither the name of the view nor that of the project — it
  // only says that it is locked, which the visitor already sees.
  if (!(await isUnlocked(ctx))) {
    return publicTokenMetadata({
      title: t("protectedTitle"),
      description: t("metaProtectedDescription"),
      locale: locale as Locale,
    });
  }
  const project = ctx.project.name;
  return publicTokenMetadata({
    title: `${ctx.view.name} · ${project}`,
    description: t("metaDescription", { project }),
    locale: locale as Locale,
  });
}

/** Everything the read-only board needs, filtered to what the view shows and
    sanitized for anonymous visitors (no emails — Member.email stays null and
    full_name is pre-resolved through displayName).

    Everything that comes out of here is SERIALIZED into the HTML of the page (MIN-342):
    what this renders therefore passes through the projections of
    [lib/public-board-projection.ts](lib/public-board-projection.ts), and never
    by the baselines as is. */
async function loadBoardProps(ctx: PublicShareContext): Promise<{
  cards: PublicCard[];
  projectKey: string;
  members: Member[];
  categories: IssueCardCategory[];
  objectives: IssueCardObjective[];
}> {
  const { view, project } = ctx;
  const service = getServiceClient();

  const [issuesRes, relationsRes, categoriesRes, objectivesRes, membersRes] =
    await Promise.all([
      service
        .from("issues")
        .select(ISSUE_SELECT)
        .is("deleted_at", null)
        .eq("project_id", project.id)
        .order("position", { ascending: true })
        .order("number", { ascending: true }),
      service
        .from("issue_relations")
        .select("id, source_id, target_id, type")
        .eq("project_id", project.id),
      service.from("categories").select("*").eq("project_id", project.id),
      service.from("objectives").select("*").eq("project_id", project.id).is("deleted_at", null),
      service.from("project_members").select("user_id").eq("project_id", project.id),
    ]);

  const allIssues = (issuesRes.data ?? []).map(mapIssueRow) as unknown as Issue[];
  const relations = (relationsRes.data ?? []) as IssueRelation[];

  // An "@me" filter shares the SHARER's roadmap: it resolves against the view
  // owner's id (shared team views fall back to whoever created the share),
  // exactly like on their own board.
  const config = viewConfigOf(view);
  // The sorting belongs to the server: the comparator reads `position`, `created_at`
  // and `updated_at`, three fields that no card displays and which therefore have no
  // no reason to cross the border (MIN-342).
  const issues = filterIssues(allIssues, config, {
    myUserId: view.user_id ?? ctx.share.created_by,
  }).sort(issueComparator(config.sort));

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
      issue: toPublicIssue(issue),
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
  const [usersById, seeds] = await Promise.all([
    fetchAuthUsersById(service, memberIds),
    fetchAvatarSeeds(service, memberIds),
  ]);
  const members: Member[] = memberIds.map((id) => {
    const named = toNamed(usersById.get(id));
    return {
      user_id: id,
      email: null,
      full_name: displayName(named),
      avatar_seed: seeds.get(id) ?? id,
      role: id === project.owner_id ? "owner" : "member",
      is_owner: id === project.owner_id,
    };
  });

  const visibleIssues = cards.map((c) => c.issue);
  return {
    cards,
    projectKey: project.key,
    members,
    // The project tables do not output in full: only the lines that one
    // visible card quotes can be painted, so only those go.
    categories: publicCategoriesFor(
      (categoriesRes.data ?? []) as Category[],
      visibleIssues
    ),
    objectives: publicObjectivesFor(
      (objectivesRes.data ?? []) as Objective[],
      visibleIssues
    ),
  };
}

export default async function SharedViewPage({ params }: PageProps) {
  const { token } = await params;
  const ctx = await getShareContext(token);
  if (!ctx) notFound();
  const { view } = ctx;
  const unlocked = await isUnlocked(ctx);
  // The public project site: Feedback tab, shared views and published
  // pages. A view locked doesn't reveal anything about itself, but the site navigation remains.
  const tFeedback = await getTranslations("PublicFeedback");
  const tabs = await getPublicSiteTabs({
    projectId: ctx.project.id,
    feedbackLabel: tFeedback("title"),
    untitledLabel: tFeedback("untitledPage"),
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
