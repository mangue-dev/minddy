import { CHANGED_FILES_CAP, sq, type RepoHost } from "./repo-host";

/**
 * LE DIFF DU TOUR EN COURS, LU DANS LA SANDBOX — la seule source qui sache ce que
 * l'agent vient d'écrire (MIN-266, note « diff en cours »).
 *
 * La vue diff de la conversation était servie par la FORGE
 * ([diff/route.ts](../../../app/api/agent-runs/[runId]/diff/route.ts)) : la PR
 * quand elle existe, sinon le compare `base...branche`. C'est le travail POUSSÉ,
 * et l'agent ne pousse qu'en fin de tour — pendant qu'il travaille, cliquer un
 * fichier qu'il vient de modifier ouvrait donc l'état d'AVANT, quand ce n'était
 * pas un diff vide (premier tour : la branche n'existe pas encore côté forge).
 * Le fil disait « app/foo.tsx modifié » et la seule surface capable de montrer
 * ce changement ne le connaissait pas.
 *
 * Ici, on lit le dépôt là où il vit (`host.layout.repoDir`), dans la microVM du
 * run. `git diff origin/<base>` y couvre TOUT — les commits des tours précédents
 * ET l'arbre de travail non committé — donc la même chose que le compare de la
 * forge, plus ce qui n'est pas encore parti. Une seule source pendant le tour,
 * pas deux diffs à recoller (des patches ne se composent pas).
 *
 * **LECTURE SEULE, et c'est la condition de sa sûreté.** Ces commandes tournent
 * pendant qu'un tour édite et committe : ni `add`, ni `add -N`, ni écriture
 * d'index — la fin de tour stage et committe seule ([commitAndPush](repo-host.ts)),
 * et une intention d'ajout posée ici finirait dans le commit de quelqu'un
 * d'autre. Le pire qui puisse arriver est un instantané pris entre deux états.
 *
 * Les fichiers NON SUIVIS passent par `git diff --no-index /dev/null <chemin>`,
 * qui rend exactement la même forme qu'un `new file mode` sans toucher à
 * l'index. Sans ça, un fichier tout juste créé — le cas le plus fréquent d'un
 * tour d'agent — serait absent du diff qu'on montre.
 *
 * Le parsing est PUR et testé ([working-diff.test.ts](working-diff.test.ts)) :
 * ce module ne peut pas s'exercer contre une vraie sandbox, mais la lecture des
 * trois sorties de git, elle, s'exerce entièrement.
 */

/** Un fichier du diff de travail, à la forme que servent déjà les forges
 *  (`PullRequestFile` côté client) : la vue diff n'a pas à savoir d'où ça vient. */
export interface WorkingDiffFile {
  filename: string;
  status: "added" | "removed" | "renamed" | "modified";
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

/**
 * Plafond d'octets sur le TEXTE des patches, appliqué par `head -c` côté sandbox :
 * un tour qui régénère un lockfile produit un diff de plusieurs mégaoctets, qu'on
 * ne veut ni faire transiter ni peindre. La coupe tombe au milieu d'une ligne,
 * donc le parseur doit la tolérer — il ne fait qu'y perdre le dernier fichier.
 */
export const WORKING_DIFF_MAX_BYTES = 2_000_000;

/** Le tour a-t-il produit un diff plus gros que ce plafond, ou plus de fichiers
 *  que `CHANGED_FILES_CAP` ? Se dit à l'écran — une liste tronquée sans le dire
 *  se lit comme une liste complète. */
export interface WorkingDiff {
  files: WorkingDiffFile[];
  truncated: boolean;
}

/**
 * Le chemin APRÈS d'un champ `--numstat`, qui compacte les renommages
 * (`a => b`, `{a => b}`, `pre/{a => b}/post`). Jumeau de `numstatNewPath` de
 * [repo-host](repo-host.ts) — la duplication est assumée : celui-là est privé, et
 * l'exporter ferait passer un détail de parsing pour une primitive de dépôt.
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

/** `git diff --numstat` → compteurs indexés par chemin d'arrivée. Un fichier
 *  binaire vaut `-` des deux côtés : compté 0/0, comme le fait la forge. */
export function parseNumstat(stdout: string): Map<string, { additions: number; deletions: number }> {
  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
    counts.set(numstatNewPath(parts.slice(2).join("\t")), { additions, deletions });
  }
  return counts;
}

