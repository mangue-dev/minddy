/**
 * LE DOSSIER LOCAL D'UN PROJET (MIN-359) — la moitié qui se décide sans disque.
 *
 * L'app de bureau attache un dossier de la machine à un projet ; c'est ce dossier
 * que l'agent ouvrira quand la conversation tourne en local (D1 de
 * [docs/audits/agent-local-2026-08-14.md](../../docs/audits/agent-local-2026-08-14.md)).
 * Tout ce qui se décide ici — est-ce un dépôt git, est-ce LE dépôt du projet,
 * qu'est-ce que le fichier de réglages a le droit de contenir — est écrit en
 * fonctions pures, testées, comme la garde de navigation et la garde micro.
 * Le `fs` et le panneau système vivent dans `desktop/src/local-repo.ts`.
 *
 * ## Le réglage est l'attachement, et il n'existe que sur une machine
 *
 * Le cadrage plaçait l'opt-in « exécuter en local » au niveau du PROJET. C'est
 * intenable : un chemin de home ne veut rien dire ailleurs que sur la machine qui
 * le porte, et le ranger côté serveur le publierait — faux — à tous les membres.
 * L'attachement vit donc dans `userData`, par projet, sur CETTE machine, et il
 * n'y a rien à migrer côté base : `agent_runs.local_exec` (MIN-355) est le seul
 * état serveur, par run, figé au lancement.
 *
 * Conséquence produit, qu'il faut assumer plutôt que découvrir : sur un projet à
 * trois, un membre sur Windows ne voit simplement pas le sélecteur et ses runs
 * partent dans le cloud. Un propriétaire ne peut pas non plus INTERDIRE le local
 * à ses membres — c'est une politique d'organisation, pas ce lot.
 *
 * ## Aucun `git` lancé pour valider
 *
 * On lit `.git/config` avec `fs`, on ne lance pas `git`. Sur un Mac sans Command
 * Line Tools, la moindre invocation de `git` fait surgir la fenêtre d'installation
 * de Xcode — au milieu d'un geste de réglage, sans que personne ne l'ait demandé.
 * Le fichier suffit, et son parseur se teste.
 */

/** Pourquoi un dossier ne peut pas servir de dépôt local à ce projet. */
export type LocalRepoRefusal =
  /** Le chemin n'existe plus, ou n'est pas un dossier (dépôt déplacé, disque démonté). */
  | "missing"
  /** Pas de `.git` lisible : ce n'est pas un dépôt (ni un worktree). */
  | "notGit"
  /** Un dépôt, mais sans aucun remote : impossible de dire lequel c'est. */
  | "noRemote"
  /** Un dépôt, mais pas celui que le projet a lié. */
  | "wrongRepo";

/** Ce qu'on sait du dossier après lecture du disque — l'entrée des décisions. */
export interface LocalRepoFacts {
  /** Le chemin existe ET c'est un dossier. */
  readonly isDirectory: boolean;
  /** Le contenu de `.git/config`, ou `null` si on n'a pas su le lire. */
  readonly gitConfig: string | null;
}

/** Le dépôt que le projet a lié, tel que le serveur le nomme. */
export interface ExpectedRepo {
  /** `owner/name` (GitHub) ou `groupe/sous-groupe/projet` (GitLab). */
  readonly fullName: string;
}

/**
 * L'état d'un attachement, tel que la page le lit. Un seul type pour les trois
 * gestes (lire, attacher, détacher) : l'appelant n'a jamais à croiser deux
 * formes pour savoir quoi afficher.
 */
export type LocalRepoState =
  | { readonly status: "none" }
  | { readonly status: "ready"; readonly path: string; readonly folder: string }
  | {
      readonly status: "invalid";
      readonly path: string;
      readonly reason: LocalRepoRefusal;
    };

/**
 * Les remotes déclarés dans un `.git/config`.
 *
 * Le format est celui de `git config` : des sections `[remote "nom"]` suivies de
 * `clé = valeur`. On ne cherche que `url`, et on tolère ce que git tolère —
 * indentation libre, espaces autour du `=`, sections en une ligne
 * (`[remote "origin"]` avec la sous-section entre guillemets).
 */
export function parseGitConfigRemotes(
  text: string,
): { name: string; url: string }[] {
  const remotes: { name: string; url: string }[] = [];
  let current: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[")) {
      // `[remote "origin"]`, et rien d'autre : `[core]`, `[branch "main"]`,
      // `[submodule …]` referment la section courante sans rien ajouter.
      const section = /^\[remote\s+"(.+)"\]$/.exec(line);
      current = section ? (section[1] ?? null) : null;
      continue;
    }
    if (!current) continue;
    const pair = /^url\s*=\s*(.+)$/.exec(line);
    if (pair?.[1]) remotes.push({ name: current, url: pair[1].trim() });
  }
  return remotes;
}

