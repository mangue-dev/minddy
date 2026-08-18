import { headTail, TOOL_RESULT_MAX_CHARS } from "./prune";

/**
 * Formatting the output of `run_command` (MIN-107). PURE and testable —
 * `execute.ts` only calls it (it imports `server-only` and the base: nothing
 * executable in test). Two rules, one idea: **never lose the ending**.
 *
 * 1. Truncation keeps the TAIL (`headTail`, elided middle) — the summary
 * of a failing test, the last error of a build, the summary of a lint
 * are still down. The old `cap()` cut through the head: the
 * model saw a hundred green checkmarks and `exitCode: 1`, without knowing what broke.
 * 2. Beyond the threshold, the COMPLETE output is dropped into the sandbox and the
 * path returned (model of OpenCode): the model rereads it on demand with
 * `grep`/`read_file` instead of defending itself from the harness with `| tail`.
 */

/** Heading of stdout returned to the model (middle elided, head AND tail kept). */
export const RUN_COMMAND_STDOUT_CAP = 4000;
/** Cap of stderr returned to the model. */
export const RUN_COMMAND_STDERR_CAP = 2000;
/**
 * THE DEPOSIT FOLLOWS THE TRUNCATION, IT NO LONGER HAS A THRESHOLD OF HIS OWN.
 *
 * He had one — 8,000 cumulative characters — higher than the sum of the two caps
 * (4,000 + 2,000). Between the two there was a band where the middle of the output
 * was elided without anything catching up with it: neither `full_output_path` nor `note`. A
 * `typecheck` with 7,000 characters of stdout lost its errors in the middle, and the
 * prompt also prohibits rerunning the filtered command to find them
 * — we closed the door after taking the key.
 *
 * The right question wasn't "is the release big?" » but “are we going to hide a piece of it from him?” ". This is the one we ask now, and it has
 * exactly the same answer as the `truncated` of `buildResult`.
 *
 * There remains a residual case, and it is SAID rather than covered: the shrinkage
 * of the envelope (`formatRunCommandResult`) can cut lower than the nominal caps
 *, on an output that `spillsToDisk` has passed. `buildResult`
 * then poses a pathless `note`, which explicitly allows the only thing
 * that remains — rerun the framed command.
 */

/** Raw output of a command (form of `ShellResult`). */
export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** What the `run_command` tool returns to the model. */
export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Absolute path of the complete output in the sandbox (if filed). */
  full_output_path?: string;
  /** Rereading instruction, present only with `full_output_path`. */
  note?: string;
}

/** Does the output deserve to be deposited in full in the sandbox? Yes as soon as
 * one of the two flows exceeds ITS cap — that is to say as soon as we elide the
 * middle, and no longer beyond an independent accumulation of caps. */
export function spillsToDisk(o: Pick<CommandOutput, "stdout" | "stderr">): boolean {
  return o.stdout.length > RUN_COMMAND_STDOUT_CAP || o.stderr.length > RUN_COMMAND_STDERR_CAP;
}

/**
 * Name of the repository file: a slug of the command (so that the model recognizes
 * ITS output in `list_dir`) + a unique `seq` in the run (calling it the slice
 * by continuation, like other run counters).
 */
export function toolOutputFileName(command: string, seq: number): string {
  const slug =
    command
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "command";
  return `${slug}-${seq}.log`;
}

/**
 * Document placed in the sandbox: the command, its exit code, then stdout
 * and stderr IN ENTIRETY under recognizable headers (a `grep` on the file should
 * be able to tell which stream the line found comes from).
 */
export function fullOutputDocument(command: string, o: CommandOutput): string {
  return [
    `$ ${command}`,
    `exit code: ${o.exitCode}`,
    "",
    "===== stdout =====",
    o.stdout,
    "===== stderr =====",
    o.stderr,
    "",
  ].join("\n");
}

/** Floor caps when it needs to shrink to fit in the envelope. */
const MIN_STREAM_CAP = 500;

function buildResult(
  o: CommandOutput,
  fullOutputPath: string | null,
  stdoutCap: number,
  stderrCap: number,
): RunCommandResult {
  const stdout = headTail(o.stdout, stdoutCap);
  const stderr = headTail(o.stderr, stderrCap);
  const truncated = stdout !== o.stdout || stderr !== o.stderr;
  if (!truncated) return { exitCode: o.exitCode, stdout, stderr };
  // Truncated WITHOUT deposit: the envelope has shrunk the caps under what `spillsToDisk`
  // had judged, or the file writing failed. Say it, and raise your hand alone
  // prohibition which no longer makes sense here — without a file to reread, restart the
  // framed command is the only path left to the lost middle.
  if (!fullOutputPath) {
    return {
      exitCode: o.exitCode,
      stdout,
      stderr,
      note: "The output was truncated (the middle was elided; the beginning and the end are shown) and no full copy was saved. If you need the elided part, re-run the command scoped to what you are looking for.",
    };
  }
  return {
    exitCode: o.exitCode,
    stdout,
    stderr,
    full_output_path: fullOutputPath,
    note: `The output was truncated (the middle was elided; the beginning and the end are shown). Full output saved to ${fullOutputPath}. Use grep to search it, or read_file with offset/limit to view specific sections — do not re-run the command piped to head/tail.`,
  };
}

/**
 * Result returned to the model. `fullOutputPath` = path to the repository on disk, or
 * null (short exit, or failed write — best-effort: truncation keeps de
 * in the queue anyway).
 *
 * The result must fit in `TOOL_RESULT_MAX_CHARS` ONCE SERIALIZED: the
 * loop applies its own `headTail` to the JSON, and this cut elides the
 * MIDDLE of the document — that is, the end of stdout, exactly what we're trying to save. JSON escaping (line breaks, quotes, ANSI sequences)
 * inflates a command output in a very variable way: we therefore shrink the
 * caps until it fits FOR REAL, without betting on a ratio.
 */
export function formatRunCommandResult(
  o: CommandOutput,
  fullOutputPath: string | null,
): RunCommandResult {
  let stdoutCap = RUN_COMMAND_STDOUT_CAP;
  let stderrCap = RUN_COMMAND_STDERR_CAP;
  for (;;) {
    const result = buildResult(o, fullOutputPath, stdoutCap, stderrCap);
    if (JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS) return result;
    if (stdoutCap <= MIN_STREAM_CAP && stderrCap <= MIN_STREAM_CAP) return result;
    stdoutCap = Math.max(MIN_STREAM_CAP, Math.floor(stdoutCap * 0.8));
    stderrCap = Math.max(MIN_STREAM_CAP, Math.floor(stderrCap * 0.8));
  }
}
