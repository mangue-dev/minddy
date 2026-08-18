import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

import {
  RUN_LOG_DIR_NAME,
  RUN_LOG_REPORT_LINES,
  formatDiagnosticReport,
  pruneRunLogs,
  readRunLogHeader,
  runLogFileName,
  runLogHeader,
  runLogRedactor,
  tagRunLogChunk,
  tailLines,
  type DiagnosticFacts,
  type RunLogFacts,
} from "@/lib/desktop/run-log";
import { OPENCODE_VERSION } from "@/lib/server/agent/vm/opencode-version";

/**
 * THE `fs` OF A LOCAL TOUR'S DIARY (MIN-363) — and nothing else.
 *
 * All decisions (naming, rotation, header, substitution, form of
 * report) live in [@/lib/desktop/run-log](../../lib/desktop/run-log.ts),
 * with their test. Here there is only the disk, the data folder and the clock.
 *
 * **This file exists BEFORE the launcher, and this is deliberate.** The launcher
 * MIN-293 just needs to open a log and connect the two sound streams
 * `utilityProcess` dessus :
 *
 * ```ts
 * const log = openRunLog({ runId, appVersion: app.getVersion(), bundleVersion,
 *                          opencodeVersion: OPENCODE_VERSION, repoPath },
 *                        [controlToken]);
 * child.stdout?.on("data", (c: Buffer) => log.write(c.toString("utf8"), "out"));
 * child.stderr?.on("data", (c: Buffer) => log.write(c.toString("utf8"), "err"));
 * child.on("exit", (code) => log.close(`exit ${code}`));
 * ```
 *
 * **Nothing here raises.** A full disk, a read-only folder, or a
 * locked file must not drop a round: a log is this
 * that we read when it fails, not a reason to fail. Every failure is reported
 * to `console.error`, where it ends up in the system logs.
 */

/** Where the logs live: under `userData`, next to the channel and session. */
export function runLogDir(): string {
  return path.join(app.getPath("userData"), RUN_LOG_DIR_NAME);
}

/** An open log, such as the thrower will hold it. */
export interface RunLog {
  /** The file, so that an error message can name it. */
  readonly path: string;
  /** A child's outing piece. Never lift. */
  write(chunk: string, stream: "out" | "err"): void;
  /** Close the log by writing the final word (exit code, reason). */
  close(note?: string): void;
}

/**
 * Opens the log in one turn: creates the folder, writes the header, rotates
 * the elders, and returns the well.
 *
 * `secrets` carries what the round holds and which the journal should not keep —
 * the local execution token, the minted key of the model. The substitution is
 * posed when writing: this is the only moment when we are sure that the byte has not
 * touched the disk again.
 */
export function openRunLog(
  facts: RunLogFacts,
  secrets: readonly (string | null | undefined)[] = [],
): RunLog {
  const startedAt = new Date();
  const dir = runLogDir();
  const file = path.join(dir, runLogFileName(facts.runId, startedAt));
  const redact = runLogRedactor(secrets);

  // The file first, the rotation then: the log of the round which begins
  // should not depend on the success of a household.
  let handle: number | null = null;
  try {
    mkdirSync(dir, { recursive: true });
    handle = openSync(file, "a");
    writeSync(handle, runLogHeader(facts, startedAt));
  } catch (error) {
    console.error("[run-log] could not open journal", error);
  }
  pruneOldRunLogs();

  const append = (text: string) => {
    if (handle === null) return;
    try {
      writeSync(handle, redact(text));
    } catch (error) {
      console.error("[run-log] write failed", error);
    }
  };

  return {
    path: file,
    write: (chunk, stream) => append(tagRunLogChunk(chunk, stream)),
    close: (note) => {
      if (note) append(`\n[minddy] ${note}\n`);
      if (handle === null) return;
      try {
        closeSync(handle);
      } catch {
        // Already closed, or invalid descriptor: there is nothing to repair.
      }
      handle = null;
    },
  };
}

/** The logs in the file, from newest to oldest. Blank if illegible. */
function listRunLogs(): Array<{ name: string; bytes: number }> {
  try {
    return readdirSync(runLogDir())
      .filter((name) => name.endsWith(".log"))
      .map((name) => {
        try {
          return { name, bytes: statSync(path.join(runLogDir(), name)).size };
        } catch {
          return { name, bytes: 0 };
        }
      })
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  } catch {
    return [];
  }
}

/** Applies rotation. A file that resists is skipped, not fatal. */
function pruneOldRunLogs(): void {
  for (const name of pruneRunLogs(listRunLogs())) {
    try {
      rmSync(path.join(runLogDir(), name));
    } catch (error) {
      console.error("[run-log] rotation impossible", name, error);
    }
  }
}

/**
 * WHAT THE DIAGNOSTIC REPORT BRINGS, picked up from the disk.
 *
 * The last log gives four of the five facts (bundle, deposit, run, date): they
 * are only known for one turn, and the app does not carry them between two launches.
 * When there is none, the report says so — that’s already an answer.
 */
export function collectDiagnostic(): DiagnosticFacts {
  const logs = listRunLogs();
  const latest = logs[0];
  let lastRun: DiagnosticFacts["lastRun"] = null;

  if (latest) {
    try {
      const text = readFileSync(path.join(runLogDir(), latest.name), "utf8");
      lastRun = {
        fileName: latest.name,
        header: readRunLogHeader(text),
        tail: tailLines(text, RUN_LOG_REPORT_LINES),
      };
    } catch (error) {
      console.error("[run-log] latest journal is unreadable", error);
    }
  }

  return {
    appVersion: app.getVersion(),
    opencodeVersion: OPENCODE_VERSION,
    platform: `${process.platform} ${os.release()}`,
    generatedAt: new Date(),
    logDir: runLogDir(),
    logCount: logs.length,
    lastRun,
  };
}

/** The report, ready for the clipboard. He NEVER leaves alone. */
export function diagnosticReport(): string {
  return formatDiagnosticReport(collectDiagnostic());
}

/**
 * The journal of the LAUNCHER himself, out of all tricks - for what misses before
 * that a `runId` exists (no repository attached, bundle refused, opencode absent).
 * It has no run header to write; he wears minimal one.
 */
export function noteLauncherFailure(message: string): void {
  const log = openRunLog({
    runId: "launcher",
    appVersion: app.getVersion(),
    bundleVersion: "—",
    opencodeVersion: OPENCODE_VERSION,
    repoPath: "—",
  });
  log.write(message, "err");
  log.close("launcher aborted before the harness started");
}