interface NameStatusEntry {
  filename: string;
  status: WorkingDiffFile["status"];
  previousFilename?: string;
}

/** `git diff --name-status --find-renames` → statut et chemins propres (le seul
 *  endroit où un renommage donne ses DEUX chemins sans compactage). */
export function parseNameStatus(stdout: string): NameStatusEntry[] {
  const out: NameStatusEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0]?.[0] ?? "";
    if (code === "R") {
      const previousFilename = parts[1] ?? "";
      const filename = parts[2] ?? previousFilename;
      if (filename) out.push({ filename, status: "renamed", previousFilename });
      continue;
    }
    const filename = parts[1] ?? "";
    if (!filename) continue;
    // Copie (C) = fichier neuf côté cible → « ajouté » du point de vue lecteur.
    // Tout le reste (M, T, U…) se dit « modifié », comme chez GitHub.
    const status: WorkingDiffFile["status"] =
      code === "A" || code === "C" ? "added" : code === "D" ? "removed" : "modified";
    out.push({ filename, status });
  }
  return out;
}

/**
 * Un diff unifié → le patch de chaque fichier, à la forme de GitHub : les HUNKS
 * seuls, de la première ligne `@@` à la fin de la section. L'en-tête
 * (`diff --git`, `index`, `---`, `+++`) est reconstruit à l'affichage
 * ([toUnifiedDiff](../../../components/pull-requests/pr-diff.tsx)), et le garder
 * ici le ferait apparaître en double.
 *
 * Le chemin se lit sur `+++ b/<chemin>` (ou `--- a/<chemin>` pour une
 * suppression), jamais sur la ligne `diff --git` : elle colle les deux chemins
 * sans séparateur exploitable, et un fichier dont le nom porte un espace y
 * devient indécidable. Git suffixe d'ailleurs ces lignes-là d'une tabulation,
 * qu'on retire.
 *
 * Une section sans hunk (renommage pur, fichier binaire) rend un patch VIDE :
 * il n'y a rien à peindre, et la vue diff sait déjà le dire.
 */
export function splitUnifiedDiff(text: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!text.trim()) return out;
  // `\ndiff --git ` et non `diff --git ` : une ligne de contenu du patch peut
  // commencer par ces mots (un diff dans un diff — ce fichier-ci, tiens).
  const sections = `\n${text}`.split("\ndiff --git ");
  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split("\n");
    let filename = "";
    let hunkStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("@@")) {
        hunkStart = i;
        break;
      }
      if (line.startsWith("+++ ")) {
        const path = line.slice(4).replace(/\t.*$/, "");
        if (path !== "/dev/null") filename = path.replace(/^b\//, "");
      } else if (line.startsWith("--- ") && !filename) {
        const path = line.slice(4).replace(/\t.*$/, "");
        if (path !== "/dev/null") filename = path.replace(/^a\//, "");
      } else if (line.startsWith("rename to ")) {
        filename = line.slice("rename to ".length);
      } else if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
        // Un binaire n'a ni `---` ni `+++` : sa seule ligne nomme les deux côtés
        // (`Binary files /dev/null and b/logo.png differ`). Il n'a rien à peindre,
        // mais il DOIT figurer dans la liste — un tour qui remplace une image ne
        // peut pas passer pour un tour qui n'a rien fait.
        const right = line.slice("Binary files ".length, -" differ".length).split(" and ").pop();
        if (right && right !== "/dev/null") filename = right.replace(/^[ab]\//, "");
      }
    }
    if (!filename) continue;
    out.set(filename, hunkStart === -1 ? "" : lines.slice(hunkStart).join("\n").replace(/\n+$/, ""));
  }
  return out;
}

/** Additions/suppressions lues sur un patch — le seul compte disponible pour un
 *  fichier NON SUIVI, que `git diff --numstat` ignore par construction. */
export function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

/**
 * Les quatre sorties de git → la liste servie à la vue diff. Pur : c'est ici que
 * vit toute la lecture, et donc tout ce qui peut se tromper.
 *
 * Les fichiers non suivis sont ajoutés APRÈS les suivis puis le tout est trié par
 * chemin : `git status` et `git diff` ne parlent pas du même ensemble, et un
 * fichier ne peut pas être dans les deux.
 */
