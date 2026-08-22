"use client";

// One reusable date + time picker for every deadline in the app (issue cards,
// the ticket side panel, and the issue / objective creation dialogs). Wraps the
// themed <Calendar> in a popover, adds a clean time field and quick actions,
// and renders one of three triggers via `variant`. Values are ISO strings
// (local wall-clock time preserved); `null` means unset.

import * as React from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { enUS as rdpEnUS, fr as rdpFr } from "react-day-picker/locale";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { CalendarDays, Repeat } from "lucide-react";
import { dueDateFormat, dueDateHasTime, parseDueDate } from "@/lib/due-date";
import {
  RECURRENCE_CADENCES,
  occurrencesBetween,
  startDueDate,
  startDueDateISO,
  type RecurrenceCadence,
} from "@/lib/recurrence";
import { recurrenceLabel } from "@/lib/recurrence-label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Default time applied when the time toggle is switched on. */
const DEFAULT_HOUR = 9;

// Deferred: react-day-picker (+ date-fns) loads when a picker first opens,
// not with every route that renders a date field. The fallback holds the
// calendar's footprint so the popover doesn't collapse while it streams in.
const CalendarSurface = React.lazy(() =>
  import("@/components/calendar").then((m) => ({ default: m.Calendar }))
);
const CALENDAR_FALLBACK = "h-[300px] w-72 animate-pulse rounded-md bg-muted/50";

// "anchored" has no visible trigger: it opens (controlled) at `anchor`, the
// mouse position — used by the keyboard field shortcuts (issue-field-shortcuts).
type Variant = "field" | "value" | "chip" | "anchored";

const pad = (n: number) => String(n).padStart(2, "0");

const VALUE_TRIGGER =
  "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

