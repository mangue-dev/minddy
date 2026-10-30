"use client";

import { objectiveFeedbackCountOptions } from "@/lib/secondary-view-queries";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "@/components/app-link";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { cn } from "@/lib/utils";

export function ObjectiveFeedbackSection({ projectId, objectiveId }: {
  projectId: string;
  objectiveId: string;
}) {
  const t = useTranslations("Relations");
  const { data, isPending, error } = useQuery(objectiveFeedbackCountOptions(projectId, objectiveId));

  const te = useTranslations("ApiErrors");
  // No feedback, no row: an empty count says nothing (nor does it while it
  // loads, rather than showing a row that may vanish).
  if (!error && (isPending || !data?.count)) return null;
  return (
    <PropertyRow label={t("linkedFeedback")}>
      {error ? <span role="alert" className="text-sm text-destructive">{te("databaseError")}</span>
        : <Link href={`/projects/${projectId}/feedback?objective=${encodeURIComponent(objectiveId)}`}
            // The rows' "+" and link buttons are 28px wide: a 10px right
            // padding centers the count's last digit on their icons.
            className={cn(TRIGGER, "pr-2.5 app-mobile:min-h-11 app-mobile:min-w-11 app-mobile:justify-end tabular-nums")}>{data?.count}</Link>}
    </PropertyRow>
  );
}
