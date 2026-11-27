"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Mic01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SplitButton } from "@/components/ui/split-button";
import { Switch } from "@/components/ui/switch";
import { StatusIndicator } from "@/components/issue-indicators";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { cn } from "@/lib/utils";
import { DATE_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import { IssueCardAssigneeAvatar, IssueCardFace } from "@/components/issue-card-face";
import { SmartFillSweep } from "@/components/smart-fill-sweep";
import { ProjectOrb } from "@/components/project-orb";
import { SmartAssignAvatar, SmartFillAvatar } from "@/components/actor-avatars";
import type { IssueCardIssue } from "@/lib/types";
import { ActorPill, FRESH_CARD } from "./hero-board";
import { FIGURE_CATEGORIES, FIGURE_MEMBERS, FIGURE_PROJECT_KEY, figureIssue, useFigureMaps } from "./figure-world";

/**
 * The AI chapter's figure, on a loop: someone types a problem in the issue
 * composer, the issue is created empty, Smart Fill writes its title and
 * properties under the app's own sweep (MIN-1032), then Smart Assign picks
 * who takes it. The card leaves, and the composer comes back with the next of
 * five examples. The composer is drawn after the app's own
 * `create-issue-dialog.tsx`; the card is the app's `IssueCardFace`, its empty
 * assignee showing Smart Assign as the app does when the project has it on.
 */

const AURORA_ORB = "bdd736ea-c04b-49f0-9217-6965c2339364";

type Text =
  | "heroFlow_issueDescription"
  | "aiFlow_desc_search"
  | "aiFlow_desc_emails"
  | "aiFlow_desc_export"
  | "aiFlow_desc_taxes"
  | "heroFlow_issueTitle"
  | "heroFlow_still_search"
  | "heroFlow_still_emails"
  | "heroFlow_still_export"
  | "aiFigure_issue3";

interface Example {
  number: number;
  description: Text;
  title: Text;
  fields: Pick<IssueCardIssue, "priority" | "effort" | "category_ids">;
  assignee: keyof typeof FIGURE_MEMBERS;
}

const EXAMPLES: readonly Example[] = [
  {
    number: 21,
    description: "heroFlow_issueDescription",
    title: "heroFlow_issueTitle",
    fields: { priority: "high", effort: "s", category_ids: [FIGURE_CATEGORIES.bug.id] },
    assignee: "tom",
  },
  {
    number: 22,
    description: "aiFlow_desc_search",
    title: "heroFlow_still_search",
    fields: { priority: "medium", effort: "l", category_ids: [FIGURE_CATEGORIES.feature.id] },
    assignee: "camille",
  },
  {
    number: 23,
    description: "aiFlow_desc_emails",
    title: "heroFlow_still_emails",
    fields: { priority: "urgent", effort: "xs", category_ids: [FIGURE_CATEGORIES.bug.id] },
    assignee: "alice",
  },
  {
    number: 24,
    description: "aiFlow_desc_export",
    title: "heroFlow_still_export",
    fields: { priority: "low", effort: "m", category_ids: [FIGURE_CATEGORIES.improvement.id] },
    assignee: "tom",
  },
  {
    number: 25,
    description: "aiFlow_desc_taxes",
    title: "aiFigure_issue3",
    fields: { priority: "medium", effort: "s", category_ids: [FIGURE_CATEGORIES.feature.id] },
    assignee: "alice",
  },
];

/** typing → created (empty card, Smart Fill at work) → filled (the sweep) → assigned (Smart Assign) → leaving. */
type Phase = "typing" | "created" | "filled" | "assigned" | "leaving";

const CHAR_MS = 32;
/** How long each phase lasts once reached; `filled` holds the sweep. */
const PHASE_MS: Record<Exclude<Phase, "typing">, number> = {
  created: 1400,
  filled: 2100,
  assigned: 2200,
  leaving: 700,
};
const TYPING_HOLD_MS = 700;

/** A shortcut as the app writes it beside a control: ⌘ ⇧ and a letter. */
function Shortcut({ letter }: { letter: string }) {
  const mod = useModKey();
  return (
    <span aria-hidden className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 opacity-60">
      <Kbd size="sm">{mod}</Kbd>
      <Kbd size="sm">⇧</Kbd>
      <Kbd size="sm">{letter}</Kbd>
    </span>
  );
}

/** The bare property triggers of the composer (`BARE` in issue-compact-fields). */
const BARE = "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground";

/**
 * The issue composer with Smart Fill on, drawn with the dialog's own classes
 * (`create-issue-dialog.tsx`, `creation-project-select.tsx`,
 * `issue-compact-fields.tsx`) and its real switch, split button and keys.
 */
function Composer({ text, typed, number }: { text: string; typed: number; number: number }) {
  const ti = useTranslations("IssueUI");
  const tc = useTranslations("Creation");
  const tf = useTranslations("Field");
  return (
    <div className="relative flex w-full max-w-2xl flex-col rounded-[2rem] bg-card px-[1.625rem] pt-15 pb-4 text-left text-sm shadow-lg shadow-black/5 ring-1 ring-border max-sm:rounded-3xl max-sm:px-4 max-sm:pt-13 max-sm:pb-3">
      <div className="absolute top-4 left-4 flex h-7 max-sm:top-3 max-sm:left-3 min-w-0 items-center gap-1.5 rounded-full bg-control px-2.5 text-sm text-foreground">
        <span className="shrink-0 text-muted-foreground">{tc("createIn")}</span>
        <ProjectOrb seed={AURORA_ORB} className="size-4 shrink-0" />
        <span className="truncate">Aurora</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
        <Shortcut letter="P" />
      </div>
      <span className="absolute top-4 right-4 flex size-7 max-sm:top-3 max-sm:right-3 items-center justify-center rounded-full bg-control text-muted-foreground">
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </span>

      <div className="flex flex-col">
        <p className="min-h-16 text-base leading-normal max-sm:min-h-12 max-sm:text-[0.9375rem]">
          {text.slice(0, typed)}
          <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.2em] animate-pulse bg-foreground" aria-hidden />
        </p>
        <div className="mt-4 -ml-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 max-sm:mt-3 max-sm:gap-x-1">
          <span className={BARE}>
            <StatusIndicator status="backlog" />
          </span>
          <span className={BARE}>
            <HugeiconsIcon icon={UserCircleIcon} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
          </span>
          <span className={cn(BARE, "text-muted-foreground")}>
            <HugeiconsIcon icon={DATE_ICON} className="size-4 shrink-0" />
            {/* On a phone the icon alone, so Smart Fill stays on the same row. */}
            <span className="max-sm:hidden">{tf("dueDate")}</span>
          </span>
          {/* Smart Fill on: the toggle and its chevron share one tint. */}
          <span className="inline-flex gap-px">
            <span className="flex h-8 items-center gap-1.5 rounded-full rounded-r-none bg-primary/10 pr-2 pl-3 text-sm text-primary">
              <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />
              {ti("smartFillChip")}
            </span>
            <span className="flex h-8 items-center gap-1.5 rounded-full rounded-l-none bg-primary/10 px-2 text-sm text-primary">
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
              <Shortcut letter="F" />
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 max-sm:mt-4 max-sm:gap-2 sm:mt-8">
        <span className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground">
          <HugeiconsIcon icon={Mic01Icon} className="size-4" />
        </span>
        <Button type="button" variant="ghost" size="icon-sm" tabIndex={-1} className="rounded-full text-muted-foreground">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </Button>
        <div className="ml-auto flex items-center gap-4 max-sm:hidden">
          <span className="text-sm text-foreground">{ti("createMore")}</span>
          <Switch checked={false} tabIndex={-1} />
        </div>
        <div className="ml-1 -mr-2.5 flex items-center justify-end gap-2 max-sm:mr-0 max-sm:ml-auto">
          <SplitButton
            type="button"
            tabIndex={-1}
            menu={null}
            className={cn("transition-transform duration-150", typed >= text.length && "scale-95")}
          >
            <span className="max-w-[14rem] truncate py-0.5 leading-normal">
              {ti("createIdentifier", { identifier: `${FIGURE_PROJECT_KEY}-${number}` })}
            </span>
          </SplitButton>
        </div>
      </div>
    </div>
  );
}

