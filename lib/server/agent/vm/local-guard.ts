import { realpath as nodeRealpath } from "node:fs/promises";
import { lookup as nodeLookup } from "node:dns/promises";
import { posix as posixPath } from "node:path";

import { assertNotGit } from "../repo-path";
import {
  editTargets,
  isHarnessPort,
  webfetchLiteralVerdict,
  type PermissionAsk,
  type PermissionVerdict,
} from "./opencode-permissions";
import {
  fetchHostname,
  isPrivateAddress,
  isPrivateHostname,
  privateFetchMessage,
  PRIVATE_FETCH_REASON,
} from "./private-address";

/**
 * THE TWO GUARDS THAT NEED THE DISK AND THE RESOLVER (MIN-360).
 *
 * [opencode-permissions.ts](opencode-permissions.ts) is PURE, and must remain that way:
 * this is what allows you to break a verdict in a test rather than in production.
 * Now two of the safeguards that going local makes mandatory are not decided
 * on a character string:
 *
 * 1. **the symbolic link.** `resolveWithin` ([repo-path.ts](../repo-path.ts))
 * normalizes a path without ever touching the disk. A
 * `ln -s /Users/x/.ssh <repository>/notes` — which nothing prevents, `ln` not being
 * git — produces a path which satisfies the validation and points where it wants.
 * Only `realpath` slices ;
 * 2. **the loopback behind a name.** Denying `http://127.0.0.1` and letting pass
 * a domain that RESOLVES to 127.0.0.1 keeps nothing at all. The control carries
 * on the address, never on the name.
 *
 * Hence this module: the ordering of addresses is elsewhere and pure
 * ([private-address.ts](private-address.ts)), the two IO entries are
 * injectables, and the supervisor only calls one function.
 */

/** What the module needs from the outside world. Injectable, therefore testable. */
export interface LocalGuardDeps {
  /** `realpath(2)`. Raised when the path does not exist — this is expected and managed. */
  realpath?: (path: string) => Promise<string>;
  /** Resolving a name into addresses. Raises when the name does not resolve. */
  resolve?: (hostname: string) => Promise<string[]>;
  /**
 * The harness ports on the local loop (LLM proxy, tools bridge, server
 * opencode) — cf. `PermissionScope.harnessPorts`. Empty = all local loop
 * is denied, prudent driving of ignorance.
 */
  harnessPorts?: readonly number[];
}

const defaultRealpath = (path: string): Promise<string> => nodeRealpath(path);
const defaultResolve = async (hostname: string): Promise<string[]> => {
  const found = await nodeLookup(hostname, { all: true });
  return found.map((entry) => entry.address);
};

/**
 * The ACTUAL path to a target that may not yet exist — a write often creates
 * the file. We therefore resolve the closest ancestor that exists, then we
 * puts together what is missing: this is what makes a symbolic link placed on a
 * parent FOLDER is seen, where a `realpath` of the file would simply raise.
 */
export async function realPathOf(
  absPath: string,
  realpath: (path: string) => Promise<string>,
): Promise<string> {
  const rest: string[] = [];
  let cursor = posixPath.normalize(absPath);
  // Depth limit: a path does not go back indefinitely, and a loop
  // without a limit in a guardrail is a guardrail which freezes the turn.
  for (let depth = 0; depth < 64; depth++) {
    try {
      const real = await realpath(cursor);
      return rest.length === 0 ? real : posixPath.join(real, ...rest);
    } catch {
      const parent = posixPath.dirname(cursor);
      if (parent === cursor) break;
      rest.unshift(posixPath.basename(cursor));
      cursor = parent;
    }
  }
  return posixPath.normalize(absPath);
}

