/**
 * Le catalogue d'un fournisseur publie le même modèle plusieurs fois — c'est
 * l'objet de ce fichier, et rien d'autre : ramener une famille de doublons au
 * seul id qu'un humain a une raison de choisir.
 *
 * Trois formes de doublon, mesurées sur les 326 modèles que le filtre
 * tool-calling laisse passer chez OpenRouter :
 *
 *  - le TARIF DIFFÉRÉ (`:batch`, 59 entrées, un cinquième de la liste) — le même
 *    modèle à moitié prix contre une file d'attente asynchrone. On ne l'appelle
 *    jamais : la boucle de l'agent attend sa réponse. C'est donc du bruit pur, et
 *    le seul cas où on écarte une variante `:` ;
 *  - l'INSTANTANÉ DATÉ (`openai/gpt-4o-2024-11-20`,
 *    `anthropic/claude-sonnet-5-20260114`) — une DATE DE BUILD au calendrier, et
 *    l'id nu est l'alias mouvant qui pointe dessus ;
 *  - le QUALIFICATIF (`-preview`, `-exp`, `-beta`…) — `tencent/hy3-preview` à
 *    côté de `tencent/hy3`, `deepseek-v3.2-exp` à côté de `deepseek-v3.2`.
 *
 * La règle qui tient les trois : **on n'écarte une version que si la version nue
 * est là.** `google/gemini-3.1-pro-preview` n'a pas de `gemini-3.1-pro` en face —
 * il reste, parce que le retirer ne rangerait pas la liste, il retirerait le
 * modèle. Deviner un gagnant dans une famille qui n'a que des datés
 * (`gpt-4o-2024-11-20` / `-2024-08-06`, sans `gpt-4o` en face) serait le même
 * pari : on les garde tous.
 *
 * ─── Ce qui n'est PAS un instantané : le TAG DE RELEASE à quatre chiffres ───
 *
 * `-0731`, `-0813`, `-2507` ressemblent à des dates et n'en sont pas. DeepSeek,
 * Qwen et Moonshot s'en servent pour publier une version AMÉLIORÉE sous le nom de
 * famille existant, pendant que l'id nu reste accroché à la sortie précédente :
 * `deepseek-v4-flash-0731` n'est pas `deepseek-v4-flash` figé, c'est le modèle
 * d'après, et `qwen3-235b-a22b-2507` n'est pas une photo de `qwen3-235b-a22b`.
 * Les traiter en doublons ne rangeait pas la liste — ça retirait du picker le
 * seul id qui mène à ce modèle-là, et il n'en restait aucun chemin.
 *
 * D'où la forme de `SNAPSHOT_RE` : elle ne reconnaît qu'une date lisible comme
 * telle (`2024-11-20`, `20241120`, `05-06`), jamais un tag nu. Un `-0613` de
 * `gpt-4-0613`, lui, EST bien un instantané — mais il porte exactement la même
 * forme qu'un `-0905` de Moonshot, et rien dans l'id ne les sépare. L'erreur
 * n'est pas symétrique : garder un doublon allonge une liste déjà cherchable,
 * retirer un modèle légitime le rend introuvable. Dans le doute, on garde.
 *
 * Les autres variantes `:` ne sont PAS des doublons et restent listées :
 * `:free` est un autre prix (donc un autre multiplicateur), `:thinking` un autre
 * comportement. Une variante survit même quand sa base disparaît —
 * `qwen-plus-2025-07-28:thinking` n'a pas d'équivalent sur `qwen-plus`, et
 * l'écarter perdrait une capacité au lieu d'un doublon.
 *
 * L'index, lui, garde tout (`openrouter-index.ts`) : un id collé à la main doit
 * rester chiffrable, y compris un instantané daté qu'un run ancien porte encore.
 * Ce qu'on range ici, c'est la LISTE PROPOSÉE, pas ce qui est acceptable.
 */

/** Variante de tarification différée : jamais proposable pour un appel synchrone. */
const BATCH_VARIANT = "batch";

/**
 * Suffixe d'instantané : une DATE, et rien d'autre — ISO complète
 * (`-2024-11-20`), compacte (`-20241120`), ou sans année (`-05-06`, la forme des
 * `-preview-…` de Google). Un tag de release à quatre chiffres (`-0813`, `-2507`)
 * n'en est pas une : il nomme un modèle de plus, pas une photo de l'id nu (cf.
 * l'en-tête). L'ancre `$` et l'ordre des branches comptent : `-2024-11-20` doit
 * se lire en entier, pas se faire couper en `-11-20`.
 */
const SNAPSHOT_RE = /-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{2}-\d{2})$/;

/** Qualificatif de pré-version accolé au nom. */
const QUALIFIER_RE = /-(?:preview|beta|alpha|exp|experimental|nightly|latest|rc\d*)$/;

/** `id` → `[base, variante]` ; variante vide quand il n'y a pas de `:`. */
function splitVariant(id: string): [string, string] {
  const colon = id.indexOf(":");
  return colon < 0 ? [id, ""] : [id.slice(0, colon), id.slice(colon + 1)];
}

/**
 * L'id NU d'une version : on retire les suffixes d'instantané et de
 * pré-version, tant qu'il en reste et tant qu'il reste un nom.
 *
 * `google/gemini-2.5-pro-preview-05-06` → `google/gemini-2.5-pro` : les deux
 * formes se cumulent, d'où la boucle. La variante `:` éventuelle est ignorée —
 * ce n'est pas une version, c'est une offre.
 */
export function canonicalModelId(id: string): string {
  const [base] = splitVariant(id);
  const slash = base.indexOf("/");
  const prefix = slash < 0 ? "" : base.slice(0, slash + 1);
  let slug = slash < 0 ? base : base.slice(slash + 1);
  for (;;) {
    const next = slug.replace(SNAPSHOT_RE, "").replace(QUALIFIER_RE, "");
    // Un slug entièrement mangé (`vendor/2024-01-01`) n'est pas une version de
    // quelque chose : on s'arrête sur la dernière forme qui nomme encore.
    if (next === slug || next === "") break;
    slug = next;
  }
  return prefix + slug;
}

/**
 * Le catalogue débarrassé de ses doublons de version, dans l'ordre reçu.
 * Générique sur `{ id }` : la même règle vaut pour une entrée de catalogue
 * complète et pour une simple liste d'ids.
 */
export function dedupeModelVariants<T extends { id: string }>(models: T[]): T[] {
  const synchronous = models.filter((m) => splitVariant(m.id)[1] !== BATCH_VARIANT);
  const bases = new Set(synchronous.map((m) => splitVariant(m.id)[0]));
  return synchronous.filter((m) => {
    const [base, variant] = splitVariant(m.id);
    if (variant) return true;
    const canonical = canonicalModelId(base);
    return canonical === base || !bases.has(canonical);
  });
}
