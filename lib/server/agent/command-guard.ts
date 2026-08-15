/**
 * Garde-fou des commandes de `run_command` (MIN-108). PUR et testable — comme
 * `repo-path.ts`, la logique protège quelque chose qu'on ne peut pas récupérer.
 *
 * Le prompt système dit depuis toujours « le harness possède git » ; le harness,
 * lui, exécutait la commande telle quelle. Deux `git checkout -- <fichier>` sont
 * réellement passés en production. Ce qui est en jeu n'est pas la microVM (elle
 * est jetable) mais **le travail non commité de la branche** : `checkout --`,
 * `reset`, `restore` le détruisent en silence, et la fin de tour pousse alors une
 * branche amputée sans que personne ne l'ait vu passer.
 *
 * Principe de conception : liste **fermée et courte**, jamais une heuristique de
 * similarité. Un faux positif qui bloque une commande légitime coûte plus cher
 * que le risque couvert — on ne vise que ce qui DÉTRUIT du travail ou ÉCRIT sur
 * le remote. Tout le git de lecture (`status`, `log`, `diff`, `show`, `branch`)
 * et `git add` restent libres.
 *
 * Le parsing est textuel, pas un vrai shell : `g=git; $g reset --hard` passe. La
 * cible est un modèle distrait, pas un attaquant — l'attaquant a déjà `rm -rf`.
 *
 * Un cas méritait quand même d'être fermé (MIN-244) : `bash -lc "git reset --hard"`
 * n'est pas une astuce d'attaquant mais une forme que le modèle écrit tout seul, et
 * le shell y cachait git derrière son propre `-c`. On re-parse donc l'argument des
 * shells. Le reste ne bouge pas : pas de rails de composition à la OpenHands
 * (`curl … | bash`) — le réseau est ouvert par décision et la VM ne détient aucun
 * secret depuis MIN-223, il n'y a rien à voler en aval.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE PASSAGE EN LOCAL ANNULE DE TOUT CE QUI PRÉCÈDE (MIN-360)
 *
 * Les deux prémisses de l'en-tête — « la VM est jetable », « il n'y a rien à voler
 * en aval » — sont fausses mot pour mot dès que le tour joue dans le dépôt de
 * l'utilisateur, sur sa machine. Trois trous en découlent, et ils ne coûtent rien
 * à fermer des deux côtés :
 *
 * 1. **`git config`** n'était gardé par personne. Poser un `core.hooksPath` fait
 *    exécuter du code de l'agent au PROCHAIN COMMIT DE L'UTILISATEUR, dans son
 *    terminal, avec son trousseau déverrouillé — une persistance qui survit à la
 *    fin du run, à la révocation de la clé et à la fermeture de l'app. Même
 *    famille : `core.sshCommand`, `credential.helper`, `filter.*.clean`,
 *    `diff.*.textconv`, `url.*.insteadOf`, un alias qui commence par `!`.
 * 2. **`.git/` par le shell.** `assertNotGit` ([repo-path.ts](repo-path.ts)) garde
 *    les tools de FICHIER ; `bash` passait à côté. Un token de chemin portant un
 *    segment `.git` est donc refusé ici, casse repliée (APFS ne distingue pas
 *    `.GIT/` de `.git/`).
 * 3. **`git -C` / `--git-dir` / `--work-tree`.** Les options globales étaient
 *    sautées : la sous-commande était bien lue, mais celles qu'on laisse passer
 *    parce qu'elles sont inoffensives DANS NOTRE DÉPÔT (changer de branche) ne le
 *    sont plus dans un autre. Elles sont refusées en bloc — le harness possède un
 *    dépôt, et c'est celui du cwd.
 *
 * Et le bug d'enveloppe qui rendait le reste contournable : `env -i git push`
 * passait, parce que `skipPrefix` s'arrêtait sur `-i`. Les enveloppes voient
 * désormais leurs OPTIONS sautées, avec leur valeur quand elles en portent une.
 */

/** Valeur du champ `reason` de l'event `tool_result` d'un refus (mesurable en base). */
export const FORBIDDEN_COMMAND_REASON = "forbidden_command";

export type CommandVerdict = { allowed: true } | { allowed: false; reason: string };

/** Caractères qui terminent une commande dans un `sh -c` : chaînage, pipe,
 *  sous-shell, substitution. Le relevé de production montre exactement ce cas —
 *  `cd /vercel/sandbox/repo && git checkout -- package-lock.json`. */
const SEGMENT_BREAKS = new Set([";", "&", "|", "\n", "(", ")", "`"]);

