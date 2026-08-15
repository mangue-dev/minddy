import { gitIdentityFlags, sq, type RepoHost } from "./repo-host";

/**
 * TRAVAILLER DANS LE DÉPÔT DE QUELQU'UN D'AUTRE (MIN-358, décision D2).
 *
 * En microVM, le dépôt est un clone créé pour le tour : on y fait ce qu'on veut,
 * `git add -A` compris, parce qu'il n'y a personne d'autre dedans. Sur la machine
 * de l'utilisateur, le dépôt est CELUI QU'IL A OUVERT — sa branche, son index,
 * son WIP, ses `.env`. Trois gestes de la chaîne de fin de tour y détruisent du
 * travail humain, mesurés sur un clone jetable de ce dépôt :
 *
 * | Geste | Ce qu'il fait au checkout de l'humain |
 * | --- | --- |
 * | `git add -A` | stage tout le non-ignoré : son WIP part dans la pull request |
 * | `git checkout -b` | le change de branche sous les doigts |
 * | `git config user.email` | réécrit SON identité git dans SON dépôt |
 *
 * Ce module est la réponse, et sa forme tient en une phrase : **on ne touche ni
 * à son index, ni à son HEAD, ni à son arbre de travail.** Le commit se fabrique
 * dans un index JETABLE (`GIT_INDEX_FILE`), depuis l'arbre du parent, en n'y
 * posant que les chemins du tour ; `commit-tree` en fait un commit, `update-ref`
 * l'accroche à une ref à nous, et le push part par sha. Après quoi
 * `git status`, `git branch --show-current` et `git write-tree` rendent, chez
 * l'utilisateur, exactement ce qu'ils rendaient avant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SONDE A TRANCHÉ, ET QU'AUCUNE LECTURE NE DIRAIT
 *
 * - **les hooks ne tournent pas.** `commit-tree` est de la plomberie : un
 *   `pre-commit` lent, ou qui sort en 1, ne peut plus casser un tour. C'est le
 *   problème « les hooks de l'utilisateur s'exécutent » réglé par construction,
 *   et non par un `--no-verify` qu'il aurait fallu penser à mettre ;
 * - **un chemin fantôme est ignoré en silence** (`update-index --add --remove`
 *   sur un fichier ni sur disque ni dans l'arbre rend 0) : la liste des chemins
 *   du tour n'a donc pas besoin d'être exacte pour être sûre ;
 * - **`git status --porcelain` CITE les chemins non-ASCII** (`"lib/\303\251t\303\251.ts"`),
 *   `-z` non. D'où `-z` partout ici : un chemin accentué mal relu, c'est un
 *   fichier absent de la pull request ;
 * - **un fichier gitignoré n'apparaît pas dans `status`** mais `update-index` le
 *   stagerait sans broncher — c'est de la plomberie, elle ne lit pas `.gitignore`.
 *   Le `.env` réel de l'utilisateur est là, dans ce mode : d'où `dropIgnoredPaths`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CHOIX ASSUMÉS, QUI SE VOIENT DANS LE PRODUIT
 *
 * 1. **Le parent du premier commit est le HEAD du checkout**, pas `origin/<base>`.
 *    Brancher sur la base produirait une pull request dont le contenu est bâti
 *    sur un état que la base ne contient pas — du code subtilement faux — là où
 *    brancher sur HEAD n'emporte que des commits que l'utilisateur a déjà faits.
 *    Corollaire : `origin/<base>` n'est LU nulle part sur ce chemin, donc le fait
 *    qu'il vaille le dernier `git fetch` de l'humain ne nous concerne plus.
 * 2. **Aucune branche locale n'est créée.** L'ancre du run est une ref à nous
 *    (`refs/minddy/run/<id>/work`) ; la branche de travail n'existe que sur le
 *    remote. Poser un `refs/heads/<branche>` serait plus commode — et le jour où
 *    l'utilisateur a justement CETTE branche checkoutée, la déplacer sous lui
 *    ferait apparaître tout le travail de l'agent comme annulé dans son
 *    `git status`. Il la récupère du remote, comme n'importe quel collègue.
 *
 * Et un cas qu'aucune astuce ne referme, et qui doit donc se DIRE plutôt que se
 * trancher en silence : **l'utilisateur édite un fichier que l'agent édite
 * aussi.** `carriedPaths` le nomme, et la fin de tour le publie au fil.
 */

