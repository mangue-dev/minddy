"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IssueCardFace } from "@/components/issue-card-face";
import { StatusIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { McpAvatar, SmartAssignAvatar, SmartFillAvatar } from "@/components/actor-avatars";
import { Github } from "@/components/git/provider-icons";
import type { IssueStatus } from "@/lib/issue-constants";
import type { IssuePr } from "@/lib/issue-pr";
import type { IssueCardIssue } from "@/lib/types";
import { FIGURE_CATEGORIES, FIGURE_MEMBERS, FIGURE_PROJECT_KEY, figureIssue, useFigureMaps } from "./figure-world";
import { useLandingMotionPaused } from "./motion-pause";

/**
 * The hero's backdrop: the real board, running on its own behind the headline
 * (MIN-805's landing rework). Every tick moves one issue one step: it is
 * created, Smart Fill writes it, Smart Assign picks someone, a coding agent
 * opens a pull request, the pull request goes to review and is merged. A pill
 * on the card names who did it. Done issues leave the board as new ones come
 * in, so the loop never ends. The cards are the app's `IssueCardFace`.
 */

const TICK_MS = 1300;
/** How many ticks a pill stays on its card. */
const PILL_TICKS = 2;
const DONE_KEPT = 3;
/** The middle columns show at most this many cards, so the hero's buttons below them always sit on an empty board. */
const MIDDLE_SHOWN = 2;

const TITLES = [
  "heroFlow_issueTitle",
  "heroFlow_still_onboarding",
  "heroFlow_still_search",
  "aiFigure_issue1",
  "heroFlow_still_export",
  "cardReview_title",
  "aiFigure_issue2",
  "heroFlow_still_emails",
  "cardComments_title",
  "aiFigure_issue3",
] as const;

type TitleKey = (typeof TITLES)[number];

/** created · filled · assigned · agent at work · in review · merged. */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const STAGE_STATUS: Record<Stage, IssueStatus> = {
  0: "todo",
  1: "todo",
  2: "todo",
  3: "in_progress",
  4: "in_review",
  5: "done",
};

const COLUMNS: readonly IssueStatus[] = ["todo", "in_progress", "in_review", "done"];

const PEOPLE = [FIGURE_MEMBERS.tom, FIGURE_MEMBERS.alice, FIGURE_MEMBERS.camille] as const;
const CATEGORIES = [FIGURE_CATEGORIES.bug, FIGURE_CATEGORIES.feature, FIGURE_CATEGORIES.improvement] as const;
const PRIORITIES = ["high", "medium", "low", "urgent"] as const;
const EFFORTS = ["s", "m", "xs", "l"] as const;

interface Card {
  number: number;
  title: TitleKey;
  stage: Stage;
  /** The tick of its last step: the board lists the latest first, and the clock picks the oldest. */
  moved: number;
}

interface Board {
  tick: number;
  cards: Card[];
  next: number;
  /** The last step of each card, for its pill. */
  pills: Record<number, { stage: Stage; tick: number }>;
  /** A merge just happened: the next tick creates the issue that replaces it. */
  spawn: boolean;
}

const INITIAL: Board = {
  tick: 0,
  next: 54,
  // The board opens on a new issue, which Smart Fill writes on the first tick.
  pills: { 53: { stage: 0, tick: 0 } },
  spawn: false,
  // Who moves next is the card that waited longest; these starting ages
  // alternate the columns, so steps never come in waves.
  cards: [
    { number: 53, title: "heroFlow_issueTitle", stage: 0, moved: -1 },
    { number: 52, title: "heroFlow_still_onboarding", stage: 1, moved: -18 },
    { number: 51, title: "heroFlow_still_search", stage: 2, moved: -15 },
    { number: 50, title: "aiFigure_issue1", stage: 3, moved: -13 },
    { number: 49, title: "heroFlow_still_export", stage: 3, moved: -16 },
    { number: 48, title: "aiFigure_issue3", stage: 3, moved: -19 },
    { number: 47, title: "cardReview_title", stage: 4, moved: -14 },
    { number: 46, title: "aiFigure_issue2", stage: 4, moved: -17 },
    { number: 45, title: "cardComments_title", stage: 4, moved: -20 },
    { number: 44, title: "heroFlow_still_emails", stage: 5, moved: -21 },
    { number: 43, title: "heroFlow_still_search", stage: 5, moved: -22 },
    { number: 42, title: "heroFlow_issueTitle", stage: 5, moved: -23 },
  ],
};

/**
 * One step per tick, in this order: a merge is followed by a new issue, Smart
 * Fill writes it on the next tick and Smart Assign assigns it on the one after,
 * and otherwise the issue that waited longest moves on.
 */
function advance(board: Board): Board {
  const tick = board.tick + 1;

  if (board.spawn) {
    // The oldest done issue leaves, and a new one is created.
    const done = board.cards.filter((card) => card.stage === 5).sort((a, b) => a.moved - b.moved);
    const kept = done.length > DONE_KEPT ? board.cards.filter((card) => card !== done[0]) : board.cards;
    const card: Card = { number: board.next, title: TITLES[board.next % TITLES.length], stage: 0, moved: tick };
    return {
      tick,
      cards: [...kept, card],
      next: board.next + 1,
      pills: { ...board.pills, [card.number]: { stage: 0, tick } },
      spawn: false,
    };
  }

  const active = board.cards.filter((card) => card.stage < 5);
  const chosen =
    active.find((card) => card.stage === 0) ??
    active.find((card) => card.stage === 1) ??
    active.reduce((a, b) => (b.moved < a.moved ? b : a));
  const stage = (chosen.stage + 1) as Stage;
  return {
    tick,
    cards: board.cards.map((card) => (card === chosen ? { ...card, stage, moved: tick } : card)),
    next: board.next,
    pills: { ...board.pills, [chosen.number]: { stage, tick } },
    spawn: stage === 5,
  };
}

function issueOf(card: Card, title: string): IssueCardIssue {
  const n = card.number;
  const filled = card.stage >= 1;
  return figureIssue({
    number: n,
    // The card shows the title alone (MIN-987): before Smart Fill, the text
    // stands in as the title, as the description's first line does in the app.
    title,
    status: STAGE_STATUS[card.stage],
    priority: filled ? PRIORITIES[n % PRIORITIES.length] : "none",
    effort: filled ? EFFORTS[n % EFFORTS.length] : null,
    category_ids: filled ? [CATEGORIES[n % CATEGORIES.length].id] : [],
    assignee_id: card.stage >= 2 ? PEOPLE[n % PEOPLE.length].user_id : null,
  });
}

function prOf(card: Card): IssuePr | null {
  if (card.stage < 3) return null;
  const state = card.stage === 5 ? "merged" : card.stage === 4 ? "open" : "draft";
  return { prId: `hero-${card.number}`, prNumber: card.number + 80, state };
}

/** Who did the card's last step, and what it changed. */
function StepPill({ card, stage }: { card: Card; stage: Stage }) {
  const t = useTranslations("Landing");
  const person = PEOPLE[card.number % PEOPLE.length];
  const pr = card.number + 80;
  const [avatar, text] = (() => {
    switch (stage) {
      case 0:
        return [<UserAvatar key="a" seed={FIGURE_MEMBERS.camille.avatar_seed} className="size-5" />, t("heroBoard_new")];
      case 1:
        return [<SmartFillAvatar key="a" className="size-5" />, "Smart Fill"];
      case 2:
        return [<SmartAssignAvatar key="a" className="size-5" />, `Smart Assign → ${person.full_name?.split(" ")[0]}`];
      case 3:
        return [<McpAvatar key="a" agent="claude-desktop" className="size-5 bg-background" iconClassName="size-3.5" />, "Claude Code"];
      case 4:
        return [<Github key="a" className="size-3.5" />, t("heroBoard_ready", { pr })];
      case 5:
        return [<Github key="a" className="size-3.5" />, t("heroBoard_merged", { pr })];
    }
  })();
  return <ActorPill avatar={avatar}>{text}</ActorPill>;
}

/** The pill a figure's card wears for a moment: who acted, and what they did. */
export function ActorPill({ avatar, children }: { avatar: ReactNode; children: ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute -top-3.5 right-3 z-10 flex items-center gap-1.5 rounded-full bg-foreground py-0.5 pr-2.5 pl-0.5 text-xs font-medium whitespace-nowrap text-background shadow-lg"
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-background text-foreground">{avatar}</span>
      {children}
    </motion.span>
  );
}

/** The lavender edge of a card that just changed: its own border, twice as thick. */
export const FRESH_CARD =
  "[&>[data-card-surface]]:border-primary/55 [&>[data-card-surface]]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_55%,transparent)]";

export function HeroBoard() {
  const t = useTranslations("Landing");
  const ts = useTranslations("Status");
  const { memberMap, categoryMap } = useFigureMaps();
  const reduced = useReducedMotion();
  const paused = useLandingMotionPaused();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [board, step] = useReducer(advance, INITIAL);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || paused || !visible) return;
    const id = window.setInterval(step, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced, paused, visible]);

  return (
    <div ref={ref} aria-hidden className="grid w-[76rem] grid-cols-4 gap-5 select-none [&_*]:pointer-events-none">
      <LayoutGroup>
        {COLUMNS.map((status) => (
          <div key={status} className="flex min-w-0 flex-col">
            <div className="mb-3 flex items-center gap-2 px-1">
              <StatusIndicator status={status} className="size-4" />
              <span className="text-sm font-semibold">{ts(status)}</span>
            </div>
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {board.cards
                  .filter((card) => STAGE_STATUS[card.stage] === status)
                  .sort((a, b) => b.moved - a.moved)
                  .slice(0, status === "in_progress" || status === "in_review" ? MIDDLE_SHOWN : undefined)
                  .map((card) => {
                    const pill = board.pills[card.number];
                    const fresh = pill && board.tick - pill.tick < PILL_TICKS;
                    return (
                      <motion.div
                        key={card.number}
                        layoutId={`hero-board-${card.number}`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 300, damping: 32 }}
                        className={cn(
                          "relative rounded-2xl",
                          fresh && FRESH_CARD,
                        )}
                      >
                        <IssueCardFace
                          issue={issueOf(card, t(card.title))}
                          projectKey={FIGURE_PROJECT_KEY}
                          memberMap={memberMap}
                          categoryMap={categoryMap}
                          pr={prOf(card)}
                        />
                        <AnimatePresence>
                          {fresh && <StepPill key={`${card.number}-${pill.stage}`} card={card} stage={pill.stage} />}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </LayoutGroup>
    </div>
  );
}
