















































































export const FORBIDDEN_COMMAND_REASON = "forbidden_command";

export type CommandVerdict = { allowed: true } | { allowed: false; reason: string };






export interface CommandScope {

  local?: boolean;
}




const SEGMENT_BREAKS = new Set([";", "&", "|", "\n", "(", ")"]);


const WRAPPERS = new Set([
  "sudo", "env", "command", "builtin", "exec", "time", "nohup", "xargs",

  "!", "{", "if", "then", "else", "elif", "while", "until", "do",
]);


const SHELL_EVALUATORS = new Set(["eval", "source", ".", "function", "coproc"]);













const WRAPPER_VALUE_OPTIONS: Record<string, ReadonlySet<string>> = {
  sudo: new Set(["-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "--close-from",
    "-U", "--other-user", "-T", "--command-timeout", "-r", "--role", "-t", "--type", "-h", "--host"]),
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  xargs: new Set(["-n", "--max-args", "-L", "-I", "-i", "-P", "--max-procs", "-s",
    "--max-chars", "-a", "--arg-file", "-d", "--delimiter", "-E", "-e", "--eof"]),
  time: new Set(["-f", "--format", "-o", "--output"]),
  command: new Set<string>(),
  builtin: new Set<string>(),
  exec: new Set(["-a"]),
  nohup: new Set<string>(),
  "!": new Set<string>(),
  "{": new Set<string>(),
  if: new Set<string>(),
  then: new Set<string>(),
  else: new Set<string>(),
  elif: new Set<string>(),
  while: new Set<string>(),
  until: new Set<string>(),
  do: new Set<string>(),
};







const DESTRUCTIVE = new Set([
  "reset",
  "restore",
  "rebase",
  "cherry-pick",
]);


const GIT_ARGUMENT_POLICY = new Set(["config", "commit", "checkout", "stash", "clean", "switch"]);


const MAX_SHELL_DEPTH = 8;






function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === "\\" && quote === '"') {
        current += ch + (command[++i] ?? "");
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\\") {
      current += ch + (command[++i] ?? "");
      continue;
    }
    if (SEGMENT_BREAKS.has(ch)) {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.filter((s) => s.trim().length > 0);
}

interface TokenizedSegment {
  tokens: string[];

  expansions: ReadonlySet<number>;

  globs: ReadonlySet<number>;
}







function tokenize(segment: string): TokenizedSegment {
  const tokens: string[] = [];
  const expansions = new Set<number>();
  const globs = new Set<number>();
  let current = "";
  let started = false;
  let expands = false;
  let globsPath = false;
  let quote: '"' | "'" | null = null;
  const flush = () => {
    if (started) {
      if (expands) expansions.add(tokens.length);
      if (globsPath) globs.add(tokens.length);
      tokens.push(current);
    }
    current = "";
    started = false;
    expands = false;
    globsPath = false;
  };
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === "\\" && quote === '"') {
        current += segment[++i] ?? "";
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      if (quote === '"' && (ch === "$" || ch === "`")) expands = true;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === "\\") {
      current += segment[++i] ?? "";
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (ch === "$" || ch === "`") expands = true;
    if (ch === "*" || ch === "?" || ch === "[") globsPath = true;
    current += ch;
    started = true;
  }
  flush();
  return { tokens, expansions, globs };
}

type SubstitutionFrame = { quote: '"' | "'" | null };


function substitutionEnd(command: string, start: number): number {
  const frames: SubstitutionFrame[] = [{ quote: null }];
  for (let i = start; i < command.length; i++) {
    const frame = frames[frames.length - 1];
    const ch = command[i];
    if (ch === "\\" && frame.quote !== "'") {
      i++;
      continue;
    }
    if (ch === "'" && frame.quote !== '"') {
      frame.quote = frame.quote === "'" ? null : "'";
      continue;
    }
    if (ch === '"' && frame.quote !== "'") {
      frame.quote = frame.quote === '"' ? null : '"';
      continue;
    }
    if (frame.quote === "'") continue;
    if (ch === "$" && command[i + 1] === "(") {
      frames.push({ quote: null });
      i++;
      continue;
    }
    if (frame.quote == null && ch === "(") {
      frames.push({ quote: null });
      continue;
    }
    if (frame.quote == null && ch === ")") {
      frames.pop();
      if (frames.length === 0) return i;
    }
  }
  return -1;
}


