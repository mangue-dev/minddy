"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "mangue-ui";
import { Clock, GitMerge, UserRound } from "lucide-react";
import type { PublicIdentity, PublicPost, PublicProject } from "@/lib/feedback/types";
import { FeedbackAuthDialog } from "../feedback-auth";
import { BackToBoardLink, FeedbackPostRow, UnpublishedBadge } from "../feedback-bits";

export interface MyFeedbackItem {
  post: PublicPost;
  relation: "authored" | "voted";
  mergedFromTitle: string | null;
}

/** « Mes feedbacks » (MIN-37) : suivi pull-based de ses posts et votes, avec
    avancement — y compris après merge (le canonique est suivi à la place).

    La ligne est celle du board, à l'identique (`FeedbackPostRow`) : c'est le
    même retour, on peut y voter d'ici comme de là-bas, et ce qui n'appartient
    qu'à cette page — privé, en vérification, écrit ou voté — s'ajoute à la ligne
    de méta au lieu de lui inventer une deuxième forme. */
export function MyFeedbackClient({
  token,
  basePath,
  project,
  identity,
  entries,
}: {
  token: string;
  /** Préfixe public des liens : /f/<token>, ou "" sur domaine personnalisé. */
  basePath: string;
  /** Le produit : nom (infobulles d'état) et icône (badge « L'équipe a répondu »). */
  project: PublicProject;
  identity: PublicIdentity | null;
  entries: MyFeedbackItem[];
}) {
  const t = useTranslations("PublicFeedback");
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-5 desktop:px-0">
      <BackToBoardLink basePath={basePath} />

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
          {/* Le pseudonyme ne se dit plus ici : il ne s'affiche NULLE PART côté
              public — ni sur une ligne du board, ni sur la page d'un retour.
              L'annoncer était promettre au visiteur qu'il verrait ce nom
              quelque part, et l'envoyer le chercher pour rien. */}
          <h2 className="text-base font-semibold">{t("myFeedback")}</h2>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("meEmpty")}</p>
            </div>
          ) : (
            <ul className="-mx-3 flex flex-col gap-0.5">
              {entries.map((entry) => (
                <FeedbackPostRow
                  key={`${entry.relation}:${entry.post.id}`}
                  token={token}
                  href={`${basePath}/p/${entry.post.id}`}
                  post={entry.post}
                  project={project}
                  statusBadge={
                    // Absent du board, quelle qu'en soit la raison : gardé privé
                    // par son auteur, ou écarté par la modération. Les deux se
                    // disent du même mot. « Spam » est le vocabulaire de
                    // l'équipe et pas une réponse à un visiteur ; et un badge
                    // « Privé » posé à côté du statut faisait deux étiquettes
                    // pour une seule idée — c'est le STATUT qui est « non
                    // publié ».
                    entry.post.status === "spam" || !entry.post.isPublic ? (
                      <UnpublishedBadge projectName={project.name} />
                    ) : undefined
                  }
                  meta={
                    <>
                      {/* Revue avant publication (MIN-54) : l'auteur voit son
                          retour en attente tant qu'il n'est pas publié. */}
                      {entry.relation === "authored" &&
                        entry.post.isPublic &&
                        entry.post.reviewState === "pending" && (
                          <Badge variant="secondary" icon={<Clock />}>
                            {t("pendingReview")}
                          </Badge>
                        )}
                      <span>
                        {entry.relation === "authored" ? t("meAuthored") : t("meVoted")}
                      </span>
                    </>
                  }
                  footer={
                    entry.mergedFromTitle ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitMerge className="size-3" />
                        {t("meMergedFrom", { title: entry.mergedFromTitle })}
                      </p>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