export function DateTimePicker({
  value,
  onChange,
  variant = "field",
  placeholder,
  className,
  ariaLabel,
  /** Stop pointer/click from bubbling to a draggable/clickable ancestor (cards). */
  stopPropagation = false,
  open: controlledOpen,
  onOpenChange,
  anchor,
  tooltip,
  shortcutHint,
  recurrence = null,
  onRecurrenceChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  variant?: Variant;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  stopPropagation?: boolean;
  /** Controlled open state (required for the "anchored" variant). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Viewport coordinates the "anchored" variant opens at (the mouse pointer). */
  anchor?: { x: number; y: number } | null;
  /** Optional tooltip on the trigger (triggered variants only). */
  tooltip?: string;
  /** Key badge (e.g. "D") shown next to the tooltip — surfaces the shortcut. */
  shortcutHint?: string;
  /** Ticket repetition rate (MIN-136). */
  recurrence?: RecurrenceCadence | null;
  /**
   * Make the field recursible: without this callback, the popover remains pure
   * deadline selector that it has always been (this is the case of the target date
   * of a goal). With it, a selector “Once | Recurring » is added
   * at the top, and a cadence line below the calendar.
   *
   * The callback carries BOTH fields because both move at the same time
   * gesture: make a ticket recurring without a date, give it one, and delete
   * the deadline cuts the recurrence. Two separate reminders would be two
   * concurrent writes on the same line.
   */
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
}) {
  const t = useTranslations("DatePicker");
  const tRec = useTranslations("Recurrence");
  const format = useFormatter();
  const locale = useLocale();
  // Locale objects come from a tiny standalone subpath — only DayPicker itself
  // (via <Calendar> below) is heavy enough to deserve the lazy boundary.
  const dfLocale = locale === "fr" ? rdpFr : rdpEnUS;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const timeId = React.useId();
  const switchId = React.useId();
  const cadenceId = React.useId();
  const selected = parseDueDate(value);

  /**
   * Return the wheel to the calendar.
   *
   * Radix takes the popover to `<body>`. Opened from a side panel or
   * dialog — therefore from a modal — it lands OUTSIDE the subtree that
   * react-remove-scroll allows, and this cancels the scroll all the way
   * rest: the calendar was displayed, but only scrolled by grabbing the
   * rod. Here we stop the event at the popover level, BEFORE it
   * goes back to `document` where react-remove-scroll is listening; the browser
   * then scrolls normally.
   *
   * The other way — carrying the popover INTO the modal (`container`) — works for
   * the side panel but not for the creation dialog, whose
   * `overflow-y: auto` trims the calendar. A single mechanism for both,
   * so, and the popover remains brought to `<body>` where nothing cuts it.
   *
   * Listening is in the CAPTURE phase on `document`: react-remove-scroll,
   * he listens to the same target in the bubble phase, and capture comes first.
   * An earphone placed on the popover node would not be enough (verified:
   * the event still happened `defaultPrevented` to the document), and
   * `onWheel` of React even less — React delegates its listeners, without
   * guaranteed order compared to a native earphone.
   *
   * `overscroll-contain` completes the picture: without it, the wheel
   * would continue on what's behind it once the calendar ends
   * course.
   */
  React.useEffect(() => {
    if (!open) return;
    const keepWheel = (e: WheelEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest("[data-datetime-picker]")) {
        e.stopPropagation();
      }
    };
    document.addEventListener("wheel", keepWheel, { capture: true });
    return () =>
      document.removeEventListener("wheel", keepWheel, { capture: true });
  }, [open]);

  // The month displayed follows the value. This is the counterpart of recalibration: on a ticket
  // recurring, clicking on a past day brings up the NEXT occurrence, sometimes the month
  // according to — without that, no day would be highlighted in the displayed month
  // and the click would look like it didn't do anything. Manual navigation passes
  // by the same state, it therefore does not enter into conflict; `open` in the
  // dependencies puts it back on the due date each time it is opened, as did
  // `defaultMonth` when the calendar went back.
  const [month, setMonth] = React.useState<Date>(() => selected ?? new Date());
  React.useEffect(() => {
    const next = parseDueDate(value);
    if (next) setMonth(next);
  }, [value, open]);

  // Time is opt-in: a date is stored at midnight (date-only) until the user
  // switches the toggle on. Sync the toggle when the value gains/loses a time.
  const valueHasTime = selected ? dueDateHasTime(selected) : false;
  const [timeEnabled, setTimeEnabled] = React.useState(valueHasTime);
  React.useEffect(() => {
    setTimeEnabled(valueHasTime);
  }, [valueHasTime]);

  const label = selected
    ? format.dateTime(
        selected,
        dueDateFormat(selected, { compact: variant === "chip" }),
      )
    : null;
  const placeholderText = placeholder ?? t("placeholder");

  /* ── Recurrence (MIN-136) ─────────────────────── ──────────────────────── */

  // Recurring mode only exists if the caller has opened it. Elsewhere (date
  // target of an objective), this entire block is inert.
  const recurrable = !!onRecurrenceChange;
  const isRecurring = recurrable && !!recurrence;
  /** Proposed cadence when switching to “Recurring”: maintenance, that
      se fait par semaine plus souvent qu'autrement. */
  const DEFAULT_CADENCE: RecurrenceCadence = "weekly";

  const setMode = (mode: "once" | "recurring") => {
    if (!onRecurrenceChange) return;
    if (mode === "once") {
      onRecurrenceChange({ due_date: value, recurrence: null });
      return;
    }
    // A cadence without a deadline does not exist: in the absence of a chosen date, the
    // series starts today (the calendar remains there to move it).
    const start = new Date();
    if (!selected) start.setHours(0, 0, 0, 0);
    setCadence(DEFAULT_CADENCE, value ?? start.toISOString());
  };

  /** Setting (or changing) the cadence resets the starting deadline: this is the gesture
 which defines the schedule, therefore the one where “last Monday” becomes “next Monday
”. */
  const setCadence = (cadence: RecurrenceCadence, from: string | null) => {
    onRecurrenceChange?.({
      due_date: startDueDateISO(from, cadence) ?? from,
      recurrence: cadence,
    });
  };

  /** What EACH cadence would give for the current deadline — “all
 Mondays”, “every 3rd of the month”: the choice can be read without having to do so. */
  const cadenceLabel = (c: RecurrenceCadence) =>
    recurrenceLabel(c, selected, tRec, format, locale);

  // The next deadlines, highlighted in the month displayed: see where the
  // ticket will fall is better than deducting it from the cadence. The grid
  // overflows from the month (neighboring days), hence the week margin on each side.
  const occurrences = React.useMemo(() => {
    const base = parseDueDate(value);
    if (!isRecurring || !recurrence || !base) return [];
    const from = new Date(month.getFullYear(), month.getMonth(), 1 - 7);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 7, 23, 59, 59, 999);
    return occurrencesBetween(base, recurrence, from, to);
  }, [isRecurring, recurrence, value, month]);

  // Preserve the picked wall-clock time; store as ISO.
  //
  // On a recurring ticket, the date chosen is a START and not a date
  // fixed: choosing last Monday as weekly means “every Monday”,
  // so next Monday. The server applies the same rule — do it here too
  // prevents the card from displaying the past due date for a second before resetting.
  const commit = (d: Date) => {
    const resolved = isRecurring && recurrence ? startDueDate(d, recurrence) : d;
    onChange(resolved.toISOString());
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const next = new Date(day);
    if (timeEnabled) {
      next.setHours(
        selected ? selected.getHours() : DEFAULT_HOUR,
        selected ? selected.getMinutes() : 0,
        0,
        0,
      );
    } else {
      next.setHours(0, 0, 0, 0); // date-only
    }
    commit(next);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [h, m] = e.target.value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(selected ?? new Date());
    next.setHours(h, m, 0, 0);
    commit(next);
  };

  const toggleTime = (enabled: boolean) => {
    setTimeEnabled(enabled);
    if (!selected) return;
    const next = new Date(selected);
    next.setHours(enabled ? DEFAULT_HOUR : 0, 0, 0, 0);
    commit(next);
  };

  const clear = () => {
    // Clearing the due date of a recurring ticket cuts the recurrence: this is the
    // date which shifts, without it the series no longer has a starting point.
    if (isRecurring && onRecurrenceChange) {
      onRecurrenceChange({ due_date: null, recurrence: null });
    } else {
      onChange(null);
    }
    setOpen(false);
  };

  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  // A recurring ticket has the repeat icon wherever its due date
  // is displayed: this is what distinguishes “August 12” from “every month,
  // August 12” without extending the chip. The cadence can be read on hover.
  const TriggerIcon = isRecurring ? Repeat : CalendarDays;

  let trigger: React.ReactNode;
  if (variant === "value") {
    trigger = (
      <button type="button" aria-label={ariaLabel} className={cn(VALUE_TRIGGER, className)}>
        {isRecurring && <Repeat className="size-3.5 shrink-0 text-muted-foreground" />}
        {label ?? <span className="text-muted-foreground">{placeholderText}</span>}
      </button>
    );
  } else if (variant === "chip") {
    trigger = (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={stop}
        onPointerDown={stop}
        className={cn(
          "-m-1 flex items-center gap-1 rounded-md p-1 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
          className,
        )}
      >
        <TriggerIcon className="size-3 shrink-0" />
        <span>{label ?? placeholderText}</span>
      </button>
    );
  } else if (variant === "field") {
    trigger = (
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring",
          className,
        )}
      >
        <TriggerIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !label && "text-muted-foreground")}>
          {label ?? placeholderText}
        </span>
      </button>
    );
  }
  // variant === "anchored": no trigger — opens (controlled) at `anchor`.

  // A tooltip (with an optional shortcut badge) wraps triggered variants only —
  // the "anchored" variant has no visible trigger to hang a tooltip on.
  const showTooltip = tooltip && variant !== "anchored";
  // On a recurring ticket, hovering says cadence — the only thing neither
  // neither the bullet nor the icon show.
  // The tooltip date is WITHOUT time when the ticket is recurring: the
  // pace the door already (“every Monday at 09:00”), repeat it twice
  // in the same sentence says nothing more.
  const tooltipText =
    isRecurring && recurrence && selected
      ? tRec("chip", {
          cadence: cadenceLabel(recurrence),
          date: format.dateTime(selected, {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        })
      : tooltip;

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "anchored" ? (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{ position: "fixed", left: anchor?.x ?? 0, top: anchor?.y ?? 0 }}
          />
        </PopoverAnchor>
      ) : (
        // The `TooltipTrigger` is there even without a tooltip (MIN-313): it is
        // the opening which varies, the more the shape of the tree. The variant
        // “anchored” remains separate — it has no trigger at all, it’s
        // another structure and not an execution switch.
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
      )}
      <PopoverContent
        align={variant === "field" || variant === "anchored" ? "start" : "end"}
        // The content is high (calendar + time, and the cadence in addition on a
        // recurring ticket): without ceiling, open from the bottom of a panel it
        // was overflowing the top of the window, months and tabs cut. Radix
        // publishes the available height; we stick to it and scroll.
        collisionPadding={8}
        // Wheel listener mark above — it recognizes the popover
        // to this attribute rather than to a ref, which does not cross the facade.
        data-datetime-picker=""
        className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto overscroll-contain p-3"
        onClick={stop}
        onPointerDown={stop}
        // Anchored variant: it opens with an action (shortcut D, entry of
        // right-click menu), not on a trigger. Opened from the menu, this one
        // disassembles just after and the focus falls back on the document: Radix y
        // reads a “focus gone outside” and closes the calendar even before
        // that we saw displayed. Click out and Escape always close it —
        // This is the only path that is neutralized here.
        onFocusOutside={
          variant === "anchored" ? (e) => e.preventDefault() : undefined
        }
      >
        {/* The recurrence is decided BEFORE the date: “recurring, every month”
 then “from which day”. This is also what remains visible at the top when the window is too short and the popover scrolls. */}
        {recurrable && (
          <div className="flex flex-col gap-2.5 pb-3">
            <SegmentedControl
              options={[
                { value: "once", label: tRec("once") },
                { value: "recurring", label: tRec("recurring") },
              ]}
              value={isRecurring ? "recurring" : "once"}
              onChange={setMode}
              ariaLabel={tRec("cadence")}
            />
            {isRecurring && (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={cadenceId} className="text-sm text-muted-foreground">
                  {tRec("cadence")}
                </label>
                <Select
                  value={recurrence ?? undefined}
                  onValueChange={(v) => setCadence(v as RecurrenceCadence, value)}
                >
                  <SelectTrigger id={cadenceId} size="sm" className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_CADENCES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {cadenceLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <React.Suspense fallback={<div className={CALENDAR_FALLBACK} aria-hidden />}>
          <CalendarSurface
            mode="single"
            selected={selected ?? undefined}
            onSelect={handleDaySelect}
            month={month}
            onMonthChange={setMonth}
            modifiers={{ highlighted: occurrences }}
            locale={dfLocale}
          />
        </React.Suspense>
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={switchId} className="text-sm text-muted-foreground">
              {t("addTime")}
            </label>
            <Switch
              id={switchId}
              checked={timeEnabled}
              onCheckedChange={toggleTime}
              disabled={!selected}
            />
          </div>
          {timeEnabled && selected && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={timeId} className="text-sm text-muted-foreground">
                {t("time")}
              </label>
              <input
                id={timeId}
                type="time"
                value={`${pad(selected.getHours())}:${pad(selected.getMinutes())}`}
                onChange={handleTimeChange}
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </div>
          )}
          {isRecurring && (
            <p className="max-w-[15rem] text-xs leading-snug text-muted-foreground">
              {tRec("hint")}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleDaySelect(new Date())}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-primary outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
          >
            {t("today")}
          </button>
          {selected && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md px-1.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-muted"
            >
              {t("clear")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  // Unconditional rendering, controlled opening — same reason as `SearchMenu`, same
  // reason (MIN-313): a conditional envelope changes the type of the root,
  // so replaces the DOM node and loses the focus it carried.
  return (
    <Tooltip open={showTooltip ? undefined : false}>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltipText}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
