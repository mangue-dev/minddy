/**
 * Les FICHIERS d'une page (MIN-280) — l'adresse, et rien d'autre.
 *
 * Ce module est la seule chose que partagent les quatre surfaces du sujet : les
 * deux blocs (image et fichier), l'éditeur qui téléverse, la route qui sert les
 * octets, et le ménage qui compare les corps aux lignes de `page_files`. Il ne
 * parle ni à la base ni au storage — il ne connaît qu'une FORME d'URL et sait la
 * lire dans les deux sens.
 *
 * ## Pourquoi une URL, et pas le chemin de storage
 *
 * Le nœud d'un bloc porte `src`, et ce `src` est l'adresse d'une ROUTE de
 * l'application (`/api/projects/{projet}/pages/files/{fichier}`) :
 *
 *  - ce n'est pas une URL signée : celles-là expirent en dix minutes, et un
 *    document est relu des mois plus tard ;
 *  - ce n'est pas un chemin de bucket : recopié dans mille documents, il ne se
 *    déplace plus jamais, et il dit à qui lit le corps où sont rangés les octets ;
 *  - c'est une INDIRECTION par identifiant, donc exactement ce que le bloc
 *    sous-page fait avec `pageId` — la ligne `page_files` reste la vérité, et la
 *    route va chercher le chemin du moment.
 *
 * Et c'est aussi ce qui rend la projection markdown possible sans base de
 * données : `![légende](/api/…)` s'écrit et se relit de tête, alors qu'un id nu
 * aurait demandé à la projection — synchrone, montée dans une fonction serveur —
 * d'aller résoudre une URL par fichier.
 *
 * L'id, lui, se REDÉDUIT de l'URL ({@link pageFileIdFromSrc}). Le porter en
 * second attribut ferait deux vérités pour une seule chose, et c'est toujours la
 * copie qui se périme.
 */

/** Aligné sur les ressources de ticket, en plus serré : un corps de page en
    porte plusieurs, et 10 Mo est déjà une capture d'écran très généreuse. */
export const MAX_PAGE_FILE_BYTES = 10 * 1024 * 1024;

/** Ce que la limite affiche à l'utilisateur, en mégaoctets. */
export const MAX_PAGE_FILE_MB = 10;

/** `projects/{projet}/pages/{page}/{fichier}/{nom}` — la famille de chemins des
    fichiers de page, DANS le préfixe des ressources de projet.

    Un préfixe `pages/…` à la racine du bucket aurait voulu dire une branche de
    plus dans la politique d'insertion du storage ET une famille de plus dans la
    porte de lecture (`/api/attachments/file`), pour la même règle d'accès mot
    pour mot : « membre du projet ». Ranger sous `projects/{id}/` la donne d'un
    coup — un fichier de page est un fichier du projet, comme les autres. */
export function pageFileStoragePrefix(projectId: string, pageId: string): string {
  return `projects/${projectId}/pages/${pageId}`;
}

/** L'adresse publique (au sens : de l'application) d'un fichier de page. */
export function pageFileUrl(projectId: string, fileId: string): string {
  return `/api/projects/${projectId}/pages/files/${fileId}`;
}

const PAGE_FILE_URL_RE =
  /^\/api\/projects\/([0-9a-fA-F-]{36})\/pages\/files\/([0-9a-fA-F-]{36})$/;

/** L'id de la ligne `page_files` derrière un `src`, ou `null` quand le `src`
    pointe ailleurs — une image externe collée depuis le web en est une, et elle
    est parfaitement légitime : elle n'a simplement rien à nous coûter. */
export function pageFileIdFromSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  return PAGE_FILE_URL_RE.exec(src.trim())?.[2] ?? null;
}

/** Le projet nommé par un `src` de fichier de page, ou `null`. */
export function pageFileProjectFromSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  return PAGE_FILE_URL_RE.exec(src.trim())?.[1] ?? null;
}

/**
 * Les fichiers CITÉS par un corps de page, lus sur son JSON.
 *
 * Sur le JSON et non sur un document ProseMirror monté : l'appelant est le
 * ménage (lib/server/retention.ts), qui lit des lignes de base dans une fonction
 * serveur et n'a ni DOM ni éditeur à sa disposition. La traversée est aveugle au
 * TYPE de nœud, volontairement — tout attribut `src` qui ressemble à l'adresse
 * d'un fichier de page compte. Un bloc de plus qui en porterait un (une vidéo,
 * une pièce jointe dans un dépliant) est donc couvert d'avance, et le pire cas
 * de cette largeur est de garder un fichier de trop : jamais d'en effacer un.
 */
export function pageFileIdsInBody(body: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const value of Object.values(record)) {
      if (typeof value === "string") {
        const id = pageFileIdFromSrc(value);
        if (id) ids.add(id);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  walk(body);
  return ids;
}

/* ── Ce qu'on affiche d'un fichier ────────────────────────────────────────── */

/** `1,4 Mo` — le poids d'un fichier, en unités que l'œil lit d'un coup.
    Volontairement sans i18n : un nombre et un symbole d'unité, identiques dans
    les deux langues à la virgule près, que `Intl` pose déjà correctement. */
export function formatFileSize(bytes: number, locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value);
  return `${formatted} ${units[unit]}`;
}

/** Une image, au sens de ce module : ce qui se rend dans un `<img>`. */
export function isImageMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

/** Les clés de storage refusent l'exotique ; le nom AFFICHÉ le garde. Miroir
    exact du nettoyeur des ressources (lib/use-attachment-uploads.ts). */
export function sanitizeFileKey(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "fichier").slice(-140);
}