export function buildWorkingDiff(out: {
  nameStatus: string;
  numstat: string;
  patch: string;
  untrackedPatch: string;
  /** Le texte des patches a été coupé au plafond d'octets. */
  patchTruncated?: boolean;
}): WorkingDiff {
  const counts = parseNumstat(out.numstat);
  const patches = splitUnifiedDiff(out.patch);
  const untrackedPatches = splitUnifiedDiff(out.untrackedPatch);

  const files: WorkingDiffFile[] = [];
  for (const entry of parseNameStatus(out.nameStatus)) {
    const c = counts.get(entry.filename) ?? { additions: 0, deletions: 0 };
    const patch = patches.get(entry.filename);
    files.push({
      filename: entry.filename,
      status: entry.status,
      additions: c.additions,
      deletions: c.deletions,
      ...(patch ? { patch } : {}),
      ...(entry.previousFilename ? { previous_filename: entry.previousFilename } : {}),
    });
  }
  const tracked = new Set(files.map((f) => f.filename));
  for (const [filename, patch] of untrackedPatches) {
    if (tracked.has(filename)) continue;
    files.push({
      filename,
      status: "added",
      ...countPatchLines(patch),
      ...(patch ? { patch } : {}),
    });
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename));
  const truncated = out.patchTruncated === true || files.length > CHANGED_FILES_CAP;
  return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
}

/**
 * Les commandes, telles qu'elles partent dans la sandbox. `patches: false` sert
 * l'EN-TÊTE de la conversation, qui n'a besoin que des deux nombres et les
 * redemande toutes les quelques secondes pendant le tour : deux passes git
 * courtes, pas des mégaoctets de patch.
 *
 * `baseRef` est une ref git (`origin/main`), pas une entrée de l'utilisateur :
 * elle vient du run. Elle passe quand même par `sq` — le jour où elle viendra
 * d'ailleurs, la question ne se reposera pas.
 *
 * Best-effort de bout en bout, comme `changedFiles` : la sandbox peut être en
 * train de committer, de s'éteindre, ou ne plus répondre. Un diff vide se lit
 * comme « rien à montrer », ce qui est vrai le plus souvent, et n'empêche jamais
 * la vue de s'ouvrir.
 */
/**
 * LA BASE DU DIFF, RÉSOLUE DANS LE CLONE — le POINT DE DÉPART DE LA BRANCHE,
 * c'est-à-dire `git merge-base origin/<base> HEAD`, et surtout pas le tip de
 * `origin/<base>`.
 *
 * C'EST LA DIFFÉRENCE ENTRE DEUX POINTS ET TROIS POINTS, et elle se chiffre. Un
 * `git diff origin/main` compare l'arbre de travail au tip de la base : tout ce
 * qui a atterri sur `main` depuis que la branche est partie y apparaît
 * **INVERSÉ**, comme si l'agent l'avait annulé. La forge, elle, montre
 * `base...tête` — depuis le point commun. Les deux vues ne racontent alors pas
 * le même tour, et c'est ce qu'on a lu sur la PR 51 : **881 lignes en direct
 * contre 130 à la forge**, parce que deux commits (729 lignes) étaient tombés
 * sur `main` entre la naissance de la branche et le clonage de ce tour-là.
 *
 * Le commentaire d'avant disait « `origin/<base>` est figé au clonage, donc le
 * diff est juste ». Figé, il l'est — mais au clonage de CE TOUR, pas à la
 * naissance de la branche. Une session qui reprend une branche vieille de
 * quelques heures reclone une base qui a bougé, et l'écart est exactement le
 * travail des autres.
 *
 * `baseBranch` est nul quand le run est parti sur la branche par défaut du dépôt
 * sans qu'on l'ait nommée. Plutôt que d'aller la demander à la forge (un token
 * d'installation pour un nom), on la lit dans le clone : celui-ci est
 * `--single-branch`, donc il n'y a QU'UNE ref distante, et c'est forcément
 * celle-là.
 *
 * `null` = pas de base lisible (dépôt absent, sandbox muette) ⇒ pas de diff en
 * direct, et l'appelant retombe sur la forge.
 */
