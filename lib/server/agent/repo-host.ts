import {
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  parseBackgroundProbe,
  BACKGROUND_FETCH_BYTES,
  type BackgroundChunk,
  type BackgroundJobRunner,
  type BackgroundPaths,
} from "./background";
import { grepPathspecs, globPathspecs, expandBraces } from "./git-pathspec";
import { isInvalidRegexError, looksLikeIntendedAlternation } from "./grep-pattern";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";
import type { HarnessLayout } from "./harness-layout";

/**
 * Les MAINS de l'agent sur le dépôt — clone, lecture, édition, recherche, jobs de
 * fond, commit et push. Tout ce que le harness fait au disque de la microVM.
 *
 * POURQUOI CE MODULE EXISTE, et c'est le pivot de MIN-224. Ces gestes étaient
 * écrits contre l'objet `Sandbox` du SDK Vercel, donc contre un aller-retour RPC :
 * `runShell(sandbox, "git status")` part de la fonction, traverse l'Atlantique,
 * revient. Quand la boucle descend DANS la microVM, ce sont exactement les mêmes
 * gestes — mais sur le disque local, par `child_process` et `fs`.
 *
 * Rien de tout ce qui est écrit ici ne dépend du transport. Un `git grep` reste un
 * `git grep`, `resolveWithin` refuse le même `../..` de part et d'autre. D'où la
 * forme : **quatre primitives** (`exec`, `readFile`, `writeFile`, `mkdir`), et
 * toute la logique au-dessus, écrite UNE fois pour les deux mondes.
 *
 * - l'adaptateur RPC vit dans [sandbox.ts](sandbox.ts) (`sandboxHost`) ;
 * - l'adaptateur local vit dans [vm/local-host.ts](vm/local-host.ts), et n'est
 *   chargé QUE dans la VM.
 *
 * Ce fichier n'importe donc AUCUN SDK, et c'est un invariant tenu par
 * `vm-bundle-secrets.test.ts` : il part dans le bundle de la microVM.
 */

/** Runtime de la microVM. */
export const SANDBOX_RUNTIME = "node24";

/**
 * Dossiers LISIBLES hors dépôt (read_file / grep / list_dir). Jamais writables.
 *
 * Une FONCTION du layout depuis MIN-354, et plus une constante : ces dossiers
 * sont ceux DU RUN, et deux runs sur une même machine n'ont pas les mêmes.
 */
function readableDirs(layout: HarnessLayout): string[] {
  return [layout.toolOutputDir];
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ShellOptions {
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
}

/**
 * Les quatre primitives, et rien d'autre. Tout ce que ce module fait au dépôt
 * passe par là — c'est ce qui rend le reste du fichier indépendant du transport.
 */
export interface RepoHost {
  /**
   * OÙ CE HOST TRAVAILLE (MIN-354). Un host, c'est un disque — et depuis que ce
   * disque peut être celui d'un Mac partagé par deux runs, son adresse est une
   * VALEUR du run et non plus une constante de module.
   *
   * Elle voyage ici plutôt qu'en argument des trente fonctions ci-dessous, qui
   * prennent déjà le host en premier paramètre : c'est le même fait, dit une
   * fois. `layout.repoDir` est en particulier la racine de sécurité que
   * `resolveWithin` et `assertNotGit` comparent.
   */
  readonly layout: HarnessLayout;
  /** `sh -c <command>`. `cwd` vaut `layout.repoDir` par défaut (les tools opèrent dans le dépôt). */
  exec(command: string, opts?: ShellOptions): Promise<ShellResult>;
  /** Contenu utf8, ou null si le fichier n'existe pas. */
  readFile(absPath: string): Promise<string | null>;
  /** Crée ou écrase. Les dossiers parents sont supposés exister (cf. `mkdir`). */
  writeFile(absPath: string, content: string): Promise<void>;
  /** `mkdir -p`. Ne lève pas si le dossier existe déjà. */
  mkdir(absPath: string): Promise<void>;
}

/** Quote sûre pour insérer une valeur dans une commande `sh -c`. */
export function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * L'IDENTITÉ GIT, POSÉE PAR COMMANDE ET JAMAIS PERSISTÉE (MIN-358).
 *
 * `git config user.email` écrit dans `.git/config`. Dans un clone jetable c'est
 * sans conséquence ; dans le dépôt de l'utilisateur — le mode dépôt courant —
 * c'est SON identité qu'on réécrit, durablement, pour tous ses commits suivants
 * (mesuré). `git -c` fait la même chose pour la seule commande qui suit, et rend
 * donc la question sans objet des deux côtés.
 *
 * Un fragment de commande, et non un environnement : c'est ce que `RepoHost.exec`
 * sait transporter.
 */
export function gitIdentityFlags(committer: { name: string; email: string }): string {
  return `-c ${sq(`user.email=${committer.email}`)} -c ${sq(`user.name=${committer.name}`)}`;
}

/**
 * FENÊTRE D'HISTORIQUE du clone de travail, en jours (MIN-267).
 *
 * Le clone était à `--depth 1` : UN commit, greffé, sans parent. Suffisant pour
 * éditer et differ contre la base — mais un run dont le travail EST l'historique
 * (« audite ce qui a changé depuis le dernier rapport », « relis les commits de
 * la semaine ») n'avait rien à lire, et rendait un rapport vide en croyant que
 * le dépôt était vide. C'est arrivé sur la routine d'audit de sécurité.
 *
 * D'où une fenêtre de temps plutôt qu'une profondeur : `--shallow-since` borne
 * le clone par ce qui s'est PASSÉ, pas par un nombre de commits. Sur ce dépôt,
 * 50 commits ne couvrent que deux jours ; six mois couvrent tout ce dont une
 * routine mensuelle a besoin, et le coût reste borné par l'activité de la
 * fenêtre — pas par la taille totale du dépôt, qui, lui, ne cesse de croître.
 *
 * Ce que ça coûte, mesuré sur ce dépôt (682 commits, tous dans la fenêtre, donc
 * le pire cas : le clone est alors COMPLET) : 33 Mo → 97 Mo, et 1,5 s → 4 s. Ce
 * n'est payé qu'à la création d'une microVM neuve — un réveil de snapshot ne
 * re-clone pas.
 */
export const HISTORY_WINDOW_DAYS = 180;

/** Borne `--shallow-since` du clone, en date ISO courte (UTC). */
export function historySince(now: Date = new Date()): string {
  const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return since.toISOString().slice(0, 10);
}

/**
 * Clone le dépôt (shallow) sur `baseBranch` dans le dépôt du layout puis se place sur
 * `workBranch` : reprise de la branche distante si elle existe déjà (le run a
 * poussé du WIP à un chunk précédent), sinon création depuis la base. `authUrl`
 * porte un token d'installation éphémère — jamais persisté hors de la microVM.
 *
 * Le clone porte la fenêtre d'historique décrite ci-dessus, et `--single-branch`
 * y est EXPLICITE : `--depth` l'impliquait, `--shallow-since` aussi en pratique,
 * mais `resolveBaseRef` ([working-diff.ts](working-diff.ts)) s'appuie sur le fait
 * qu'il n'y a QU'UNE ref distante — ça se dit dans la commande, pas dans un
 * effet de bord. La reprise de la branche de travail utilise la MÊME borne : un
 * `--depth 1` y poserait une greffe sur son tip et re-couperait la marche
 * arrière, alors même que la base, elle, est profonde.
 *
 * L'IDENTITÉ N'EST PLUS ÉCRITE DANS `.git/config` (MIN-358). Elle voyage jusqu'au
 * commit, où `commitAndPush` la pose par `git -c`. Ici, dans un clone jetable, la
 * persister était sans conséquence ; le geste, lui, était le même que celui qui,
 * dans le dépôt de l'utilisateur, réécrit SON identité pour tous ses commits
 * suivants (mesuré). Un geste qu'on n'a qu'à un seul endroit ne peut pas fuir
 * dans l'autre mode.
 */
export async function cloneRepo(
  host: RepoHost,
  opts: {
    authUrl: string;
    baseBranch: string;
    workBranch: string;
  },
): Promise<void> {
  const { root, repoDir } = host.layout;
  // La racine du run est créée ici, et pas seulement nettoyée : sur une microVM
  // elle existe déjà (c'est le home du Sandbox), sur une machine ordinaire non.
  await host.mkdir(root).catch(() => {});
  const wipe = await host.exec(`rm -rf ${sq(repoDir)}`, { cwd: root });
  if (wipe.exitCode !== 0) throw new Error(`cleanup failed: ${wipe.stderr || wipe.stdout}`);

  const since = historySince();
  const clone = await host.exec(
    `git clone --shallow-since=${sq(since)} --single-branch --branch ${sq(opts.baseBranch)}` +
      ` ${sq(opts.authUrl)} ${sq(repoDir)}`,
    { cwd: root, timeoutMs: 180_000 },
  );
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);

  const setup = [
    `set -e`,
    `if git ls-remote --exit-code --heads ${sq(opts.authUrl)} ${sq(opts.workBranch)} >/dev/null 2>&1; then`,
    `  git fetch --shallow-since=${sq(since)} ${sq(opts.authUrl)} ${sq(opts.workBranch)}:${sq(opts.workBranch)}`,
    `  git checkout ${sq(opts.workBranch)}`,
    `else`,
    `  git checkout -b ${sq(opts.workBranch)}`,
    `fi`,
  ].join("\n");
  const branch = await host.exec(setup, { timeoutMs: 120_000 });
  if (branch.exitCode !== 0) throw new Error(`branch setup failed: ${branch.stderr || branch.stdout}`);
}

