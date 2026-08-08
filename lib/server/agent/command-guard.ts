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
 *  d'environnement (`FOO=bar git …`) et les enveloppes (`sudo git …`). */
function skipPrefix(tokens: string[]): number {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || WRAPPERS.has(t)) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/** Options GLOBALES de git qui portent une valeur en mot suivant (`git -C dir …`). */
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

/**
 * La sous-commande git d'un segment, et ses arguments — ou null si le segment ne
 * lance pas git. Saute les affectations d'environnement (`FOO=bar git …`), les
 * enveloppes (`sudo git …`) et les options globales de git.
 */
function gitInvocation(tokens: string[]): { sub: string; args: string[] } | null {
  let i = skipPrefix(tokens);
  const bin = tokens[i];
  if (!bin || !(bin === "git" || bin.endsWith("/git"))) return null;
  i++;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const opt = tokens[i];
    i++;
    if (GIT_GLOBAL_WITH_VALUE.has(opt)) i++;
  }
  const sub = tokens[i];
  if (!sub) return null;
  return { sub, args: tokens.slice(i + 1) };
}

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

  const git = gitInvocation(tokens);
  if (!git) return { allowed: true };
  const { sub, args } = git;

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
