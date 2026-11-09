/**
 * The shortest label that still says when a conversation message was sent:
 * the time alone on the same day, the day and month with the time in the same
 * year, and the full date with the time otherwise. Days are compared in the
 * reader's local time zone, the one the label is shown in.
 */
export function messageTimeLabel(sentAt: string, locale: string, now: Date = new Date()): string {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return "";
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? time
    : sameYear
      ? { day: "numeric", month: "short", ...time }
      : { day: "numeric", month: "short", year: "numeric", ...time };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
