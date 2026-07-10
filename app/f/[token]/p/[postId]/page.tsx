import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { PublicPageShell } from "@/components/public-page-shell";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
} from "@/lib/server/feedback/identity";
import { getPublicPostDetail } from "@/lib/server/feedback/queries";
import { FeedbackPostClient } from "../../feedback-post-client";

/**
 * Page publique d'un post (MIN-37). L'URL d'un doublon fusionné redirige en
 * 308 vers le canonique — qui porte la mention « fusionné depuis », le statut,
 * la réponse d'équipe et l'union des votes.
 */

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string; postId: string }> };

const getBoardContext = cache(getBoardByToken);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const ctx = await getBoardContext(token);
  return {
    ...(ctx?.board.enabled ? { title: `${ctx.project.name} · Feedback` } : {}),
    robots: { index: false, follow: false },
  };
}

export default async function PublicFeedbackPostPage({ params }: PageProps) {
  const { token, postId } = await params;
  const ctx = await getBoardContext(token);
  if (!ctx || !ctx.board.enabled) notFound();
  const t = await getTranslations("PublicFeedback");

  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const session = await getFeedbackSession(ctx.board.id, cookie);
  const detail = await getPublicPostDetail({
    projectId: ctx.project.id,
    postId,
    viewerId: session?.user.id ?? null,
  });
  if (!detail) notFound();
  if (detail.mergedIntoId) {
    permanentRedirect(`/f/${token}/p/${detail.mergedIntoId}`);
  }

  return (
    <PublicPageShell
      heading={
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb seed={ctx.project.id} className="size-5 rounded-[6px]" />
          <h1 className="min-w-0 truncate text-sm font-semibold">{ctx.project.name}</h1>
          <span className="shrink-0 text-sm text-muted-foreground">· {t("title")}</span>
        </div>
      }
    >
      <main className="min-h-0 flex-1">
        <FeedbackPostClient
          token={token}
          projectName={ctx.project.name}
          post={detail.post}
          facets={detail.facets}
          mergedFromTitles={detail.mergedFromTitles}
          identity={
            session ? { pseudonym: session.user.pseudonym, email: session.user.email } : null
          }
        />
      </main>
    </PublicPageShell>
  );
}
