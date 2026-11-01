"use client";

// What the surface being written is tied to, lifted to the top of its "@"
// menu: the sub-pages of a page, the relations of an issue or objective
// (parent, sub-issues, blocking, blocked, related), and the due date and plan
// of the very issue or objective being written.
//
// Related entities are the options the menu already lists, moved under a
// contextual section rather than added a second time. The due date is a
// date mention like any other; the plan is the issue's own mention with
// `?part=plan`, offered in its description alone, where a click switches
// the panel to its plan.

import { useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dayKey, formatMentionDate, mentionDateMeta, type MentionDate } from "@/lib/mention-date";
import { dueDateHasTime, parseDueDate } from "@/lib/due-date";
import { isPlanMention, PLAN_MENTION_META } from "@/lib/mention-link";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { MentionLinks } from "@/components/mention-links";
import type { MentionOption } from "@/components/mention-suggest";

export interface MentionContext {
  /** Whose description it is: the label of the due date's section. */
  subject: "issue" | "objective" | "page";
  /** Issues and objectives the subject is related to, in any direction. */
  related?: ReadonlyArray<{ type: "issue" | "objective"; id: string }>;
  /** The page's direct sub-pages. */
  subpages?: readonly string[];
  /** The issue's due date or the objective's target date, as stored. */
  dueDate?: string | null;
  /** Offers the issue's own plan, and opens it when its pill is clicked. */
  plan?: { issueId: string; onOpen: () => void };
}

/** A stored due date (a bare day or a full timestamp) as a date mention. */
function dueDateMention(value: string): MentionDate | null {
  const parsed = parseDueDate(value);
  if (!parsed) return null;
  const date = dayKey(parsed);
  if (!dueDateHasTime(parsed)) return { date };
  const time = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export function useContextMentions<T extends DocumentEditorMentions | undefined>(
  base: T,
  context: MentionContext | null,
): T {
  const locale = useLocale();
  const tField = useTranslations("Field");
  const tPlan = useTranslations("Plan");
  const dueLabel = tField("dueDate");
  const planLabel = tPlan("tabPlan");

  const subject = context?.subject ?? null;
  const relatedKey = (context?.related ?? []).map((r) => `${r.type}:${r.id}`).join(",");
  const subpagesKey = (context?.subpages ?? []).join(",");
  const dueDate = context?.dueDate ?? null;
  const planIssueId = context?.plan?.issueId ?? null;
  // Read through the context at click time: a new callback each render must
  // not rebuild the editor's mentions.
  const planOpenRef = useRef(context?.plan?.onOpen);
  planOpenRef.current = context?.plan?.onOpen;

  return useMemo((): T => {
    if (!base || !subject) return base;
    const related = new Set(relatedKey ? relatedKey.split(",") : []);
    const subpages = new Set(subpagesKey ? subpagesKey.split(",") : []);
    if (related.size === 0 && subpages.size === 0 && !dueDate && !planIssueId) return base;

    const own: MentionOption["section"] = subject === "objective" ? "thisObjective" : "thisIssue";
    const options: MentionOption[] = base.options.map((option) => {
      if ((option.type === "issue" || option.type === "objective") && related.has(`${option.type}:${option.id}`)) {
        return { ...option, section: "relations" };
      }
      if (option.type === "page" && subpages.has(option.id)) return { ...option, section: "subpages" };
      return option;
    });
    const extra: MentionOption[] = [];
    if (planIssueId) {
      extra.push({
        type: "issue",
        id: planIssueId,
        label: planLabel,
        meta: PLAN_MENTION_META,
        keywords: ["plan", "tasks", "tâches"],
        section: own,
      });
    }
    const due = dueDate ? dueDateMention(dueDate) : null;
    if (due && subject !== "page") {
      const meta = mentionDateMeta(due);
      extra.push({
        type: "date",
        id: due.date,
        label: formatMentionDate(due, locale, new Date()),
        detail: dueLabel,
        keywords: [dueLabel, "due", "deadline", "échéance"],
        ...(meta ? { meta } : {}),
        section: own,
      });
    }

    const inner = base.links;
    const links: MentionLinks | undefined = inner && planIssueId
      ? {
          ...inner,
          navigate: (type, id, meta) => {
            if (id === planIssueId && isPlanMention(type, meta) && planOpenRef.current) {
              planOpenRef.current();
              return;
            }
            inner.navigate(type, id, meta);
          },
        }
      : inner;
    return { ...base, options: [...extra, ...options], links } as T;
  }, [base, subject, relatedKey, subpagesKey, dueDate, planIssueId, planLabel, dueLabel, locale]);
}
