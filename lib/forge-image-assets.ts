/**
 * Les images collées dans un commentaire de forge (MIN-162) — pourquoi elles ne
 * se rendaient pas dans minddy, et par où elles passent maintenant.
 *
 * ## Ce qui se passe vraiment
 *
 * Une image déposée dans un commentaire sur github.com s'écrit, dans le corps
 * markdown que sert l'API, `https://github.com/user-attachments/assets/<uuid>`.
 * Cette URL-là n'est PAS servable : mesuré contre la vraie API (dépôt privé
 * `mangue-dev/minddy-issues`, PR #30), elle répond **404** à tout ce que minddy
 * peut présenter —
 *
 * | Qui demande | Réponse |
 * | --- | --- |
 * | anonyme (le `<img>` du navigateur, sans cookie GitHub cross-site) | 404 |
 * | token d'installation de la GitHub App (`ghs_`) | 404 |
 * | token utilisateur-vers-serveur de l'App (`ghu_`) | 404 |
 * | token OAuth classique à scope `repo` (`gho_`) | 302 → l'image |
 *
 * — et minddy ne détient aucun `gho_`. La piste « proxy avec le token
 * d'installation » du cadrage initial ne marche donc pas : elle proxifierait
 * un 404. (La piste « domaines autorisés » était déjà écartée : le rendu passe
 * par une balise `<img>` brute, aucune allowlist `next/image` n'intervient.)
 *
 * ## Par où ça passe
 *
 * GitHub sait rendre le commentaire lui-même : avec
 * `Accept: application/vnd.github.full+json`, la réponse porte un `body_html` où
 * chaque image est réécrite en
 * `private-user-images.githubusercontent.com/<id>/<n>-<uuid>.<ext>?jwt=<signé>`,
 * et **cette URL-là se sert sans aucune authentification** (mesuré : 200,
 * image/png). C'est la même réécriture pour un dépôt public et pour un dépôt
 * privé — une seule mécanique à connaître.
 *
 * Le `jwt` ne vit que **300 secondes**. C'est ce qui interdit de le coller dans
 * la réponse `/comments` et d'en rester là : un panneau resté ouvert cinq
 * minutes n'afficherait plus rien. D'où le détour par une route de minddy
 * (`/api/pull-requests/[prId]/image?asset=<uuid>`), qui redemande une URL
 * fraîche à chaque chargement d'image.
 *
 * L'`uuid` est la clé d'appariement des deux formes : il est présent dans l'URL
 * publique **et** dans le nom de fichier de l'URL signée. Rien à corréler par
 * position.
 *
 * Ce module est pur des deux côtés : le client y lit ce qu'il faut réécrire, le
 * serveur ce qu'il faut résoudre.
 */

/**
 * Le bucket PUBLIC où atterrissent les fichiers joints à un commentaire de PR
 * (MIN-162). Public parce que le commentaire part chez la forge : son URL est
 * lue par GitHub, par ses e-mails de notification, et par des gens qui n'ont pas
 * de compte minddy. Écriture serveur uniquement — cf. la migration.
 */
export const FORGE_ATTACHMENTS_BUCKET = "forge-attachments";

/**
 * Ce qu'un fichier hébergé ajoute au corps du commentaire. Une image s'INSÈRE
 * (elle se regarde dans le fil, ici comme chez la forge) ; tout le reste devient
 * un lien nommé — un `![](…)` sur un PDF ne donnerait qu'une icône cassée.
 */
export function forgeAttachmentMarkdown(file: {
  url: string;
  name: string;
  isImage: boolean;
}): string {
  // Les crochets d'un nom de fichier casseraient la syntaxe du lien.
  const label = file.name.replace(/[[\]]/g, "");
  return file.isImage ? `![${label}](${file.url})` : `[${label}](${file.url})`;
}

/** `…/user-attachments/assets/<uuid>` — la forme qui arrive dans le markdown. */
const PUBLIC_ASSET_RE =
  /^https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `…/<ownerId>/<n>-<uuid>.<ext>?jwt=…` — la forme signée que rend `body_html`. */
const SIGNED_ASSET_RE =
  /^https:\/\/private-user-images\.githubusercontent\.com\/\d+\/\d+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+/i;

/** Le seul hôte que la route d'image accepte d'aller chercher (garde SSRF). */
export const SIGNED_ASSET_HOST = "private-user-images.githubusercontent.com";

/** Un identifiant d'asset tel qu'il arrive en paramètre d'URL. Contraint AVANT
    toute résolution : il sert de clé de recherche, jamais de chemin. */
export function isForgeAssetId(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

/** L'uuid d'une URL d'asset publique, ou null si ce n'en est pas une. */
export function forgeAssetId(src: string): string | null {
  return PUBLIC_ASSET_RE.exec(src.trim())?.[1]?.toLowerCase() ?? null;
}

/** L'uuid d'une URL SIGNÉE, ou null. Le préfixe numérique du nom de fichier est
    l'id interne de l'upload — il ne nous sert à rien, seul l'uuid apparie. */
export function signedForgeAssetId(url: string): string | null {
  return SIGNED_ASSET_RE.exec(url.trim())?.[1]?.toLowerCase() ?? null;
}

/**
 * Les `src` d'image d'un `body_html`, indexés par uuid d'asset. Une lecture de
 * chaîne plutôt qu'un parseur : la réponse vient de GitHub, on n'en garde que
 * ce qui matche `SIGNED_ASSET_RE` — donc jamais une URL arbitraire.
 *
 * `&amp;` : le HTML échappe les séparateurs de query, l'URL doit être déséchappée
 * avant d'être suivie (le `jwt` en dépend).
 */
export function collectSignedAssets(
  htmls: Iterable<string | null | undefined>,
  into: Map<string, string> = new Map(),
): Map<string, string> {
  for (const html of htmls) {
    if (!html) continue;
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      const url = match[1].replace(/&amp;/g, "&");
      const id = signedForgeAssetId(url);
      // Premier gagnant : un même asset cité deux fois porte deux jwt également
      // valides, inutile d'en garder plus d'un.
      if (id && !into.has(id)) into.set(id, url);
    }
  }
  return into;
}

/**
 * La `src` à rendre pour une image de commentaire de forge : la route de minddy
 * quand c'est un asset GitHub, l'URL d'origine sinon (un badge CI, une image
 * hébergée ailleurs — rien à proxifier, et le proxy ne saurait pas la résoudre).
 *
 * `endpoint` est la base de la PR (`/api/pull-requests/{id}`), celle que le reste
 * de la vue utilise déjà.
 */
export function forgeImageSrc(src: string | undefined, endpoint: string): string | undefined {
  if (!src) return src;
  const id = forgeAssetId(src);
  return id ? `${endpoint}/image?asset=${id}` : src;
}