function commandSubstitutions(command: string): string[] {
  const substitutions: string[] = [];
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (ch === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'";
      continue;
    }
    if (ch === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (quote === "'") continue;
    if (ch === "$" && command[i + 1] === "(") {
      const end = substitutionEnd(command, i + 2);
      if (end >= 0) {
        substitutions.push(command.slice(i + 2, end));
        i = end;
      }
      continue;
    }
    if (ch === "`") {
      let end = i + 1;
      while (end < command.length && command[end] !== "`") {
        if (command[end] === "\\") end++;
        end++;
      }
      if (end < command.length) {
        substitutions.push(command.slice(i + 1, end));
        i = end;
      }
    }
  }
  return substitutions;
}




function skipPrefix(tokens: string[]): number {
  let i = 0;


  let valueOptions: ReadonlySet<string> | null = null;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i++;
      continue;
    }
    if (WRAPPERS.has(t)) {
      valueOptions = WRAPPER_VALUE_OPTIONS[t] ?? new Set<string>();
      i++;
      continue;
    }
    if (valueOptions && t === "--") {
      i++;
      continue;
    }
    if (valueOptions && t.startsWith("-") && t.length > 1) {
      i++;

      if (!t.includes("=") && valueOptions.has(t)) i++;
      continue;
    }
    break;
  }
  return i;
}


const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);


















const GIT_GLOBAL_ELSEWHERE = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);










function gitInvocation(tokens: string[]): {
  sub: string;
  args: string[];
  globals: string[];
  policyTokenIndexes: number[];
  argsStart: number;
} | null {
  let i = skipPrefix(tokens);
  const bin = tokens[i];
  if (!bin || !(bin === "git" || bin.endsWith("/git"))) return null;
  i++;
  const globals: string[] = [];
  const policyTokenIndexes: number[] = [];
  while (i < tokens.length && tokens[i].startsWith("-")) {
    policyTokenIndexes.push(i);
    const opt = tokens[i];
    i++;
    if (GIT_GLOBAL_WITH_VALUE.has(opt)) {
      policyTokenIndexes.push(i);
      globals.push(`${opt}=${tokens[i] ?? ""}`);
      i++;
    } else {
      globals.push(opt);
    }
  }
  // A Git invocation without a subcommand still has policy-bearing globals.
  policyTokenIndexes.push(i);
  return {
    sub: tokens[i] ?? "",
    args: tokens.slice(i + 1),
    globals,
    policyTokenIndexes,
    argsStart: i + 1,
  };
}

/**
 * Git configuration keys that execute code or persist beyond the run (MIN-360).
 *
 * Git treats the section and final key in `section.key` as case-insensitive, but
 * preserves the case of an optional subsection such as the names in
 * `filter.<name>.clean` and `url.<base>.insteadOf`. Compare the two fixed parts
 * rather than lowercasing and matching the complete key.
 */
const GIT_CONFIG_EXECUTES = new Set([
  "core.hookspath",
  "core.fsmonitor",
  "core.sshcommand",
  "core.editor",
  "core.pager",
  "core.gitproxy",
  "core.alternaterefscommand",
  "credential.helper",
  "filter.clean",
  "filter.smudge",
  "filter.process",
  "diff.textconv",
  "diff.external",
  "merge.driver",
  "url.insteadof",
  "url.pushinsteadof",
  "sequence.editor",
  "include.path",
  "uploadpack.packobjectshook",
]);

/** Sections where every key executes a command or loads another file. */
const GIT_CONFIG_SECTIONS = new Set(["alias", "includeif"]);

function dangerousConfigKey(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  const parts = key.split(".");
  if (parts.length < 2) return false;
  if (GIT_CONFIG_SECTIONS.has(parts[0])) return true;
  return GIT_CONFIG_EXECUTES.has(`${parts[0]}.${parts[parts.length - 1]}`);
}

