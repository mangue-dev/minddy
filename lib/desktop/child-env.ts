/**
 * THE ENVIRONMENT OF A SHELL CHILD (MIN-293) — the half that decides
 * sans process.
 *
 * ## The trap, measured in real life
 *
 * `utilityProcess.fork` **refuses a `env` whose value is not a string**,
 * and he says it in a way that doesn't designate anything: `TypeError: Invalid value for
 * approx. Not the key name, not the value. Remove a variable by writing
 * `{ ...process.env, NODE_OPTIONS: undefined }` — the natural form, that which
 * works with `child_process.spawn` — therefore brings down the fork **before** the
 * harness has started, that is to say at the exact place where there is no event yet,
 * ni checkpoint, ni journal de tour.
 *
 * Hence this module: **we REMOVE the key, we do not set it to `undefined`**, and we
 * filters anything that is not a string. One line, but that's the kind of
 * line which costs a debugging session the second time.
 *
 * ## What a child does not inherit, and why
 *
 * The harness is an ordinary Node bundle, and `npm` is an ordinary program:
 * neither has to receive what Electron asks for its own processes
 * son, nor what an editor left lying around in the terminal that launched the app.
 *
 * - **`ELECTRON_RUN_AS_NODE`** — **VS Code puts it in the environment of everything
 * that it launches**, integrated terminal included. The repository already knows it and removes it
 * to launch Electron ([scripts/dev-desktop.mjs](../../scripts/dev-desktop.mjs));
 * it's the same trap one layer lower.
 * - **`NODE_OPTIONS`** — `npm run dev` of this repository sets one
 * (`--max-http-header-size=32768`). It makes no sense for the harness, and a
 * unknown flag from another version of Node would cause it to die on startup
 * with a message that doesn't talk about anything we've just changed.
 */

/**
 * What a shell child never inherits. Closed voluntarily: a
 * variable removed “just in case” is a variable that no one then puts back.
 */
export const NOT_INHERITED: readonly string[] = ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"];

/**
 * L'environnement d'un enfant : celui du parent, moins ce qui ne se transmet pas,
 * and **nothing but chains**.
 *
 * `drop` is added to `NOT_INHERITED` rather than replacing it — a caller who
 * wants to remove one more variable must not be able to reintroduce both
 * others by forgetting to copy them.
 */
export function childEnv(
  parent: Readonly<Record<string, string | undefined>>,
  drop: readonly string[] = [],
): Record<string, string> {
  const forbidden = new Set([...NOT_INHERITED, ...drop]);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (forbidden.has(key)) continue;
    // The guard that counts: `utilityProcess.fork` raises on any value that is not
    // not a string, and its message does not name the offending key.
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}
