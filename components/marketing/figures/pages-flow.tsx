"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PROSE } from "@/components/editor/prose";
import { PagePresence } from "@/components/pages/page-presence-faces";
import { MentionChip } from "@/components/mention-chip";
import { caretColor } from "@/lib/page-caret-colors";
import { displayName } from "@/lib/display-name";
import { FIGURE_MEMBERS } from "./figure-world";
import { useStory } from "./use-story";
import { MotionPauseButton } from "./motion-pause";

/**
 * The pages chapter: two teammates write in the same page at once. The body
 * uses the editor's own typography (`components/editor/prose.ts`), the carets
 * its `page-collab-caret` styles and colors, and the faces its presence
 * component: what a visitor sees is what a shared page looks like.
 */

export const WRITERS = [FIGURE_MEMBERS.tom, FIGURE_MEMBERS.alice] as const;
const STEPS = 3;
const CHAR_MS = 38;

/** Types `text` out while `active`, character by character; whole when still. */
function useTyped(text: string, active: boolean, done: boolean) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setCount(done ? text.length : 0);
      return;
    }
    setCount(0);
    const id = window.setInterval(() => {
      setCount((n) => {
        if (n >= text.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, CHAR_MS);
    return () => window.clearInterval(id);
  }, [active, done, text]);

  return reduced ? text : text.slice(0, count);
}

export function Caret({ userId, name }: { userId: string; name: string }) {
  return (
    <span
      aria-hidden
      className="page-collab-caret"
      style={{ "--collab-color": caretColor(userId) } as CSSProperties}
    >
      <span className="page-collab-caret-label">{name}</span>
    </span>
  );
}

export function PagesFlow() {
  const t = useTranslations("Landing");
  // 0: Tom writes his line · 1: Alice writes hers · 2: both read it back.
  const { ref, step } = useStory(STEPS, { stepMs: 3000, holdMs: 2600 });
  const line2 = useTyped(t("pagesFigure_line2"), step === 0, step > 0);
  const line3 = useTyped(t("pagesFigure_line3"), step === 1, step > 1);

  return (
    // A fixed height: typing a line, or a caret's name tag, never moves the page.
    <div ref={ref} className="relative h-[25rem] overflow-hidden rounded-xl bg-background px-5 pt-6 pb-9 shadow-sm sm:h-[23rem] sm:px-10 sm:pt-9 sm:pb-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h3 className="font-display text-[2rem] leading-tight font-semibold tracking-tight">
          {t("pagesFigure_title")}
        </h3>
        <PagePresence
          userIds={WRITERS.map((member) => member.user_id)}
          members={WRITERS}
          className="mt-2 shrink-0"
        />
      </div>

      <div className={cn(PROSE.page, "max-w-2xl")}>
        <h2>{t("pagesFigure_goal")}</h2>
        <ul>
          <li>{t("pagesFigure_line1")}</li>
          <li>
            {line2}
            {step === 0 && <Caret userId={WRITERS[0].user_id} name={displayName(WRITERS[0])} />}
          </li>
          {/* Kept in the layout before Alice starts, so the figure never changes height. */}
          <li className={cn(step < 1 && "invisible")}>
            {step >= 1 ? line3 : t("pagesFigure_line3")}
            {step === 1 && <Caret userId={WRITERS[1].user_id} name={displayName(WRITERS[1])} />}
          </li>
        </ul>
        <h2>{t("pagesFigure_tasks")}</h2>
        {/* Inline, as in the editor: a chip's figure is aligned on the text's baseline. */}
        <p>
          <MentionChip type="issue" id="figure-42" label={`AUR-42 ${t("heroFlow_issueTitle")}`} status="in_progress" />{" "}
          <MentionChip type="issue" id="figure-43" label={`AUR-43 ${t("aiFigure_issue1")}`} status="todo" />
        </p>
      </div>
      <MotionPauseButton className="absolute right-3 bottom-3 z-10" />
    </div>
  );
}