/** `git config` flags that only read values. */
const GIT_CONFIG_READ_FLAGS = new Set([
  "--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool",
  "-l", "--list",
]);
/** `git config` flags that write values or open the configuration in an editor. */
const GIT_CONFIG_WRITE_FLAGS = new Set([
  "--add", "--unset", "--unset-all", "--replace-all", "--edit", "-e",
  "--remove-section", "--rename-section",
]);
/** Scopes outside the current repository whose writes persist beyond the run. */
const GIT_CONFIG_ELSEWHERE = new Set(["--global", "--system", "--file", "-f", "--blob"]);
/** Command-style `git config` modes, available in Git 2.46 and later. */
const GIT_CONFIG_MODES = new Set([
  "get", "set", "unset", "list", "edit", "remove-section", "rename-section",
]);
const GIT_CONFIG_WRITE_MODES = new Set(["set", "unset", "edit", "remove-section", "rename-section"]);

/** Shells that accept a command as an argument (`bash -lc "…"`). */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/**
 * Return the command passed to `sh -c` or `bash -lc`, or null when the segment
 * does not launch a shell command. Only options containing `c` count;
 * `bash script.sh` executes a script file instead.
 */
function shellCommandArg(tokens: string[]): string | null {
  const i = skipPrefix(tokens);
  const bin = tokens[i];
  if (!bin) return null;
  const name = bin.slice(bin.lastIndexOf("/") + 1);
  if (!SHELLS.has(name)) return null;
  let sawC = false;
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    // After `--`, what follows is the command for `-c` ... or a script name otherwise.
    if (t === "--") return sawC ? (tokens[j + 1] ?? null) : null;
    if (!t.startsWith("-")) return sawC ? t : null;
    if (!t.startsWith("--") && t.includes("c")) sawC = true;
    if (t === "-o" || t === "+o") j++; // `bash -o pipefail -c …`: `-o` carries a value
  }
  return null;
}

/** Refuse commands that can discard uncommitted work in any execution scope. */
function destructiveRefusal(what: string): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused \`${what}\` — it throws away uncommitted work, and nothing in git tells what YOU ` +
      `changed apart from what was already in this checkout. Read-only git ` +
      `(status/diff/log/show/branch) and \`git add\` are free. To undo a change you made, edit ` +
      `the file back instead.`,
  };
}


function pushRefusal(scope: CommandScope): CommandVerdict {
  return {
    allowed: false,
    reason: scope.local
      ? `Refused \`git push\` — \`create_pr\` owns the remote here: it mints the credentials, runs ` +
        `the delivery checks and links the pull request to the ticket, and a bare push goes ` +
        `around all three. Commit locally when you were asked to, then \`create_pr\` to publish.`
      : `Refused \`git push\` — the harness owns the remote: it pushes your work at the end of ` +
        `every turn, and reopens the pull request if needed. Read-only git (status/diff/log/show) ` +
        `is fine, and \`git add\` is free.`,
  };
}






function harnessCommitRefusal(): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused \`git commit\` — the harness owns git here: it commits and pushes your work at the ` +
      `end of every turn, and reopens the pull request if needed. Read-only git ` +
      `(status/diff/log/show) is fine, and \`git add\` is free.`,
  };
}