/** The assignee Smart Assign just set: it fades in where it is, without moving. */
function Landed({ value, children }: { value: string; children: ReactNode }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex"
    >
      {children}
    </motion.span>
  );
}

export function SmartFillFlow() {
  const t = useTranslations("Landing");
  const tField = useTranslations("Field");
  const { memberMap, categoryMap } = useFigureMaps();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  /** The sweep of this example is over: the filled card shows as is. */
  const [swept, setSwept] = useState(false);

  const example = EXAMPLES[index];
  const description = t(example.description);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One timer drives the loop: a letter at a time, then each phase in turn.
  useEffect(() => {
    if (reduced || !visible) return;
    let delay: number;
    let next: () => void;
    if (phase === "typing") {
      if (typed < description.length) {
        delay = CHAR_MS;
        next = () => setTyped(typed + 1);
      } else {
        delay = TYPING_HOLD_MS;
        next = () => setPhase("created");
      }
    } else {
      delay = PHASE_MS[phase];
      next = {
        created: () => setPhase("filled"),
        filled: () => setPhase("assigned"),
        assigned: () => setPhase("leaving"),
        leaving: () => {
          setIndex((index + 1) % EXAMPLES.length);
          setTyped(0);
          setSwept(false);
          setPhase("typing");
        },
      }[phase];
    }
    const id = window.setTimeout(next, delay);
    return () => window.clearTimeout(id);
  }, [description.length, index, phase, reduced, typed, visible]);

  // Reduced motion: the first example, filled and assigned.
  const shown: Phase = reduced ? "assigned" : phase;
  const filled = shown !== "created";
  const assigned = shown === "assigned" || shown === "leaving";
  const assignee = assigned ? FIGURE_MEMBERS[example.assignee] : null;

  const face = (issueFilled: boolean) => (
    <IssueCardFace
      issue={figureIssue({
        number: example.number,
        // Until Smart Fill has written the title, the card shows the
        // description, muted, as the app does (MIN-1032).
        title: issueFilled ? t(example.title) : "",
        status: "todo",
        priority: issueFilled ? example.fields.priority : "none",
        effort: issueFilled ? example.fields.effort : null,
        category_ids: issueFilled ? example.fields.category_ids : [],
        assignee_id: assignee?.user_id ?? null,
      })}
      description={issueFilled ? null : description}
      projectKey={FIGURE_PROJECT_KEY}
      memberMap={memberMap}
      categoryMap={categoryMap}
      slots={{
        assignee: (
          <Landed value={assignee?.user_id ?? "none"}>
            <IssueCardAssigneeAvatar assignee={assignee} smartAssign emptyLabel={tField("smartAssign")} />
          </Landed>
        ),
      }}
    />
  );

  const pill =
    shown === "created" || shown === "filled" ? (
      <ActorPill key="fill" avatar={<SmartFillAvatar className="size-5" />}>
        Smart Fill
      </ActorPill>
    ) : shown === "assigned" ? (
      <ActorPill key="assign" avatar={<SmartAssignAvatar className="size-5" />}>
        {`Smart Assign → ${FIGURE_MEMBERS[example.assignee].full_name?.split(" ")[0]}`}
      </ActorPill>
    ) : null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative flex h-[340px] items-center justify-center select-none sm:h-[360px] [&_*]:pointer-events-none"
    >
      <AnimatePresence mode="wait" initial={false}>
        {shown === "typing" ? (
          <motion.div
            key={`composer-${index}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex w-full justify-center"
          >
            <Composer text={description} typed={typed} number={example.number} />
          </motion.div>
        ) : (
          <motion.div
            key={`card-${index}`}
            initial={{ opacity: 0, y: -6 }}
            // Leaving: it drops and fades, at its own size.
            animate={shown === "leaving" ? { opacity: 0, y: 70 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={
              shown === "leaving"
                ? { duration: 0.6, ease: [0.4, 0, 1, 1] }
                : { duration: 0.35, ease: "easeOut" }
            }
            className="relative w-[min(100%,24rem)]"
          >
            {shown === "filled" && !swept ? (
              <SmartFillSweep revealing placeholder={face(false)} onDone={() => setSwept(true)}>
                {face(true)}
              </SmartFillSweep>
            ) : (
              <div className={cn("rounded-2xl", assigned && pill && FRESH_CARD)}>{face(filled)}</div>
            )}
            <AnimatePresence>{pill}</AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
