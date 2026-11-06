/**
 * How much of a Numo message travels inline (MIN-916). Past this, the composer
 * attaches pasted text as a file and the chat route does the same for any
 * client that did not, so Numo reads the text in pages instead of every turn
 * of the history carrying it whole.
 */
export const MAX_INLINE_MESSAGE_CHARS = 12_000;

/**
 * The date part of a pasted-text attachment's name, `YYYY-MM-DD HH.mm` in the
 * given time zone (the browser's, or the one a chat request sent). Dots, not
 * colons, keep the name valid on every file system.
 */
export function pastedTextStamp(date: Date, timeZone?: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    // An unknown time zone name from a client: fall back to UTC.
    return pastedTextStamp(date, "UTC");
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}.${part("minute")}`;
}

/** Files one Numo chat message carries, as the composer and the route allow. */
export const MAX_CHAT_ATTACHMENTS = 5;
