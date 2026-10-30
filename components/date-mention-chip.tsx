"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTimePicker } from "@/components/date-time-picker";
import { MentionChip } from "@/components/mention-chip";
import { DATE_ONLY } from "@/lib/due-date";
import {
  dayKey,
  formatMentionDate,
  relativeMentionDate,
  takeDatePickerRequest,
  type MentionDate,
} from "@/lib/mention-date";

const noSubscription = () => () => {};

/** The picker's value: a bare day, or the local wall-clock time as ISO. */
function pickerValue(value: MentionDate): string {
  if (!value.time) return value.date;
  const [hours, minutes] = value.time.split(":").map(Number);
  const [year, month, day] = value.date.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** The picker's answer as a date mention, keeping its end when still after it. */
function fromPicker(next: string, previous: MentionDate): MentionDate | null {
  let value: MentionDate;
  if (DATE_ONLY.test(next)) value = { date: next };
  else {
    const at = new Date(next);
    if (Number.isNaN(at.getTime())) return null;
    const pad = (part: number) => String(part).padStart(2, "0");
    value = { date: dayKey(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
  }
  return previous.end && previous.end > value.date ? { ...value, end: previous.end } : value;
}

/**
 * The pill of a date mention (MIN-872): "Today", "Tomorrow", "Yesterday"
 * while the date is that close, the full date otherwise. The date itself is
 * fixed when written. In an editor (`onChange`), a click opens the date and
 * time picker; elsewhere the pill only reads. Hovering a pill that shows a
 * full date tells how far it is from now ("in 3 weeks"). A pill inserted by
 * `@date` opens its picker at once.
 *
 * The server render does not know the reader's day: until the browser takes
 * over, the pill shows the full date, which never mismatches.
 */
export function DateMentionChip({
  value,
  onChange,
}: {
  value: MentionDate;
  onChange?: (next: MentionDate) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Common");
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const now = hydrated ? new Date() : null;
  const label = formatMentionDate(value, locale, now);
  const tooltip = now ? relativeMentionDate(value, locale, now) : null;

  // `@date` was just picked: this pill opens its picker where it stands.
  useEffect(() => {
    if (!onChange || !takeDatePickerRequest()) return;
    // The holder is `display: contents`: the pill inside it has the box.
    const rect = holder.current?.firstElementChild?.getBoundingClientRect();
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
  }, [onChange]);

  if (!onChange) return <MentionChip type="date" id={value.date} label={label} tooltip={tooltip} />;
  return (
    <>
      <span
        ref={holder}
        className="contents"
        onMouseDown={(event) => {
          // Where the picker opens: the pill's own corner.
          const rect = (event.target as HTMLElement).getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom });
        }}
      >
        <MentionChip
          type="date"
          id={value.date}
          label={label}
          tooltip={anchor ? null : tooltip}
          ariaHasPopup="dialog"
          onClick={() => setAnchor((current) => current ?? { x: 0, y: 0 })}
        />
      </span>
      {anchor ? (
        <DateTimePicker
          variant="anchored"
          open
          stopPropagation
          preserveDateOnly
          anchor={anchor}
          value={pickerValue(value)}
          onOpenChange={(open) => !open && setAnchor(null)}
          onChange={(next) => {
            const updated = next ? fromPicker(next, value) : null;
            if (updated) onChange(updated);
          }}
          ariaLabel={t("mentionDateEdit")}
        />
      ) : null}
    </>
  );
}
