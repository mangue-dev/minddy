import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { Check, GitPullRequest, ListChecks, MessageSquareDashed } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { NumoFace } from "@/components/numo-face";

/**
 * The agent loop, in figure — the image of the hero (MIN-148).
 *
 * WHY NOT A CAPTURE. The loop does not fit on any screen: it is played
 * out of three (`workflowIssue`, `workflowAgent`, `workflowPr`), and three captures
 * shrunk side by side in a hero cannot be read. Above all, the hero showed
 * so far the board — and a board necessarily looks like a board, and putting it down
 * in first image invited a comparison of tracker to tracker, on the
 * terrain de Linear. Ici l'image dit ce que personne d'autre ne peut montrer :
 * a ticket, and under it the plan that the agent wrote, what he executed, the
 * pull request attached to it, and your proofreading.
 *
 * The form follows the argument: ONE card, not four. “Only one ticket carries
 * everything” is demonstrated by drawing it, not by writing it.
 *
 * PRODUCT LOYALTY, like `voice-dictation-figure.tsx`:
 * - the status and priority are returned by `StatusIndicator` and
 * `PriorityIndicator`, the components of the board;
 * - the check boxes take the exact geometry of `TaskRow`
 * (components/plan-task-row.tsx): 16 px, radius 4, checked in `primary`,
 * crossed out and grayed out text;
 * - the labels of the review bar are those of the real bar
 * (`PullRequests.reviewApprove` / `reviewRequestChanges`), not one
 *     reformulation marketing ;
 * - the green of the open pull request is that of GitHub, like
 * `PR_STATE_STYLES` — copied and not imported, this module is client.
 *
 * SHE’S PLAYING (MIN-254). She was frozen: the four beats of a LOOP,
 * placed all four at once, which is exactly what a loop is
 * not. They are now coming one after the other — the rail is going down, the plan
 * is written, the boxes are checked, the pull request is attached. The demonstration
 * of the product in four seconds, without having to read it.
 *
 * The animation is ENTIRELY IN CSS (`app/globals.css`, section “Figure of the
 * agent loop"): the component remains a Server Component, the hero does not send
 * still not a line of JavaScript for this image, and it remains light
 * for the LCP — text and two SVGs instead of a 16/10 capture. She
 * plays LOADING and not scrolling, like the hero's stunt to which it
 * appartient.
 *
 * Everything is there in filling `backwards`: the arrival state of each animation
 * IS the base state of the element (box checked, line drawn, rail extended), so
 * filling has only one job — hold the starting state during the delay —
 * and the animation drops the element at the end instead of freezing a layer
 * composed. Useful corollary: without CSS or with reduced movement, the figure
 * appears already completed.
 */

/** Rank of an element in the partition: it is he who carries the delay. */
const beat = (i: number) => ({ "--loop-i": i }) as CSSProperties;

/** The three tasks of the plan, all checked: the loop shown is finished. */
const PLAN_TASKS = ["repro", "signature", "retry"] as const;

/** The agent branch: code, therefore never translated. */
const BRANCH = "fix/stripe-webhook-500";

/** A time of the loop: pellet on the rail, title, content. */
function Beat({
  index,
  icon,
  label,
  last,
  children,
}: {
  /** Rank in the cascade — the next beat only comes after this one. */
  index: number;
  icon: React.ReactNode;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="loop-step grid grid-cols-[1.75rem_1fr] gap-x-3" style={beat(index)}>
      {/* The rail: the pellet, then the line which descends towards time
          following. He lives IN the column and not in absolute position — his
          height is therefore that of the content, whatever the length of the
          text once translated. */}
      <div className="flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {icon}
        </span>
        {/* The line DEPLOYS downwards: it announces the next beat exactly
            before he arrives, which makes the figure read like a sequel. */}
        {!last && (
          <span className="loop-rail mt-1 w-px flex-1 bg-border" style={beat(index)} aria-hidden />
        )}
      </div>

      <div className={cn("min-w-0", !last && "pb-5")}>
        {/* `h-7`: the title occupies the height of the pastille, both
            align without optical shift. */}
        <p className="flex h-7 items-center text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

/** The frame of a content block — same background as the landing inserts. */
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3", className)}>
      {children}
    </div>
  );
}

export async function AgentLoopFigure() {
  const [t, tPr] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("PullRequests"),
  ]);

  return (
    <figure className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
      {/* ── The ticket: the only gesture that remains yours ─────────────────── */}
      <header className="loop-step flex items-start gap-3 border-b border-border pb-5" style={beat(0)}>
        <StatusIndicator status="in_progress" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* Hard identifier: it's a decoration, not a piece of data. MIN-42 because
              that minddy follows itself in minddy. */}
          <p className="font-mono text-xs text-muted-foreground">MIN-42</p>
          <p className="mt-0.5 text-base leading-snug font-semibold text-pretty">
            {t("heroLoopIssueTitle")}
          </p>
        </div>
        <PriorityIndicator priority="high" className="mt-1" />
      </header>

      <ol className="mt-5">
        {/* ① The plan, written by the agent ─────────────────────────────────── */}
        <Beat index={1} icon={<ListChecks className="size-3.5" />} label={t("heroLoopStepPlan")}>
          <Panel>
            <ul className="flex flex-col gap-2">
              {PLAN_TASKS.map((task, i) => (
                <li key={task} className="flex items-start gap-2.5">
                  <span
                    className="loop-check mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground"
                    style={beat(i)}
                  >
                    <Check className="size-3" />
                  </span>
                  {/* The bar is a drawn LINE and not a `line-through`:
                      a text decoration does not animate, a line is drawn. */}
                  <span
                    className="loop-strike relative text-sm leading-relaxed text-muted-foreground"
                    style={beat(i)}
                  >
                    {t(`heroLoopTask_${task}`)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </Beat>

        {/* ② Execution ───────────────────────── ───────────────────────── */}
        <Beat index={2} icon={<NumoFace className="h-3.5 w-auto" />} label={t("heroLoopStepRun")}>
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="font-mono text-xs text-foreground/90">{BRANCH}</span>
            <span className="text-xs text-muted-foreground">{t("heroLoopRunDetail")}</span>
          </Panel>
        </Beat>

        {/* ③ The pull request, attached to the ticket ────────────────────────── */}
        <Beat index={3} icon={<GitPullRequest className="size-3.5" />} label={t("heroLoopStepPr")}>
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <GitPullRequest className="size-4 shrink-0 text-green-700 dark:text-green-400" />
              #128
            </span>
            <span className="font-mono text-xs tabular-nums">
              <span className="text-green-700 dark:text-green-400">+82</span>{" "}
              <span className="text-destructive">−14</span>
            </span>
          </Panel>
        </Beat>

        {/* ④ Verification — the time that cannot be delegated ────────────── */}
        <Beat index={4} icon={<Check className="size-3.5" />} label={t("heroLoopStepReview")} last>
          {/* Pellets, not buttons: nothing is clickable here, and a
              full button would invoke the click that the real action deserves. */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
              <Check className="size-3.5 shrink-0 text-green-700 dark:text-green-400" />
              {tPr("reviewApprove")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <MessageSquareDashed className="size-3.5 shrink-0" />
              {tPr("reviewRequestChanges")}
            </span>
          </div>
        </Beat>
      </ol>
    </figure>
  );
}
