import { realpath as nodeRealpath } from "node:fs/promises";
import { posix as posixPath } from "node:path";

import { assertNotGit } from "../repo-path";
import {
  editTargets,
  LOCAL_CAPABILITY_REASON,
  type PermissionAsk,
  type PermissionVerdict,
} from "./opencode-permissions";

/**
 * Disk-backed guards for local runs.
 *
 * Lexical containment cannot detect an in-repository symlink that targets a
 * host path. These checks resolve the nearest existing ancestor before reads
 * and writes are approved. Direct URL fetching is denied independently.
 */

/** What the module needs from the outside world. Injectable, therefore testable. */
export interface LocalGuardDeps {
  /** `realpath(2)`. Raised when the path does not exist — this is expected and managed. */
  realpath?: (path: string) => Promise<string>;
}

const defaultRealpath = (path: string): Promise<string> => nodeRealpath(path);
/** Resolve the closest existing ancestor, preserving a missing target suffix. */
export async function realPathOf(
  absPath: string,
  realpath: (path: string) => Promise<string>,
): Promise<string> {
  const rest: string[] = [];
  let cursor = posixPath.normalize(absPath);
  // Bound traversal so an unexpected path cannot stall the turn indefinitely.
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

/** Refine an allowed verdict using filesystem state; never widen a denial. */
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
  if (ask.permission === "read") {
    return await refineRead(ask, verdict, repoDir, deps.realpath ?? defaultRealpath);
  }
  if (ask.permission === "webfetch") {
    return {
      reply: "reject",
      message:
        "Direct URL fetching is unavailable in local runs. Use the scoped web_search tool when it is offered.",
      reason: LOCAL_CAPABILITY_REASON,
    };
  }
  return verdict;
}

/** Follow write targets through symlinks and keep them inside the repository. */
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
      assertInsideRepo(root, real, path);
      assertNotGit(root, real, path);
    } catch (err) {
      return { reply: "reject", message: (err as Error).message };
    }
  }
  return verdict;
}

async function refineRead(
  ask: PermissionAsk,
  verdict: PermissionVerdict,
  repoDir: string,
  realpath: (path: string) => Promise<string>,
): Promise<PermissionVerdict> {
  const path = (ask.filepath ?? "").trim();
  if (!path) return verdict;
  let root: string;
  try {
    root = await realpath(repoDir);
  } catch {
    root = repoDir;
  }
  const absolute = path.startsWith("/") ? path : posixPath.join(repoDir, path);
  const real = await realPathOf(absolute, realpath);
  try {
    assertInsideRepo(root, real, path);
    return verdict;
  } catch (err) {
    return {
      reply: "reject",
      message: (err as Error).message,
      reason: LOCAL_CAPABILITY_REASON,
    };
  }
}

function assertInsideRepo(repoDir: string, realPath: string, displayPath: string): void {
  const root = posixPath.normalize(repoDir);
  const target = posixPath.normalize(realPath);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`Path escapes the repository: ${displayPath}`);
  }
}