/**
 * Où l'ancre d'un run vit dans le dépôt de l'utilisateur. Une ref à nous, hors
 * de `refs/heads/` : elle n'apparaît ni dans `git branch`, ni dans son
 * autocomplete, et deux runs sur la même machine ne se marchent pas dessus.
 *
 * Le point est retiré comme le reste, et pas seulement en tête : `..` est
 * INTERDIT dans un nom de ref par git lui-même, et un identifiant qui en
 * porterait ferait échouer le `update-ref` au moment du commit — c'est-à-dire à
 * l'endroit où on a le plus de travail à perdre.
 */
export function runWorkRef(runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9_-]/g, "-") || "run";
  return `refs/minddy/run/${safe}/work`;
}

/**
 * L'ÉTAT DE L'ARBRE DE TRAVAIL, indexé par chemin — un instantané qu'on prend au
 * début du tour et qu'on recompare à la fin.
 *
 * La valeur est le code XY de `git status` (` M`, `??`, `D `…). On ne compare
 * jamais des CONTENUS : ce qu'on cherche, c'est « ce chemin n'était pas dans cet
 * état quand le tour a commencé », et c'est exactement ce que le code dit.
 */
export type RepoState = Map<string, string>;

/**
 * `git status --porcelain -z` → l'état, chemin par chemin.
 *
 * Le format `-z` sépare les entrées par NUL et ne cite RIEN. Un renommage (`R`)
 * y occupe deux champs — destination puis origine — et les deux comptent : la
 * destination est un chemin neuf, l'origine un chemin disparu, et un tour qui
 * renomme doit livrer les deux.
 */
export function parseStatusZ(stdout: string): RepoState {
  const fields = stdout.split("\0");
  const state: RepoState = new Map();
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    state.set(path, code);
    // Renommage/copie : le champ SUIVANT porte le chemin d'origine, et il n'a pas
    // de code à lui. Il est consommé ici, sans quoi la boucle le lirait comme une
    // entrée dont les trois premiers caractères seraient du chemin.
    if (code[0] === "R" || code[0] === "C") {
      const from = fields[++i];
      if (from) state.set(from, code);
    }
  }
  return state;
}

/** L'instantané, lu dans le dépôt. Best-effort : un git muet rend un état vide,
 *  ce qui fait retomber le périmètre du tour sur les seules éditions notées. */
export async function readRepoState(host: RepoHost): Promise<RepoState> {
  try {
    const res = await host.exec(`git status --porcelain -z`, { timeoutMs: 60_000 });
    return res.exitCode === 0 ? parseStatusZ(res.stdout) : new Map();
  } catch {
    return new Map();
  }
}

/** Le périmètre d'un tour : ce qu'il livre, et ce qu'il emporte sans l'avoir écrit. */
export interface TurnPaths {
  /** Les chemins à stager, triés — l'union des deux sources, chemins ignorés exclus
   *  par `dropIgnoredPaths` (qui, lui, a besoin du dépôt). */
  paths: string[];
  /**
   * Les chemins que l'agent a édités ALORS QUE l'utilisateur les avait déjà
   * modifiés — donc ceux dont le commit emporte aussi son travail à lui.
   *
   * Ce n'est pas une erreur à corriger, c'est le prix du mode : deux mains dans
   * le même fichier. Ce qui serait fautif, ce serait de ne pas le dire.
   */
  carried: string[];
}