function shellExpansionRefusal(what: string): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused shell-expanded ${what} — the guard must see literal executable, Git option, ` +
      `subcommand, and destructive-mode names before the shell runs. Write the command ` +
      `literally so its Git effects can be verified.`,
  };
}

/**
 * Reject `git config` writes that either leave the current repository or make a
 * later Git command execute code (MIN-360). Read-only operations remain allowed.
 * Return null when the arguments are safe.
 */
function checkGitConfig(args: string[]): CommandVerdict | null {
  const positionals: string[] = [];
  let reads = false;
  let writes = false;
  let elsewhere = "";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
      if (GIT_CONFIG_READ_FLAGS.has(name)) reads = true;
      if (GIT_CONFIG_WRITE_FLAGS.has(name)) writes = true;
      if (GIT_CONFIG_ELSEWHERE.has(name)) elsewhere = name;
      // `--file <path>` carries its value in the following word, so skip that value.
      if (!arg.includes("=") && (name === "--file" || name === "-f" || name === "--blob")) i++;
      continue;
    }
    positionals.push(arg);
  }

  const mode = positionals[0] ?? "";
  const named = GIT_CONFIG_MODES.has(mode) ? positionals.slice(1) : positionals;
  if (GIT_CONFIG_WRITE_MODES.has(mode)) writes = true;
  // The historical form has no verb: `git config <key>` reads, while
  // `git config <key> <value>` writes. The argument count distinguishes them.

  if (!reads && !GIT_CONFIG_MODES.has(mode) && named.length >= 2) writes = true;
  if (!writes) return null;

  if (elsewhere) {
    return {
      allowed: false,
      reason:
        `Refused \`git config ${elsewhere}\` — that writes outside this repository (your own ` +
        `git configuration), and it would outlive this run. Configuration this turn needs goes ` +
        `on the command that needs it (\`git -c …\`), never in a file.`,
    };
  }
  const key = named.find(dangerousConfigKey);
  if (key) return configKeyRefusal(key);
  return null;
}

function configKeyRefusal(key: string): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused setting \`${key}\` — that git setting makes something run later, in someone ` +
      `else's terminal, long after this turn is over. The harness runs what a turn needs itself; ` +
      `nothing has to be installed into the repository's configuration to make it happen.`,
  };
}














const GIT_INTERNALS = /(^|\/)\.git(\/|$)/i;

function gitInternalsToken(tokens: string[]): string | null {
  return tokens.find((t) => GIT_INTERNALS.test(t)) ?? null;
}


const shortFlagWith = (letter: string) => (a: string) =>
  a.startsWith("-") && !a.startsWith("--") && a.includes(letter);


