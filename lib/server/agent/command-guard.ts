/**
 * Guardrail for `run_command` commands (MIN-108). PURE and testable — like
 * `repo-path.ts`, logic protects something that cannot be recovered.
 *
 * The system prompt has always said “harness owns git”; the harness,
 * he executed the order as is. Two `git checkout -- <fichier>` are
 * actually passed into production. What is at stake is not the microVM (it
 * is disposable) but **the uncommitted work of the branch**: `checkout --`,
 * `reset`, `restore` destroy it silently, and the end of the turn then pushes a
 * amputated branch without anyone seeing it pass.
 *
 * Design principle: **closed and short** list, never a heuristic of
 * similarity. A false positive that blocks a legitimate order costs more
 * than the risk covered — we only target what DESTROYS work or WRITE on it
 * the remote. All reading git (`status`, `log`, `diff`, `show`, `branch`)
 * and `git add` remain free.
 *
 * The parsing is textual, not a real shell: `g=git; $g reset --hard` passes. There
 * target is a distracted model, not an attacker — the attacker already has `rm -rf`.
 *
 * One case still deserved to be closed (MIN-244): `bash -lc "git reset --hard"`
 * is not an attacker's trick but a form that the model writes by itself, and
 * the shell there hid git behind its own `-c`. We therefore re-examine the argument of
 * shells. The rest doesn't change: no OpenHands-style composition rails
 * (`curl … | bash`) — the network is open by decision and the VM does not hold any
 * secret since MIN-223, there is nothing to steal downstream.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT GOING LOCAL CANCELS FROM ALL OF THE ABOVE (MIN-360)
 *
 * The two premises of the header — “the VM is disposable”, “there is nothing to steal
 * downstream” — are false word for word as soon as the trick plays in the deposit of
 * the user, on his machine. Three holes come from it, and they cost nothing
 * to close on both sides:
 *
 * 1. **`git config`** was not guarded by anyone. Place a `core.hooksPath` done
 * execute agent code to USER'S NEXT COMMIT, in its
 * terminal, with its keychain unlocked — a persistence that survives the
 * end of the run, when the key is revoked and when the app is closed. Even
 *    famille : `core.sshCommand`, `credential.helper`, `filter.*.clean`,
 *    `diff.*.textconv`, `url.*.insteadOf`, un alias qui commence par `!`.
 * 2. **`.git/` by the shell.** `assertNotGit` ([repo-path.ts](repo-path.ts)) keeps
 * FILE tools; `bash` was passing by. A path token carrying a
 * segment `.git` is therefore refused here, folded case (APFS does not distinguish
 *    `.GIT/` de `.git/`).
 * 3. **`git -C` / `--git-dir` / `--work-tree`.** The global options were
 * skipped: the subcommand was read correctly, but the ones we let pass
 * because they are harmless IN OUR REPOSITORY (change branch) do not
 * are more in another. They are refused en bloc — the harness has a
 * deposit, and it is that of the cwd.
 *
 * And the envelope bug which made the rest workable: `env -i git push`
 * passed, because `skipPrefix` stopped on `-i`. Envelopes see
 * now their skipped OPTIONS, with their value when they wear one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COMMITTEE GIVES BACK TO THE ONE WHO WORKS (MIN-364, decision D6)
 *
 * `commit` was refused on a reason written in black and white — “the harness commits
 * and pushes at the end of each round. **In current repository mode, it does not commit
 * more** (D2bis-B): three texts said three things, and the result was a
 * local tower which delivered NOTHING — the work remained in the tree, the model
 * read in his prompt that he was delivered, and the guard refused to let him
 * deliver himself.
 *
 * Hence the `scope`: it is the SAME module, and it gives two verdicts because the
 * two worlds are no longer alike on this point. In microVM, the harness
 * commit: `commit` remains refused, and the reason is true. On the machine
 * someone, no one commits for them: `commit` is returned to the model, which
 * only uses it on request (the prompt says so, cf. `prompt.ts`).
 *
 * `push`, remains refused on BOTH sides, and for two different reasons:
 * in microVM it is the end of the turn which pushes, locally it is `create_pr` which
 * owns the remote (he mints the token, applies the delivery gate and connects
 * the pull request to the ticket). A bare `push` would bypass all three.
 */

/** Valeur du champ `reason` de l'event `tool_result` d'un refus (mesurable en base). */
export const FORBIDDEN_COMMAND_REASON = "forbidden_command";

export type CommandVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * THE WORLD WHERE THE COMMAND EXECUTES (MIN-364). Only one field, and it only decides
 * only one thing: who commits. All the rest of the guardrail is identical
 * two sides — what destroys work destroys it everywhere.
 */
export interface CommandScope {
  /** Does the trick play on the user's machine (`isLocalJob`)? */
  local?: boolean;
}

