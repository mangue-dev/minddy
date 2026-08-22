import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
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
 * Public page of a post (MIN-37). The URL of a merged duplicate redirects to
 * 308 towards the canonical — which bears the mention “merged since”, the status,
 * the team response and the union of votes.
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
  // The same feedback responds on www.minddy.app/f/<token>/p/<id> AND on the
  // client domain: the canonical says which one is authentic (MIN-88).
  const canonical = await publicCanonicalUrl(
    feedbackBasePath(token, domainTarget),
    `/p/${postId}`,
  );
  // Board absent or deactivated → the page goes to 404: it bears the title,
  // and especially not a canonical to an unresponsive URL.
  if (!ctx?.board.enabled) {
    return { ...(await appPageMetadata("notFound")), robots: { index: false, follow: false } };
  }
  const project = ctx.project.name;
  // This is THE page that we stick in a conversation (“vote for it”): it
  // bears the title of the return, not that of the board. A private post, waiting for
  // revised or merged is not named — see `getPublicPostMeta`.
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
      untitledLabel: t("untitledPage"),
      current: { kind: "feedback" },
      domainTarget,
    }),
  ]);
  const [detail, identity] = await Promise.all([
    getPublicPostDetail({
      projectId: ctx.project.id,
      postId,
      viewerId: session?.user.id ?? null,
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
        <FeedbackPostClient
          token={token}
          basePath={base}
          project={{
            id: ctx.project.id,
            name: ctx.project.name,
            iconUrl: ctx.project.icon_url,
            orbSeed: ctx.project.orb_seed,
          }}
          post={detail.post}
          mergedFromTitles={detail.mergedFromTitles}
          comments={detail.comments}
          allowComments={ctx.board.allow_comments}
          identity={identity}
        />
      </main>
    </PublicPageShell>
  );
}
