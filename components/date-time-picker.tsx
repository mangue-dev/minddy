"use client";

// One reusable date + time picker for every échéance in the app (issue cards,
// the ticket side panel, and the issue / objective creation dialogs). Wraps the
// themed <Calendar> in a popover, adds a clean time field and quick actions,
// and renders one of three triggers via `variant`. Values are ISO strings
// (local wall-clock time preserved); `null` means unset.

import * as React from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { enUS, fr } from "react-day-picker/locale";
import {
  Kbd,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/calendar";
import { dueDateFormat, dueDateHasTime, parseDueDate } from "@/lib/due-date";

/** Default time applied when the time toggle is switched on. */
const DEFAULT_HOUR = 9;

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
}) {
  const t = useTranslations("DatePicker");
  const format = useFormatter();
  const locale = useLocale();
  const dfLocale = locale === "fr" ? fr : enUS;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const timeId = React.useId();
  const switchId = React.useId();
  const selected = parseDueDate(value);

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

  // Preserve the picked wall-clock time; store as ISO.
  const commit = (d: Date) => onChange(d.toISOString());

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
    onChange(null);
    setOpen(false);
  };

  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  let trigger: React.ReactNode;
  if (variant === "value") {
    trigger = (
      <button type="button" aria-label={ariaLabel} className={cn(VALUE_TRIGGER, className)}>
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
        <CalendarDays className="size-3 shrink-0" />
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
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
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

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "anchored" ? (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{ position: "fixed", left: anchor?.x ?? 0, top: anchor?.y ?? 0 }}
          />
        </PopoverAnchor>
      ) : showTooltip ? (
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align={variant === "field" || variant === "anchored" ? "start" : "end"}
        className="w-auto p-3"
        onClick={stop}
        onPointerDown={stop}
        // Variante ancrée : elle s'ouvre sur une action (raccourci D, entrée du
        // menu clic droit), pas sur un trigger. Ouverte depuis le menu, celui-ci
        // se démonte juste après et le focus retombe sur le document : Radix y
        // lit un « focus parti dehors » et referme le calendrier avant même
        // qu'on ait vu s'afficher. Le clic dehors et Échap le ferment toujours —
        // c'est bien le seul chemin qu'on neutralise ici.
        onFocusOutside={
          variant === "anchored" ? (e) => e.preventDefault() : undefined
        }
      >
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          onSelect={handleDaySelect}
          defaultMonth={selected ?? undefined}
          locale={dfLocale}
        />
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

  if (!showTooltip) return popover;
  return (
    <Tooltip>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltip}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