/** Characters that end a command in a `sh -c`: chaining, pipe,
 * subshell, substitution. The production record shows exactly this case —
 *  `cd /vercel/sandbox/repo && git checkout -- package-lock.json`. */
const SEGMENT_BREAKS = new Set([";", "&", "|", "\n", "(", ")", "`"]);

/** Commands that wrap another: we look at what they launch. */
const WRAPPERS = new Set(["sudo", "env", "command", "time", "nohup", "xargs"]);

/**
 * ENVELOPE OPTIONS THAT HAVE A FOLLOWING WORD VALUE (MIN-360).
 *
 * Without this table, `skipPrefix` stopped at the first word starting with `-`:
 * `env -i git push` designated `-i` as binary, so “not git”, so passed.
 * By skipping the options we find git — but skipping a VALUE option without its
 * value would reopen the same hole one step further (`sudo -u root git push`
 * would designate `root`). Hence the two gestures together, and never one without the other.
 *
 * An UNKNOWN option is skipped alone: ​​it is the conduct just for `-i`, `-p`,
 * `-0` and all the Boolean flags, which are the vast majority.
 */
const WRAPPER_VALUE_OPTIONS: Record<string, ReadonlySet<string>> = {
  sudo: new Set(["-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "--close-from",
    "-U", "--other-user", "-T", "--command-timeout", "-r", "--role", "-t", "--type", "-h", "--host"]),
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  xargs: new Set(["-n", "--max-args", "-L", "-I", "-i", "-P", "--max-procs", "-s",
    "--max-chars", "-a", "--arg-file", "-d", "--delimiter", "-E", "-e", "--eof"]),
  time: new Set(["-f", "--format", "-o", "--output"]),
  command: new Set<string>(),
  nohup: new Set<string>(),
};

/**
 * Subcommands that DESTROY or REWRITE uncommitted work, refused
 * in both worlds. None depends on who delivers: what they throw away
 * is not recoverable, and nothing in git distinguishes the agent's work from
 * the one who was there before him.
 */
const DESTRUCTIVE = new Set([
  "reset", // `--hard` destroyed; `--soft`/`--mixed` have no reason to be here
  "restore", // its reason for being is to throw modifications
  "rebase",
  "cherry-pick",
]);

/**
 * Cuts the command into segments executed independently, respecting the
 * guillemets — sinon `grep -n "git commit && git push" README.md` se ferait
 * refuse on text which is only an argument.
 */
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

/** Breaks a segment into words, quotation marks removed (`git "checkout" -- x`). */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  const flush = () => {
    if (started) tokens.push(current);
    current = "";
    started = false;
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
    current += ch;
    started = true;
  }
  flush();
  return tokens;
}

/** Index of the first word that is truly a binary: skips assignments
 * environment (`FOO=bar git …`), envelopes (`sudo git …`) and OPTIONS
 *  de ces enveloppes (`env -i git …`, cf. `WRAPPER_VALUE_OPTIONS`). */
function skipPrefix(tokens: string[]): number {
  let i = 0;
  /** Options set to value of LAST envelope seen — null as long as none are present
   * did not have: without envelope, a word in `-` is binary, not an option. */
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
      // `--user=root` carries its value; `-u root` carries it in the following word.
      if (!t.includes("=") && valueOptions.has(t)) i++;
      continue;
    }
    break;
  }
  return i;
}

/** GLOBAL git options that carry a next word value (`git -C dir …`). */
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * The globals that make git work ELSEWHERE than in the tour repository.
 *
 * **In microVM they are refused en bloc** rather than followed: the harness
 * has ONE repository, that of cwd, and the second curtain of permissions
 * (`external_directory: "deny"`) ne voit pas passer un `bash`.
 *
 * **On the user's machine, they pass** (MIN-364, decision D5):
 * this is the SAME perimeter as the one we just opened with file tools,
 * said by another word. A monorepo whose packages are outside the folder
 * attached, a neighboring repository to consult — refuse them here while `read` and
 * `edit` going there would be the cage in reverse of §2 of the audit, once again.
 *
 * What makes them harmless is elsewhere and hasn't changed: the subcommands
 * which DESTROY remain refused regardless of the target repository — `git -C /other
 * reset --hard` se fait toujours refuser sur `reset`, jamais sur `-C`.
 */
const GIT_GLOBAL_ELSEWHERE = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * The git subcommand of a segment, its arguments and ITS GLOBALS — or null if the
 * segment does not launch git. Skip environment assignments
 * (`FOO=bar git …`) and envelopes (`sudo git …`).
 *
 * Globals are RENDERED rather than silently skipped (MIN-360): this is where
 * live `-C`, `--git-dir` and `-c <key>=<value>` which sets a hook for time
 * of an order.
 */
