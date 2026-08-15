/**
 * OÙ LE HARNESS TRAVAILLE — et pourquoi ce n'est plus une constante (MIN-354).
 *
 * Tous ces chemins étaient des `const` de module sous `/vercel/sandbox`. C'était
 * vrai tant que le seul disque du harness était celui d'une microVM créée pour
 * lui : un run, une machine, aucune chance de collision. Deux choses cassent
 * cette hypothèse, et il faut les deux pour comprendre la forme ci-dessous.
 *
 * 1. **`/vercel/…` n'existe pas sur un Mac**, et n'y est pas créable sans root.
 *    Mesuré : `.agent-vm/main.js` s'exécute tel quel sous le Node d'Electron et
 *    meurt sur `/vercel/sandbox/harness/job.json` — avant la moindre autre ligne.
 * 2. **Une machine peut porter DEUX runs à la fois.** Une microVM est créée par
 *    run ; un ordinateur, non. Deux tickets lancés à la suite sur le même poste
 *    partageraient le job du harness, la base SQLite d'opencode, le dossier de
 *    sorties de tools et les ports — avec des symptômes qui ne ressemblent en
 *    rien à leur cause.
 *
 * D'où un OBJET, dérivé d'une racine unique par run, et non une variable
 * d'environnement posée une fois pour le process : une variable d'environnement
 * a exactement le défaut qu'on cherche à supprimer, elle est globale.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RACINES, ET C'EST VOULU
 *
 * `root` est la racine DU RUN : tout ce qui appartient à un tour et à lui seul —
 * le dépôt de travail, les sorties de tools, le harness, le `.tsbuildinfo`.
 *
 * `opencodeDir` n'en fait pas partie. C'est 144 Mo de binaire, installés une
 * fois (10,6 s) et cuits dans le snapshot de la microVM
 * ([opencode-host.ts](vm/opencode-host.ts)) : le poser sous la racine du run
 * reviendrait à le réinstaller à chaque ticket. Il est propre à la MACHINE, pas
 * au run, et rien de ce qu'un run y écrit ne le distingue d'un autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `repoDir` EST LA RACINE DE SÉCURITÉ
 *
 * `resolveWithin`, `assertNotGit`, `resolveReadable` ([repo-path.ts](repo-path.ts))
 * et `absoluteInRepo` ([opencode-permissions.ts](vm/opencode-permissions.ts))
 * comparent tous à cette valeur. Tant qu'elle était un littéral, sa forme allait
 * de soi ; elle arrive désormais par un JSON écrit ailleurs. `assertUsableLayout`
 * est ce qui reprend le rôle du littéral : un chemin relatif, un slash final ou
 * un dépôt hors de sa racine rendraient ces quatre fonctions muettes plutôt que
 * fausses — `resolveWithin("repo", "../x")` ne sort de rien du tout, puisque
 * « rien » est ce à quoi il compare.
 *
 * Module PUR et SANS AUCUN import : il part dans le bundle de la microVM, il est
 * lu par le script de snapshot lancé à la main (`tsx`), et par la fonction.
 */

/** Le disque d'un run, tel que le harness et les garde-fous le voient. */
export interface HarnessLayout {
  /** La racine UNIQUE du run. Tout ce qui suit en dérive, sauf `opencodeDir`. */
  root: string;
  /**
   * Où le dépôt est cloné — et LA RACINE DE SÉCURITÉ (cf. en-tête). Aucune
   * écriture du modèle ne sort d'ici.
   */
  repoDir: string;
  /**
   * Où le harness dépose les sorties de tools trop longues pour le modèle
   * (MIN-107). DÉLIBÉRÉMENT hors de `repoDir` : le `git add -A` de fin de tour ne
   * le voit pas, donc rien de tout ça n'atterrit dans un commit ou une PR.
   */
  toolOutputDir: string;
  /**
   * Où vit le HARNESS lui-même — bundle, job du tour, config et état d'opencode.
   *
   * Hors de `repoDir` pour la même raison que `toolOutputDir`, et c'est encore
   * plus vrai ici : le `git add -A` de fin de tour emporterait sinon le code du
   * harness ET le job, qui porte l'historique de la conversation, dans un commit
   * du dépôt de l'utilisateur puis dans sa pull request.
   */
  harnessDir: string;
  /**
   * Le `.tsbuildinfo` du type-check de livraison ([diagnostics.ts](diagnostics.ts)).
   * Hors du dépôt (même raison), et il persiste avec la racine du run : c'est ce
   * qui fait passer les tours suivants de 22 s à 11 s.
   */
  typecheckDir: string;
  /**
   * Où le binaire opencode est INSTALLÉ. Propre à la machine, PAS au run
   * (cf. en-tête) : deux runs simultanés le partagent, et c'est ce qu'on veut.
   */
  opencodeDir: string;
}

