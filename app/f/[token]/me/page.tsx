import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectOrb } from "@/components/project-orb";
import { PublicPageShell } from "@/components/public-page-shell";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import {
  FEEDBACK_SESSION_COOKIE,
  getFeedbackSession,
} from "@/lib/server/feedback/identity";
import { getPublicSiteTabs } from "@/lib/server/feedback/public-nav";
import { listMyFeedback } from "@/lib/server/feedback/queries";
import { HeaderIdentity } from "../header-identity";
import { MyFeedbackClient, type MyFeedbackItem } from "./me-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

const getBoardContext = cache(getBoardByToken);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const ctx = await getBoardContext(token);
  return {
    ...(ctx?.board.enabled ? { title: `${ctx.project.name} · Feedback` } : {}),
    robots: { index: false, follow: false },
  };
}

export default async function MyFeedbackPage({ params }: PageProps) {
  const { token } = await params;
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
    }),
  ]);
  const entries: MyFeedbackItem[] = session
    ? await listMyFeedback({ projectId: ctx.project.id, viewerId: session.user.id })
    : [];
  const identity = session
    ? { pseudonym: session.user.pseudonym, email: session.user.email }
    : null;

  return (
    <PublicPageShell
      contained
      tabs={tabs}
      heading={
        <div className="flex min-w-0 items-center gap-2">
          <ProjectOrb seed={ctx.project.id} className="size-5 rounded-[6px]" />
          <h1 className="min-w-0 truncate text-sm font-semibold">{ctx.project.name}</h1>
          {tabs.length === 0 && (
            <span className="shrink-0 text-sm text-muted-foreground">· {t("title")}</span>
          )}
        </div>
      }
      actions={<HeaderIdentity token={token} identity={identity} />}
    >
      <main className="min-h-0 flex-1">
        <MyFeedbackClient token={token} identity={identity} entries={entries} />
      </main>
    </PublicPageShell>
  );
}