function gitInvocation(
  tokens: string[],
): { sub: string; args: string[]; globals: string[] } | null {
  let i = skipPrefix(tokens);
  const bin = tokens[i];
  if (!bin || !(bin === "git" || bin.endsWith("/git"))) return null;
  i++;
  const globals: string[] = [];
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const opt = tokens[i];
    i++;
    if (GIT_GLOBAL_WITH_VALUE.has(opt)) {
      globals.push(`${opt}=${tokens[i] ?? ""}`);
      i++;
    } else {
      globals.push(opt);
    }
  }
  // `git -C /autre` sans sous-commande ne fait rien, mais ses globales se jugent
  // anyway: making null here would make them invisible.
  return { sub: tokens[i] ?? "", args: tokens.slice(i + 1), globals };
}

/**
 * CONFIG KEYS THAT EXECUTE CODE OR SURVIVE RUN (MIN-360).
 *
 * Indexed `section.feuille` in lowercase: the section and the final key of a name
 * git are case insensitive, only the middle subsection is not —
 * and it is precisely she who is free (`filter.<nom>.clean`,
 * `url.<base>.insteadOf`). We therefore compare the two ends, never the whole name.
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

/** Sections of which ANY key executes (`alias.x = !sh -c …`) or loads a file. */
const GIT_CONFIG_SECTIONS = new Set(["alias", "includeif"]);

function dangerousConfigKey(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  const parts = key.split(".");
  if (parts.length < 2) return false;
  if (GIT_CONFIG_SECTIONS.has(parts[0])) return true;
  return GIT_CONFIG_EXECUTES.has(`${parts[0]}.${parts[parts.length - 1]}`);
}

/** Drapeaux de `git config` qui LISENT — ils ne posent rien. */
const GIT_CONFIG_READ_FLAGS = new Set([
  "--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool",
  "-l", "--list",
]);
/** Flags that WRITE (or open an editor on the file). */
const GIT_CONFIG_WRITE_FLAGS = new Set([
  "--add", "--unset", "--unset-all", "--replace-all", "--edit", "-e",
  "--remove-section", "--rename-section",
]);
/** Scopes that leave the tour repository: the user's `~/.gitconfig`, the
 * system file, a file named. A writing survives everything else. */
const GIT_CONFIG_ELSEWHERE = new Set(["--global", "--system", "--file", "-f", "--blob"]);
/** Modern form verbs (`git config set core.pager x`, git ≥ 2.46). */
const GIT_CONFIG_MODES = new Set([
  "get", "set", "unset", "list", "edit", "remove-section", "rename-section",
]);
const GIT_CONFIG_WRITE_MODES = new Set(["set", "unset", "edit", "remove-section", "rename-section"]);

/** Shells that accept a command as an argument (`bash -lc "…"`). */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/**
 * The command carried by a `sh -c` / `bash -lc` — or null if the segment does not launch
 * not a shell with a command as an argument. Only the `-…c…` form counts:
 * `bash script.sh` executes a file, which is not read.
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
    if (!t.startsWith("-")) return sawC ? t : null; // sinon : un script, pas un `-c`
    if (!t.startsWith("--") && t.includes("c")) sawC = true;
    if (t === "-o" || t === "+o") j++; // `bash -o pipefail -c …`: `-o` carries a value
  }
  return null;
}

/**
 * WHAT DESTROYS WORK — the refusal which does not depend on any decision of
 * delivery, and the only one of the lot whose victim is never the agent himself.
 */
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

/** THE PUSH, refused by both sides — but not by the same owner (D6). */
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

/**
 * THE COMMIT, IN MICROVM ONLY (D6). On someone's machine, this refusal
 * no longer exists: no one commits in place of the model, and the prompt tells it
 * when to do it.
 */
function harnessCommitRefusal(): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused \`git commit\` — the harness owns git here: it commits and pushes your work at the ` +
      `end of every turn, and reopens the pull request if needed. Read-only git ` +
      `(status/diff/log/show) is fine, and \`git add\` is free.`,
  };
}

