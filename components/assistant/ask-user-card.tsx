"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  IconButton,
  Input,
  cn,
} from "mangue-ui";
import { Square, SquareCheck, X } from "lucide-react";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";
import {
  composeAskUserReply,
  type AskUserQuestion,
} from "@/lib/ask-user";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `ask_user` question card (MIN-86) — shared between Numo chat and feed
 * of the code agent, in parity with the AskUserQuestion tool from Claude Code:
 * PAGINED (one set of questions at a time, chips-tabs + Previous/Next),
 * options in vertical list with description and “Recommended” badge, radio
 * (exclusive choice, full circle when checked) or checkboxes (`multiSelect`),
 * “Something else…” which becomes an inline input, a GLOBAL SEND
 * (a single Send button validates the whole thing) and a cross to SKIP the
 * questions without answering.
 *
 * The VIVANTE card replaces the composer (Claude Code/Codex pattern) — rendered by
 * the host surface with `onAnswer`/`onSkip`. Without `onAnswer`, it is the simple
 * inert recording of a past question, posted in the thread.
 */

interface AskUserCardProps {
  questions: AskUserQuestion[];
  /** Sends the composed response as a user message. Absent = inert card. */
  onAnswer?: (text: string) => void;
  /** Skip the questions without answering (cross at the top right of the card). */
  onSkip?: () => void;
}

/** Draft answer to a question: options checked + free entry. */
type Draft = { values: string[]; other: boolean; otherValue: string };

/** Delay before automatic advance to the next set after a radio choice: the
 time to SEE the option is checked — without it, the immediate tab change
 looks like a bug. */
const AUTO_ADVANCE_MS = 250;

const EMPTY_DRAFT: Draft = { values: [], other: false, otherValue: "" };

function draftAnswered(d: Draft | undefined): boolean {
  return !!d && (d.values.length > 0 || d.otherValue.trim().length > 0);
}

/** Answer to a question: options checked + possible free entry, attached. */
function draftAnswer(d: Draft | undefined): string {
  if (!d) return "";
  const parts = [...d.values];
  if (d.otherValue.trim()) parts.push(d.otherValue.trim());
  return parts.join(", ");
}

