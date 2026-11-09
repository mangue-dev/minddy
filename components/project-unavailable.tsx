"use client";

import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ReadFailureNotice } from "@/components/read-failure-notice";
import type { ProjectLookup } from "@/lib/use-project-lookup";

/**
 * What a project screen shows when its project is not in the viewer's list,
 * once `useProjectLookup` has an answer: "Project not found" only for a
 * confirmed absence, a retryable notice when the list could not be read
 * (MIN-937). The screens keep their own skeleton for the `loading` state.
 */
export function ProjectUnavailable({ lookup }: { lookup: Pick<ProjectLookup, "state" | "error" | "retry"> }) {
  const t = useTranslations("Board");
  if (lookup.state === "error") {
    return (
      <ReadFailureNotice
        error={lookup.error}
        className="px-6 py-20"
        message={t("projectLoadError")}
        retryLabel={t("readRetry")}
        onRetry={lookup.retry}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <h1 className="font-display text-xl font-semibold">{t("projectNotFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("projectNotFoundDescription")}</p>
      <Button asChild variant="outline">
        <Link href="/home">{t("backToHome")}</Link>
      </Button>
    </div>
  );
}
