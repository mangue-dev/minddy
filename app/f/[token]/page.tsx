import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
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
} from "@/lib/server/feedback/identity";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import {
  listPublicCategories,
  listPublicPosts,
  type PublicSort,
} from "@/lib/server/feedback/queries";
import { isFeedbackPostStatus, type PublicCategory } from "@/lib/feedback/types";
import { FeedbackBoardClient } from "./feedback-board-client";
import { HeaderIdentity } from "./header-identity";

/**
 * Board public de feedback (MIN-37) — anonyme en lecture, le token EST
 * l'autorisation. Toute écriture exige une identité (OTP ou SSO) mais reste
 * pseudonyme côté public. Board désactivé = 404 (la collecte continue par
 * les canaux API/interne). Le header porte les onglets du site public :
 * Feedback + les vues partagées du projet.
 */

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    sort?: string;
    status?: string;
    category?: string;
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
  // Le même board répond sur www.minddy.app/f/<token> ET sur le domaine du
  // client : le canonical dit laquelle des deux URLs fait foi (MIN-88).
  const canonical = await publicCanonicalUrl(
    feedbackBasePath(token, domainTarget),
    "",
  );
  // Board absent ou désactivé → la page part en 404 : elle en porte le titre,
  // et surtout pas un canonical vers une URL qui ne répond pas.
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
  // Domaine personnalisé (MIN-36) : basePath "" quand le board est servi par
  // son propre domaine — les liens deviennent /p/<id>, /me…
  const domainTarget = await getRequestDomainTarget();
  const base = feedbackBasePath(token, domainTarget);

  // Atterrissage SSO documenté : /f/<token>?sso=<jwt> — une page ne peut pas
  // poser de cookie, la route dédiée s'en charge puis revient ici.
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
  const status = isFeedbackPostStatus(search.status) ? search.status : null;
  const showCategories = ctx.board.show_categories;
  const activeCategory =
    showCategories && typeof search.category === "string" ? search.category : null;
  const [posts, categories] = await Promise.all([
    listPublicPosts({
      projectId: ctx.project.id,
      viewerId: session?.user.id ?? null,
      sort,
      status,
      includeCategories: showCategories,
      categoryId: activeCategory,
    }),
    showCategories
      ? listPublicCategories(ctx.project.id)
      : Promise.resolve<PublicCategory[]>([]),
  ]);
  const identity = session
    ? { pseudonym: session.user.pseudonym, email: session.user.email }
    : null;

  return (
    <PublicPageShell
      contained
      tabs={tabs}
      heading={
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb seed={ctx.project.id} iconUrl={ctx.project.icon_url} className="size-5 rounded-[6px]" />
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
          posts={posts}
          sort={sort}
          status={status}
          categories={categories}
          activeCategory={activeCategory}
          identity={identity}
          ssoError={search.ssoError === "1"}
        />
      </main>
    </PublicPageShell>
  );
}
