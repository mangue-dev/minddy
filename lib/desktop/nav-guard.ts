/**
 * Où la fenêtre de l'app a le droit d'aller (MIN-291).
 *
 * Le renderer charge du CODE DISTANT avec notre `preload` attaché. Si un lien
 * vers un site tiers ouvrait ce site *dans* la fenêtre, ce site hériterait du
 * pont — c'est-à-dire de `openExternal` et du reste. La garde n'est donc pas une
 * politesse d'UX : c'est la frontière de la surface exposée.
 *
 * Module PUR : la décision se prend ici et se teste ici ; `desktop/src/main.ts`
 * ne fait que la câbler sur `will-navigate` et `setWindowOpenHandler`.
 */

/**
 * - `allow` — notre origine, la fenêtre navigue.
 * - `external` — une page web ordinaire ailleurs : elle part au navigateur
 *   système.
 * - `block` — rien de tout ça (`file:`, `javascript:`, `data:`, une URL
 *   illisible). On ne navigue pas, et on ne la passe pas non plus à
 *   `shell.openExternal`, qui la donnerait au système : `open` sur un `file://`
 *   ou un schéma inscrit par une autre app, c'est de l'exécution.
 */
export type NavigationDecision = "allow" | "external" | "block";

/** Les seuls schémas qu'on accepte de confier au navigateur du système. */
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * Que faire d'une navigation vers `target`, la fenêtre étant à `origin` ?
 *
 * La comparaison porte sur l'ORIGINE complète (schéma + hôte + port), jamais sur
 * l'hôte seul : `http://www.minddy.app` et un sous-domaine voisin sont des
 * tierces parties comme les autres, et doivent sortir.
 */
export function navigationDecision(
  target: string,
  origin: string
): NavigationDecision {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return "block";
  }

  let home: URL;
  try {
    home = new URL(origin);
  } catch {
    return "block";
  }

  if (url.origin === home.origin) return "allow";
  return EXTERNAL_SCHEMES.has(url.protocol) ? "external" : "block";
}
