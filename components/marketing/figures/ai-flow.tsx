"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Loading03Icon, TaskAdd01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { IssueCardFace } from "@/components/issue-card-face";
import { NumoAvatar, SmartAssignAvatar, SmartFillAvatar } from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { issueIdentifier } from "@/lib/issue-constants";
import type { IssueCardIssue } from "@/lib/types";
import {
  FIGURE_CATEGORIES,
  FIGURE_MEMBERS,
  FIGURE_PROJECT_KEY,
  figureIssue,
  useFigureMaps,
} from "./figure-world";
import { useSceneStep } from "./story";

/**
 * The AI chapter: you ask Numo for something in your own words, it files the
 * issues, then Smart Fill and Smart Assign complete them without being asked.
 * The cards are the app's real `IssueCardFace`; the chat bubble reuses the
 * classes of `components/ai-elements/message.tsx`, whose Markdown renderer is
 * too heavy for the landing.
 */

const ISSUES = [
  { number: 43, titleKey: "aiFigure_issue1", priority: "high", effort: "m", category: "design", assignee: "alice" },
  { number: 44, titleKey: "aiFigure_issue2", priority: "medium", effort: "s", category: "feature", assignee: "tom" },
  { number: 45, titleKey: "aiFigure_issue3", priority: "medium", effort: "xs", category: "improvement", assignee: "camille" },
] as const;

/**
 * Scene 1: 0 prompt · 1 working · 2-4 one issue created per step.
 * Scene 2: 5 Smart Fill. Scene 3: 6 Smart Assign · 7 Numo answers.
 */
const SCENES = [
  [0, 4],
  [5, 5],
  [6, 7],
] as const;
const CREATED_FROM = 2;
const FILLED_AT = 5;
const ASSIGNED_AT = 6;
const ANSWERED_AT = 7;

function ToolRow({ done, label }: { done: boolean; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <HugeiconsIcon icon={TaskAdd01Icon} className="size-3 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      <HugeiconsIcon
        icon={done ? CheckmarkCircle02Icon : Loading03Icon}
        className={cn("size-3.5 shrink-0", done ? "text-emerald-500" : "animate-spin")}
        aria-hidden
      />
    </motion.div>
  );
}

export function AiFlow() {
  const t = useTranslations("Landing");
  const { memberMap, categoryMap } = useFigureMaps();
  const step = useSceneStep(SCENES);

  const issues = useMemo(
    () =>
      ISSUES.map((spec, index): IssueCardIssue | null => {
        if (step < CREATED_FROM + index) return null;
        return figureIssue({
          number: spec.number,
          title: t(spec.titleKey),
          status: "todo",
          priority: step >= FILLED_AT ? spec.priority : "none",
          effort: step >= FILLED_AT ? spec.effort : null,
          category_ids: step >= FILLED_AT ? [FIGURE_CATEGORIES[spec.category].id] : [],
          assignee_id: step >= ASSIGNED_AT ? FIGURE_MEMBERS[spec.assignee].user_id : null,
        });
      }),
    [step, t],
  );

  const actor =
    step === FILLED_AT ? (
      <><SmartFillAvatar className="size-5" />Smart Fill</>
    ) : step === ASSIGNED_AT ? (
      <><SmartAssignAvatar className="size-5" />Smart Assign</>
    ) : null;

  return (
    <div className="grid h-full gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The conversation */}
      <div className="flex h-[300px] flex-col gap-4 overflow-hidden rounded-xl bg-background p-4 shadow-sm sm:h-auto sm:p-5">
        <div className="group is-user ml-auto flex w-full max-w-[95%] flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="w-fit rounded-lg bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))] px-4 py-3 text-sm">
              {t("aiFigure_prompt")}
            </div>
            <UserAvatar seed={FIGURE_MEMBERS.camille.avatar_seed} className="size-6 shrink-0" />
          </div>
        </div>

        {step >= 1 && (
          <div className="flex gap-2.5">
            <NumoAvatar className="size-6 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              {step < CREATED_FROM && (
                <span className="text-xs text-muted-foreground">{t("aiFigure_working")}</span>
              )}
              {ISSUES.map((spec, index) =>
                step >= CREATED_FROM - 1 + index ? (
                  <ToolRow
                    key={spec.number}
                    done={step >= CREATED_FROM + index}
                    label={`${issueIdentifier(FIGURE_PROJECT_KEY, spec.number)} · ${t(spec.titleKey)}`}
                  />
                ) : null,
              )}
              <AnimatePresence>
                {step >= ANSWERED_AT && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm"
                  >
                    {t("aiFigure_reply")}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* The issues it filed, completed in place */}
      <div className="relative flex flex-col gap-2">
        {issues.map((issue, index) =>
          issue ? (
            <motion.div
              key={ISSUES[index].number}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className={cn(
                "rounded-2xl ring-2 ring-transparent transition-shadow duration-500",
                (step === FILLED_AT || step === ASSIGNED_AT) && "ring-primary/30",
              )}
            >
              <IssueCardFace
                issue={issue}
                projectKey={FIGURE_PROJECT_KEY}
                memberMap={memberMap}
                categoryMap={categoryMap}
              />
            </motion.div>
          ) : (
            <div key={ISSUES[index].number} aria-hidden className="h-[118px] rounded-2xl border border-dashed border-foreground/10" />
          ),
        )}
        <div className="flex h-8 items-center justify-end">
          <AnimatePresence mode="wait">
            {actor && (
              <motion.span
                key={step}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-3 pl-1 text-xs font-medium shadow-xs"
              >
                {actor}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
