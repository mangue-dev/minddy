/**
 * The shortest label that still says when a conversation message was sent:
 * the time alone on the same day, the named day with the time for the two
 * days before, the day and month with the time in the same year, and the
 * full date with the time otherwise. Days are compared in the
 * reader's local time zone, the one the label is shown in.
 */
export function messageTimeLabel(sentAt: string, locale: string, now: Date = new Date()): string {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return "";
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  // Yesterday and the day before are named in the reader's language, with
  // the time ("yesterday, 7:01 PM").
  const days = daysBetween(date, now);
  if (days === 1 || days === 2) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
    return `${day}, ${new Intl.DateTimeFormat(locale, time).format(date)}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? time
    : sameYear
      ? { day: "numeric", month: "short", ...time }
      : { day: "numeric", month: "short", year: "numeric", ...time };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** Calendar days from `date` to `now`, in local time. */
function daysBetween(date: Date, now: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}
