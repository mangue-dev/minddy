import { createHash } from "node:crypto";

/**
 * WHAT MACHINE IS THIS? (MIN-293)
 *
 * ## The problem, and it is not hypothetical
 *
 * On the workstation where we are developing minddy, **two shells are running side by side**:
 * the installed app and that of `npm run desktop:dev`. They have separate
 * profiles — `app.setName` adds `-dev` outside the packaged app, and `userData` en
 * derives ([main.ts](../../desktop/src/main.ts)) — but **they share the
 * session** as soon as they point to the same origin: the cookies are by
 * origin, not by profile.
 *
 * Two shells with the same session, that's two machines which would claim the
 * same runs for the same account. The local execution lease ties the tiebreaker
 * (to issue is to revoke — [local-exec.ts](../server/agent/local-exec.ts)),
 * but the tiebreaker is an observation after the fact: the second chases the first,
 * the first harness loses its turn, and nothing says why.
 *
 * ## Why it DERIVES from `userData`, instead of being drawn and put away
 *
 * A random identifier written to a file would do the same job — and
 * would provide three ways to miss it: the file may be missing, be truncated
 * by a sudden shutdown, or be copied as is by a Time
 * machine restoration on another machine. The `userData` path is already the thing
 * which distinguishes the two profiles, it exists before any file, and it does not
 * corrupt.
 *
 * This results in a property that you need to know: **two Macs including user
 * has the same short name get the same identifier**
 * (`/Users/clement/Library/Application Support/minddy`). This is not a defect
 * for what it is used for - say "it's another typo", not "it's a
 * another computer" - but it prohibits using it as a device identity
 * in the strong sense. The day this is needed, it is the lease which must
 * carry the guarantee, not this chain.
 *
 * ## It is not a secret
 *
 * It travels in clear to the server (MIN-371 uses it for the claim) and il
 * does not open anything: it is the LEASE which authorizes, never the identifier. The hash isn't there to hide the path — it's there so that whatever travels is of fixed length and doesn't have anyone's first name on it.
 */

/** Length of the identifier. 32 hexadecimal characters = 128 hash bits. */
const DEVICE_ID_LENGTH = 32;

/**
 * The identifier of this shell, derived from its data folder.
 *
 * The path is normalized before being hashed — a trailing slash, a duplicate of
 * separator or a different case designates the same folder and must give
 * the same identifier, otherwise a version of the app that would build the path
 * would otherwise present itself as a new machine.
 */
export function deviceIdForUserData(userDataPath: string): string {
  return createHash("sha256")
    .update(normalizeUserDataPath(userDataPath), "utf8")
    .digest("hex")
    .slice(0, DEVICE_ID_LENGTH);
}

/**
 * The path returned to its comparable form. No `path.resolve`: this module is
 * pure and can be tested without a file system, and a `userData` path is
 * always absolute — what we correct here are the only variations that a
 * concatenation can introduce.
 */
export function normalizeUserDataPath(userDataPath: string): string {
  return userDataPath.trim().replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * HOW THIS SHELL SHOWS, in plain text.
 *
 * The identifier cannot be read; this label, yes — it ends up in a tower log,
 * in a diagnostic report, and one day in a “your machines” list. It
 * SAYS when it is the dev shell, because it is precisely the confusion
 * that we want to make impossible: believing that we are looking at the shell that we are developing
 * while we are looking at the installed app is an error that we have already made here
 * (cf. the single instance lock in `main.ts`).
 */
export function deviceLabel(opts: {
  hostname: string;
  packaged: boolean;
}): string {
  const host = opts.hostname.trim().replace(/\.local$/i, "") || "Mac";
  return opts.packaged ? host : `${host} (dev)`;
}
