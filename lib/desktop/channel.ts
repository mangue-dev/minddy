/**
 * The retired desktop CHANNEL (MIN-352, removed by MIN-765).
 *
 * The desktop app used to offer a "preview" channel that loaded
 * `preview.minddy.app` instead of `www.minddy.app`. Since MIN-740 preview has
 * its own database: accounts, projects and issues differ from production, so
 * the channel only led people to a sign-in screen for an account that does not
 * exist there. The toggle and the cross-origin session carry are gone.
 *
 * What remains is the migration of installations that had switched: their
 * `userData/channel.json` still says `"preview"`, and the shell rewrites it to
 * `"stable"` at startup (`desktop/src/channel-store.ts`). The window always
 * loads the stable origin; `MINDDY_DESKTOP_ORIGIN` remains the team's way to
 * open preview in a development shell.
 *
 * PURE module, without `electron`: the decision is tested here, the file I/O
 * stays in the shell.
 */

/** The only channel the desktop app still records. */
export const DESKTOP_STABLE_CHANNEL = "stable";

/**
 * Whether the parsed content of `channel.json` must be rewritten to stable.
 *
 * Only a file that explicitly recorded the retired preview channel is
 * rewritten. A missing, unreadable or unknown value already loads production,
 * so it is left alone.
 */
export function storedChannelNeedsReset(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  return (raw as { channel?: unknown }).channel === "preview";
}