/**
 * Le `owner/repo` que désigne une URL de remote, ou `null`.
 *
 * Trois formes, et il faut les trois : `git@host:owner/repo.git` (le SCP
 * historique, ce que GitHub propose par défaut), `ssh://git@host/owner/repo.git`
 * et `https://host/owner/repo(.git)`. GitLab autorisant les sous-groupes, tout
 * ce qui suit l'hôte est gardé, pas seulement deux segments.
 */
export function remoteRepoPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Forme SCP : pas d'URL au sens de `new URL`, il faut la reconnaître à part.
  const scp = /^[^/]+@([^/:]+):(.+)$/.exec(trimmed);
  const raw = scp
    ? scp[2]
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? safeUrlPath(trimmed)
      : null;
  if (!raw) return null;

  const path = raw.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  return path.includes("/") ? path : null;
}

function safeUrlPath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Ce dossier est-il le dépôt que le projet a lié ?
 *
 * **On compare le chemin du dépôt, PAS l'hôte** — et c'est une décision, pas un
 * raccourci. Un même dépôt se joint par `github.com`, par un GitHub Enterprise,
 * par un GitLab auto-hébergé ou par un miroir interne ; exiger l'hôte du
 * fournisseur refuserait des dossiers parfaitement légitimes, et le refus serait
 * incompréhensible. Le risque résiduel — deux `owner/repo` identiques sur deux
 * forges — suppose que quelqu'un se trompe de dossier en le choisissant lui-même
 * dans un panneau système : c'est un garde-fou d'inattention, pas une frontière.
 */
export function remoteMatchesRepo(url: string, expected: ExpectedRepo): boolean {
  const path = remoteRepoPath(url);
  if (!path) return false;
  const wanted = expected.fullName.trim().replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!wanted) return false;
  return path.toLowerCase() === wanted.toLowerCase();
}

/** Le dossier est-il utilisable comme dépôt local de ce projet ? */
export function localRepoVerdict(
  facts: LocalRepoFacts,
  expected: ExpectedRepo,
): { ok: true } | { ok: false; reason: LocalRepoRefusal } {
  if (!facts.isDirectory) return { ok: false, reason: "missing" };
  if (facts.gitConfig === null) return { ok: false, reason: "notGit" };
  const remotes = parseGitConfigRemotes(facts.gitConfig);
  if (remotes.length === 0) return { ok: false, reason: "noRemote" };
  const matched = remotes.some((remote) => remoteMatchesRepo(remote.url, expected));
  return matched ? { ok: true } : { ok: false, reason: "wrongRepo" };
}

/**
 * Le pointeur d'un `.git` FICHIER — ce qu'est `.git` dans un worktree et dans un
 * sous-module : une ligne `gitdir: <chemin>`. Le chemin peut être relatif au
 * dossier qui porte le fichier ; c'est à l'appelant de le résoudre, il a `path`.
 */
export function parseGitDirPointer(text: string): string | null {
  const match = /^\s*gitdir:\s*(.+?)\s*$/m.exec(text);
  return match?.[1] ?? null;
}

/** Ce que le fichier de réglages contient : un chemin par projet. */
export type LocalRepoStore = Record<string, string>;

/**
 * Le store relu depuis le disque, réduit à ce qu'il a le droit d'être.
 *
 * **Tout ce qui n'est pas une paire de chaînes disparaît en silence**, comme le
 * canal : un fichier tronqué par un arrêt brutal ne doit pas empêcher l'app de
 * s'ouvrir, et un chemin relatif glissé là à la main ne doit pas devenir le
 * dossier de travail d'un agent.
 */
export function parseLocalRepoStore(raw: unknown): LocalRepoStore {
  if (typeof raw !== "object" || raw === null) return {};
  const projects = (raw as { projects?: unknown }).projects;
  if (typeof projects !== "object" || projects === null) return {};
  const store: LocalRepoStore = {};
  for (const [projectId, value] of Object.entries(projects as Record<string, unknown>)) {
    if (!projectId) continue;
    const path = typeof value === "string" ? value : null;
    if (path && path.startsWith("/")) store[projectId] = path;
  }
  return store;
}

/** La forme écrite sur le disque — un objet nommé, pour pouvoir grandir. */
export function serializeLocalRepoStore(store: LocalRepoStore): string {
  return `${JSON.stringify({ projects: store }, null, 2)}\n`;
}

export function withLocalRepo(
  store: LocalRepoStore,
  projectId: string,
  path: string,
): LocalRepoStore {
  return { ...store, [projectId]: path };
}

export function withoutLocalRepo(
  store: LocalRepoStore,
  projectId: string,
): LocalRepoStore {
  const { [projectId]: _removed, ...rest } = store;
  return rest;
}

/** Le dernier segment d'un chemin — ce que le chip affiche quand la place manque. */
export function localRepoFolderName(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}
