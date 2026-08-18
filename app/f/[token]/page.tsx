import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { PublicPageShell } from "@/components/public-page-shell";
import type { Locale } from "@/i18n/config";
import { appPageMetadata } from "@/lib/app-metadata";
import { publicTokenMetadata } from "@/lib/seo";
import {
  feedbackBasePath,
  getRequestDomainTarget,
  publicCanonicalUrl,
} from "@/lib/server/custom-domains";
import { getBoardContext } from "@/lib/server/feedback/board-context";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
  toPublicIdentity,
} from "@/lib/server/feedback/identity";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import {
  hasAnyPublicPost,
  listPublicPosts,
  type PublicSort,
} from "@/lib/server/feedback/queries";
import {
  FEEDBACK_PUBLIC_STATUSES,
  isFeedbackPostStatus,
  publicFilterStatuses,
  type PublicStatusFilter,
} from "@/lib/feedback/types";
import { FeedbackBoardClient } from "./feedback-board-client";
import { HeaderIdentity } from "./header-identity";

/**
 * Public feedback board (MIN-37) — anonymous for reading, the EST token
 * authorization. All writing requires an identity (OTP or SSO) but remains
 * pseudonym on the public side. Board disabled = 404 (collection continues through
 * API/internal channels). The header carries the tabs of the public site:
 * Feedback + shared views of the project.
 */

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    sort?: string;
    status?: string;
    sso?: string;
    ssoError?: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [ctx, domainTarget, t, locale] = await Promise.all([
    getBoardContext(token),
    getRequestDomainTarget(),
    getTranslations("PublicFeedback"),
    getLocale(),
  ]);
  // The same board responds on www.minddy.app/f/<token> AND on the domain
  // client: the canonical says which of the two URLs is authentic (MIN-88).
  const canonical = await publicCanonicalUrl(
    feedbackBasePath(token, domainTarget),
    "",
  );
  // Board absent or deactivated → the page goes to 404: it bears the title,
  // and especially not a canonical to an unresponsive URL.
  if (!ctx?.board.enabled) {
    return { ...(await appPageMetadata("notFound")), robots: { index: false, follow: false } };
  }
  const project = ctx.project.name;
  return publicTokenMetadata({
    title: `${t("title")} · ${project}`,
    description: t("metaBoardDescription", { project }),
    canonical,
    locale: locale as Locale,
  });
}

export default async function PublicFeedbackPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const search = await searchParams;
  // Custom domain (MIN-36): basePath "" when the board is served by
  // its own domain — the links become /p/<id>, /me…
  const domainTarget = await getRequestDomainTarget();
  const base = feedbackBasePath(token, domainTarget);

  // Documented SSO landing: /f/<token>?sso=<jwt> — a page cannot
  // place a cookie, the dedicated route takes care of it and then comes back here.
  if (search.sso) {
    redirect(`${base}/sso?jwt=${encodeURIComponent(search.sso)}`);
  }

  const ctx = await getBoardContext(token);
  if (!ctx || !ctx.board.enabled) notFound();
  const t = await getTranslations("PublicFeedback");

  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const [session, tabs] = await Promise.all([
    getFeedbackSession(ctx.board.id, cookie),
    getPublicSiteTabs({
      projectId: ctx.project.id,
      feedbackLabel: t("title"),
      current: { kind: "feedback" },
      domainTarget,
    }),
  ]);
  const sort: PublicSort = search.sort === "recent" ? "recent" : "top";
  // Only the statuses that the board knows how to name, plus “all”: `?status=spam`
  // is not a filter, it is a question that the page has nothing to do with
  // answer. Everything else — including the absent parameter — falls on the
  // default: returns still alive.
  const filter: PublicStatusFilter =
    search.status === "all"
      ? "all"
      : isFeedbackPostStatus(search.status) &&
          FEEDBACK_PUBLIC_STATUSES.includes(search.status)
        ? search.status
        : null;
  const [posts, identity] = await Promise.all([
    listPublicPosts({
      projectId: ctx.project.id,
      viewerId: session?.user.id ?? null,
      sort,
      statuses: publicFilterStatuses(filter),
    }),
    toPublicIdentity(session),
  ]);
  // One more reading, and only when there is nothing to show: it
  // decides which of the two voids the board announces.
  const boardEmpty = posts.length === 0 ? !(await hasAnyPublicPost(ctx.project.id)) : false;

  return (
    <PublicPageShell
      contained
      tabs={tabs}
      heading={
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb seed={projectOrbSeed(ctx.project)} iconUrl={ctx.project.icon_url} className="size-5 rounded-[6px]" />
          <h1 className="min-w-0 truncate text-sm font-semibold">{ctx.project.name}</h1>
          {tabs.length === 0 && (
            <span className="shrink-0 text-sm text-muted-foreground">· {t("title")}</span>
          )}
        </div>
      }
      actions={<HeaderIdentity token={token} basePath={base} identity={identity} />}
    >
      <main className="min-h-0 flex-1">
        <FeedbackBoardClient
          token={token}
          basePath={base}
          project={{
            id: ctx.project.id,
            name: ctx.project.name,
            iconUrl: ctx.project.icon_url,
            orbSeed: ctx.project.orb_seed,
          }}
          posts={posts}
          sort={sort}
          filter={filter}
          boardEmpty={boardEmpty}
          identity={identity}
          ssoError={search.ssoError === "1"}
        />
      </main>
    </PublicPageShell>
  );
}
