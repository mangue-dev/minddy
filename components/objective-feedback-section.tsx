"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "@/components/app-link";
import { FeedbackStatusBadge } from "@/app/f/[token]/feedback-bits";
import type { IssueLinkedFeedback } from "@/lib/feedback/types";

export function ObjectiveFeedbackSection({ projectId, objectiveId }: {
  projectId: string;
  objectiveId: string;
}) {
  const t = useTranslations("Relations");
  const { data, isPending, error } = useQuery({
    queryKey: ["objective-feedback", projectId, objectiveId],
    queryFn: async (): Promise<{ feedback: IssueLinkedFeedback[] }> => {
      const response = await fetch(`/api/objectives/${objectiveId}/feedback`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load objective feedback");
      return response.json();
    },
  });
  const tc = useTranslations("Common");
  const te = useTranslations("ApiErrors");
  if (!isPending && !error && !data?.feedback.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{t("linkedFeedback")}</h3>
      {isPending ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{te("databaseError")}</p>
      ) : (
        <div className="flex flex-col">
          {data?.feedback.map((post) => (
            <Link key={post.id}
              href={`/projects/${projectId}/feedback?post=${encodeURIComponent(post.id)}`}
              className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1 truncate">{post.title}</span>
              <FeedbackStatusBadge status={post.status} />
              <span className="text-xs text-muted-foreground">{t("votes", { count: post.vote_count })}</span>
              {!post.is_public && (
                <span className="text-xs text-muted-foreground">{t("feedbackPrivate")}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
