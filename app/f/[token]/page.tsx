import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { PublicPageShell } from "@/components/public-page-shell";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
} from "@/lib/server/feedback/identity";
import { listPublicPosts, type PublicSort } from "@/lib/server/feedback/queries";
import { FeedbackBoardClient } from "./feedback-board-client";

/**
 * Board public de feedback (MIN-37) — anonyme en lecture, le token EST
 * l'autorisation. Toute écriture exige une identité (OTP ou SSO) mais reste
 * pseudonyme côté public. Board désactivé = 404 (la collecte continue par
 * les canaux API/interne).
 */

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sort?: string; sso?: string; ssoError?: string }>;
};

const getBoardContext = cache(getBoardByToken);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const ctx = await getBoardContext(token);
  return {
    ...(ctx?.board.enabled ? { title: `${ctx.project.name} · Feedback` } : {}),
    robots: { index: false, follow: false },
  };
}

export default async function PublicFeedbackPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const search = await searchParams;

  // Atterrissage SSO documenté : /f/<token>?sso=<jwt> — une page ne peut pas
  // poser de cookie, la route dédiée s'en charge puis revient ici.
  if (search.sso) {
    redirect(`/f/${token}/sso?jwt=${encodeURIComponent(search.sso)}`);
  }

  const ctx = await getBoardContext(token);
  if (!ctx || !ctx.board.enabled) notFound();
  const t = await getTranslations("PublicFeedback");

  const cookie = (await cookies()).get(FEEDBACK_SESSION_COOKIE)?.value;
  const session = await getFeedbackSession(ctx.board.id, cookie);
  const sort: PublicSort = search.sort === "recent" ? "recent" : "top";
  const posts = await listPublicPosts({
    projectId: ctx.project.id,
    viewerId: session?.user.id ?? null,
    sort,
  });

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
        <FeedbackBoardClient
          token={token}
          posts={posts}
          sort={sort}
          identity={
            session ? { pseudonym: session.user.pseudonym, email: session.user.email } : null
          }
          ssoError={search.ssoError === "1"}
        />
      </main>
    </PublicPageShell>
  );
}