/** La racine du disque d'un run en microVM. Une VM par run : elle suffit à elle seule. */
export const CLOUD_SANDBOX_ROOT = "/vercel/sandbox";

/** Où le binaire opencode est cuit dans l'image pré-chauffée de la microVM. */
export const CLOUD_OPENCODE_DIR = "/vercel/oc";

/** Le layout dérivé d'une racine de run. La seule fabrique — nulle part ailleurs
 *  on ne recolle un chemin de harness à la main. */
export function layoutForRoot(root: string, opencodeDir: string): HarnessLayout {
  const base = trimTrailingSlashes(root);
  return {
    root: base,
    repoDir: `${base}/repo`,
    toolOutputDir: `${base}/tool-output`,
    harnessDir: `${base}/harness`,
    typecheckDir: `${base}/typecheck`,
    opencodeDir: trimTrailingSlashes(opencodeDir),
  };
}

/** Le layout d'un run en microVM — exactement les chemins d'avant MIN-354. */
export function cloudLayout(): HarnessLayout {
  return layoutForRoot(CLOUD_SANDBOX_ROOT, CLOUD_OPENCODE_DIR);
}

/**
 * LA RACINE D'UN RUN SUR UNE MACHINE PARTAGÉE — un dossier par identifiant de
 * run, sous un dossier de travail commun.
 *
 * C'est le geste que la microVM rendait gratuit et qu'un ordinateur ne rend pas :
 * sans lui, deux runs lancés à la suite écrivent leur job, leur base SQLite et
 * leurs sorties de tools au même endroit, et le second efface le premier en
 * silence. Le `runId` est passé au tamis des caractères de chemin — il vient de
 * la base, mais un identifiant qui porterait un `/` ou un `..` ferait sortir la
 * racine de son dossier de travail, et c'est elle qui borne tout le reste.
 */
export function runScopedRoot(baseDir: string, runId: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "") || "run";
  return `${trimTrailingSlashes(baseDir)}/${safe}`;
}

/**
 * REFUSE UN LAYOUT QUE LES GARDE-FOUS NE SAURAIENT PAS TENIR.
 *
 * Trois exigences, et chacune correspond à une hypothèse que les littéraux
 * d'hier rendaient évidente :
 *
 * - **absolu** — `resolveWithin` normalise `<base>/<chemin>` et compare au
 *   préfixe. Sur une base relative, un `../..` du modèle sort du dépôt sans que
 *   la comparaison le voie ;
 * - **sans slash final** — `assertNotGit` compare à `${base}/.git`, et
 *   `resolveWithin` à `${base}/` : une base finissant par `/` produit un
 *   `//`, que `normalize` efface d'un côté et pas de l'autre ;
 * - **le dépôt sous la racine** — c'est ce qui garantit que `toolOutputDir` et
 *   `harnessDir` en sont frères et non enfants, donc que le `git add -A` de fin
 *   de tour ne les emporte jamais.
 *
 * LÈVE, et ne rend pas un booléen : le seul appelant est le harness au moment
 * où il lit son job, et un layout douteux n'a pas de mode dégradé — il n'y a
 * rien à faire d'un tour dont on ne sait pas où il écrit.
 */
export function assertUsableLayout(layout: HarnessLayout): void {
  const dirs: Array<[keyof HarnessLayout, string]> = [
    ["root", layout.root],
    ["repoDir", layout.repoDir],
    ["toolOutputDir", layout.toolOutputDir],
    ["harnessDir", layout.harnessDir],
    ["typecheckDir", layout.typecheckDir],
    ["opencodeDir", layout.opencodeDir],
  ];
  for (const [name, value] of dirs) {
    if (typeof value !== "string" || !value.startsWith("/")) {
      throw new Error(`harness layout: ${name} must be an absolute path, got ${JSON.stringify(value)}`);
    }
    if (value.length > 1 && value.endsWith("/")) {
      throw new Error(`harness layout: ${name} must not end with a slash, got ${JSON.stringify(value)}`);
    }
  }
  for (const [name, value] of dirs) {
    if (name === "root" || name === "opencodeDir") continue;
    if (!value.startsWith(`${layout.root}/`)) {
      throw new Error(`harness layout: ${name} (${value}) must live under root (${layout.root})`);
    }
  }
}

function trimTrailingSlashes(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}