/**
 * REFINEES AN ALREADY GIVEN VERDICT, on the local path only.
 *
 * The meaning of the function is one-way, and that's what makes it safe to
 * insert: it can only deny what was allowed, never the other way around. A
 * refusal of `decidePermission` comes out intact, without touching the disk.
 *
 * NEVER RAISES, for the reason of `decidePermission`: an IO that fails on an unexpected
 * form would stop the round instead of protecting it. The two ignorances
 * are not treated the same, and this is deliberate — a silent `realpath` on the root
 * of the repository leaves the verdict as is (the pure check has already taken place), a
 * silent DNS resolution REFUSES, because a name about which we know nothing is
 * exactly what this guardrail exists to prevent from passing.
 */
export async function refineLocalVerdict(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  repoDir: string,
  deps: LocalGuardDeps = {},
): Promise<PermissionVerdict> {
  if (verdict.reply !== "once") return verdict;

  if (ask.permission === "edit") {
    return await refineEdit(ask, verdict, repoDir, deps.realpath ?? defaultRealpath);
  }
  if (ask.permission === "webfetch") {
    return await refineWebfetch(
      ask,
      verdict,
      deps.resolve ?? defaultResolve,
      deps.harnessPorts ?? [],
    );
  }
  return verdict;
}

/**
 * WRITING, FOLLOWED TO ITS REAL TARGET (MIN-360, then MIN-364).
 *
 * ⚠ WHAT DISAPPEARED WITH D5: refusal to exit from the deposit. There was only
 * to prevent a `ln -s` from taking a write out of a scope... which
 * no longer exists. Keeping it would have made the disk reachable in a straight line and
 * refused by symbolic link, which makes no sense.
 *
 * WHAT REMAINS, and that's the whole point of this function now: `.git/`.
 * `resolveWithin` and `assertNotGit` are PURE — they normalize a path without
 * never touching the disk —, but a `ln -s <repository>/.git <repository>/notes` produces a
 * path that satisfies them both and writes well to `.git/hooks`. Only
 * `realpath` slices, and a hook placed there executes on the next git gesture of a human
 *, with his keychain unlocked.
 */
async function refineEdit(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  repoDir: string,
  realpath: (path: string) => Promise<string>,
): Promise<PermissionVerdict> {
  let root: string;
  try {
    root = await realpath(repoDir);
  } catch {
    root = repoDir;
  }
  for (const { path } of editTargets(ask)) {
    const absolute = path.startsWith("/") ? path : posixPath.join(repoDir, path);
    const real = await realPathOf(absolute, realpath);
    try {
      assertNotGit(root, real, path);
    } catch (err) {
      return { reply: "reject", message: (err as Error).message };
    }
  }
  return verdict;
}

/**
 * THE RESOLUTION, BUT ONLY WHEN IT CAN CHANGE SOMETHING (MIN-364).
 *
 * Control now concerns the PORT: only a fetch that targets a port of the
 * harness can be refused. A name that doesn't have one of these ports therefore has no reason to be resolved — and not resolving it removes a DNS round trip on each fetch in a round, in addition to making the check readable: on
 * looks for "is this name a disguise of our proxy", not " is
 * this name is private.
 */
async function refineWebfetch(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  resolve: (hostname: string) => Promise<string[]>,
  harnessPorts: readonly number[],
): Promise<PermissionVerdict> {
  const hostname = fetchHostname(ask.url);
  // The literal verdict first: it redoes the check that `decidePermission` has
  // already done, and this is intended — this function must stand alone, without assuming that
  // someone passed the right guardrail before her.
  if (!hostname || isPrivateHostname(hostname)) {
    return webfetchLiteralVerdict(ask.url, harnessPorts);
  }
  if (!isHarnessPort(ask.url, harnessPorts)) return verdict;

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    return {
      reply: "reject",
      message:
        `Refused fetching ${hostname} — it could not be resolved, so the harness cannot tell ` +
        `whether it points at one of its own services on this machine.`,
      reason: PRIVATE_FETCH_REASON,
    };
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return {
      reply: "reject",
      message: privateFetchMessage(hostname),
      reason: PRIVATE_FETCH_REASON,
    };
  }
  return verdict;
}