/**
 * Clone le dépôt pour RELIRE une pull request (MIN-168) : base d'abord, puis la
 * tête de la PR, en LECTURE SEULE — aucune branche de travail n'est créée, rien
 * ne sera commité ni poussé depuis cette microVM.
 *
 * La tête est cherchée par sa **ref serveur** (`refs/pull/<n>/head` chez GitHub,
 * `refs/merge-requests/<iid>/head` chez GitLab) et non par le nom de branche : sur
 * une PR de FORK, `head_branch` n'existe pas dans le dépôt de base, et un fetch
 * dessus ne trouverait rien — l'agent se retrouverait sur la base, sans diff, à
 * relire du vide en croyant relire la PR. La ref serveur, elle, pointe le commit
 * de tête d'où qu'il vienne.
 *
 * Repli sur le nom de branche quand la ref n'existe pas (dépôt miroir, instance
 * qui ne la publie pas) ; échec explicite si les deux manquent, plutôt qu'une
 * session muette sur la mauvaise référence.
 *
 * Le clone reste shallow : `git diff <base>` marche (c'est un diff d'arbres), les
 * diffs à trois points et un `git log` profond n'ont pas d'historique commun à
 * parcourir — le prompt le dit à l'agent.
 *
 * D'où `baseSha` (MIN-258), et c'est ce qui rend le diff JUSTE. Sans lui il ne
 * reste que `git diff origin/<base>`, qui compare au tip VIVANT de la base : un
 * commit fusionné dans la base depuis l'ouverture de la PR y apparaît INVERSÉ,
 * comme si la pull request l'avait annulé — et une relecture pose alors des
 * remarques publiques sur du code que la PR ne touche pas. `baseSha` est la base
 * du diff que la FORGE sert (`getMergeBaseSha` : merge base vivant chez GitHub,
 * `diff_refs.base_sha` chez GitLab) : on l'amène dans le clone à profondeur 1 —
 * un commit, moins d'une seconde — et on le marque du tag `PR_BASE_TAG`. À partir
 * de là `git diff pr-base` EST le changement de la pull request, et il compte
 * exactement les mêmes fichiers que la liste « Files changed » de l'amorce.
 *
 * Best-effort, délibérément : ce fetch n'est pas une condition du clone. S'il
 * échoue (sha injoignable, instance qui refuse un `want` par sha), la session
 * tourne quand même — le prompt décrit alors le repli `origin/<base>` et ce qu'il
 * vaut. Une relecture qui ne démarre pas coûte plus qu'une relecture prudente.
 */
/** Tag qui marque, dans le clone de relecture, la base du diff servi par la forge. */
export const PR_BASE_TAG = "pr-base";
export async function clonePullRequest(
  host: RepoHost,
  opts: {
    authUrl: string;
    baseBranch: string;
    /** Ref serveur de la tête (cf. `pullRequestHeadRef`). */
    headRef: string;
    /** Nom de branche de tête, quand on le connaît : le repli. */
    headBranch: string | null;
    /** Nom local sous lequel la tête est checkoutée. */
    localBranch: string;
    /** Base du diff servi par la forge, à marquer `pr-base` (cf. en-tête). */
    baseSha?: string | null;
  },
): Promise<void> {
  const { root, repoDir } = host.layout;
  await host.mkdir(root).catch(() => {});
  const wipe = await host.exec(`rm -rf ${sq(repoDir)}`, { cwd: root });
  if (wipe.exitCode !== 0) throw new Error(`cleanup failed: ${wipe.stderr || wipe.stdout}`);

  const clone = await host.exec(
    `git clone --depth 1 --branch ${sq(opts.baseBranch)} ${sq(opts.authUrl)} ${sq(repoDir)}`,
    { cwd: root, timeoutMs: 180_000 },
  );
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);

  const fallback = opts.headBranch?.trim()
    ? [
        `  echo "head ref ${opts.headRef} unavailable, falling back to the branch" >&2`,
        `  git fetch --depth 1 ${sq(opts.authUrl)} ${sq(`${opts.headBranch.trim()}:${opts.localBranch}`)}`,
      ]
    : [`  exit 1`];
  const setup = [
    `set -e`,
    // AUCUNE IDENTITÉ N'EST POSÉE ICI (MIN-358). Il y en avait une, « neutre »,
    // au motif que git refuserait certaines opérations d'index sans elle : mesuré
    // faux — sur un dépôt sans la moindre identité (ni locale, ni globale, ni
    // système), `fetch`, `checkout`, `tag -f` et `show` passent tous. Et rien ne
    // commite ici, par construction.
    `if git fetch --depth 1 ${sq(opts.authUrl)} ${sq(`${opts.headRef}:${opts.localBranch}`)} 2>/dev/null; then`,
    `  :`,
    `else`,
    ...fallback,
    `fi`,
    `git checkout ${sq(opts.localBranch)}`,
  ].join("\n");
  const head = await host.exec(setup, { timeoutMs: 120_000 });
  if (head.exitCode !== 0) {
    throw new Error(`pull request checkout failed: ${head.stderr || head.stdout}`);
  }

  // Sha VALIDÉ avant de partir dans un shell : il vient d'une API de forge, et
  // `sq` seul suffirait, mais un ref qui n'est pas un sha n'a de toute façon rien
  // à faire ici — un nom de branche donnerait un tag qui bouge sous l'agent.
  const baseSha = opts.baseSha?.trim() ?? "";
  if (!/^[0-9a-f]{7,64}$/i.test(baseSha)) return;
  const anchor = await host.exec(
    [
      `set -e`,
      `git fetch --depth 1 ${sq(opts.authUrl)} ${sq(baseSha)}`,
      `git tag -f ${sq(PR_BASE_TAG)} ${sq(baseSha)}`,
    ].join("\n"),
    { timeoutMs: 120_000 },
  );
  if (anchor.exitCode !== 0) {
    // Pas une panne de session : le prompt sait décrire le repli. Mais ça se dit,
    // sinon une relecture dégradée est indiscernable d'une relecture exacte.
    console.error(
      `[agent] pr base anchor unavailable (${baseSha}): ${anchor.stderr || anchor.stdout}`,
    );
  }
}

