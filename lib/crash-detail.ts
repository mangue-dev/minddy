/** Longest message kept on the crash screen; a stack never fits a screenshot. */
const MAX_MESSAGE_LENGTH = 160;

/**
 * The one technical line the crash screen shows (MIN-945): the error's kind
 * and message, plus the server digest that matches a production log. Enough
 * to recognize a crash from a screenshot, short enough to read on a phone.
 */
export function crashDetail(error: { name?: unknown; message?: unknown; digest?: unknown }): string {
  const name = typeof error.name === "string" && error.name ? error.name : "Error";
  const raw = typeof error.message === "string" ? error.message.replace(/\s+/g, " ").trim() : "";
  const message = raw.length > MAX_MESSAGE_LENGTH ? `${raw.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : raw;
  const digest = typeof error.digest === "string" && error.digest ? ` · ${error.digest}` : "";
  return `${message ? `${name}: ${message}` : name}${digest}`;
}
