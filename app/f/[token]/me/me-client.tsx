"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { ArrowLeft, Ban, Clock, GitMerge, Lock, UserRound } from "lucide-react";
import type { PublicIdentity, PublicPost } from "@/lib/feedback/types";
import { FeedbackAuthDialog } from "../feedback-auth";
import { FeedbackStatusBadge } from "../feedback-bits";

export interface MyFeedbackItem {
  post: PublicPost;
  relation: "authored" | "voted";
  mergedFromTitle: string | null;
}

/** « Mes feedbacks » (MIN-37) : suivi pull-based de ses posts et votes, avec
    avancement — y compris après merge (le canonique est suivi à la place). */
export function MyFeedbackClient({
  token,
  basePath,
  identity,
  entries,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  identity: PublicIdentity | null;
  entries: MyFeedbackItem[];
}) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-2 desktop:px-0">
      <Link
        href={basePath || "/"}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("back")}
      </Link>

      {!identity ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <UserRound className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("meSignInPrompt")}</p>
          <Button variant="outline" onClick={() => setAuthOpen(true)}>
            {t("signIn")}
          </Button>
          <FeedbackAuthDialog token={token} open={authOpen} onOpenChange={setAuthOpen} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">{t("myFeedback")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("meIntro", { pseudonym: identity.pseudonym })}
            </p>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("meEmpty")}</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {entries.map((entry) => (
                <li key={`${entry.relation}:${entry.post.id}`}>
                  <Link
                    href={`${basePath}/p/${entry.post.id}`}
                    className="group flex flex-col gap-1 py-3"
                  >
                    <p className="text-sm font-medium leading-snug group-hover:text-brand">
                      {entry.post.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {/* Un retour écarté par la modération ne dit pas « spam »
                          à celui qui l'a écrit — c'est le mot de l'équipe, pas
                          une réponse à un visiteur. Il lit « non publié ». */}
                      {entry.post.status === "spam" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                          <Ban className="size-2.5" />
                          {t("rejected")}
                        </span>
                      ) : (
                        <FeedbackStatusBadge status={entry.post.status} />
                      )}
                      {!entry.post.isPublic && (
                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                          <Lock className="size-2.5" />
                          {t("private")}
                        </span>
                      )}
                      {/* Revue avant publication (MIN-54) : l'auteur voit son
                          retour en attente tant qu'il n'est pas publié. */}
                      {entry.relation === "authored" &&
                        entry.post.isPublic &&
                        entry.post.reviewState === "pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
                            <Clock className="size-2.5" />
                            {t("pendingReview")}
                          </span>
                        )}
                      <span>
                        {entry.relation === "authored" ? t("meAuthored") : t("meVoted")}
                      </span>
                      <span>▲ {entry.post.voteCount}</span>
                      <span>
                        {format.dateTime(new Date(entry.post.createdAt), {
                          dateStyle: "medium",
                        })}
                      </span>
                    </div>
                    {entry.mergedFromTitle && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitMerge className="size-3" />
                        {t("meMergedFrom", { title: entry.mergedFromTitle })}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
