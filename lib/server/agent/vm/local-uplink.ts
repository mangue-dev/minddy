/**
 * CE QUI REMONTE DE LA MACHINE DE L'UTILISATEUR (MIN-361) — un module PUR, sans
 * un seul import, comme ses voisins de garde-fou (`local-exec-scope.ts`,
 * `private-address.ts`) : il descend dans le bundle du harness, et il doit
 * pouvoir être cassé dans un test plutôt qu'en production.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE POINT QUI N'EST PAS RÉPARABLE APRÈS COUP
 *
 * Tout le reste du chantier local raisonne sur ce qui **descend** (le jeton du
 * run, la clé du modèle, le token de forge). Ce module est le seul à regarder ce
 * qui **remonte**, et c'est le seul endroit du dossier où l'erreur ne se corrige
 * pas : ce qui est monté est monté.
 *
 * Dans le cloud, ce qui remonte est le contenu d'un clone jetable d'un dépôt que
 * le projet possède déjà. **Sur une machine, c'est le disque de quelqu'un** — et
 * `agent_run_events` est persisté 30 jours et lu par tout membre du projet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GESTES, ET ILS NE FONT PAS LE MÊME TRAVAIL
 *
 * 1. **Réécrire les chemins de la machine** (`scrubPaths`). Le dépôt devient
 *    relatif, la maison devient `~`. C'est le geste qui traite le porteur
 *    d'identité le plus banal et le plus universel : `/Users/<prénom nom>/…`
 *    n'est pas dans les sorties « suspectes », il est dans **toutes** — chaque
 *    trace de pile, chaque `pwd`, chaque message d'erreur de compilateur, y
 *    compris pour un fichier qui est DANS le dépôt. Une règle qui ne regarderait
 *    que ce qui sort du dépôt le laisserait passer intégralement.
 * 2. **Retenir une sortie qui parle d'ailleurs** (`foreignPaths`). Un tool dont
 *    l'appel ou la sortie porte un chemin personnel hors du dépôt ne publie pas
 *    son aperçu : il est remplacé par un compte. Ce qui reste visible, c'est le
 *    GESTE — on doit pouvoir lire ce que l'agent est allé faire, surtout quand
 *    il est allé le faire hors du dossier. Ce qui ne monte pas, c'est le
 *    CONTENU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « PERSONNEL » VEUT DIRE ICI, ET POURQUOI PAS PLUS
 *
 * `/Users/x`, `/home/x`, `~`, et les points de montage (`/Volumes`, `/mnt`,
 * `/media` — le disque externe, le NAS, la clé USB). **Pas `/usr`, pas `/opt`,
 * pas `/etc`.**
 *
 * Ce n'est pas de la timidité, c'est le rapport de force entre les deux erreurs.
 * `/usr/lib/…` et `/opt/homebrew/…` sont identiques sur tous les Mac : ils ne
 * disent rien de personne, et ils sont dans la moitié des traces de pile. `/etc`
 * est le cas limite qui tranche la règle — il apparaît dans le CONTENU des
 * dépôts (un Dockerfile, une conf nginx, un README), et l'y inclure ferait
 * retenir des lectures parfaitement ordinaires. Une garde qui vide le fil de ses
 * sorties honnêtes ne sera pas gardée longtemps.
 *
 * Le résidu est donc nommé plutôt que masqué : `cat /etc/hosts` par le shell
 * monte. Il est du même ordre que le « mur de papier » du §2 de l'audit — le
 * shell n'a pas de périmètre de lecture, et le fermer n'est pas de ce lot.
 */

/** Ce qui remplace le dépôt dans un texte qui remonte. */
export const REPO_MARK = ".";

/** Ce qui remplace le dossier personnel — et il reste utilisable tel quel. */
export const HOME_MARK = "~";

/**
 * Les têtes de chemin d'un dossier personnel, quel qu'en soit le propriétaire.
 *
 * Universel plutôt que restreint à l'utilisateur du tour, et c'est voulu : un
 * chemin `/Users/quelquun-dautre/…` dans une sortie nomme quelqu'un tout autant.
 * Le segment s'arrête aux caractères qui terminent un chemin dans une phrase ou
 * dans une trace de pile — sinon la ponctuation entrerait dans le nom.
 */
