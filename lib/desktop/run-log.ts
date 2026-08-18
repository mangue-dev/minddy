import { SecretRedactor, type RedactText } from "@/lib/server/agent/redact";

/**
 * THE DIARY OF A TICK PLAYED ON THE MACHINE (MIN-363) — the half that decides
 * sans disque.
 *
 * ## Pourquoi ce fichier existe
 *
 * A local run can fail **before the harness has spoken**: the bundle does not
 * does not launch, opencode does not install, the repository has moved, macOS refuses it
 * folder, the control plan returns 403. In this window, there is neither
 * event, neither checkpoint, nor line of `agent_runs` to read — the `stdio` of
 * the child is the ONLY thing that speaks, and no one listens: the shell
 * never launched a child, and the opencode logs go to a folder
 * of the machine that the user does not know.
 *
 * This is the first support ticket for the feature, and without this file it
 * is insoluble: “it doesn’t work” without a line to look at.
 *
 * ## What is decided here, and why it does not live in `desktop/src/`
 *
 * Naming, rotation, header, secret substitution and reporting
 * diagnostic are decisions; `vitest` does not collect `desktop/src/`
 * ([local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 * So they come down here, with their test, and the shell only keeps the `fs`.
 *
 * ## Three rules that seem like details
 *
 * 1. **The name has the date at the top**, so alphabetical order IS the order
 * chronological. Rotation sorts strings, without ever reading a `mtime` —
 * as a copy, a backup or a rewritten `rsync`.
 * 2. **Rotation always keeps the most recent**, even alone above the
 * byte limit. A ride that goes off the rails and spits out 200MB is exactly
 * the one we want to read; a rotation that removes it to hold a quota
 * leaves the user with a clean folder and nothing to send.
 * 3. **Secrets are substituted for WRITING**, not for reading. The token
 * local execution and the model key pass through the environment and the
 * child's arguments; a newspaper stuck in a support wire does not
 * should not wear them, and the only time it's guaranteed is before
 * the byte touches the disk.
 *
 * And a product rule, which is not technical: **the report does not leave
 * never on its own.** It goes to the clipboard, the user reads it again and
 * glue. This is what allows you to put a path home there.
 */

/** The logs folder, under `userData`. */
export const RUN_LOG_DIR_NAME = "agent-logs";

/** The extension, and the rotation filter: it doesn't look at anything else. */
export const RUN_LOG_EXTENSION = ".log";

/** Combien de journaux on garde au plus. */
export const RUN_LOG_MAX_FILES = 20;

/** And how many bytes, all logs combined (25 MB). */
export const RUN_LOG_MAX_BYTES = 25 * 1024 * 1024;

/** How many tail lines the diagnostic report carries. */
export const RUN_LOG_REPORT_LINES = 120;

/** What we write when we don't know — never an empty string, which reads poorly. */
const UNKNOWN = "—";

/**
 * WHAT A NEWSPAPER KNOWS ABOUT ITS TURN BEFORE THE HARNESS HAS SPOKEN.
 *
 * The five fields of the diagnostic report, plus the run identity. They are
 * all known to the launcher at the time of `fork`: this is precisely what makes
 * the useful header when all else has failed.
 */
export interface RunLogFacts {
  /** The run which this diary is about. */
  readonly runId: string;
  /** Version de l'app de bureau (`app.getVersion()`). */
  readonly appVersion: string;
  /** Footprint of the harness bundle downloaded for this tour. */
  readonly bundleVersion: string;
  /** Pinned opencode version (`OPENCODE_VERSION`). */
  readonly opencodeVersion: string;
  /** The deposit on which the round plays — a path of this machine. */
  readonly repoPath: string;
}

/** The header reread from a newspaper. All fields are optional: a
 * file truncated by a hard stop should still be read. */
export type RunLogHeader = Partial<Record<keyof RunLogFacts | "started", string>>;

/** A log on disk, such as rotation needs to see it. */
export interface RunLogFile {
  readonly name: string;
  readonly bytes: number;
}

/** Both caps of the rotation. */
export interface RunLogLimits {
  readonly maxFiles?: number;
  readonly maxBytes?: number;
}

/**
 * The name of the log of a tour: the date first, the identifier then.
 *
 * `:` and `.` go outside the timestamp — the first is prohibited on systems
 * of files from other platforms and annoying in a `scp`, the second would cut
 * the extension in two. The identifier is reduced to safe characters: it comes
 * from the base, but a file name constructed from a remote value
 * unfiltered is a writing path that we offer to someone else.
 */