/** Commandes qui en enveloppent une autre : on regarde ce qu'elles lancent. */
const WRAPPERS = new Set(["sudo", "env", "command", "time", "nohup", "xargs"]);

/**
 * LES OPTIONS D'ENVELOPPE QUI PORTENT UNE VALEUR EN MOT SUIVANT (MIN-360).
 *
 * Sans cette table, `skipPrefix` s'arrêtait au premier mot commençant par `-` :
 * `env -i git push` désignait `-i` comme binaire, donc « pas git », donc passait.
 * En sautant les options on retrouve git — mais sauter une option À VALEUR sans sa
 * valeur rouvrirait le même trou d'un cran plus loin (`sudo -u root git push`
 * désignerait `root`). D'où les deux gestes ensemble, et jamais l'un sans l'autre.
 *
 * Une option INCONNUE est sautée seule : c'est la conduite juste pour `-i`, `-p`,
 * `-0` et tous les drapeaux booléens, qui sont l'immense majorité.
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

/** Sous-commandes git refusées quelle que soit leur forme. */
const ALWAYS_FORBIDDEN = new Set([
  "commit", // le harness commite à la fin de chaque tour
  "push", // …et pousse (force-push inclus : la sous-commande suffit)
  "reset", // `--hard` détruit ; `--soft`/`--mixed` n'ont aucune raison d'être ici
  "restore", // sa raison d'être est de jeter des modifications
  "rebase",
  "cherry-pick",
]);

/**
 * Découpe la commande en segments exécutés indépendamment, en respectant les
 * guillemets — sinon `grep -n "git commit && git push" README.md` se ferait
 * refuser sur du texte qui n'est qu'un argument.
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

/** Découpe un segment en mots, guillemets retirés (`git "checkout" -- x`). */
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

/** Index du premier mot qui est vraiment un binaire : saute les affectations
 *  d'environnement (`FOO=bar git …`), les enveloppes (`sudo git …`) et LES OPTIONS
 *  de ces enveloppes (`env -i git …`, cf. `WRAPPER_VALUE_OPTIONS`). */
function skipPrefix(tokens: string[]): number {
  let i = 0;
  /** Les options à valeur de la DERNIÈRE enveloppe vue — null tant qu'il n'y en
   *  a pas eu : sans enveloppe, un mot en `-` est le binaire, pas une option. */
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
      // `--user=root` porte sa valeur ; `-u root` la porte en mot suivant.
      if (!t.includes("=") && valueOptions.has(t)) i++;
      continue;
    }
    break;
  }
  return i;
}

/** Options GLOBALES de git qui portent une valeur en mot suivant (`git -C dir …`). */
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * Les globales qui font travailler git AILLEURS que dans le dépôt du tour. Elles
 * sont refusées en bloc plutôt que suivies : le harness possède UN dépôt, celui du
 * cwd, et le second rideau des permissions (`external_directory: "deny"`) ne voit
 * pas passer un `bash`.
 */