export async function resolveBaseRef(
  host: RepoHost,
  baseBranch: string | null,
): Promise<string | null> {
  const shell: ShellOpts = { cwd: host.layout.repoDir, timeoutMs: 15_000 };
  const ref = await resolveBaseTip(host, baseBranch, shell);
  if (!ref) return null;
  return await mergeBaseWithHead(host, ref, shell);
}

/** Le tip de la base dans le clone — la ref, avant de remonter au point commun. */
async function resolveBaseTip(
  host: RepoHost,
  baseBranch: string | null,
  shell: ShellOpts,
): Promise<string | null> {
  const named = baseBranch?.trim();
  if (named) {
    const ref = `origin/${named}`;
    const ok = await run(host, `git rev-parse --verify --quiet ${sq(ref)}`, shell);
    if (ok.trim()) return ref;
  }
  // `origin/HEAD` quand le clone l'a posé : c'est nommément la branche par défaut.
  const head = await run(host, `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`, shell);
  if (head.trim()) return head.trim();
  // Sinon la seule ref distante qui reste. `--exclude` écarte `origin/HEAD`, dont
  // le nom court est « origin » tout court : un ref valide, mais qui se lit comme
  // un bug le jour où il apparaît dans un log.
  const only = await run(
    host,
    `git for-each-ref --count=1 --format='%(refname:short)'` +
      ` --exclude=refs/remotes/origin/HEAD refs/remotes/origin/`,
    shell,
  );
  return only.trim() || null;
}

/**
 * Le point commun entre la base et la tête, ou la base elle-même quand git ne
 * sait pas le dire.
 *
 * LE REPLI EST LE COMPORTEMENT D'AVANT, et il est assumé : un clone `--depth`
 * peut n'avoir aucun ancêtre commun dans son greffon, et `merge-base` rend alors
 * un code 1 sans rien écrire. Mieux vaut le diff légèrement trop large qu'aucun
 * diff — la vue tombe sinon sur la forge, qui ne connaît pas le travail non
 * poussé, c'est-à-dire précisément ce qu'on est venu voir.
 */
async function mergeBaseWithHead(
  host: RepoHost,
  ref: string,
  shell: ShellOpts,
): Promise<string> {
  const base = await run(host, `git merge-base ${sq(ref)} HEAD`, shell);
  return base.trim() || ref;
}

export async function readWorkingDiff(
  host: RepoHost,
  baseRef: string,
  opts: { patches: boolean },
): Promise<WorkingDiff> {
  const ref = sq(baseRef);
  const shell: ShellOpts = { cwd: host.layout.repoDir, timeoutMs: 30_000 };
  try {
    const [nameStatus, numstat, patch, untrackedPatch] = await Promise.all([
      run(host, `git diff --name-status --find-renames ${ref}`, shell),
      run(host, `git diff --numstat --find-renames ${ref}`, shell),
      opts.patches
        ? run(
            host,
            `git diff --find-renames --no-color ${ref} | head -c ${WORKING_DIFF_MAX_BYTES}`,
            shell,
          )
        : Promise.resolve(""),
      opts.patches
        ? run(
            host,
            // `-I%` plutôt qu'un `xargs` nu : un chemin à espaces doit rester UN
            // argument. `; true` avale le code 1 que `git diff --no-index` rend
            // par DESIGN dès qu'il y a une différence — c'est-à-dire toujours ici.
            `git ls-files --others --exclude-standard -z` +
              ` | xargs -0 -n1 -I% git diff --no-index --no-color -- /dev/null %` +
              ` | head -c ${WORKING_DIFF_MAX_BYTES}; true`,
            shell,
          )
        : Promise.resolve(""),
    ]);
    return buildWorkingDiff({
      nameStatus,
      numstat,
      patch,
      untrackedPatch,
      patchTruncated:
        patch.length >= WORKING_DIFF_MAX_BYTES || untrackedPatch.length >= WORKING_DIFF_MAX_BYTES,
    });
  } catch {
    return { files: [], truncated: false };
  }
}

type ShellOpts = { cwd: string; timeoutMs: number };

/** Une commande dont l'échec ne vaut rien de plus qu'une sortie vide. */
function run(host: RepoHost, command: string, opts: ShellOpts): Promise<string> {
  return host
    .exec(command, opts)
    .then((r) => (r.exitCode === 0 ? r.stdout : ""))
    .catch(() => "");
}
