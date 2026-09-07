import { posix as posixPath } from "node:path";

import { checkCommand, FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { assertNotGit, resolveWithin } from "../repo-path";
import { isSecretFile } from "../secret-scan";



















































export interface PermissionAsk {
  id: string;
  sessionId: string;

  permission: string;

  callId: string;

  command?: string;








  filepath?: string;














  files?: { path: string; status: "added" | "modified" | "deleted" }[];




  subagentType?: string;





  url?: string;
}





export interface SubagentContext {

  names: ReadonlySet<string>;

  running: number;











  pending?: number;

  maxParallel: number;
}


export interface PermissionVerdict {
  reply: "once" | "reject";

  message?: string;

  reason?: string;
}

const ALLOW: PermissionVerdict = { reply: "once" };


export const UNKNOWN_PERMISSION_REASON = "unknown_permission";


export const DOOM_LOOP_REASON = "doom_loop";


export const DISABLED_PERMISSION_REASON = "disabled_permission";


export const LOCAL_CAPABILITY_REASON = "local_capability_disabled";



























export const REVIEWED_OPENCODE_VERSION = "1.18.16";





export const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set([

  "bash",
  "edit",
  "read",
  "webfetch",
  "task",
  "external_directory",
  "question",
  "doom_loop",



  "glob",
  "grep",
  "websearch",
  "todowrite",
  "skill",
  "plan_enter",
  "plan_exit",
]);


export const SECRET_FILE_READ_REASON = "secret_file_read";









export interface PermissionScope {

  local?: boolean;
}






export function decidePermission(
  ask: PermissionAsk,









  repoDir: string,
  subagents?: SubagentContext,
  scope: PermissionScope = {},
): PermissionVerdict {
  switch (ask.permission) {
    case "task":
      return decideTask(ask, subagents);

    case "bash": {
      if (scope.local) {
        return {
          reply: "reject",
          message:
            "Shell commands are unavailable in local runs because they would inherit unrestricted host filesystem and network access.",
          reason: LOCAL_CAPABILITY_REASON,
        };
      }
      const command = (ask.command ?? "").trim();


      if (!command) {
        return {
          reply: "reject",
          message: "The harness could not read the command to run, so it refused it.",
        };
      }


      const verdict = checkCommand(command, { local: false });
      if (verdict.allowed) return ALLOW;
      return { reply: "reject", message: verdict.reason, reason: FORBIDDEN_COMMAND_REASON };
    }

    case "edit": {







      const targets = editTargets(ask);
      if (targets.length === 0) {
        return {
          reply: "reject",
          message: "The harness could not read the path to write, so it refused the edit.",
        };
      }
      try {
        for (const { path } of targets) {

          const abs = absoluteInRepo(repoDir, path);
          assertNotGit(repoDir, abs, path);
        }
        return ALLOW;
      } catch (err) {
        return { reply: "reject", message: (err as Error).message };
      }
    }


    case "external_directory":
      return {
        reply: "reject",
        message: `The harness only allows work inside the repository (${repoDir}).`,
        ...(scope.local ? { reason: LOCAL_CAPABILITY_REASON } : {}),
      };

    /** Local reads are repository-contained and environment files remain denied. */
    case "read": {
      const path = (ask.filepath ?? "").trim();
      if (!path) {
        return {
          reply: "reject",
          message: "The harness could not read the path to open, so it refused the read.",
        };
      }
      try {
        absoluteInRepo(repoDir, path);
      } catch (err) {
        return {
          reply: "reject",
          message: (err as Error).message,
          ...(scope.local ? { reason: LOCAL_CAPABILITY_REASON } : {}),
        };
      }
      if (!isSecretFile(path)) return ALLOW;
      return {
        reply: "reject",
        message:
          `Refused reading ${path} — environment files hold this machine's real credentials, ` +
          `and this session runs on someone's own computer. If you need to know which ` +
          `variables exist, read the \`.env.example\` next to it.`,
        reason: SECRET_FILE_READ_REASON,
      };
    }


    case "webfetch":
      return scope.local
        ? {
            reply: "reject",
            message:
              "Direct URL fetching is unavailable in local runs. Use the scoped web_search tool when it is offered.",
            reason: LOCAL_CAPABILITY_REASON,
          }
        : ALLOW;







    case "glob":
    case "grep":
      return ALLOW;












    case "question":
      return ALLOW;













    case "doom_loop":
      return {
        reply: "reject",
        message:
          `You have called the same tool with the same input several times in a row, and it keeps ` +
          `failing. Calling it again will not change the answer: read the error, then either fix ` +
          `what it points at or take another route. If nothing works, say so in your reply — ` +
          `looping costs a round each time and produces the same thing.`,
        reason: DOOM_LOOP_REASON,
      };











    case "websearch":
    case "todowrite":
    case "skill":
    case "plan_enter":
    case "plan_exit":
      return {
        reply: "reject",
        message:
          `\`${ask.permission}\` is off in this session — minddy serves its own equivalent ` +
          `(\`web_search\` for the web, \`update_plan\` for the checklist, the ticket's plan for ` +
          `the rest). Use those instead.`,
        reason: DISABLED_PERMISSION_REASON,
      };



















    default:
      if (!scope.local) return ALLOW;
      return {
        reply: "reject",
        message:
          `The harness does not know the permission "${ask.permission}", and this session runs ` +
          `on a real computer — so it refused it rather than allow something it has never ` +
          `checked. Do what you were doing another way.`,
        reason: UNKNOWN_PERMISSION_REASON,
      };
  }
}






















function decideTask(ask: PermissionAsk, subagents?: SubagentContext): PermissionVerdict {
  if (!subagents) return ALLOW;



  const engaged = subagents.running + (subagents.pending ?? 0);
  if (engaged >= subagents.maxParallel) {
    return {
      reply: "reject",
      message:
        `Too many sub-agents running at once (${engaged}/${subagents.maxParallel}). ` +
        `Wait for one to report back before delegating again.`,
      reason: "subagent_limit",
    };
  }

  const requested = (ask.subagentType ?? "").trim();
  if (!subagents.names.has(requested)) {
    return {
      reply: "reject",
      message:
        `Unknown sub-agent type ${JSON.stringify(requested)}. ` +
        `Available for this session: ${[...subagents.names].join(", ")}.`,
      reason: "unknown_subagent",
    };
  }
  return ALLOW;
}

/**
 * What a write request commits, file by file. `files` is authentic from
 * that it is there (`apply_patch`, which also carries the NATURE of each gesture);
 * otherwise it is `filepath`, which is then a true unique path (`write`, `edit`)
 * of which we can only say “modified”; the final Git list remains authoritative.
 */
export function editTargets(ask: PermissionAsk): NonNullable<PermissionAsk["files"]> {
  const files = (ask.files ?? [])
    .map((f) => ({ ...f, path: f.path.trim() }))
    .filter((f) => f.path);
  if (files.length > 0) return files;
  const single = (ask.filepath ?? "").trim();
  return single ? [{ path: single, status: "modified" }] : [];
}

/**
 * The absolute path of a write, RELEASED if it leaves the repository. A relative path
 * passes through `resolveWithin` (the `..` is normalized there, the output is refused there);
 * an absolute is compared to the deposit as is.
 */
function absoluteInRepo(repoDir: string, filepath: string): string {
  if (!filepath.startsWith("/")) return resolveWithin(repoDir, filepath);
  const resolved = posixPath.normalize(filepath);
  if (resolved !== repoDir && !resolved.startsWith(`${repoDir}/`)) {
    throw new Error(`Path escapes the repository: ${filepath}`);
  }
  return resolved;
}