export function runLogFileName(runId: string, startedAt: Date): string {
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const safe = runId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${stamp}-run-${safe || "unknown"}${RUN_LOG_EXTENSION}`;
}

/**
 * The header written at the top of each newspaper, and rereadable by
 * {@link readRunLogHeader}. It ends with an empty line: it is she who
 * bounds the read, and it visually separates the header from the raw output.
 */
export function runLogHeader(facts: RunLogFacts, startedAt: Date): string {
  return (
    [
      "minddy run log",
      `runId: ${facts.runId}`,
      `started: ${startedAt.toISOString()}`,
      `appVersion: ${facts.appVersion}`,
      `bundleVersion: ${facts.bundleVersion}`,
      `opencodeVersion: ${facts.opencodeVersion}`,
      `repoPath: ${facts.repoPath}`,
    ].join("\n") + "\n\n"
  );
}

/**
 * The header read again. Stops at the first empty line, and ignores anything that doesn't have
 * not the form `key: value` — a log whose header has been eaten returns a
 * empty object rather than lifting.
 */
export function readRunLogHeader(text: string): RunLogHeader {
  const header: RunLogHeader = {};
  for (const line of text.split("\n")) {
    if (line.trim() === "") break;
    const match = /^([A-Za-z]+): (.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as keyof RunLogHeader;
    header[key] = match[2];
  }
  return header;
}

/**
 * Logs to DELETE — the function doesn't touch anything, it names.
 *
 * Two ceilings, and the most recent always survives both (see rule 2 at the top
 * file). The sorting is descending on the NAME, which begins with the date.
 */
export function pruneRunLogs(files: readonly RunLogFile[], limits: RunLogLimits = {}): string[] {
  const maxFiles = limits.maxFiles ?? RUN_LOG_MAX_FILES;
  const maxBytes = limits.maxBytes ?? RUN_LOG_MAX_BYTES;

  const sorted = files
    .filter((file) => file.name.endsWith(RUN_LOG_EXTENSION))
    .slice()
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

  const doomed: string[] = [];
  let kept = 0;
  let bytes = 0;
  for (const file of sorted) {
    const first = kept === 0;
    const overflow = kept >= maxFiles || bytes + file.bytes > maxBytes;
    if (overflow && !first) {
      doomed.push(file.name);
      continue;
    }
    kept += 1;
    bytes += file.bytes;
  }
  return doomed;
}

/**
 * The last `count` lines. The final `\n` does not count for an empty line
 * moreover: a newspaper always ends with an end of line, and take away
 * an empty line instead of the last useful line would be the fault we don't
 * notice that the day we read the report.
 */
export function tailLines(text: string, count: number): string {
  const lines = text.replace(/\n$/, "").split("\n");
  if (count <= 0) return "";
  return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

/**
 * The substitution placed on what the turn writes. Values ​​too short for
 * be a secret are ignored by `SecretRedactor` — otherwise a “key” of
 * three characters would substitute bits of words throughout the newspaper.
 *
 * `redact.ts` rather than a second substitution written here: it is the same
 * problem only in the loop, and two implementations diverge.
 */
export function runLogRedactor(secrets: readonly (string | null | undefined)[]): RedactText {
  const redactor = new SecretRedactor();
  for (const secret of secrets) redactor.add(secret);
  return redactor.redact;
}

/**
 * A piece of `stdout` or `stderr`, prepared for the log: each line
 * porte sa source.
 *
 * Marking matters more than it seems — a harness that writes its
 * progress on `stdout` and its errors on `stderr` produces, mixed, a
 * text where we no longer know what is an incident. An empty line remains empty:
 * we don't make `[out]` for white.
 */
export function tagRunLogChunk(chunk: string, stream: "out" | "err"): string {
  const tag = stream === "err" ? "[err] " : "[out] ";
  return chunk
    .split("\n")
    .map((line) => (line === "" ? "" : `${tag}${line}`))
    .join("\n");
}

/** What the shell picked up from the disk to make the report. */
export interface DiagnosticFacts {
  readonly appVersion: string;
  readonly opencodeVersion: string;
  /** `darwin 25.5.0`, or what the platform renders. */
  readonly platform: string;
  readonly generatedAt: Date;
  /** The logs folder — the user should be able to see. */
  readonly logDir: string;
  /** Combien de journaux y vivent. */
  readonly logCount: number;
  /** The last turn played, or `null` when none has ever played. */
  readonly lastRun: {
    readonly fileName: string;
    readonly header: RunLogHeader;
    readonly tail: string;
  } | null;
}

/**
 * THE DIAGNOSTIC REPORT, as it goes on the clipboard.
 *
 * In English, like the menu that triggers it, and in markdown: it will end up pasted
 * in a support thread, not read in a terminal.
 *
 * When no trick ever played, he SAYS so instead of returning an empty report.
 * That's already an answer — "the machine never received a run" and "the run has
 * failed to boot” are two different support tickets.
 */
export function formatDiagnosticReport(facts: DiagnosticFacts): string {
  const header = facts.lastRun?.header ?? {};
  const rows: Array<[string, string]> = [
    ["App", facts.appVersion],
    ["Platform", facts.platform],
    ["opencode", facts.opencodeVersion],
    ["Harness bundle", header.bundleVersion || UNKNOWN],
    ["Repository", header.repoPath || UNKNOWN],
    ["Last run", header.runId || UNKNOWN],
    ["Started", header.started || UNKNOWN],
    ["Logs", `${facts.logCount} in ${facts.logDir}`],
  ];

  const body = facts.lastRun
    ? `### Last ${RUN_LOG_REPORT_LINES} lines — ${facts.lastRun.fileName}\n\n` +
      "```\n" +
      `${facts.lastRun.tail}\n` +
      "```"
    : "No agent run has ever started on this machine — there is no log to read.";

  return (
    `## minddy diagnostic report\n\n` +
    `Generated ${facts.generatedAt.toISOString()}\n\n` +
    rows.map(([label, value]) => `- **${label}:** ${value}`).join("\n") +
    `\n\n${body}\n`
  );
}