/**
 * LE PÉRIMÈTRE DU TOUR — deux sources, et il faut les deux.
 *
 * 1. **Les éditions notées** (`delivery.noteEdit`, qui vient des permissions
 *    `edit` d'opencode). Fiable en v1 : il n'y a pas de bouton « toujours
 *    autoriser », donc aucune édition n'est muette. **Le jour où il y en aura un,
 *    `always` sur `edit` porte le motif `*` et rendra les éditions suivantes
 *    invisibles** — cette liste deviendra alors FAUSSE, pas seulement incomplète,
 *    et c'est la seconde source qui devra rattraper.
 * 2. **Le delta des deux instantanés**, qui voit ce qu'aucun tool d'écriture n'a
 *    produit : un lockfile réécrit par `npm install`, un codegen, un `rm` du
 *    shell. Sans lui ces fichiers seraient simplement absents de la pull request.
 *
 * Aucune des deux ne suffit : `git status` seul verrait aussi le WIP de
 * l'utilisateur, et les éditions notées seules rateraient tout le shell.
 *
 * `owned` est ce que les tours PRÉCÉDENTS du même run avaient déjà édité. Il ne
 * sert qu'à `carried` : après un tour, le travail de l'agent reste « modifié »
 * dans l'arbre de travail (nos commits vivent sur une ref, pas sur son HEAD), et
 * sans cette soustraction chaque fichier de l'agent se dénoncerait lui-même comme
 * du travail de l'utilisateur emporté.
 */
export function turnPaths(opts: {
  /** Chemins édités par les tools PENDANT ce tour (relatifs au dépôt). */
  edited: Iterable<string>;
  /** Chemins déjà édités par les tours précédents de ce run. */
  owned?: Iterable<string>;
  before: RepoState;
  after: RepoState;
}): TurnPaths {
  const paths = new Set<string>();
  for (const path of opts.edited) {
    const clean = path.trim();
    if (clean) paths.add(clean);
  }
  for (const [path, code] of opts.after) {
    if (opts.before.get(path) !== code) paths.add(path);
  }
  // Un chemin disparu de l'instantané de fin alors qu'il était modifié au début
  // ne compte PAS : c'est l'utilisateur (ou l'agent) qui a rendu le fichier à son
  // état d'origine, il n'y a rien à livrer.

  const owned = new Set<string>();
  for (const path of opts.owned ?? []) owned.add(path.trim());
  const carried = [...paths].filter((path) => opts.before.has(path) && !owned.has(path));

  return { paths: [...paths].sort(), carried: carried.sort() };
}

/**
 * LA LISTE DES CHEMINS, PASSÉE PAR UN FICHIER ET NON PAR LA LIGNE DE COMMANDE.
 *
 * Deux raisons, et la seconde est la vraie : un tour de refonte touche des
 * centaines de fichiers et `sh -c` a une limite (`E2BIG`) ; surtout, `-z` — le
 * seul format où un chemin accentué ou à espaces se relit sans ambiguïté — n'est
 * accepté par `check-ignore` et `update-index` qu'avec `--stdin` (mesuré :
 * « -z only makes sense with --stdin »). Le fichier vit sous la racine DU RUN,
 * donc hors du dépôt : il n'apparaît jamais dans le `git status` de personne.
 */
async function writePathList(host: RepoHost, name: string, paths: string[]): Promise<string> {
  const file = `${host.layout.root}/${name}`;
  await host.mkdir(host.layout.root).catch(() => {});
  await host.writeFile(file, paths.map((path) => `${path}\0`).join(""));
  return file;
}

/**
 * RETIRE LES CHEMINS GITIGNORÉS. `update-index` est de la plomberie : il stage un
 * `.env.local` sans un mot. Dans ce mode, ce `.env.local` est le VRAI fichier de
 * secrets de l'utilisateur.
 *
 * `git check-ignore` rend les chemins ignorés sur stdout, sort en 0 s'il en a
 * trouvé, en 1 sinon, et en 128 sur erreur — ce dernier cas ne filtre rien
 * plutôt que de tout jeter. Il consulte l'index, donc un fichier SUIVI n'est
 * jamais rendu comme ignoré, même s'il matche un motif : c'est ce qu'on veut.
 */
