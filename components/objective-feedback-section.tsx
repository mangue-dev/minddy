"use client";

import { objectiveFeedbackCountOptions } from "@/lib/secondary-view-queries";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "@/components/app-link";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";

export function ObjectiveFeedbackSection({ projectId, objectiveId }: {
  projectId: string;
  objectiveId: string;
}) {
  const t = useTranslations("Relations");
  const { data, isPending, error } = useQuery(objectiveFeedbackCountOptions(projectId, objectiveId));

  const tc = useTranslations("Common");
  const te = useTranslations("ApiErrors");
  return (
    <PropertyRow label={t("linkedFeedback")}>
      {isPending ? <span className="text-sm text-muted-foreground">{tc("loading")}</span>
        : error ? <span role="alert" className="text-sm text-destructive">{te("databaseError")}</span>
        : <Link href={`/projects/${projectId}/feedback?objective=${encodeURIComponent(objectiveId)}`}
            className={`${TRIGGER} app-mobile:min-h-11 app-mobile:min-w-11 tabular-nums`}>{data?.count ?? 0}</Link>}
    </PropertyRow>
  );
}
