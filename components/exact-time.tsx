"use client";

import type { ReactElement } from "react";
import { useFormatter } from "next-intl";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * A relative date of an activity log (“3 weeks ago”) that tells the exact
 * instant, to the second, on hover. Wraps the element that shows it; an
 * unreadable date leaves the element as it is.
 */
export function ExactTime({
  date,
  children,
}: {
  date: string | number | Date | null | undefined;
  children: ReactElement;
}) {
  const when = date == null ? null : new Date(date);
  if (!when || !Number.isFinite(when.getTime())) return children;
  return <AppTooltip label={<ExactTimeLabel when={when} />}>{children}</AppTooltip>;
}

/** Formatted only once the tooltip shows, not for every row of a long log. */
function ExactTimeLabel({ when }: { when: Date }) {
  const format = useFormatter();
  return format.dateTime(when, { dateStyle: "full", timeStyle: "medium" });
}