export async function dropIgnoredPaths(host: RepoHost, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return paths;
  try {
    const file = await writePathList(host, "ignore-probe", paths);
    const res = await host.exec(`git check-ignore -z --stdin < ${sq(file)}`, { timeoutMs: 30_000 });
    if (res.exitCode !== 0) return paths;
    const ignored = new Set(res.stdout.split("\0").filter(Boolean));
    return paths.filter((path) => !ignored.has(path));
  } catch {
    return paths;
  }
}

/** Ce que la préparation a trouvé dans le dépôt de l'utilisateur. */
export interface CurrentRepoState {
  /** Le commit sur lequel le tour s'appuie : notre ancre si le run a déjà commité,
   *  le HEAD du checkout sinon. */
  parent: string;
  /** La branche que l'utilisateur a sous les doigts (vide si HEAD est détaché). */
  branch: string;
  /** Le tour reprend-il une ancre existante (deuxième tour, ou reprise) ? */
  resumed: boolean;
  /** Fichiers déjà modifiés dans son arbre de travail quand le tour a commencé. */
  dirty: number;
}

/**
 * PRÉPARE LE TOUR DANS LE DÉPÔT COURANT — et ne clone, ne checkout, ne configure
 * rien. C'est le pendant de `cloneRepo`, et il est beaucoup plus court parce que
 * tout ce que `cloneRepo` fabrique est déjà là.
 *
 * Trois gestes seulement :
 *
 * 1. **vérifier que `layout.repoDir` EST la racine d'un dépôt git.** Refuser un
 *    sous-dossier n'est pas du zèle : les chemins du tour sont relatifs à la
 *    racine du dépôt, et un sous-dossier les décalerait tous en silence ;
 * 2. **retrouver l'ancre du run** — la ref locale si elle existe, sinon la
 *    branche de travail sur le remote (le run a déjà poussé, d'ici ou d'ailleurs),
 *    sinon rien ;
 * 3. **lire l'état de départ** : HEAD, branche, propreté.
 *
 * LÈVE si le dépôt n'est pas utilisable, comme `cloneRepo` : un tour qui ne sait
 * pas où il écrit n'a pas de mode dégradé.
 */
export async function prepareCurrentRepo(
  host: RepoHost,
  opts: { runId: string; authUrl: string; workBranch: string },
): Promise<CurrentRepoState> {
  const { repoDir } = host.layout;
  const toplevel = await host.exec(`git rev-parse --show-toplevel && pwd -P`, {
    timeoutMs: 30_000,
  });
  const [root, cwd] = toplevel.stdout.trim().split("\n");
  if (toplevel.exitCode !== 0 || !root) {
    throw new Error(
      `local repository unusable: ${repoDir} is not a git repository ` +
        `(${(toplevel.stderr || toplevel.stdout).trim().slice(0, 200)})`,
    );
  }
  if (root !== cwd) {
    throw new Error(
      `local repository unusable: ${repoDir} is inside the repository at ${root}, not its root — ` +
        `attach the repository root to the project`,
    );
  }

  const ref = runWorkRef(opts.runId);
  let parent = await revParse(host, ref);
  if (!parent) {
    // Le run a-t-il déjà poussé, d'ici ou d'une autre machine ? On ramène son tip
    // sous NOTRE ref — jamais sous `refs/heads/` ni `refs/remotes/origin/`, qui
    // appartiennent tous les deux à l'utilisateur.
    const fetched = await host.exec(
      `git fetch --no-tags --quiet ${sq(opts.authUrl)}` +
        ` ${sq(`+refs/heads/${opts.workBranch}:${ref}`)}`,
      { timeoutMs: 120_000 },
    );
    if (fetched.exitCode === 0) parent = await revParse(host, ref);
  }
  // « Repris » se dit du RUN, pas de la machine : une ancre ramenée du remote est
  // du travail que ce run a déjà poussé, d'ici ou d'ailleurs. Ce qui reste après
  // ce point, c'est un run qui commence — et il commence sur le HEAD de
  // l'utilisateur (cf. l'en-tête, choix nº 1).
  const resumed = Boolean(parent);
  if (!parent) parent = await revParse(host, "HEAD");
  if (!parent) {
    throw new Error(`local repository unusable: ${repoDir} has no commit to build on`);
  }

  const branch = (await host.exec(`git branch --show-current`).catch(() => null))?.stdout.trim() ?? "";
  const dirty = (await readRepoState(host)).size;
  return { parent, branch, resumed, dirty };
}