/**
 * `git config` — or rather the only part that matters: what WRITES (MIN-360).
 *
 * Reading the config is free and useful (`git config --get remote.origin.url`). This
 * that we refuse is contained in two sentences: a writing that COMES OUT of the deposit of the turn
 * (`--global` rewrites the user's `~/.gitconfig`), and a write to a
 * key that makes something RUN later — on the next commit, on the next
 * `git fetch`, to the next `git diff` from a human who won't know where it comes from.
 *
 * `null` = nothing to complain about.
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
      // `--file <chemin>` carries its value in the following word: it is not a key.
      if (!arg.includes("=") && (name === "--file" || name === "-f" || name === "--blob")) i++;
      continue;
    }
    positionals.push(arg);
  }

  const mode = positionals[0] ?? "";
  const named = GIT_CONFIG_MODES.has(mode) ? positionals.slice(1) : positionals;
  if (GIT_CONFIG_WRITE_MODES.has(mode)) writes = true;
  // The historical form has no verb: `git config <key>` READS, `git config
  // <key> <value>` WRITES. The number of arguments decides, and that alone.
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

/**
 * A TOKEN WHICH DESIGNATES `.git/` (MIN-360) — the hole that `assertNotGit` did not plug
 * not, because it keeps the FILE tools and `bash` does not pass through them.
 *
 * Writing to `.git/hooks/` causes code to execute on the next Git operation;
 * writing `.git/config` can install an `insteadOf` or `credential.helper` rule.
 * Reads are also refused because Git internals belong to the harness, even
 * though MIN-421 removed reusable forge credentials from sandbox remotes.
 *
 * Case is collapsed because APFS is case insensitive — `.GIT/hooks`
 * denotes exactly the same folder. `.gitignore` and `x.git` (a clone URL)
 * do not match: it is a path SEGMENT that we are looking for, not a substring.
 */
const GIT_INTERNALS = /(^|\/)\.git(\/|$)/i;

function gitInternalsToken(tokens: string[]): string | null {
  return tokens.find((t) => GIT_INTERNALS.test(t)) ?? null;
}

/** Un drapeau court (`-fd`, `-xdf`) qui porte cette lettre. */
const shortFlagWith = (letter: string) => (a: string) =>
  a.startsWith("-") && !a.startsWith("--") && a.includes(letter);

/** Is this segment running a forbidden git command? */
function checkSegment(segment: string, depth: number, scope: CommandScope): CommandVerdict {
  const tokens = tokenize(segment);

  // `bash -lc "git reset --hard"`: the shell hides git behind its own `-c`.
  // We re-parse his argument as a command in its own right. The depth
  // terminal `bash -c "bash -c …"`, which has no reason to exist.
  const inner = shellCommandArg(tokens);
  if (inner != null && depth < 3) {
    const verdict = check(inner, depth + 1, scope);
    if (!verdict.allowed) return verdict;
  }

  // `.git/` by the shell — independent of git: `echo … > .git/hooks/pre-commit`
  // doesn't call git at all, and that's precisely what made it invisible.
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
  const { sub, args, globals } = git;

  // The globals, BEFORE the subcommand: `git -C /autre checkout main` is
  // harmless here and not there, and it's the `-C` that says so.
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
    // `git -c core.hooksPath=… <commande>` does not persist, but it executes — and
    // it poses the same thing as `git config`, except for one word.
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
  // The commit remains at the harness in the microVM, and NOTHING BUT there (D6).
  if (sub === "commit" && !scope.local) return harnessCommitRefusal();
  // `--amend` rewrites the last commit — that of the harness in the microVM,
  // that of the USER on his machine. Refused on both sides, therefore.
  if (args.includes("--amend")) return destructiveRefusal(`git ${sub} --amend`);
  // `checkout` is ambiguous (changing branch is harmless): we only refuse
  // the forms which aim at FILES, that is to say which throw away the work.
  if (sub === "checkout") {
    const discards = args.find((a) => a === "--" || a === "." || a === "-f" || a === "--force");
    if (discards) return destructiveRefusal(`git checkout ${discards}`);
  }
  // `git stash` only is recoverable; `drop`/`clear` are not.
  if (sub === "stash" && (args[0] === "drop" || args[0] === "clear")) {
    return destructiveRefusal(`git stash ${args[0]}`);
  }
  // `git clean` without `-f` does nothing; with it, it deletes untracked files
  // — uncommitted work, exactly what this module protects. `-n` remains free.
  if (sub === "clean") {
    const forces = args.find((a) => a === "--force" || shortFlagWith("f")(a));
    if (forces) return destructiveRefusal(`git clean ${forces}`);
  }
  // `git switch` is the modern equivalent of `checkout`: changing branch is
  // harmless, throwing away the changes to get there is not.
  if (sub === "switch") {
    const discards = args.find((a) => a === "--discard-changes" || a === "--force" || a === "-f");
    if (discards) return destructiveRefusal(`git switch ${discards}`);
  }
  return { allowed: true };
}

/**
 * Harness verdict on an order for `run_command`. A refusal comes down to
 * model as a TOOL ERROR: the round continues, it reads why and
 * adapts — we never break the trick.
 */
export function checkCommand(command: string, scope: CommandScope = {}): CommandVerdict {
  return check(command, 0, scope);
}

function check(command: string, depth: number, scope: CommandScope): CommandVerdict {
  for (const segment of splitSegments(command)) {
    const verdict = checkSegment(segment, depth, scope);
    if (!verdict.allowed) return verdict;
  }
  return { allowed: true };
}
