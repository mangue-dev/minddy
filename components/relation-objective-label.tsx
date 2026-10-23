"use client";

import { useTranslations } from "next-intl";
import { ObjectiveBadge } from "@/components/objective-label";
import type { Objective } from "@/lib/types";

/**
 * Objectives have no issue identifier: a relation names one by its pill —
 * status glyph and name, tinted in its color (MIN-785). The tooltip keeps the
 * full name, which a long one truncates.
 */
export function RelationObjectiveLabel({
  objective,
}: {
  objective: Objective;
}) {
  const t = useTranslations("Relations");
  return (
    <>
      <span className="sr-only">{t("objectives")}: </span>
      <ObjectiveBadge objective={objective} tooltip={objective.name} />
    </>
  );
}
