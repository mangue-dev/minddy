"use client";

// Themed calendar built on react-day-picker v9. Self-contained (no external
// stylesheet): every part is styled with mangue-ui design tokens so it matches
// the app in light and dark, and reads cleanly on desktop and mobile.

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  type DayPickerProps,
} from "react-day-picker";
import { cn } from "mangue-ui";

export type CalendarProps = DayPickerProps;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex items-center justify-between",
          defaults.nav,
        ),
        button_previous: cn(
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-40",
          defaults.button_previous,
        ),
        button_next: cn(
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-40",
          defaults.button_next,
        ),
        month_caption: cn(
          "flex h-7 items-center justify-center",
          defaults.month_caption,
        ),
        caption_label: cn(
          "text-sm font-medium capitalize",
          defaults.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "w-9 select-none text-[0.7rem] font-normal text-muted-foreground",
          defaults.weekday,
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("size-9 p-0 text-center", defaults.day),
        outside: cn("text-muted-foreground/40", defaults.outside),
        disabled: cn("text-muted-foreground/30", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const selected = modifiers.selected;
  const today = modifiers.today && !selected;
  // Modificateur maison, générique : un jour SIGNALÉ, en retrait du jour
  // sélectionné. Le picker d'échéance s'en sert pour montrer les prochaines
  // occurrences d'un ticket récurrent (MIN-136) — on voit d'un coup d'œil sur
  // quels jours le ticket va retomber.
  const highlighted = modifiers.highlighted && !selected;

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-sm font-normal outline-none transition-colors",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        today && "bg-accent font-medium text-accent-foreground",
        highlighted &&
          "bg-blue-500/15 text-blue-700 dark:bg-blue-400/20 dark:text-blue-200",
        selected &&
          "bg-primary font-medium text-primary-foreground hover:bg-primary",
        className,
      )}
      {...props}
    />
  );
}