const GIT_GLOBAL_ELSEWHERE = new Set(["-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * La sous-commande git d'un segment, ses arguments et SES GLOBALES — ou null si le
 * segment ne lance pas git. Saute les affectations d'environnement
 * (`FOO=bar git …`) et les enveloppes (`sudo git …`).
 *
 * Les globales sont RENDUES plutôt que sautées en silence (MIN-360) : c'est là que
 * vivent `-C`, `--git-dir` et le `-c <clé>=<valeur>` qui pose un hook le temps
 * d'une commande.
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
  // quand même : rendre null ici les rendrait invisibles.
  return { sub: tokens[i] ?? "", args: tokens.slice(i + 1), globals };
}

/**
 * LES CLÉS DE CONFIG QUI EXÉCUTENT DU CODE OU SURVIVENT AU RUN (MIN-360).
 *
 * Indexées `section.feuille` en minuscules : la section et la clé finale d'un nom
 * git sont insensibles à la casse, seule la sous-section du milieu ne l'est pas —
 * et c'est justement elle qui est libre (`filter.<nom>.clean`,
 * `url.<base>.insteadOf`). On compare donc les deux bouts, jamais le nom entier.
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

/** Sections dont TOUTE clé exécute (`alias.x = !sh -c …`) ou charge un fichier. */
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
/** Drapeaux qui ÉCRIVENT (ou ouvrent un éditeur sur le fichier). */
const GIT_CONFIG_WRITE_FLAGS = new Set([
  "--add", "--unset", "--unset-all", "--replace-all", "--edit", "-e",
  "--remove-section", "--rename-section",
]);
/** Portées qui sortent du dépôt du tour : le `~/.gitconfig` de l'utilisateur, le
 *  fichier système, un fichier nommé. Une écriture y survit à tout le reste. */
const GIT_CONFIG_ELSEWHERE = new Set(["--global", "--system", "--file", "-f", "--blob"]);
/** Verbes de la forme moderne (`git config set core.pager x`, git ≥ 2.46). */
const GIT_CONFIG_MODES = new Set([
  "get", "set", "unset", "list", "edit", "remove-section", "rename-section",
]);
const GIT_CONFIG_WRITE_MODES = new Set(["set", "unset", "edit", "remove-section", "rename-section"]);

/** Shells qui acceptent une commande en argument (`bash -lc "…"`). */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/**
 * La commande portée par un `sh -c` / `bash -lc` — ou null si le segment ne lance
 * pas un shell avec une commande en argument. Seule la forme `-…c…` compte :
 * `bash script.sh` exécute un fichier, qu'on ne lit pas.
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
    // Après `--`, ce qui suit est la commande de `-c` … ou un nom de script sinon.
    if (t === "--") return sawC ? (tokens[j + 1] ?? null) : null;
    if (!t.startsWith("-")) return sawC ? t : null; // sinon : un script, pas un `-c`
    if (!t.startsWith("--") && t.includes("c")) sawC = true;
    if (t === "-o" || t === "+o") j++; // `bash -o pipefail -c …` : `-o` porte une valeur
  }
  return null;
}

function refusal(what: string): CommandVerdict {
  return {
    allowed: false,
    reason:
      `Refused \`${what}\` — the harness owns git: it commits and pushes your work at the end of ` +
      `every turn, and reopens the pull request if needed. Read-only git (status/diff/log/show) ` +
      `is fine. If you need to discard a change you made, edit the file back instead.`,
  };
}

/**
 * `git config` — ou plutôt la seule partie qui compte : ce qui ÉCRIT (MIN-360).
 *
 * Lire la config est libre et utile (`git config --get remote.origin.url`). Ce
 * qu'on refuse tient en deux phrases : une écriture qui SORT du dépôt du tour
 * (`--global` réécrit le `~/.gitconfig` de l'utilisateur), et une écriture sur une
 * clé qui fait EXÉCUTER quelque chose plus tard — au prochain commit, au prochain
 * `git fetch`, au prochain `git diff` d'un humain qui ne saura pas d'où ça vient.
 *
 * `null` = rien à redire.
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
      // `--file <chemin>` porte sa valeur en mot suivant : elle n'est pas une clé.
      if (!arg.includes("=") && (name === "--file" || name === "-f" || name === "--blob")) i++;
      continue;
    }
    positionals.push(arg);
  }

  const mode = positionals[0] ?? "";
  const named = GIT_CONFIG_MODES.has(mode) ? positionals.slice(1) : positionals;
  if (GIT_CONFIG_WRITE_MODES.has(mode)) writes = true;
  // La forme historique n'a pas de verbe : `git config <clé>` LIT, `git config
  // <clé> <valeur>` ÉCRIT. C'est le nombre d'arguments qui tranche, et lui seul.
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
 * UN TOKEN QUI DÉSIGNE `.git/` (MIN-360) — le trou que `assertNotGit` ne bouchait
 * pas, parce qu'il garde les tools de FICHIER et que `bash` ne passe pas par eux.
 *
 * Écrire dans `.git/hooks/` fait exécuter du code au prochain geste git de
 * l'utilisateur ; écrire dans `.git/config` y pose un `insteadOf` ou un
 * `credential.helper` que personne ne relira. Refuser aussi les LECTURES est
 * volontaire : `.git/config` porte l'URL de push, token de forge compris.
 *
 * La casse est repliée parce qu'APFS est insensible à la casse — `.GIT/hooks`
 * désigne exactement le même dossier. `.gitignore` et `x.git` (une URL de clone)
 * ne matchent pas : c'est un SEGMENT de chemin qu'on cherche, pas une sous-chaîne.
 */
const GIT_INTERNALS = /(^|\/)\.git(\/|$)/i;

function gitInternalsToken(tokens: string[]): string | null {
  return tokens.find((t) => GIT_INTERNALS.test(t)) ?? null;
}

/** Un drapeau court (`-fd`, `-xdf`) qui porte cette lettre. */
const shortFlagWith = (letter: string) => (a: string) =>
  a.startsWith("-") && !a.startsWith("--") && a.includes(letter);

/** Ce segment lance-t-il une commande git interdite ? */
function checkSegment(segment: string, depth: number): CommandVerdict {
  const tokens = tokenize(segment);

  // `bash -lc "git reset --hard"` : le shell cache git derrière son propre `-c`.
  // On re-parse son argument comme une commande à part entière. La profondeur
  // borne `bash -c "bash -c …"`, qui n'a aucune raison d'exister.
  const inner = shellCommandArg(tokens);
  if (inner != null && depth < 3) {
    const verdict = check(inner, depth + 1);
    if (!verdict.allowed) return verdict;
  }

  // `.git/` par le shell — indépendant de git : `echo … > .git/hooks/pre-commit`
  // n'appelle pas git du tout, et c'est précisément ce qui le rendait invisible.
  const internals = gitInternalsToken(tokens);
  if (internals) {
    return {
      allowed: false,
      reason:
        `Refused \`${internals}\` — \`.git/\` belongs to the harness. A file written there runs ` +
        `on someone else's next git command, and \`.git/config\` holds the push credentials. ` +
        `Use git itself (\`git status\`, \`git log\`, \`git show\`) to read the repository's state.`,
    };
  }

  const git = gitInvocation(tokens);
  if (!git) return { allowed: true };
  const { sub, args, globals } = git;

  // Les globales, AVANT la sous-commande : `git -C /autre checkout main` est
  // inoffensif ici et ne l'est pas là-bas, et c'est le `-C` qui le dit.
  for (const global of globals) {
    const name = global.includes("=") ? global.slice(0, global.indexOf("=")) : global;
    if (GIT_GLOBAL_ELSEWHERE.has(name)) {
      return {
        allowed: false,
        reason:
          `Refused \`git ${name}\` — this turn works in one repository, the one you are in. ` +
          `Pointing git somewhere else is outside what the harness can vouch for.`,
      };
    }
    // `git -c core.hooksPath=… <commande>` ne persiste pas, mais il exécute — et
    // il pose la même chose que `git config`, à un mot près.
    if (name === "-c") {
      const key = global.slice(global.indexOf("=") + 1).split("=")[0];
      if (dangerousConfigKey(key)) return configKeyRefusal(key);
    }
  }

  if (sub === "config") {
    const verdict = checkGitConfig(args);
    if (verdict) return verdict;
  }

  if (ALWAYS_FORBIDDEN.has(sub)) return refusal(`git ${sub}`);
  // `--amend` réécrit le dernier commit — celui du harness, poussé ou non.
  if (args.includes("--amend")) return refusal(`git ${sub} --amend`);
  // `checkout` est ambigu (changer de branche est inoffensif) : on ne refuse que
  // les formes qui visent des FICHIERS, c'est-à-dire qui jettent le travail.
  if (sub === "checkout") {
    const discards = args.find((a) => a === "--" || a === "." || a === "-f" || a === "--force");
    if (discards) return refusal(`git checkout ${discards}`);
  }
  // `git stash` seul est récupérable ; `drop`/`clear` ne le sont pas.
  if (sub === "stash" && (args[0] === "drop" || args[0] === "clear")) {
    return refusal(`git stash ${args[0]}`);
  }
  // `git clean` sans `-f` ne fait rien ; avec, il supprime des fichiers non suivis
  // — le travail non commité, exactement ce que ce module protège. `-n` reste libre.
  if (sub === "clean") {
    const forces = args.find((a) => a === "--force" || shortFlagWith("f")(a));
    if (forces) return refusal(`git clean ${forces}`);
  }
  // `git switch` est l'équivalent moderne de `checkout` : changer de branche est
  // inoffensif, jeter les modifications pour y arriver ne l'est pas.
  if (sub === "switch") {
    const discards = args.find((a) => a === "--discard-changes" || a === "--force" || a === "-f");
    if (discards) return refusal(`git switch ${discards}`);
  }
  return { allowed: true };
}

/**
 * Verdict du harness sur une commande de `run_command`. Un refus revient au
 * modèle comme une ERREUR DE TOOL : le round continue, il lit pourquoi et
 * s'adapte — on ne casse jamais le tour.
 */
export function checkCommand(command: string): CommandVerdict {
  return check(command, 0);
}

function check(command: string, depth: number): CommandVerdict {
  for (const segment of splitSegments(command)) {
    const verdict = checkSegment(segment, depth);
    if (!verdict.allowed) return verdict;
  }
  return { allowed: true };
}