/**
 * Sha du tip de la BASE tel que le clone l'a rapporté (`refs/remotes/origin/<base>`,
 * créé par `git clone --branch <base>` et intact après la reprise d'une branche de
 * travail). C'est le point de comparaison du détecteur de travail ci-dessous.
 *
 * Renvoie "" si le ref est illisible (clone d'une forme inattendue) : l'appelant
 * pousse alors comme avant — en cas de doute, on ne prend jamais le risque de
 * garder du travail hors du remote.
 */
async function baseTipSha(host: RepoHost, baseBranch: string): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse --verify ${sq(`refs/remotes/origin/${baseBranch}`)}`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Stage tout, commit s'il y a des changements, puis push HEAD → workBranch. À
 * appeler à chaque suspend et à la fin (l'état du repo devient durable dans git).
 * `authUrl` doit porter un token FRAIS (l'appelant le re-résout avant l'appel).
 *
 * PAS DE BRANCHE POUR RIEN (MIN-123) : `git push HEAD:refs/heads/<branche>` CRÉE la
 * branche distante même quand l'arbre est propre — au sha de la base. Une session
 * qui ne touche à aucun fichier (question, plan, vérification) laissait donc une
 * branche vide sur le dépôt de l'utilisateur. D'où le détecteur : si, commit
 * conditionnel fait, HEAD est ENCORE au tip de la base, la branche n'a rien à dire
 * et on ne pousse pas du tout (`pushed: false`). Dès qu'un commit existe — c'est
 * le seul signal de « du code a changé », `git add -A` ne voyant que du suivi — on
 * pousse comme avant : le WIP poussé reste le filet durable au-delà du snapshot de
 * la microVM.
 *
 * Renvoie le sha de HEAD, si un commit a été créé, si un push a eu lieu, et surtout
 * `remoteUpdated` : le push a-t-il fait AVANCER la branche distante ? C'est LE
 * signal « du vrai travail vient d'arriver sur le remote » — plus fiable que
 * `committed`, qui ne voit que l'appel courant : un commit posé par un appel
 * précédent dont le push avait échoué (5xx transitoire) part avec un arbre PROPRE
 * au push suivant (committed=false), et inversement un tour purement conversationnel
 * pousse un no-op (remote déjà à jour). Les décisions du type « rouvrir la PR
 * refusée » doivent se prendre sur `remoteUpdated`.
 */
export async function commitAndPush(
  host: RepoHost,
  opts: {
    authUrl: string;
    workBranch: string;
    baseBranch: string;
    message: string;
    /**
     * Identité git des commits de l'agent, posée PAR COMMANDE (MIN-358) plutôt
     * qu'écrite dans `.git/config` au clonage. Doit être rattachable à un vrai
     * compte du forge (bot de l'App côté GitHub) : sinon Vercel bloque le
     * déploiement.
     */
    committer: { name: string; email: string };
  },
): Promise<{ committed: boolean; remoteUpdated: boolean; headSha: string; pushed: boolean }> {
  const status = await host.exec(`git status --porcelain`);
  const dirty = status.stdout.trim().length > 0;

  if (dirty) {
    const staged = await host.exec(`git add -A`);
    if (staged.exitCode !== 0) throw new Error(`git add failed: ${staged.stderr || staged.stdout}`);
    const commit = await host.exec(
      `git ${gitIdentityFlags(opts.committer)} commit -m ${sq(opts.message)}`,
    );
    if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const head = await host.exec(`git rev-parse HEAD`);
  const headSha = head.stdout.trim();

  // Rien de commité par-dessus la base : aucune branche à créer sur le remote.
  // `!dirty` est redondant (un commit fait forcément avancer HEAD) mais tenu
  // explicitement : ce chemin ne doit JAMAIS pouvoir garder un commit au chaud.
  const baseSha = await baseTipSha(host, opts.baseBranch);
  if (!dirty && baseSha && baseSha === headSha) {
    return { committed: false, remoteUpdated: false, headSha, pushed: false };
  }

  // Sha actuel de la branche distante (vide si elle n'existe pas encore). Best-
  // effort : si ls-remote échoue, on suppose le remote en retard (remoteUpdated
  // sera true si le push passe) — mieux vaut un reopen de trop qu'un travail
  // poussé sans réouverture de sa PR refusée.
  const remote = await host.exec(
    `git ls-remote ${sq(opts.authUrl)} ${sq(`refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 60_000 },
  );
  const remoteSha = remote.exitCode === 0 ? remote.stdout.trim().split(/\s/)[0] ?? "" : "";

  const push = await host.exec(
    `git push ${sq(opts.authUrl)} ${sq(`HEAD:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return { committed: dirty, remoteUpdated: remoteSha !== headSha, headSha, pushed: true };
}

// ── Diff par tour (event `files_changed`, MIN-46) ────────────────────────────

/**
 * LE PÉRIMÈTRE D'UN TOUR, QUAND LE DÉPÔT N'EST PAS À NOUS (MIN-358).
 *
 * Les trois lectures ci-dessous comparent une référence à l'ARBRE DE TRAVAIL. En
 * microVM, cet arbre ne contient que le travail de l'agent, et la question ne se
 * pose pas. Dans le checkout de l'utilisateur, il contient aussi le SIEN : sans
 * borne, l'auto-relecture de fin de tour lui rend son propre WIP comme s'il
 * venait du modèle, et la portée ciblée des tests part sur ses fichiers à lui.
 *
 * `undefined` = pas de borne, exactement le comportement d'avant. Une liste
 * VIDE, elle, borne à rien du tout — et c'est le bon sens : un tour qui n'a
 * touché à aucun fichier n'a pas de diff, quoi qu'il y ait dans l'arbre.
 */
export type TurnScope = readonly string[] | undefined;

/** Le `-- <chemins>` d'une commande git, ou "" quand rien ne borne. `:(literal)`
 *  n'y est pas utile : ces chemins viennent de git lui-même, pas du modèle. */
function pathspec(scope: TurnScope): string {
  if (scope === undefined) return "";
  // Un pathspec impossible plutôt qu'aucun pathspec : `-- ` seul serait lu comme
  // « tout », c'est-à-dire l'inverse de ce qu'une liste vide demande.
  if (scope.length === 0) return ` -- ${sq(":(exclude)*")}`;
  return ` -- ${scope.map(sq).join(" ")}`;
}

/** Nombre max de fichiers listés dans un event `files_changed` (gros tour borné). */
export const CHANGED_FILES_CAP = 100;

/** Un fichier changé sur un intervalle git. Défini ICI : ce module (serveur ET
    microVM) ne dépend pas de la couche client `lib/agent-api.ts` (« use client »).
    Même forme. */
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  previousPath?: string;
}

/** HEAD courant du dépôt (sha), ou "" si indéterminable. Best-effort — ne lève pas. */
export async function revParseHead(host: RepoHost): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse HEAD`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Résout le chemin APRÈS d'un champ path de `git diff --numstat`, qui compacte les
 * renommages (`a => b`, `{a => b}`, `pre/{a => b}/post`) — là où `--name-status`
 * donne des chemins propres tab-séparés. On ne s'en sert que pour indexer les
 * compteurs par chemin final.
 */
function numstatNewPath(field: string): string {
  const brace = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) {
    const [, pre, , newMid, post] = brace;
    return `${pre}${newMid}${post}`.replace(/\/{2,}/g, "/");
  }
  const arrow = field.split(" => ");
  return (arrow.length === 2 ? arrow[1] : field).trim();
}

/**
 * Le diff TEXTUEL du tour, pour l'auto-relecture de fin de tour (self-review.ts) :
 * le patch depuis `fromSha` jusqu'à l'arbre de travail — donc le travail déjà
 * poussé en WIP au milieu du chunk ET ce qui n'est pas encore committé — plus la
 * sortie brute de `git status --porcelain`, d'où se lisent les fichiers ajoutés
 * (que `git diff` ignore tant qu'ils ne sont pas suivis).
 *
 * LECTURE SEULE : ni `add`, ni `add -N`. L'index appartient à la fin de tour, qui
 * stage et committe seule — une intention d'ajout posée ici se retrouverait dans
 * le commit de quelqu'un d'autre.
 *
 * Best-effort, comme `changedFiles` : toute erreur rend des chaînes vides plutôt
 * que d'empêcher un tour de se terminer.
 */
export async function turnDiff(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ diff: string; porcelain: string }> {
  const only = pathspec(scope);
  const [diff, porcelain] = await Promise.all([
    fromSha
      ? host
          .exec(`git diff ${sq(fromSha)}${only}`, { timeoutMs: 30_000 })
          .then((r) => (r.exitCode === 0 ? r.stdout : ""))
          .catch(() => "")
      : Promise.resolve(""),
    host
      .exec(`git status --porcelain${only}`, { timeoutMs: 30_000 })
      .then((r) => (r.exitCode === 0 ? r.stdout : ""))
      .catch(() => ""),
  ]);
  return { diff, porcelain };
}

/**
 * LA TAILLE DU TOUR, POUR DIMENSIONNER SES CONTRÔLES (MIN-262) — pas son contenu :
 * on ne rend ici ni patch ni statut, juste de quoi répondre à « ce tour est-il
 * assez petit pour qu'un passage de tests CIBLÉ suffise ? ».
 *
 * `files` ne porte QUE les fichiers qui existent encore (`--diff-filter=d`) : c'est
 * la liste qu'on passe à `vitest related`, et un chemin supprimé n'y a pas de sens.
 * `lines` compte tout, suppressions comprises — c'est le poids du changement.
 *
 * `untracked` est rendu à part et pèse lourd chez l'appelant : un fichier NEUF est
 * du comportement neuf, celui-là même dont aucun test existant ne parle (MIN-251).
 * Un tour qui en crée n'est jamais « petit », quelle que soit sa taille en lignes.
 *
 * Best-effort comme `turnDiff` : toute erreur rend un tour de taille INCONNUE
 * (`null`), et l'appelant retombe alors sur le contrôle complet.
 */
export async function turnDiffStat(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ files: string[]; lines: number; untracked: number } | null> {
  if (!fromSha) return null;
  const only = pathspec(scope);
  try {
    const [numstat, names, porcelain] = await Promise.all([
      host.exec(`git diff --numstat ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git diff --name-only --diff-filter=d ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git status --porcelain${only}`, { timeoutMs: 30_000 }),
    ]);
    if (numstat.exitCode !== 0 || names.exitCode !== 0) return null;
    let lines = 0;
    for (const line of numstat.stdout.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      // `-` : fichier binaire. Il ne se compte pas en lignes, mais il compte comme
      // un changement — un `0` le rendrait invisible.
      lines += m[1] === "-" || m[2] === "-" ? 1 : Number(m[1]) + Number(m[2]);
    }
    const files = names.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const untracked =
      porcelain.exitCode === 0
        ? porcelain.stdout.split("\n").filter((l) => l.startsWith("??")).length
        : 0;
    return { files, lines, untracked };
  } catch {
    return null;
  }
}

/**
 * TOUS LES CHEMINS QUE LE TOUR A REMUÉS, suppressions et fichiers neufs compris
 * (MIN-286).
 *
 * `turnDiffStat` sert à DIMENSIONNER un tour : sa liste est celle qu'on passe à
 * `vitest related`, donc elle exclut ce qui n'existe plus (`--diff-filter=d`) et
 * ne compte les fichiers neufs qu'en nombre. Ici on veut l'inverse — savoir CE
 * QUI a bougé, pour que le type-check de fin de tour ait quelque chose à
 * regarder quand le modèle n'a fait que supprimer ou créer par le shell (sous
 * opencode, `rm`/`mv` ne passent par aucun tool d'écriture).
 *
 * Best-effort comme ses voisines : toute erreur rend une liste vide.
 */
export async function turnTouchedPaths(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<string[]> {
  if (!fromSha) return [];
  const only = pathspec(scope);
  try {
    const [names, porcelain] = await Promise.all([
      host.exec(`git diff --name-only ${sq(fromSha)}${only}`, { timeoutMs: 30_000 }),
      host.exec(`git status --porcelain${only}`, { timeoutMs: 30_000 }),
    ]);
    const paths = new Set<string>();
    if (names.exitCode === 0) {
      for (const line of names.stdout.split("\n")) {
        const path = line.trim();
        if (path) paths.add(path);
      }
    }
    if (porcelain.exitCode === 0) {
      for (const line of porcelain.stdout.split("\n")) {
        if (!line.startsWith("??")) continue;
        const path = line.slice(2).trim();
        if (path) paths.add(path);
      }
    }
    return [...paths];
  } catch {
    return [];
  }
}

/**
 * Fichiers changés entre deux shas (le « diff par tour »). Deux passes git :
 * `--name-status` (statut + chemins propres, renommages compris) pour la liste, et
 * `--numstat` pour les compteurs +/− (fichier binaire → 0/0). Forme deux-points
 * seulement — le clone est shallow (depth 1). Best-effort : toute erreur (ou un sha
 * hors de l'historique shallow) renvoie une liste vide, ne casse jamais un tour.
 */
export async function changedFiles(
  host: RepoHost,
  fromSha: string,
  toSha: string,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  if (!fromSha || !toSha || fromSha === toSha) return { files: [], truncated: false };
  return diffToChangedFiles(host, fromSha, sq(toSha), "");
}

/**
 * LES MÊMES FICHIERS CHANGÉS, MAIS DANS L'ARBRE DE TRAVAIL (MIN-293).
 *
 * En mode dépôt courant, **le tour ne commite plus** : son livrable est ce qu'il
 * a laissé sur le disque de l'utilisateur (décision D2bis-B). Il n'y a donc pas
 * de second sha à differ — on compare la baseline du tour à l'arbre, et on
 * ajoute les fichiers NON SUIVIS, que `git diff` ne voit pas et qui sont
 * pourtant le cas le plus courant d'un agent qui crée un fichier.
 *
 * `scope` borne aux chemins du tour : sans lui, les 20 fichiers sales de
 * l'utilisateur remonteraient dans le fil comme si l'agent les avait touchés.
 */
export async function workingTreeChangedFiles(
  host: RepoHost,
  fromSha: string,
  scope?: TurnScope,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  if (!fromSha) return { files: [], truncated: false };
  const only = pathspec(scope);
  const tracked = await diffToChangedFiles(host, fromSha, "", only);

  // Les non-suivis, que `git diff` ignore par construction. `--porcelain` les
  // marque `??`, et ils comptent tous pour « ajouté ».
  let untracked: string[] = [];
  try {
    const status = await host.exec(`git status --porcelain --untracked-files=all${only}`, {
      timeoutMs: 30_000,
    });
    if (status.exitCode === 0) {
      untracked = status.stdout
        .split("\n")
        .filter((line) => line.startsWith("?? "))
        .map((line) => line.slice(3).trim())
        .filter(Boolean);
    }
  } catch {
    // Best-effort, comme tout ce fichier : un `git status` qui échoue ne doit pas
    // faire tomber un tour abouti.
  }

  const seen = new Set(tracked.files.map((f) => f.path));
  const files = [
    ...tracked.files,
    ...untracked
      .filter((path) => !seen.has(path))
      .map((path): ChangedFile => ({ path, status: "added", additions: 0, deletions: 0 })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  const truncated = tracked.truncated || files.length > CHANGED_FILES_CAP;
  return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
}

/** Le corps commun : deux passes `git diff`, une liste de `ChangedFile`. */
async function diffToChangedFiles(
  host: RepoHost,
  fromSha: string,
  target: string,
  only: string,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  const to = target ? ` ${target}` : "";
  try {
    const [nameStatus, numstat] = await Promise.all([
      host.exec(`git diff --name-status --find-renames ${sq(fromSha)}${to}${only}`),
      host.exec(`git diff --numstat --find-renames ${sq(fromSha)}${to}${only}`),
    ]);
    if (nameStatus.exitCode !== 0) return { files: [], truncated: false };

    // Compteurs indexés par chemin APRÈS.
    const counts = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstat.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
      counts.set(numstatNewPath(parts.slice(2).join("\t")), { additions, deletions });
    }

    const files: ChangedFile[] = [];
    for (const line of nameStatus.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0]?.[0] ?? "";
      let status: ChangedFile["status"];
      let path: string;
      let previousPath: string | undefined;
      if (code === "R") {
        status = "renamed";
        previousPath = parts[1] ?? "";
        path = parts[2] ?? previousPath;
      } else if (code === "A" || code === "C") {
        // Copie (C) = nouveau fichier côté cible → « ajouté » du point de vue lecteur.
        status = "added";
        path = parts[1] ?? "";
      } else if (code === "D") {
        status = "deleted";
        path = parts[1] ?? "";
      } else {
        status = "modified";
        path = parts[1] ?? "";
      }
      if (!path) continue;
      const c = counts.get(path) ?? { additions: 0, deletions: 0 };
      files.push({
        path,
        status,
        additions: c.additions,
        deletions: c.deletions,
        ...(previousPath ? { previousPath } : {}),
      });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const truncated = files.length > CHANGED_FILES_CAP;
    return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
  } catch {
    return { files: [], truncated: false };
  }
}

// ── Helpers fichiers (utilisés par les tools de l'agent) ─────────────────────

/** Nombre max de lignes renvoyées par un `read_file` sans offset/limit. */
export const READ_MAX_LINES = 2000;
/** Longueur max d'une ligne renvoyée (au-delà, tronquée). */
export const READ_MAX_LINE_CHARS = 2000;
/** Taille max d'un fichier lu (au-delà, on lit quand même mais on borne les lignes). */
export const READ_MAX_BYTES = 250_000;
/** Nombre max de fichiers renvoyés par `glob`. */
export const GLOB_MAX_FILES = 100;

/**
 * Chemin absolu et VALIDÉ d'un fichier du dépôt. Résout `..` et rejette toute
 * sortie du dépôt du run.
 *
 * DÉFENSE EN PROFONDEUR, et elle garde exactement le même sens depuis MIN-224 :
 * c'est une fonction de CHEMIN, appliquée aux arguments du modèle avant de
 * toucher le disque. Que le harness tourne dans la machine qu'il garde ne change
 * rien à ce qu'elle refuse — la microVM reste la vraie frontière, mais un
 * `../../x` ne doit jamais y toucher autre chose que le dépôt.
 *
 * La racine vient du host depuis MIN-354, et c'est le seul changement : sur une
 * machine où le dépôt n'est plus sous `/vercel`, une racine en dur ne refusait
 * pas trop peu — elle refusait TOUT, chaque chemin réel sortant d'une racine
 * qui n'existe pas.
 */
function repoPath(host: RepoHost, relPath: string): string {
  return resolveWithin(host.layout.repoDir, relPath);
}

/**
 * Chemin de LECTURE : le dépôt, plus les dossiers lisibles du run (sorties
 * de tools déposées, MIN-107). Réservé aux tools qui LISENT — les écritures
 * passent par `writablePath` et restent enfermées dans le dépôt.
 */
function readablePath(host: RepoHost, path: string): string {
  return resolveReadable(host.layout.repoDir, readableDirs(host.layout), path);
}

/**
 * Comme repoPath mais pour les ÉCRITURES : refuse en plus `.git/` (écrire un hook
 * ou config = escalade possible — exfiltration du token d'installation, backdoor).
 */
function writablePath(host: RepoHost, relPath: string): string {
  const abs = repoPath(host, relPath);
  assertNotGit(host.layout.repoDir, abs, relPath);
  return abs;
}

/** Lit le contenu BRUT d'un fichier du dépôt (utf8), ou null s'il n'existe pas.
    Sert à l'édition (`edit_file`), qui a besoin du contenu exact non annoté. */
export async function readWorkFile(host: RepoHost, relPath: string): Promise<string | null> {
  return host.readFile(repoPath(host, relPath));
}

/**
 * Le même fichier, mais tel qu'il est À UNE RÉFÉRENCE GIT — pas dans l'arbre de
 * travail (MIN-328).
 *
 * Une session de RELECTURE est checkoutée sur la TÊTE de la pull request, qui sur
 * un fork appartient à l'auteur de la PR — c'est-à-dire, sur un dépôt public, à
 * n'importe qui. Lire les instructions du dépôt là-dedans revenait à laisser un
 * inconnu écrire dans le prompt système de la session. Seule la BASE fait
 * autorité, et c'est ce que le tag `pr-base` désigne.
 *
 * `git show` plutôt qu'un checkout : rien ne bouge dans l'arbre, donc le
 * `git diff pr-base` de la relecture reste exactement le changement de la PR.
 * Rend null si la ref ou le chemin n'existe pas — c'est le cas normal (pas
 * d'`AGENTS.md`, ou ancrage de base non ramené), et il vaut mieux une relecture
 * sans conventions qu'une relecture aux conventions de l'attaquant.
 */
export async function readFileAtRef(
  host: RepoHost,
  ref: string,
  relPath: string,
): Promise<string | null> {
  // La ref vient de nous (`PR_BASE_TAG`), le chemin vient d'un nom de fichier
  // d'instructions calculé par `instructionFilesFor` — les deux passent quand
  // même par `sq`, comme tout ce qui entre dans un shell ici.
  const cleaned = relPath.trim().replace(/^\.\//, "");
  if (!cleaned || cleaned.startsWith("/") || cleaned.split("/").includes("..")) return null;
  try {
    const res = await host.exec(`git show ${sq(`${ref}:${cleaned}`)}`, { timeoutMs: 20_000 });
    return res.exitCode === 0 ? res.stdout : null;
  } catch {
    return null;
  }
}

/**
 * Dépose une sortie de tool trop longue dans le dossier de sorties du run et
 * renvoie son chemin ABSOLU (celui que le modèle repassera à `read_file`/`grep`).
 * Ne passe PAS par `writablePath` : on écrit volontairement hors du dépôt, et
 * `name` est un simple nom de fichier (tout séparateur est neutralisé ici).
 */
export async function writeToolOutput(
  host: RepoHost,
  name: string,
  content: string,
): Promise<string> {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+$/, "output") || "output";
  const dir = host.layout.toolOutputDir;
  const abs = `${dir}/${safe}`;
  await host.mkdir(dir).catch(() => {});
  await host.writeFile(abs, content);
  return abs;
}

// ── Jobs de fond (MIN-114) ───────────────────────────────────────────────────

/** Timeout du lancement d'un job (on n'attend que son PID, pas sa fin). */
const BACKGROUND_START_TIMEOUT_MS = 20_000;
/** Timeout d'une sonde / d'un arrêt. */
const BACKGROUND_PROBE_TIMEOUT_MS = 30_000;

/**
 * Les trois fichiers d'un job, dans le dossier de sorties du run — donc HORS du
 * dépôt (le `git add -A` de fin de tour ne les voit jamais) et dans un dossier
 * LISIBLE par `read_file`/`grep` : le log complet d'un serveur reste consultable
 * même quand la sonde n'en a renvoyé que la queue (MIN-107).
 */
function backgroundPaths(layout: HarnessLayout, jobId: string): BackgroundPaths {
  const safe = jobId.replace(/[^A-Za-z0-9._-]/g, "-") || "job";
  return {
    log: `${layout.toolOutputDir}/${safe}.log`,
    pid: `${layout.toolOutputDir}/${safe}.pid`,
    exit: `${layout.toolOutputDir}/${safe}.exit`,
  };
}

/**
 * Lance une commande EN FOND et renvoie son PID (le script lui-même, et pourquoi
 * il est écrit ainsi, sont dans `background.ts` — module pur).
 */
export async function startBackground(
  host: RepoHost,
  opts: { jobId: string; command: string; cwd?: string },
): Promise<{ pid: number; logPath: string }> {
  const p = backgroundPaths(host.layout, opts.jobId);
  const launcher = backgroundStartScript(p, opts.command, host.layout.toolOutputDir);

  const res = await host.exec(launcher, {
    cwd: opts.cwd,
    timeoutMs: BACKGROUND_START_TIMEOUT_MS,
  });
  const pid = Number.parseInt(res.stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    const detail = (res.stderr || res.stdout).trim().slice(0, 300);
    throw new Error(`Could not start the background job${detail ? `: ${detail}` : "."}`);
  }
  return { pid, logPath: p.log };
}

/**
 * Sonde un job : ce qui a été écrit DEPUIS `offset`, plus son état. L'incrément est
 * borné à `maxBytes` pris à la FIN (un watcher bavard ne doit pas ramener 40 Mo par
 * sonde) ; l'offset avance quand même jusqu'à la taille réelle du log, et ce qui a
 * été sauté reste dans le fichier, lisible avec `grep`/`read_file`.
 */
export async function readBackgroundSince(
  host: RepoHost,
  opts: { jobId: string; pid: number; offset: number; maxBytes: number },
): Promise<BackgroundChunk> {
  const p = backgroundPaths(host.layout, opts.jobId);
  const offset = Math.max(0, Math.floor(opts.offset));
  const maxBytes = Math.max(1, Math.floor(opts.maxBytes));
  const res = await host.exec(backgroundProbeScript(p, opts.pid, offset, maxBytes), {
    timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS,
  });
  try {
    return parseBackgroundProbe(res.stdout, { offset, maxBytes });
  } catch {
    throw new Error(
      `Could not read the background job: ${(res.stderr || res.stdout).trim().slice(0, 300)}`,
    );
  }
}

/**
 * Arrête un job : SIGTERM, délai de grâce, puis SIGKILL (script dans
 * `background.ts`). Ne lève jamais sur un processus déjà mort.
 */
export async function stopBackground(host: RepoHost, pid: number): Promise<void> {
  await host.exec(backgroundStopScript(pid), { timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS });
}

export interface ReadWindow {
  /** Contenu annoté : une ligne `<n>\t<contenu>` par ligne source (1-based). */
  content: string;
  /** Nombre total de lignes du fichier. */
  totalLines: number;
  /** Index (1-based) de la première ligne renvoyée. */
  startLine: number;
  /** Nombre de lignes renvoyées. */
  returnedLines: number;
  /** true si des lignes ont été omises (fenêtre plus petite que le fichier). */
  truncated: boolean;
}

/**
 * Lit une FENÊTRE d'un fichier avec numéros de ligne (format `cat -n` : `n\t…`),
 * ce qui rend les éditions ciblables et borne le contexte. `offset` (1-based) et
 * `limit` fenêtrent ; par défaut les `READ_MAX_LINES` premières lignes. Les
 * lignes très longues sont tronquées. Renvoie null si le fichier n'existe pas.
 *
 * Accepte, en plus des chemins du dépôt, les sorties de tools déposées dans le
 * dossier de sorties du run (MIN-107) : c'est ainsi que le modèle relit la sortie
 * complète d'un `run_command` trop long.
 */
export async function readWorkFileWindow(
  host: RepoHost,
  relPath: string,
  opts?: { offset?: number; limit?: number },
): Promise<ReadWindow | null> {
  const raw = await host.readFile(readablePath(host, relPath));
  if (raw === null) return null;

  const lines = raw.split("\n");
  // Un fichier finissant par `\n` (le cas courant) produit un dernier élément vide :
  // on le retire pour ne pas afficher une ligne numérotée fantôme (sémantique `cat -n`).
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const totalLines = lines.length;
  const startLine = Math.max(1, Math.floor(opts?.offset ?? 1));
  const limit = Math.max(1, Math.floor(opts?.limit ?? READ_MAX_LINES));
  const from = startLine - 1;
  const slice = lines.slice(from, from + limit);

  const numbered = slice.map((line, i) => {
    const n = startLine + i;
    const text = line.length > READ_MAX_LINE_CHARS ? `${line.slice(0, READ_MAX_LINE_CHARS)}… [line truncated]` : line;
    return `${n}\t${text}`;
  });

  return {
    content: numbered.join("\n"),
    totalLines,
    startLine,
    returnedLines: slice.length,
    truncated: from > 0 || from + slice.length < totalLines,
  };
}

/** Écrit (crée/écrase) un fichier du dépôt. Crée les dossiers parents si besoin.
    Rejette les écritures hors dépôt ou dans `.git/`. */
export async function writeWorkFile(
  host: RepoHost,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = writablePath(host, relPath);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  if (dir) await host.mkdir(dir).catch(() => {});
  await host.writeFile(abs, content);
}

/**
 * Déplace/renomme un fichier suivi (git mv). Refuse la sortie du dépôt / `.git/`
 * des deux côtés, et l'écrasement d'une destination existante. Passe par git pour
 * que le commit/PR capture le renommage.
 */
export async function moveWorkFile(host: RepoHost, from: string, to: string): Promise<void> {
  const src = writablePath(host, from);
  const dst = writablePath(host, to);
  const dstDir = dst.slice(0, dst.lastIndexOf("/"));
  const cmd = [
    `set -e`,
    `test -e ${sq(src)} || { echo "source not found" >&2; exit 3; }`,
    `test -e ${sq(dst)} && { echo "destination exists" >&2; exit 4; }`,
    dstDir ? `mkdir -p ${sq(dstDir)}` : `:`,
    // git mv si le fichier est suivi, sinon mv simple (fichier neuf non commité).
    `git mv ${sq(src)} ${sq(dst)} 2>/dev/null || mv ${sq(src)} ${sq(dst)}`,
  ].join("\n");
  const res = await host.exec(cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "move failed");
}

/** Supprime un fichier suivi (git rm) ou neuf. Refuse hors dépôt / `.git/`. */
export async function deleteWorkFile(host: RepoHost, relPath: string): Promise<void> {
  const abs = writablePath(host, relPath);
  const cmd = [
    `test -e ${sq(abs)} || { echo "file not found" >&2; exit 3; }`,
    `git rm -f ${sq(abs)} 2>/dev/null || rm -f ${sq(abs)}`,
  ].join("\n");
  const res = await host.exec(cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "delete failed");
}

/** Liste le contenu d'un dossier du dépôt — ou du dossier de sorties du run, pour
    retrouver les sorties déposées (noms, dossiers suffixés `/`). */
/**
 * Contenu d'un dossier, ou `null` s'il n'a pas pu être LU (chemin absent, pas un
 * dossier, droits) — MIN-226, même règle que `grep` : un échec ne se rend pas
 * comme un résultat vide. « (empty) » sur un dossier qui n'existe pas affirme
 * qu'il existe et qu'il est vide, ce qui est deux fois faux, et le modèle en tire
 * la conclusion qu'il n'y a rien à y chercher.
 */
export async function listDir(host: RepoHost, relPath = "."): Promise<string | null> {
  const res = await host.exec(`ls -1Ap ${sq(readablePath(host, relPath))}`);
  return res.exitCode === 0 ? res.stdout : null;
}

export type GrepOutputMode = "content" | "files_with_matches" | "count";

export interface GrepOptions {
  /** Motif (regex étendue POSIX). */
  pattern: string;
  /** Sous-arbre à limiter (pathspec). */
  path?: string;
  /** Glob de fichiers, ex. `**\/*.ts` (pathspec `:(glob)`). */
  glob?: string;
  outputMode?: GrepOutputMode;
  /** Insensible à la casse. */
  ignoreCase?: boolean;
  /** Lignes de contexte autour de chaque match (mode `content`). */
  context?: number;
  /** Cap de lignes renvoyées. */
  headLimit?: number;
  /** Cherche le motif comme une chaîne LITTÉRALE (`-F`), sans le lire comme une regex. */
  fixedStrings?: boolean;
}

export interface GrepResult {
  /** Lignes de sortie (peut être vide = aucun match). */
  output: string;
  /** false → git grep a ÉCHOUÉ (regex/option invalide) — pas « aucun match ». */
  ok: boolean;
  /** Message d'erreur si ok=false. */
  error?: string;
  /** Le motif n'était pas une regex valide : relancé en littéral (MIN-109). */
  retriedAsLiteral?: boolean;
  /**
   * L'inverse (MIN-238) : `fixed_strings` posé sur une ALTERNATION, donc un `|`
   * cherché comme un caractère et des alternatives jamais cherchées du tout.
   * Relancé en regex — ce sont ces résultats-là qui sont rendus.
   *
   * Même famille que `noFilesInScope` : la recherche a bien tourné, elle n'a
   * simplement pas cherché ce que le modèle croyait. La différence est qu'ici on
   * peut la refaire correctement, comme MIN-109 le fait dans l'autre sens.
   */
  retriedAsRegex?: boolean;
  /**
   * Aucun match ET aucun fichier dans le périmètre : `path`/`glob` n'ont
   * sélectionné AUCUN fichier, donc la recherche n'a rien lu (MIN-226).
   *
   * C'est la distinction qui manquait. « Aucune correspondance » se lit comme un
   * fait vérifié sur le code — le modèle en tire une conclusion et passe à la
   * suite — alors qu'un périmètre vide ne dit rien du tout, sinon que le filtre
   * était faux. Les deux sortaient par la même phrase, et un filtre malformé
   * mentait donc en silence, indiscernable d'une vraie absence : c'est comme ça
   * que le plan de MIN-226 a « vérifié » qu'un fichier n'appelait pas ce qu'il
   * appelait. Une correction de forme (accolades en MIN-116, `path` de fichier
   * en MIN-226) referme UNE porte ; celle-ci referme la classe.
   */
  noFilesInScope?: boolean;
}

/**
 * Recherche via `git grep` : gitignore-aware (fichiers suivis + non suivis, hors
 * ignorés), rapide, sans dépendance à installer. `content` → `fichier:ligne:…`,
 * `files_with_matches` → chemins, `count` → `fichier:compte`. `path` et `glob`
 * s'INTERSECTENT (glob dans path). Les erreurs git (regex invalide, option
 * invalide) NE sont PAS masquées : on lit l'exit code (≥2 = erreur) au lieu de
 * `|| true`/`| head` qui les avaleraient — le cap de lignes se fait en JS.
 * Seule exception (MIN-109) : un motif refusé comme regex est relancé en littéral
 * (`-F`), et le retour le DIT (`retriedAsLiteral`).
 */
export async function grepRepo(host: RepoHost, opts: GrepOptions): Promise<GrepResult> {
  // Le `path` vise-t-il un dossier lisible HORS dépôt (une sortie de tool déposée,
  // MIN-107) ? git grep n'y voit rien — on passe au grep du système.
  const outside = opts.path ? readableOutsideRepo(host, opts.path) : null;
  if (outside) return grepOutside(host, opts, outside);

  const specs = grepPathspecs(opts.path, opts.glob).map(sq);
  const pathspecPart = specs.length ? ` -- ${specs.join(" ")}` : "";
  const build = (literal: boolean) => {
    const flags = [
      "--no-color",
      "-I",
      literal ? "-F" : "-E",
      "--untracked",
      ...grepModeFlags(opts),
    ];
    return `git grep ${flags.join(" ")} -e ${sq(opts.pattern)}${pathspecPart}`;
  };
  const { res, retriedAsLiteral, retriedAsRegex } = await runGrepWithLiteralFallback(
    host,
    build,
    opts,
  );

  // git grep : 0 = matchs, 1 = aucun match, ≥2 = ERREUR (regex/option invalide…).
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  if (res.exitCode === 1 && specs.length > 0) {
    // Rien trouvé SOUS UN FILTRE : le filtre a-t-il seulement retenu un fichier ?
    // Une seule commande, sur le seul chemin où la question se pose.
    const listed = await host.exec(
      `git ls-files --cached --others --exclude-standard -- ${specs.join(" ")}`,
    );
    if (listed.exitCode === 0 && listed.stdout.trim() === "") {
      return { output: "", ok: true, retriedAsLiteral, retriedAsRegex, noFilesInScope: true };
    }
  }
  return {
    output: capGrepLines(res.stdout, opts.headLimit),
    ok: true,
    retriedAsLiteral,
    retriedAsRegex,
  };
}

/**
 * Lance la recherche, et si le moteur a refusé le MOTIF (pas une regex valide),
 * la relance en littéral (`-F`) — le cas de loin le plus courant (MIN-109) : le
 * modèle colle un bout de code (`onUpdateIssue={`) en croyant chercher du texte.
 * Toute autre erreur (option, pathspec) remonte telle quelle.
 */
async function runGrepWithLiteralFallback(
  host: RepoHost,
  build: (literal: boolean) => string,
  opts: GrepOptions,
): Promise<{ res: ShellResult; retriedAsLiteral: boolean; retriedAsRegex?: boolean }> {
  const literal = opts.fixedStrings === true;
  const res = await host.exec(build(literal));
  if (literal) {
    // Le repli SYMÉTRIQUE (MIN-238) : `fixed_strings` sur une alternation a
    // cherché la barre au pied de la lettre, donc les alternatives n'ont jamais
    // été cherchées. Rien trouvé ici ne veut rien dire — on relance en regex.
    // Conditionné à l'absence de match : un littéral qui TROUVE est ce qu'on
    // voulait, et le relancer changerait une réponse juste.
    if (res.exitCode === 1 && looksLikeIntendedAlternation(opts.pattern)) {
      const retry = await host.exec(build(false));
      // Une regex refusée ne vaut pas mieux que le littéral : on garde le
      // premier résultat plutôt que d'échanger « rien trouvé » contre une erreur.
      if (retry.exitCode < 2) return { res: retry, retriedAsLiteral: false, retriedAsRegex: true };
    }
    return { res, retriedAsLiteral: false };
  }
  if (res.exitCode < 2 || !isInvalidRegexError(res.stderr || res.stdout)) {
    return { res, retriedAsLiteral: false };
  }
  return { res: await host.exec(build(true)), retriedAsLiteral: true };
}

/** Drapeaux partagés par les deux moteurs (casse, mode de sortie, contexte). */
function grepModeFlags(opts: GrepOptions): string[] {
  const flags: string[] = [];
  if (opts.ignoreCase) flags.push("-i");
  const mode = opts.outputMode ?? "content";
  if (mode === "files_with_matches") flags.push("-l");
  else if (mode === "count") flags.push("-c");
  else {
    flags.push("-n");
    const ctx = opts.context != null ? Math.floor(opts.context) : 0;
    if (ctx > 0) flags.push(`-C ${Math.min(ctx, 20)}`);
  }
  return flags;
}

/** Cap de lignes appliqué en JS (jamais `| head`, qui masquerait l'exit code). */
function capGrepLines(output: string, headLimit?: number): string {
  if (headLimit == null || headLimit <= 0) return output;
  return output.split("\n").slice(0, Math.floor(headLimit)).join("\n");
}

/** Chemin absolu validé s'il vise un dossier lisible hors dépôt, sinon null.
    Lève si un `..` tentait d'en sortir. */
function readableOutsideRepo(host: RepoHost, path: string): string | null {
  const dirs = readableDirs(host.layout);
  if (!dirs.some((dir) => path === dir || path.startsWith(`${dir}/`))) return null;
  return readablePath(host, path);
}

/**
 * Recherche dans un dossier lisible hors dépôt (sorties de tools déposées) avec le
 * grep du système : `-r` pour un dossier, `-H` pour toujours préfixer le chemin
 * (le modèle doit pouvoir le repasser à `read_file`). Mêmes codes de sortie que
 * git grep (0 match, 1 rien, ≥2 erreur), donc même contrat de retour.
 */
async function grepOutside(
  host: RepoHost,
  opts: GrepOptions,
  absPath: string,
): Promise<GrepResult> {
  // `--include` de GNU grep ne développe pas les accolades non plus : une
  // alternative = un `--include` (ils s'unissent), comme les pathspecs git.
  const includes = opts.glob
    ? expandBraces(opts.glob).map((alt) => `--include=${sq(alt)}`)
    : [];
  const build = (literal: boolean) => {
    const flags = [
      "--color=never",
      "-I",
      literal ? "-F" : "-E",
      "-r",
      "-H",
      ...grepModeFlags(opts),
      ...includes,
    ];
    return `grep ${flags.join(" ")} -e ${sq(opts.pattern)} -- ${sq(absPath)}`;
  };
  const { res, retriedAsLiteral, retriedAsRegex } = await runGrepWithLiteralFallback(
    host,
    build,
    opts,
  );
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  if (res.exitCode === 1 && includes.length > 0) {
    // Même question que côté dépôt, posée avec le MÊME filtre : un motif qui
    // matche n'importe quelle ligne non vide. Ce qui reste est exactement le
    // périmètre, sans avoir à réinventer la sémantique de `--include`.
    const probe = await host.exec(
      `grep --color=never -I -r -l -E ${includes.join(" ")} -e ${sq(".")} -- ${sq(absPath)}`,
    );
    if (probe.stdout.trim() === "") {
      return { output: "", ok: true, retriedAsLiteral, retriedAsRegex, noFilesInScope: true };
    }
  }
  return {
    output: capGrepLines(res.stdout, opts.headLimit),
    ok: true,
    retriedAsLiteral,
    retriedAsRegex,
  };
}

export interface GlobResult {
  files: string[];
  truncated: boolean;
  /**
   * false → `git ls-files` a ÉCHOUÉ (pathspec malformé, magie non fermée) —
   * pas « aucun fichier » (MIN-226). L'échec sortait par la liste vide, donc un
   * motif mal écrit répondait « ce dépôt ne contient aucun fichier de ce genre ».
   * Même mensonge que le `grep`, dans le tool d'à côté.
   */
  ok: boolean;
}

/**
 * Liste les fichiers du dépôt correspondant à un glob (pathspec `:(glob)`),
 * gitignore-aware (suivis + non suivis, hors ignorés). `path` et `pattern`
 * s'INTERSECTENT (glob dans path). Tri + cap (`GLOB_MAX_FILES`) faits en JS pour
 * ne pas masquer l'exit code de git derrière un pipe.
 */
export async function globRepo(
  host: RepoHost,
  pattern: string,
  path?: string,
): Promise<GlobResult> {
  const specs = globPathspecs(pattern, path).map(sq).join(" ");
  const cmd = `git ls-files --cached --others --exclude-standard -- ${specs}`;
  const res = await host.exec(cmd);
  // Pathspec malformé : une ERREUR, et elle se dit. Un motif que git refuse et un
  // motif qui ne matche rien ne sont pas la même nouvelle.
  if (res.exitCode !== 0) return { files: [], truncated: false, ok: false };

  const all = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
  return {
    files: all.slice(0, GLOB_MAX_FILES),
    truncated: all.length > GLOB_MAX_FILES,
    ok: true,
  };
}

/**
 * Les mains de `run_background` (MIN-114) sur LE dépôt : la politique (plafond,
 * garde-fou git, offsets, mise en forme) vit dans le module pur `background.ts`,
 * ce runner ne fait que la poser sur l'hôte. `workdir` passe par `resolveWithin` —
 * un `../..` revient au modèle en erreur de tool.
 *
 * Il vit ICI, et non plus dans `exec-tool.ts`, depuis que les DEUX moteurs s'en
 * servent (MIN-286, lot 3) : le superviseur d'opencode n'a rien à emprunter à
 * l'exécuteur de tools de la boucle maison, que le lot 3 finit par supprimer.
 */
export function repoBackgroundRunner(host: RepoHost): BackgroundJobRunner {
  return {
    start: ({ jobId, command, workdir }) =>
      startBackground(host, {
        jobId,
        command,
        cwd: workdir ? resolveWithin(host.layout.repoDir, workdir) : undefined,
      }),
    read: ({ jobId, pid, offset }) =>
      readBackgroundSince(host, { jobId, pid, offset, maxBytes: BACKGROUND_FETCH_BYTES }),
    stop: ({ pid }) => stopBackground(host, pid),
  };
}