/** Le sha d'une ref, ou "" si elle n'existe pas. Ne lève jamais. */
async function revParse(host: RepoHost, ref: string): Promise<string> {
  try {
    const res = await host.exec(`git rev-parse --verify --quiet ${sq(`${ref}^{commit}`)}`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/** Ce que `commitTurnAndPush` rend — la forme de `commitAndPush`, plus ce que le
 *  mode dépôt courant est seul à savoir. */
export interface CurrentRepoPush {
  committed: boolean;
  remoteUpdated: boolean;
  headSha: string;
  pushed: boolean;
  /** Les chemins livrés par ce commit. */
  paths: string[];
  /** Ceux d'entre eux que l'utilisateur avait aussi modifiés (cf. `TurnPaths`). */
  carried: string[];
}

/**
 * LE COMMIT PAR INDEX TEMPORAIRE, PUIS LE PUSH — le cœur du mode dépôt courant.
 *
 * ```
 * GIT_INDEX_FILE=<jetable> git read-tree <parent>          # l'arbre du parent, pas le sien
 * GIT_INDEX_FILE=<jetable> git update-index --add --remove -- <chemins du tour>
 * GIT_INDEX_FILE=<jetable> git write-tree                  # l'arbre du commit
 * git -c user.email=… commit-tree <arbre> -p <parent>      # aucun hook, aucun HEAD
 * git update-ref <ancre du run> <commit>
 * git push <url> <commit>:refs/heads/<branche>
 * ```
 *
 * L'index de l'utilisateur, son HEAD et son arbre de travail ne sont touchés par
 * aucune de ces six commandes — vérifié sur un vrai dépôt
 * ([current-repo.git.test.ts](current-repo.git.test.ts)).
 *
 * PAS DE BRANCHE POUR RIEN, comme `commitAndPush` (MIN-123) : si l'arbre écrit
 * est identique à celui du parent, il n'y a rien à commiter, et si le run n'a
 * jamais rien poussé il n'y a alors rien à pousser non plus. Un tour de question
 * ou de plan ne laisse donc aucune branche sur le dépôt de l'utilisateur.
 *
 * `remoteUpdated` garde exactement le sens qu'il a côté microVM : le push a-t-il
 * fait AVANCER la branche distante ? C'est lui, et non `committed`, que la
 * fonction lit pour rouvrir une pull request refusée.
 */
export async function commitTurnAndPush(
  host: RepoHost,
  opts: {
    runId: string;
    authUrl: string;
    workBranch: string;
    message: string;
    committer: { name: string; email: string };
    /**
     * Sur quoi commiter QUAND LE RUN N'A PAS ENCORE D'ANCRE — le HEAD du
     * checkout, tel que `prepareCurrentRepo` l'a lu.
     *
     * Le parent réel, lui, est relu ICI à chaque appel. C'est ce qui rend la
     * fonction sûre à appeler deux fois dans un tour (`create_pr`, puis la fin de
     * tour) : un appelant qui oublierait d'avancer son état fabriquerait sinon un
     * FRÈRE du premier commit, et le push partirait en non-fast-forward.
     */
    fallbackParent: string;
    /** Le périmètre du tour, déjà uni et déjà débarrassé des chemins ignorés. */
    scope: TurnPaths;
  },
): Promise<CurrentRepoPush> {
  const ref = runWorkRef(opts.runId);
  const anchor = await revParse(host, ref);
  const parent = anchor || opts.fallbackParent;
  const indexFile = `${host.layout.root}/turn-index`;
  const env = { GIT_INDEX_FILE: indexFile };

  // L'index jetable est REFAIT à chaque appel (`create_pr` puis fin de tour, ou
  // deux tours dans la même racine de run) : un index laissé par un appel
  // précédent porterait des chemins qui ne sont plus ceux du tour. Et il vit sous
  // la racine du RUN, jamais dans le dépôt : `git status` ne doit rien en voir.
  await host.mkdir(host.layout.root).catch(() => {});
  const wipe = await host.exec(`rm -f ${sq(indexFile)}`);
  if (wipe.exitCode !== 0) throw new Error(`temp index cleanup failed: ${wipe.stderr}`);

  const read = await host.exec(`git read-tree ${sq(parent)}`, { env, timeoutMs: 120_000 });
  if (read.exitCode !== 0) {
    throw new Error(`git read-tree failed: ${read.stderr || read.stdout}`);
  }

  if (opts.scope.paths.length > 0) {
    // `--add` prend les fichiers neufs, `--remove` acte ceux qui ont disparu du
    // disque. Un chemin qui n'existe ni sur disque ni dans l'arbre est ignoré
    // sans erreur (mesuré) : la liste n'a pas besoin d'être exacte.
    const list = await writePathList(host, "turn-paths", opts.scope.paths);
    const staged = await host.exec(
      `git update-index --add --remove -z --stdin < ${sq(list)}`,
      { env, timeoutMs: 120_000 },
    );
    if (staged.exitCode !== 0) {
      throw new Error(`git update-index failed: ${staged.stderr || staged.stdout}`);
    }
  }

  const written = await host.exec(`git write-tree`, { env, timeoutMs: 120_000 });
  const tree = written.stdout.trim();
  if (written.exitCode !== 0 || !tree) {
    throw new Error(`git write-tree failed: ${written.stderr || written.stdout}`);
  }
  const parentTree = await host.exec(`git rev-parse ${sq(`${parent}^{tree}`)}`);

  let headSha = parent;
  let committed = false;
  if (parentTree.stdout.trim() !== tree) {
    const commit = await host.exec(
      `git ${gitIdentityFlags(opts.committer)} commit-tree ${sq(tree)} -p ${sq(parent)}` +
        ` -m ${sq(opts.message)}`,
      { timeoutMs: 120_000 },
    );
    headSha = commit.stdout.trim();
    if (commit.exitCode !== 0 || !headSha) {
      throw new Error(`git commit-tree failed: ${commit.stderr || commit.stdout}`);
    }
    const moved = await host.exec(`git update-ref ${sq(ref)} ${sq(headSha)}`);
    if (moved.exitCode !== 0) {
      throw new Error(`git update-ref failed: ${moved.stderr || moved.stdout}`);
    }
    committed = true;
  }
  await host.exec(`rm -f ${sq(indexFile)}`).catch(() => {});

  /**
   * CE QUE CE COMMIT A LIVRÉ — vide quand il n'y a pas eu de commit, et c'est ce
   * qui compte : `carried` déclenche une note au fil (« du travail à vous est
   * parti dans la pull request »), et la publier sur un tour qui n'a rien
   * commité annoncerait un dégât qui n'a pas eu lieu.
   */
  const delivered = committed
    ? { paths: opts.scope.paths, carried: opts.scope.carried }
    : { paths: [], carried: [] };

  // Rien de commité et rien de poussé auparavant : aucune branche à créer sur le
  // dépôt de l'utilisateur pour un tour qui n'a pas touché au code.
  if (!committed && !anchor) {
    return { ...delivered, committed: false, remoteUpdated: false, headSha, pushed: false };
  }

  const remote = await host.exec(
    `git ls-remote ${sq(opts.authUrl)} ${sq(`refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 60_000 },
  );
  const remoteSha = remote.exitCode === 0 ? remote.stdout.trim().split(/\s/)[0] ?? "" : "";

  // Par SHA, et pas `HEAD:refs/heads/…` : HEAD est celui de l'utilisateur.
  const push = await host.exec(
    `git push ${sq(opts.authUrl)} ${sq(`${headSha}:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return { ...delivered, committed, remoteUpdated: remoteSha !== headSha, headSha, pushed: true };
}
