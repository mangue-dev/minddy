import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { PublicPageShell } from "@/components/public-page-shell";
import type { Locale } from "@/i18n/config";
import { appPageMetadata } from "@/lib/app-metadata";
import { metaExcerpt, publicTokenMetadata } from "@/lib/seo";
import {
  feedbackBasePath,
  getRequestDomainTarget,
  publicCanonicalUrl,
} from "@/lib/server/custom-domains";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
  toPublicIdentity,
} from "@/lib/server/feedback/identity";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import {
  getPublicPostDetail,
  getPublicPostMeta,
} from "@/lib/server/feedback/queries";
import { FeedbackPostClient } from "../../feedback-post-client";
import { HeaderIdentity } from "../../header-identity";

/**
 * Page publique d'un post (MIN-37). L'URL d'un doublon fusionné redirige en
 * 308 vers le canonique — qui porte la mention « fusionné depuis », le statut,
 * la réponse d'équipe et l'union des votes.
 */

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string; postId: string }> };

const getBoardContext = cache(getBoardByToken);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, postId } = await params;
  const [ctx, domainTarget, t, locale] = await Promise.all([
    getBoardContext(token),
    getRequestDomainTarget(),
    getTranslations("PublicFeedback"),
    getLocale(),
  ]);
  // Le même retour répond sur www.minddy.app/f/<token>/p/<id> ET sur le
  // domaine du client : le canonical dit laquelle fait foi (MIN-88).
  const canonical = await publicCanonicalUrl(
    feedbackBasePath(token, domainTarget),
    `/p/${postId}`,
  );
  // Board absent ou désactivé → la page part en 404 : elle en porte le titre,
  // et surtout pas un canonical vers une URL qui ne répond pas.
  if (!ctx?.board.enabled) {
    return { ...(await appPageMetadata("notFound")), robots: { index: false, follow: false } };
  }
  const project = ctx.project.name;
  // C'est LA page qu'on colle dans une conversation (« vote pour ça ») : elle
  // porte le titre du retour, pas celui du board. Un post privé, en attente de
  // revue ou fusionné ne se nomme pas — voir `getPublicPostMeta`.
  const post = await getPublicPostMeta(ctx.project.id, postId);
  return publicTokenMetadata({
    title: post ? `${post.title} · ${project}` : `${t("title")} · ${project}`,
    description:
      post && post.body.trim()
        ? metaExcerpt(post.body)
        : t("metaPostDescription", { project }),
    canonical,
    locale: locale as Locale,
  });
}

export default async function PublicFeedbackPostPage({ params }: PageProps) {
  const { token, postId } = await params;
  const ctx = await getBoardContext(token);
  if (!ctx || !ctx.board.enabled) notFound();
  const t = await getTranslations("PublicFeedback");
  const domainTarget = await getRequestDomainTarget();
  const base = feedbackBasePath(token, domainTarget);

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
  const [detail, identity] = await Promise.all([
    getPublicPostDetail({
      projectId: ctx.project.id,
      postId,
      viewerId: session?.user.id ?? null,
      includeCategories: ctx.board.show_categories,
    }),
    toPublicIdentity(session),
  ]);
  if (!detail) notFound();
  if (detail.mergedIntoId) {
    permanentRedirect(`${base}/p/${detail.mergedIntoId}`);
  }

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
        <FeedbackPostClient
          token={token}
          basePath={base}
          projectName={ctx.project.name}
          post={detail.post}
          mergedFromTitles={detail.mergedFromTitles}
          identity={identity}
        />
      </main>
    </PublicPageShell>
  );
}