export function AskUserCard({ questions, onAnswer, onSkip }: AskUserCardProps) {
  const t = useTranslations("ToolCall");
  const isSend = useIsSendShortcut();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Delayed automatic advance (radio choice) — canceled by any interaction
  // intermediate (deselection, manual navigation) and disassembly.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );
  const clearAdvance = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };
  const goTo = (i: number) => {
    clearAdvance();
    setCurrent(i);
  };

  if (questions.length === 0) return null;

  const live = !!onAnswer && !submitted;
  const sets = questions.length;
  const page = Math.min(current, sets - 1);
  const q = questions[page];
  const draft = drafts[page];
  const isLast = page === sets - 1;
  const allAnswered = questions.every((_, i) => draftAnswered(drafts[i]));
  const showSkip = live && !!onSkip;
  // Without options, the question calls for a free answer: the field is displayed
  // directly, without going through the “Something else…” line.
  const freeOnly = q.options.length === 0;

  const submit = () => {
    if (!onAnswer || !allAnswered) return;
    const entries = questions.map((question, i) => ({
      question: question.question,
      answer: draftAnswer(drafts[i]),
    }));
    setSubmitted(true);
    onAnswer(composeAskUserReply(entries));
  };

  const skip = () => {
    if (!showSkip) return;
    setSubmitted(true);
    onSkip!();
  };

  const setDraft = (index: number, next: Draft) =>
    setDrafts((prev) => ({ ...prev, [index]: next }));

  const pickOption = (label: string) => {
    if (!live) return;
    const d = drafts[page] ?? EMPTY_DRAFT;
    if (q.multiSelect) {
      // Checkbox: you can combine freely, free entry remains independent.
      const values = d.values.includes(label)
        ? d.values.filter((v) => v !== label)
        : [...d.values, label];
      setDraft(page, { ...d, values });
    } else {
      // Radio: exclusive choice — selecting closes “Something else…”, clicking again deselects.
      const selecting = !d.values.includes(label);
      clearAdvance();
      setDraft(page, {
        values: selecting ? [label] : [],
        other: false,
        otherValue: "",
      });
      // Responding on the radio advances to the next set on its own, after a short
      // delay which lets SEE the selection (the checkboxes remain manual —
      // we check several). Never automatic sending: since last
      // set, it is the Send button which validates.
      if (selecting && sets > 1 && !isLast) {
        advanceTimer.current = setTimeout(() => {
          advanceTimer.current = null;
          setCurrent(page + 1);
        }, AUTO_ADVANCE_MS);
      }
    }
  };

  const pickOther = () => {
    if (!live) return;
    clearAdvance();
    const d = drafts[page] ?? EMPTY_DRAFT;
    if (q.multiSelect) {
      // Checkbox: “Something else…” is checked/unchecked as an option.
      setDraft(page, d.other ? { ...d, other: false, otherValue: "" } : { ...d, other: true });
    } else {
      setDraft(page, { values: [], other: true, otherValue: "" });
    }
  };

  // Selection indicator: radio = FULL circle when checked; checkbox = checkbox.
  const OptionIcon = ({ selected }: { selected: boolean }) => {
    if (q.multiSelect) {
      const Icon = selected ? SquareCheck : Square;
      return (
        <Icon
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            selected ? "text-primary" : "opacity-50"
          )}
        />
      );
    }
    // Classic radio: ring + space + full dot when checked. Ink
    // (`primary`), like mango-ui's Checkbox — no branding color.
    return (
      <span
        aria-hidden
        className={cn(
          "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground/40"
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
    );
  };

  const optionRow = (
    label: string,
    description: string,
    recommended: boolean,
    selected: boolean,
    onClick: () => void
  ) => (
    <button
      key={label}
      type="button"
      disabled={!live}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        !live && "cursor-default opacity-60 hover:bg-transparent"
      )}
    >
      <OptionIcon selected={selected} />
      <span className="flex min-w-0 flex-col">
        <span className="leading-snug">
          {label}
          {recommended && (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-foreground">
              {t("recommendedBadge")}
            </span>
          )}
        </span>
        {description && (
          <span className="text-xs leading-snug opacity-70">{description}</span>
        )}
      </span>
    </button>
  );

  // `withIcon`: the entry REPLACES the line “Something else…” (radio / question
  // free) and keeps its indicator; without icon, it is displayed BELOW the line
  // checked (multi-selection).
  const otherInput = (withIcon: boolean) => (
    <div className={cn("flex items-center gap-2 py-1", withIcon ? "px-2.5" : "pl-8 pr-2.5")}>
      {withIcon && (
        <span
          aria-hidden
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
            draft?.otherValue.trim()
              ? "border-primary"
              : "border-muted-foreground/40"
          )}
        >
          {!!draft?.otherValue.trim() && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
        </span>
      )}
      <Input
        autoFocus={!freeOnly}
        value={draft?.otherValue ?? ""}
        disabled={!live}
        placeholder={t("freeAnswerPlaceholder")}
        onChange={(e) =>
          setDraft(page, {
            ...(drafts[page] ?? EMPTY_DRAFT),
            other: true,
            otherValue: e.target.value,
          })
        }
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // Enter: advance to the next set, or send from the last one.
          if (!isLast) goTo(page + 1);
          else if (allAnswered) submit();
        }}
        className="h-7 flex-1 bg-background text-sm"
      />
    </div>
  );

  return (
    // The map takes the PLACE of the composer: it takes up the surface (map
    // edged, light shade, rounded-2xl) rather than a branded shade — she
    // thus follows the light/dark theme like the rest of the interface.
    //
    // It also includes the SHORTCUT: ⌘/Ctrl+Enter sends the responses —
    // or Entry only, if the account has it set that way. The free response field
    // keeps priority (Enter advances one question and `preventDefault`),
    // hence the `defaultPrevented` guard: without it, in “Enter send” mode,
    // the same strike would advance AND send.
    <div
      className="relative rounded-2xl border border-border bg-card px-3.5 py-3 text-sm shadow-sm"
      onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (!isSend(e) || !live || !allAnswered) return;
        e.preventDefault();
        submit();
      }}
    >
      {/* “Skip questions” cross — top right corner of the card. */}
      {showSkip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={skip}
              aria-label={t("skipQuestions")}
              className="absolute right-2 top-2 size-6 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {t("skipQuestions")}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Chips-tabs from sets — multi-question only. */}
      {sets > 1 && (
        <div
          className={cn(
            "mb-2.5 flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5",
            showSkip && "pr-7"
          )}
        >
          {questions.map((question, i) => {
            const active = i === page;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors",
                  active
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <span className="block max-w-24 truncate">
                  {question.header || `${i + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Set courant : question + options en liste verticale. */}
      <div className="flex flex-col gap-1.5">
        <p
          className={cn(
            "leading-relaxed",
            sets === 1 && showSkip && "pr-7"
          )}
        >
          {q.question}
        </p>
        <div className="flex flex-col gap-0.5">
          {q.options.map((o) =>
            optionRow(
              o.label,
              o.description,
              o.recommended,
              !!draft && draft.values.includes(o.label),
              () => pickOption(o.label)
            )
          )}
          {/* “Something else…”: the line transforms into an input field when clicked. */}
          {freeOnly || (draft?.other && !q.multiSelect)
            ? otherInput(true)
            : optionRow(t("otherOption"), "", false, !!draft?.other, pickOther)}
          {/* In multi-selection, “Something else…” remains checked AND opens the field below. */}
          {q.multiSelect && draft?.other && otherInput(false)}
        </div>
      </div>

      {/* Foot: free navigation between sets, GLOBAL sending to the last one. */}
      {(sets > 1 || live) && (
        <div className="mt-1 flex items-center justify-between gap-2 pt-1.5">
          <div>
            {sets > 1 && page > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => goTo(page - 1)}
                className="h-7 rounded-full px-3 text-muted-foreground"
              >
                {t("answerPrev")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sets > 1 && !isLast && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goTo(page + 1)}
                className="h-7 rounded-full px-3"
              >
                {t("answerNext")}
              </Button>
            )}
            {live && (isLast || allAnswered) && (
              <SendShortcutTooltip label={t("answerSend")}>
                <Button
                  type="button"
                  size="sm"
                  disabled={!allAnswered}
                  onClick={submit}
                  className="h-7 rounded-full px-3.5"
                >
                  {t("answerSend")}
                </Button>
              </SendShortcutTooltip>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