const HOME_HEAD = /\/(?:Users|home)\/[^/\s"'`:;,)\]}]+/g;

/**
 * Un chemin PERSONNEL, tel qu'on le reconnaît dans un texte quelconque.
 *
 * Au moins un segment après la racine : `/Users` seul n'est pas un chemin de
 * quelqu'un, `/Users/clement` en est un. Les terminateurs sont ceux d'un chemin
 * cité dans du texte — guillemets, parenthèses, deux-points d'une trace de pile
 * (`fichier.ts:12`), ponctuation de fin de phrase.
 */
const PERSONAL_PATH = /(?:~|\/Users|\/home|\/Volumes|\/mnt|\/media)(?:\/[^\s"'`()[\]{}<>|:;,]+)+/g;

/**
 * LE DOSSIER PERSONNEL, DÉDUIT DU DÉPÔT — et jamais lu dans l'environnement.
 *
 * `process.env.HOME` aurait fait de ce module un module impur pour rien : le
 * dépôt du run est déjà un chemin absolu sur la machine, et sa racine
 * personnelle est dedans. Un dépôt qui vit ailleurs (`/srv/code`, un volume
 * monté) rend `null`, et le reste du module s'en accommode — il n'y a alors
 * simplement pas de `~` à substituer.
 */
export function homeOf(repoDir: string): string | null {
  const found = /^(\/(?:Users|home)\/[^/]+)(?:\/|$)/.exec(repoDir);
  return found ? found[1] : null;
}

/** `a` est-il `b` ou dedans ? La comparaison de préfixe des garde-fous, redite
 *  ici pour que le module reste sans import. */
function inside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

/**
 * LES CHEMINS D'UN TEXTE QUI PARLENT D'AILLEURS QUE DU DÉPÔT.
 *
 * Rend la liste dédoublonnée, pas seulement un booléen : c'est elle qui rend un
 * refus lisible dans un test, et un compte lisible dans le fil.
 *
 * `~/x` est développé quand on connaît la maison — sans quoi un `~/notes` situé
 * dans le dépôt (cas rare mais réel : un dépôt à la racine du dossier personnel)
 * serait compté comme étranger.
 */
export function foreignPaths(text: string, repoDir: string): string[] {
  if (!text) return [];
  const home = homeOf(repoDir);
  const out = new Set<string>();
  for (const raw of text.match(PERSONAL_PATH) ?? []) {
    const path = raw.startsWith("~") ? (home ? `${home}${raw.slice(1)}` : raw) : raw;
    if (!inside(path, repoDir)) out.add(raw);
  }
  return [...out];
}

/**
 * LE TEXTE, CHEMINS DE LA MACHINE RÉÉCRITS.
 *
 * Le dépôt D'ABORD (c'est le préfixe le plus long, et il contient la maison),
 * puis la maison. `split`/`join` sur le dépôt plutôt qu'une expression
 * régulière, pour la raison de `SecretRedactor` : c'est une chaîne littérale, et
 * une regex construite dessus raterait en silence sur un caractère spécial
 * oublié.
 *
 * Ce que ça donne reste UTILISABLE : `./lib/x.ts` est un chemin valide depuis le
 * dépôt, `~/Projets/…` en est un pour le shell. Une réécriture qui casserait les
 * chemins se paierait au tour suivant, quand le modèle relit ce qu'il a écrit.
 */
export function scrubPaths(text: string, repoDir: string): string {
  if (!text) return text;
  const withoutRepo = repoDir ? text.split(repoDir).join(REPO_MARK) : text;
  return withoutRepo.replace(HOME_HEAD, HOME_MARK);
}

/** L'aperçu qui remplace une sortie retenue. En anglais, comme les autres
 *  messages que le harness écrit dans un `tool_result` (les refus de permission,
 *  `assertNotGit`) : il est lu par le modèle autant que par un humain. */
export function withheldOutput(chars: number, paths: number): string {
  return (
    `[minddy kept this output on this machine: it mentions ${paths} path(s) outside the ` +
    `repository, and this turn runs on someone's own computer. ${chars} characters were ` +
    `not uploaded — you saw the output when the tool ran, it is only absent from the thread.]`
  );
}

/** Ce qu'un filtrage rend : la charge réécrite, et ce qu'elle a révélé. */
export interface LocalPayloadFilter {
  payload: Record<string, unknown>;
  /** Au moins une chaîne portait un chemin personnel hors du dépôt. */
  foreign: boolean;
  /** Combien, tous champs confondus — c'est le COMPTE que le fil publie. */
  foreignCount: number;
}

/**
 * LA CHARGE D'UN EVENT, PRÊTE À MONTER — réécrite en profondeur, et jugée.
 *
 * Même parcours que `redactDeep` ([redact.ts](../redact.ts)), et pour la même
 * raison : les charges d'opencode sont imbriquées par construction, et c'est au
 * fond qu'un chemin se cache. Les deux gestes sont ici plutôt que dans le
 * superviseur pour qu'il n'y ait qu'UNE rédaction de la règle.
 */
export function filterLocalPayload(
  payload: Record<string, unknown>,
  repoDir: string,
): LocalPayloadFilter {
  let foreignCount = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      foreignCount += foreignPaths(value, repoDir).length;
      return scrubPaths(value, repoDir);
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(item);
    }
    return out;
  };
  const out = walk(payload) as Record<string, unknown>;
  return { payload: out, foreign: foreignCount > 0, foreignCount };
}