function checkSegment(segment: string, depth: number, scope: CommandScope): CommandVerdict {
  const tokenized = tokenize(segment);
  const { tokens, expansions, globs } = tokenized;
  const isIndirect = (index: number) => expansions.has(index) || globs.has(index);




  const executableIndex = skipPrefix(tokens);
  const envWrapperIndex = tokens.findIndex((token, index) => token === "env" && index < executableIndex);
  if (
    envWrapperIndex >= 0 &&
    tokens
      .slice(envWrapperIndex + 1, executableIndex)
      .some((token) => token === "-S" || token === "--split-string" || token.startsWith("--split-string="))
  ) {
    return shellExpansionRefusal("`env --split-string` payload");
  }
  if (isIndirect(executableIndex)) {
    return shellExpansionRefusal(`executable name \`${tokens[executableIndex]}\``);
  }
  const executable = tokens[executableIndex];
  if (SHELL_EVALUATORS.has(executable)) {
    return shellExpansionRefusal(`shell evaluator \`${executable}\``);
  }




  const inner = shellCommandArg(tokens);
  if (inner != null && depth < MAX_SHELL_DEPTH) {
    const verdict = check(inner, depth + 1, scope);
    if (!verdict.allowed) return verdict;
  } else if (inner != null) {
    return shellExpansionRefusal("nested shell command");
  }



  const internals = gitInternalsToken(tokens);
  if (internals) {
    return {
      allowed: false,
      reason:
        `Refused \`${internals}\` — \`.git/\` belongs to the harness. A file written there runs ` +
        `on someone else's next git command, and \`.git/config\` controls future Git behavior. ` +
        `Use git itself (\`git status\`, \`git log\`, \`git show\`) to read the repository's state.`,
    };
  }

  const git = gitInvocation(tokens);
  if (!git) return { allowed: true };
  const { sub, args, globals, policyTokenIndexes, argsStart } = git;

  const expandedPolicyIndex = policyTokenIndexes.find(isIndirect);
  if (expandedPolicyIndex != null) {
    return shellExpansionRefusal(`Git policy token \`${tokens[expandedPolicyIndex]}\``);
  }
  if (GIT_ARGUMENT_POLICY.has(sub)) {
    const expandedArgIndex = args.findIndex((_, index) => isIndirect(argsStart + index));
    if (expandedArgIndex >= 0) {
      return shellExpansionRefusal(`\`git ${sub}\` argument \`${args[expandedArgIndex]}\``);
    }
  }



  for (const global of globals) {
    const name = global.includes("=") ? global.slice(0, global.indexOf("=")) : global;
    if (!scope.local && GIT_GLOBAL_ELSEWHERE.has(name)) {
      return {
        allowed: false,
        reason:
          `Refused \`git ${name}\` — this turn works in one repository, the one you are in. ` +
          `Pointing git somewhere else is outside what the harness can vouch for.`,
      };
    }


    if (name === "-c") {
      const key = global.slice(global.indexOf("=") + 1).split("=")[0];
      if (dangerousConfigKey(key)) return configKeyRefusal(key);
    }
  }

  if (sub === "config") {
    const verdict = checkGitConfig(args);
    if (verdict) return verdict;
  }

  if (DESTRUCTIVE.has(sub)) return destructiveRefusal(`git ${sub}`);
  if (sub === "push") return pushRefusal(scope);
  // The harness owns commits inside the microVM (D6).
  if (sub === "commit" && !scope.local) return harnessCommitRefusal();
  // `--amend` rewrites the last commit in both local and microVM execution.
  if (args.includes("--amend")) return destructiveRefusal(`git ${sub} --amend`);
  // A positional `git checkout` argument is ambiguous without repository state:
  // Git may treat it as either a branch or a path and overwrite the path from the
  // index. Require an explicit branch-creation/detach mode, or use `git switch`.
  if (sub === "checkout") {
    const explicitBranchMode = args.some((arg) =>
      ["-b", "-B", "--orphan", "--detach"].includes(arg)
    );
    const discards = args.find((arg) =>
      arg === "--" ||
      arg === "-f" ||
      arg === "--force" ||
      arg === "-p" ||
      arg === "--patch" ||
      arg === "--ours" ||
      arg === "--theirs" ||
      arg === "-m" ||
      arg === "--merge" ||
      arg.startsWith("--conflict=") ||
      arg === "--ignore-skip-worktree-bits" ||
      arg === "--pathspec-from-file" ||
      arg.startsWith("--pathspec-from-file=") ||
      arg === "--pathspec-file-nul" ||
      (!explicitBranchMode && !arg.startsWith("-"))
    );
    if (discards) return destructiveRefusal(`git checkout ${discards}`);
  }
  // A stash is recoverable, but `drop` and `clear` permanently remove stashes.
  if (sub === "stash" && (args[0] === "drop" || args[0] === "clear")) {
    return destructiveRefusal(`git stash ${args[0]}`);
  }
  // `git clean` without `-f` does nothing; with it, it deletes untracked files,
  // including uncommitted work. Dry runs with `-n` remain allowed.
  if (sub === "clean") {
    const forces = args.find((a) => a === "--force" || shortFlagWith("f")(a));
    if (forces) return destructiveRefusal(`git clean ${forces}`);
  }
  // `git switch` changes branches without the path ambiguity of `git checkout`.
  // Its discard options can still overwrite uncommitted work.
  if (sub === "switch") {
    const discards = args.find((a) => a === "--discard-changes" || a === "--force" || a === "-f");
    if (discards) return destructiveRefusal(`git switch ${discards}`);
  }
  return { allowed: true };
}

/**
 * Return the harness verdict for a `run_command` request. A refusal is reported
 * to the model as a tool error so it can adapt and continue the turn.
 */
export function checkCommand(command: string, scope: CommandScope = {}): CommandVerdict {
  return check(command, 0, scope);
}

function check(command: string, depth: number, scope: CommandScope): CommandVerdict {
  const substitutions = commandSubstitutions(command);
  if (substitutions.length > 0 && depth >= MAX_SHELL_DEPTH) {
    return shellExpansionRefusal("nested command substitution");
  }
  for (const inner of substitutions) {
    const verdict = check(inner, depth + 1, scope);
    if (!verdict.allowed) return verdict;
  }
  for (const segment of splitSegments(command)) {
    const verdict = checkSegment(segment, depth, scope);
    if (!verdict.allowed) return verdict;
  }
  return { allowed: true };
}
